import { app, type IpcMain } from 'electron'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { assertTrustedSender } from './ipcSecurity'
import { createCodexTask, inspectCodex, resolveCodex } from './codexClient'
import { AI_REQUEST_TIMEOUT_MS, redactAiError, type AiRequest } from '../shared/ai'

export function validateCodexRequest(request: AiRequest): void {
  if (!request || typeof request.model !== 'string' || !request.model.trim()
    || !Array.isArray(request.messages) || !request.messages.length
    || request.messages.some(m => !m || !['user', 'system', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
    throw new Error('无效的 Codex 请求')
  }
  if (request.images !== undefined && (!Array.isArray(request.images) || request.images.some(image =>
    !image || typeof image.label !== 'string' || typeof image.dataUrl !== 'string'
    || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl)))) throw new Error('无效的图片输入')
  if (request.schema !== undefined && (!request.schema || Array.isArray(request.schema) || typeof request.schema !== 'object')) throw new Error('无效的输出结构')
  if (Buffer.byteLength(JSON.stringify(request)) > 24 * 1024 * 1024) throw new Error('AI 输入超过 24 MiB，请减少图片或分段处理')
}

export function registerCodexIpc(ipcMain: IpcMain): { dispose: () => void } {
  const active = new Map<string, { cancel: () => void }>()
  const cwd = () => path.join(app.getPath('userData'), 'ai-workspace')
  ipcMain.handle('codex:inspect', async (event, executable?: string) => {
    assertTrustedSender(event, 'codex:inspect')
    if (executable !== undefined && typeof executable !== 'string') throw new Error('无效的程序路径')
    const controller = new AbortController()
    const cancel = () => controller.abort()
    const key = `${event.sender.id}:inspect:${randomUUID()}`
    active.set(key, { cancel })
    event.sender.once('destroyed', cancel)
    event.sender.once('render-process-gone', cancel)
    event.sender.once('did-start-navigation', cancel)
    try { return await inspectCodex(executable, cwd(), controller.signal) }
    finally {
      active.delete(key)
      event.sender.removeListener('destroyed', cancel)
      event.sender.removeListener('render-process-gone', cancel)
      event.sender.removeListener('did-start-navigation', cancel)
    }
  })
  ipcMain.handle('codex:complete', async (event, id: string, executable: string | undefined, request: AiRequest) => {
    assertTrustedSender(event, 'codex:complete')
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('无效的任务编号')
    if (executable !== undefined && typeof executable !== 'string') throw new Error('无效的程序路径')
    validateCodexRequest(request)
    const key = `${event.sender.id}:${id}`
    if (active.has(key)) throw new Error('任务已存在')
    let task: Awaited<ReturnType<typeof createCodexTask>> | undefined
    const controller = new AbortController()
    const cancel = () => controller.abort()
    active.set(key, { cancel })
    const timer = setTimeout(() => controller.abort(new Error('AI 请求超时，任务未完成')), AI_REQUEST_TIMEOUT_MS)
    event.sender.once('destroyed', cancel)
    event.sender.once('render-process-gone', cancel)
    event.sender.once('did-start-navigation', cancel)
    try {
      const resolved = await resolveCodex(executable)
      await mkdir(cwd(), { recursive: true })
      if (controller.signal.aborted) throw new Error('AI 任务已取消')
      task = await createCodexTask(resolved.executable, cwd(), request.model, controller.signal)
      return await task.client.complete(request, cwd(), delta => {
        if (!event.sender.isDestroyed()) event.sender.send('codex:delta', id, delta)
      })
    } catch (error) {
      throw new Error(redactAiError(error instanceof Error ? error.message : String(error)))
    } finally {
      clearTimeout(timer)
      event.sender.removeListener('destroyed', cancel)
      event.sender.removeListener('render-process-gone', cancel)
      event.sender.removeListener('did-start-navigation', cancel)
      await task?.dispose()
      active.delete(key)
    }
  })
  ipcMain.handle('codex:cancel', (event, id: string) => {
    assertTrustedSender(event, 'codex:cancel')
    active.get(`${event.sender.id}:${id}`)?.cancel()
  })
  return { dispose: () => { for (const task of active.values()) task.cancel() } }
}
