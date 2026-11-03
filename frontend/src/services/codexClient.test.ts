import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chmod } from 'node:fs/promises'
import path from 'node:path'
import { CodexClient, resolveCodex, restrictModelCatalog } from '../../../electron/codexClient'

const fixture = path.resolve('../scripts/fixtures/fake-codex.cjs')
const clients: CodexClient[] = []
beforeAll(async () => { await chmod(fixture, 0o755) })
afterEach(() => { clients.splice(0).forEach(client => client.close()) })
function run(model: string) {
  const client = new CodexClient(fixture, process.cwd())
  clients.push(client)
  const deltas: string[] = []
  return { client, deltas, result: client.complete({ model, messages: [{ role: 'user', content: '合成样本' }] }, process.cwd(), delta => deltas.push(delta)) }
}

describe('Codex managed process', () => {
  it('removes built-in tool capabilities while preserving the selected model metadata', () => {
    const metadata = { slug: 'custom', context_window: 12345, apply_patch_tool_type: 'freeform', shell_type: 'local', experimental_supported_tools: ['test_sync_tool'] }
    const source = { models: [metadata, { slug: 'other' }] }
    expect(restrictModelCatalog(source, 'custom')).toMatchObject({ models: [{
      slug: 'custom', context_window: 12345, apply_patch_tool_type: null, shell_type: 'disabled', experimental_supported_tools: [],
    }] })
    expect(metadata.apply_patch_tool_type).toBe('freeform')
    expect(() => restrictModelCatalog(source, 'unknown')).toThrow('缺少')
  })
  it('resolves an explicit executable and validates its version', async () => {
    expect(await resolveCodex(fixture)).toEqual({ executable: fixture, version: '0.156.0' })
    await expect(resolveCodex('codex')).rejects.toThrow('绝对路径')
  })
  it('completes a structured protocol turn with MCP disabled and ephemeral history', async () => {
    const task = run('ok')
    expect(await task.result).toBe('已完成')
    expect(task.deltas).toEqual(['已完成'])
  })
  it.each([
    ['unsafe', '只读权限隔离'], ['permission', '不允许的工具'], ['tool', '尝试使用工具'],
    ['malformed', '无效协议数据'], ['exit', '进程已退出'], ['failed', 'quota exceeded'],
  ])('fails closed for %s', async (model, error) => {
    await expect(run(model).result).rejects.toThrow(error)
  })
  it('cancels a pending task and rejects future RPC calls', async () => {
    const task = run('pending')
    task.client.close()
    await expect(task.result).rejects.toThrow('已取消')
    await expect(task.client.request('turn/start', {})).rejects.toThrow('已取消')
  })
})
