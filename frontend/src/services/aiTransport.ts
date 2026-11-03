import { AI_REQUEST_TIMEOUT_MS, aiBaseUrl, aiUsesResponses, redactAiError } from '../../../shared/ai'
import type { AiConnection, AiRequest } from '../../../shared/ai'

export interface AiRequestOptions {
  taskKey?: string
  signal?: AbortSignal
  onDelta?: (delta: string) => void
}

const tasks = new Map<string, Set<AbortController>>()
export function cancelAiTasks(taskKey: string): void {
  for (const task of tasks.get(taskKey) || []) task.abort()
}

function outputText(output: Array<{ type?: string; content?: Array<{ type: string; text?: string; refusal?: string }> }> = []): string {
  const parts = output.flatMap(item => item.content || [])
  const refusal = parts.find(part => part.type === 'refusal')
  if (refusal) throw new Error(refusal.refusal || 'AI 拒绝处理该请求')
  return parts.filter(part => part.type === 'output_text').map(part => part.text || '').join('')
}

export function buildAiBody(config: AiConnection, request: AiRequest, stream: boolean): object {
  if (aiUsesResponses(config)) {
    const input: object[] = request.messages.map(message => ({ ...message, content: message.content }))
    if (request.images?.length) input.push({ role: 'user', content: request.images.flatMap(image => [
      { type: 'input_text', text: image.label },
      { type: 'input_image', image_url: image.dataUrl, detail: 'auto' },
    ]) })
    return { model: request.model, input, stream, store: false, tools: [],
      ...(request.schema ? { text: { format: { type: 'json_schema', name: 'delive_result', strict: true, schema: request.schema } } } : {}) }
  }
  const messages: object[] = [...request.messages]
  if (request.images?.length) messages.push({ role: 'user', content: request.images.flatMap(image => [
    { type: 'text', text: image.label }, { type: 'image_url', image_url: { url: image.dataUrl } },
  ]) })
  // Compatible services may not implement response_format; their JSON is validated by the feature parser.
  return { model: request.model, messages, stream }
}

export async function completeAi(config: AiConnection, request: AiRequest, options: AiRequestOptions = {}): Promise<string> {
  const controller = new AbortController()
  const key = options.taskKey || crypto.randomUUID()
  const group = tasks.get(key) || new Set<AbortController>()
  group.add(controller)
  tasks.set(key, group)
  try {
    return await performAi(config, request, { ...options,
      signal: AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : [])]),
    })
  } finally {
    group.delete(controller)
    if (!group.size) tasks.delete(key)
  }
}

async function performAi(config: AiConnection, request: AiRequest, options: AiRequestOptions): Promise<string> {
  const signal = AbortSignal.any([AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS), ...(options.signal ? [options.signal] : [])])
  try {
    signal.throwIfAborted()
    if (request.images?.length && !config.visionModels?.includes(request.model)) throw new Error('所选模型尚未确认支持图片，请在 AI 设置中选择视觉模型')
    if (config.provider === 'codex') {
      const api = typeof window !== 'undefined' ? window.electronAPI?.codex : undefined
      if (!api) throw new Error('本机 Codex 需要桌面应用')
      const id = crypto.randomUUID()
      const unsubscribe = api.onDelta((requestId, delta) => { if (requestId === id) options.onDelta?.(delta) })
      const cancel = () => { void api.cancel(id).catch(() => {}) }
      signal.addEventListener('abort', cancel, { once: true })
      try {
        const result = await api.complete(id, config.codexPath, request)
        signal.throwIfAborted()
        if (!result.trim()) throw new Error('AI 未返回内容')
        return result
      } finally {
        signal.removeEventListener('abort', cancel)
        unsubscribe()
      }
    }

    const responses = aiUsesResponses(config)
    const res = await fetch(`${aiBaseUrl(config)}/${responses ? 'responses' : 'chat/completions'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}) },
      body: JSON.stringify(buildAiBody(config, request, Boolean(options.onDelta))), signal,
    })
    if (!res.ok) throw new Error(`AI HTTP ${res.status}: ${await res.text()}`)
    let text = ''
    if (!options.onDelta) {
      const payload = await res.json()
      if (payload.error) throw new Error(payload.error.message || 'AI 请求失败')
      if (responses) {
        if (payload.status !== 'completed') throw new Error(`AI 未完成：${payload.status || '未知状态'}`)
        text = outputText(payload.output)
      } else {
        const choice = payload.choices?.[0]
        if (choice?.message?.refusal) throw new Error(choice.message.refusal)
        if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new Error(`AI 未完整返回：${choice.finish_reason}`)
        const content = choice?.message?.content
        text = typeof content === 'string' ? content : (content || []).filter((p: { type: string }) => p.type === 'text').map((p: { text: string }) => p.text).join('')
      }
    } else {
      const reader = res.body?.getReader()
      if (!reader) throw new Error('AI 响应流不可读')
      let buffer = '', finished = false
      const decoder = new TextDecoder()
      const consume = (line: string) => {
        if (!line.startsWith('data:')) return
        const data = line.slice(5).trim()
        if (data === '[DONE]') { if (!responses) finished = true; return }
        if (!data) return
        const event = JSON.parse(data)
        if (event.error || ['error', 'response.failed', 'response.incomplete'].includes(event.type)) throw new Error(event.error?.message || event.response?.error?.message || 'AI 响应未完成')
        if (event.type === 'response.refusal.delta' || event.choices?.[0]?.delta?.refusal) throw new Error('AI 拒绝处理该请求')
        if (responses && event.type === 'response.completed') {
          if (event.response?.status !== 'completed') throw new Error('AI 响应未完成')
          finished = true
          const finalText = outputText(event.response.output)
          if (!text && finalText) { text = finalText; options.onDelta?.(finalText) }
        }
        const choice = event.choices?.[0]
        if (!responses && choice?.finish_reason) {
          if (choice.finish_reason !== 'stop') throw new Error(`AI 未完整返回：${choice.finish_reason}`)
          finished = true
        }
        const delta = responses ? (event.type === 'response.output_text.delta' ? event.delta : '') : choice?.delta?.content
        if (typeof delta === 'string' && delta) { text += delta; options.onDelta?.(delta) }
      }
      try {
        while (true) {
          const chunk = await reader.read()
          buffer += decoder.decode(chunk.value, { stream: !chunk.done })
          const lines = buffer.split('\n'); buffer = lines.pop() || ''
          for (const line of lines) consume(line.trimEnd())
          if (chunk.done) break
        }
        if (buffer) consume(buffer.trimEnd())
        if (!finished) throw new Error('AI 响应流意外中断，结果未完成')
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    }
    signal.throwIfAborted()
    if (!text.trim()) throw new Error('AI 未返回内容')
    return text
  } catch (error) {
    if (signal.aborted) throw new Error(options.signal?.aborted ? 'AI 任务已取消' : 'AI 请求超时，任务未完成')
    throw new Error(redactAiError(error instanceof Error ? error.message : String(error), config.apiKey))
  }
}
