import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptureManager } from './captureManager'
beforeEach(() => vi.stubGlobal('window', {}))
afterEach(() => vi.unstubAllGlobals())
describe('dual source acquisition', () => {
  it('stops before capture when the permission dialog is dismissed and allows another attempt', async () => {
    const permissions = vi.fn().mockResolvedValue('需要录屏与系统录音权限')
    const getDisplayMedia = vi.fn().mockRejectedValue(new Error('capture reached'))
    vi.stubGlobal('window', { electronAPI: { ensureRecordingPermissions: permissions } })
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } })
    const capture = new CaptureManager()
    await expect(capture.acquireStream({ system: true, microphone: false })).rejects.toThrow('需要录屏')
    expect(getDisplayMedia).not.toHaveBeenCalled()
    expect(permissions).toHaveBeenCalledWith({ system: true, microphone: false })
    permissions.mockResolvedValue(null)
    await expect(capture.acquireStream({ system: true, microphone: false })).rejects.toThrow('capture reached')
    expect(getDisplayMedia).toHaveBeenCalledOnce()
  })
  it('reports denied microphone permission and releases the acquired system grant', async () => {
    const stop = vi.fn()
    const audio = { stop, label: 'synthetic system', onended: null }
    const display = { getAudioTracks: () => [audio], getTracks: () => [audio, { stop }] }
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(display), getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) } })
    const onSource = vi.fn()
    await expect(new CaptureManager().acquireStream({ system: true, microphone: true, onSource })).rejects.toThrow('denied')
    expect(onSource.mock.calls.some(([state]) => state.source === 'microphone' && state.status === 'denied')).toBe(true)
    expect(stop).toHaveBeenCalledTimes(2)
  })
  it('rejects no sources before requesting a device', async () => {
    await expect(new CaptureManager().acquireStream({ system: false, microphone: false })).rejects.toThrow()
  })
  it('reports missing system audio and releases the video grant', async () => {
    const stop = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue({ getAudioTracks: () => [], getTracks: () => [{ stop }] }) } })
    await expect(new CaptureManager().acquireStream({ system: true, microphone: false })).rejects.toThrow(/音频/)
    expect(stop).toHaveBeenCalledOnce()
  })
})
describe('audio-thread timeline and mix', () => {
  it('keeps separate originals aligned, clamps mix, flushes the exact tail once and stops', () => {
    const messages: Array<{ startFrame: number; buffers: ArrayBuffer[]; flushed?: boolean }> = []
    let Factory: new () => { process: (input: Float32Array[][], output: Float32Array[][]) => boolean; port: { onmessage: (e: { data: string }) => void } }
    class Processor { port = { postMessage: (m: typeof messages[number]) => messages.push(m), onmessage: null } }
    runInNewContext(readFileSync(new URL('../../public/dual-recorder.worklet.js', import.meta.url), 'utf8'), {
      AudioWorkletProcessor: Processor, sampleRate: 48000, Int16Array, Math,
      registerProcessor: (_name: string, f: typeof Factory) => { Factory = f },
    })
    const p = new Factory!()
    const system = new Float32Array(128).fill(0.75)
    const mic = new Float32Array(128).fill(0.25)
    const output = new Float32Array(128)
    for (let i = 0; i < 400; i++) p.process([[system], [mic]], [[output]])
    expect(output[0]).toBe(0.5)
    p.port.onmessage({ data: 'flush' })
    expect(messages.slice(0, 2).map(m => m.startFrame)).toEqual([0, 48000])
    expect(messages[1].buffers[0].byteLength).toBe(3200 * 2)
    expect(new Int16Array(messages[0].buffers[0])[0]).toBe(24575)
    expect(new Int16Array(messages[0].buffers[1])[0]).toBe(8192)
    expect(new Int16Array(messages[0].buffers[2])[0]).toBe(16384)
    expect(messages[2].flushed).toBe(true)
    expect(p.process([[system], [mic]], [[output]])).toBe(false)
  })
})

describe('image timestamps', () => {
  it('uses the audio clock, freezes when suspended and includes the current archive offset', () => {
    const capture = new CaptureManager()
    const state = capture as unknown as { id:string;context:{currentTime:number};offset:number;graphOrigin:number;lastArchiveTime:number }
    state.id='synthetic';state.context={currentTime:3.5};state.graphOrigin=1;state.offset=5000
    expect(capture.archiveTimeMs).toBe(7500)
    expect(capture.archiveTimeMs).toBe(7500)
    state.context.currentTime=4
    expect(capture.archiveTimeMs).toBe(8000)
    state.graphOrigin=0;state.context.currentTime=0.25;state.offset=9000
    expect(capture.archiveTimeMs).toBe(9250)
  })
})
