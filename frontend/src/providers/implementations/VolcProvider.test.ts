import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VolcProvider } from './VolcProvider'
import type { RealtimeRecognition } from '../../types/realtime'
vi.mock('../../utils/proxyUrl', () => ({ getProxyWsUrl: async () => 'ws://localhost/ws/volc' }))
class Socket {
  static instances: Socket[] = []
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onerror?: () => void
  onclose?: () => void
  bufferedAmount = 0
  sent: unknown[] = []
  constructor(public url: string) { Socket.instances.push(this) }
  send(data: unknown) { this.sent.push(data) }
  close() { this.onclose?.() }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
}
const raw = { result: { text: '合成文本', utterances: [{ text: '合成文本', start_time: 0, end_time: 100, definite: true, additions: { speaker_id: '0' } }] } }
async function connected() {
  const provider = new VolcProvider(), events: RealtimeRecognition[] = []
  provider.on('onRealtime', event => events.push(event))
  const connecting = provider.connect({ apiKey: 'synthetic-secret', timelineOffsetMs: () => 5100 })
  await Promise.resolve()
  const ws = Socket.instances[Socket.instances.length - 1]!
  ws.onopen?.(); ws.message({ type: 'ready' }); await connecting
  return { provider, ws, events }
}
describe('Volc lifecycle (isolated WebSocket double)', () => {
  beforeEach(() => { vi.useFakeTimers(); Socket.instances = []; vi.stubGlobal('WebSocket', Socket) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('ignores real-service metadata acknowledgements without dropping text or accepting malformed final frames', async () => {
    const { provider, ws, events } = await connected()
    const metadata = { result: { additions: { log_id: 'fixture-log-id' } } }
    ws.message({ type: 'snapshot', final: false, raw: metadata })
    expect(events).toHaveLength(0)
    ws.message({ type: 'snapshot', raw })
    ws.message({ type: 'snapshot', final: false, raw: metadata })
    expect(events).toHaveLength(1)
    expect(events[0].text).toBe('合成文本')
    ws.message({ type: 'snapshot', final: true, raw: metadata })
    expect(events[1]).toMatchObject({ text: '合成文本', status: 'incomplete', errorCode: 'PROTOCOL_ERROR' })
    await provider.disconnect()
  })
  it('keeps credentials out of URL and waits for final, flushing ordered PCM before end', async () => {
    const { provider, ws, events } = await connected()
    expect(ws.url).not.toContain('synthetic-secret')
    provider.sendAudio(new ArrayBuffer(1600))
    provider.sendAudio(new ArrayBuffer(1700))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    const stopped = provider.disconnect()
    await vi.advanceTimersByTimeAsync(1)
    expect(ws.sent.filter(x => x instanceof Uint8Array).map(x => (x as Uint8Array).length)).toEqual([3200, 100])
    expect(ws.sent[ws.sent.length - 1]).toBe('{"type":"audio_end"}')
    ws.message({ type: 'snapshot', final: true, sequence: -3, raw })
    await stopped
    expect(events[events.length - 1]?.status).toBe('complete')
    expect(events[events.length - 1]?.segments[0].startMs).toBe(5050)
  })
  it('marks timeout incomplete and preserves the last snapshot', async () => {
    const { provider, ws, events } = await connected()
    ws.message({ type: 'snapshot', raw, sequence: 1 })
    const stopped = provider.disconnect()
    await vi.advanceTimersByTimeAsync(10001); await stopped
    expect(events[events.length - 1]).toMatchObject({ text: '合成文本', status: 'incomplete', errorCode: 'FINAL_TIMEOUT' })
  })
  it('rejects authentication and early-close errors without hanging connect', async () => {
    const provider = new VolcProvider()
    const connecting = provider.connect({ apiKey: 'synthetic' })
    const rejection = expect(connecting).rejects.toThrow()
    await Promise.resolve()
    Socket.instances[Socket.instances.length - 1]!.message({ type: 'error', code: 45000001, message: '鉴权失败' })
    await rejection; await provider.disconnect()
  })
  it('settles a connecting request when recording stops before ready', async () => {
    const provider = new VolcProvider()
    const pending = provider.connect({ apiKey: 'synthetic' })
    const rejection = expect(pending).rejects.toThrow('取消')
    await Promise.resolve()
    await provider.disconnect()
    await rejection
  })
  it('keeps reconnect IDs distinct and rejects stale snapshots', async () => {
    const first = await connected()
    first.ws.message({ type: 'snapshot', raw, sequence: 2 })
    first.ws.message({ type: 'snapshot', raw: { result: { text: 'stale' } }, sequence: 1 })
    first.ws.close()
    const second = await connected()
    second.ws.message({ type: 'snapshot', final: true, raw, sequence: -2 })
    expect(first.events[first.events.length - 1]?.text).toBe('合成文本')
    expect(first.events[first.events.length - 1]?.status).toBe('incomplete')
    expect(first.events[0].id).not.toBe(second.events[0].id)
    await first.provider.disconnect(); await second.provider.disconnect()
  })
})
