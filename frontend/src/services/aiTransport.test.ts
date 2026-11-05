import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAiBody, cancelAiTasks, completeAi } from './aiTransport'
import type { AiRequest, CodexAPI } from '../../../shared/ai'

const request: AiRequest = { model: 'vision-model', messages: [{ role: 'user', content: '总结资料' }] }
const image = { label: '[图片 00:03]', dataUrl: 'data:image/png;base64,YQ==' }
const config = { provider: 'openai' as const, visionModels: [request.model] }
const completed = { type: 'response.completed', response: { status: 'completed', output: [] } }
function stream(events: unknown[], terminated = true) {
  const data = [...events, ...(terminated ? [completed] : [])].map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join('')
  const bytes = new TextEncoder().encode(data)
  return new Response(new ReadableStream({ start(controller) {
    // Split inside UTF-8 and JSON tokens, as real network reads do.
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
    controller.close()
  } }))
}
afterEach(() => vi.unstubAllGlobals())

describe('AI transport', () => {
  it('maps explicit Responses settings, images and strict schema without enabling tools', () => {
    const schema = { type: 'object' }
    expect(buildAiBody(config, { ...request, images: [image], schema }, true)).toMatchObject({
      model: request.model, stream: true, store: false, tools: [],
      input: [request.messages[0], { role: 'user', content: [
        { type: 'input_text', text: image.label }, { type: 'input_image', image_url: image.dataUrl },
      ] }], text: { format: { type: 'json_schema', strict: true, schema } },
    })
    expect(buildAiBody({}, request, false)).toEqual({ ...request, stream: false })
  })

  it('uses the official default URL and preserves split streamed text', async () => {
    const fetch = vi.fn().mockResolvedValue(stream([{ type: 'response.output_text.delta', delta: '计划发布。' }]))
    vi.stubGlobal('fetch', fetch)
    const onDelta = vi.fn()
    expect(await completeAi(config, request, { onDelta })).toBe('计划发布。')
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses')
    expect(onDelta).toHaveBeenCalledWith('计划发布。')
  })

  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)('sends %s effort on Responses requests only', async reasoningEffort => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '完成' }] }] })))
    vi.stubGlobal('fetch', fetch)
    expect(await completeAi({ ...config, reasoningEffort }, request)).toBe('完成')
    expect(JSON.parse(fetch.mock.calls[0][1].body).reasoning).toEqual({ effort: reasoningEffort })
    expect(buildAiBody({ protocol: 'responses', reasoningEffort }, request, true)).toMatchObject({ reasoning: { effort: reasoningEffort }, stream: true })
    expect(buildAiBody(config, request, false)).not.toHaveProperty('reasoning')
    expect(buildAiBody({ reasoningEffort }, request, false)).not.toHaveProperty('reasoning')
  })

  it.each([
    [[{ type: 'response.output_text.delta', delta: '半截' }], /中断/],
    [[{ type: 'response.failed', response: { error: { message: 'quota exceeded' } } }], /quota exceeded/],
    [[{ type: 'response.refusal.delta', delta: 'refused' }], /拒绝/],
  ])('rejects incomplete, failed and refused streams', async (events, error) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream(events as unknown[], false)))
    await expect(completeAi(config, request, { onDelta: () => {} })).rejects.toThrow(error as RegExp)
  })

  it('does not silently send images to an unconfirmed model', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(completeAi({}, { ...request, images: [image] })).rejects.toThrow('尚未确认支持图片')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('redacts credentials and does not retry or change protocol after HTTP errors', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('key=private-key Bearer other-secret https://host/path?token=hidden', { status: 429 }))
    vi.stubGlobal('fetch', fetch)
    const error = await completeAi({ ...config, apiKey: 'private-key' }, request).catch(e => e.message)
    expect(error).toContain('HTTP 429')
    expect(error).not.toMatch(/private-key|other-secret|token=hidden/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retains the compatible endpoint and rejects a length-limited result', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] })))
    vi.stubGlobal('fetch', fetch)
    await expect(completeAi({ baseUrl: 'http://localhost:1234/v1/' }, request)).rejects.toThrow('length')
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:1234/v1/chat/completions')
  })

  it('cancels a session HTTP request', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    })))
    const result = completeAi(config, request, { taskKey: 'session' })
    cancelAiTasks('session')
    await expect(result).rejects.toThrow('已取消')
  })

  it('routes Codex deltas, cancels only its request and removes its listener', async () => {
    let listener: Parameters<CodexAPI['onDelta']>[0] = () => {}
    let reject: (error: Error) => void = () => {}
    let id = ''
    const unsubscribe = vi.fn(), onDelta = vi.fn()
    const api: CodexAPI = {
      inspect: vi.fn(),
      onDelta: callback => { listener = callback; return unsubscribe },
      complete: vi.fn(requestId => { id = requestId; return new Promise<string>((_resolve, fail) => { reject = fail }) }),
      cancel: vi.fn(async () => { reject(new Error('cancelled')) }),
    }
    vi.stubGlobal('window', { electronAPI: { codex: api } })
    const result = completeAi({ provider: 'codex' }, request, { taskKey: 'codex-session', onDelta })
    listener('another-task', 'ignored'); listener(id, 'hello')
    cancelAiTasks('codex-session')
    await expect(result).rejects.toThrow('已取消')
    expect(onDelta.mock.calls).toEqual([['hello']])
    expect(api.cancel).toHaveBeenCalledExactlyOnceWith(id)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
