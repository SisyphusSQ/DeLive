// Synthetic PCM only. These tests do not access microphone, cloud credentials or ASR.
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RecordingStore } from '../../../electron/recordingStore'
const dirs: string[] = []
function store(quota = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'delive-recording-'))
  dirs.push(directory)
  return new RecordingStore(directory, quota)
}
function packet(startMs = 0) {
  const data = new Int16Array(48000)
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * Math.PI * 2 * 440 / 48000) * 16000
  return { startMs, sampleRate: 48000, tracks: { system: data.buffer, microphone: data.buffer.slice(0), mix: data.buffer.slice(0) } }
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })
describe('durable recording assets', () => {
  it('writes independently readable PCM WAV tracks on the same timeline and preserves gaps', () => {
    const s = store(); s.begin('session')
    s.append('session', packet()); s.append('session', packet(1500))
    const result = s.finish('session')
    expect(result.durationMs).toBe(2500)
    expect(result.blocks.map(b => b.startMs)).toEqual([0, 1500])
    for (const track of ['system', 'microphone', 'mix'] as const) {
      const bytes = Buffer.from(s.readBlock('session', 0, track))
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF')
      expect(bytes.readUInt32LE(24)).toBe(48000)
      expect(bytes.readUInt32LE(40)).toBe(96000)
      expect(bytes.readInt16LE(46)).toBeGreaterThan(0)
    }
  })
  it('recovers committed blocks after process loss, ignores unfinished blocks and persists interruption', () => {
    const s = store(); s.begin('crashed'); s.append('crashed', packet())
    mkdirSync(join(s.directory, 'crashed', 'pending'))
    writeFileSync(join(s.directory, 'crashed', 'pending', 'mix.wav'), 'partial')
    const restarted = new RecordingStore(s.directory)
    const recovered = restarted.read('crashed')
    expect(recovered.status).toBe('interrupted'); expect(recovered.blocks).toHaveLength(1)
    expect(recovered.events[recovered.events.length - 1]?.message).toContain('中断')
    expect(restarted.read('crashed').events).toHaveLength(1)
    expect(() => restarted.begin('crashed')).toThrow()
  })
  it('fails quota before writing a block without deleting prior audio', () => {
    const s = store(300000); s.begin('full'); s.append('full', packet())
    expect(() => s.append('full', packet(1000))).toThrow(/配额/)
    expect(s.finish('full', true).blocks).toHaveLength(1)
  })
  it('reports disk write failure, retains the committed journal and rejects overlapping timestamps', () => {
    const s = store(); s.begin('disk'); s.append('disk', packet())
    expect(() => s.append('disk', packet(0))).toThrow(/timeline/)
    // A file at the staging path deterministically causes a real filesystem error.
    writeFileSync(join(s.directory, 'disk', 'pending'), 'cannot create directory')
    expect(() => s.append('disk', packet(1000))).toThrow()
    expect(new RecordingStore(s.directory).read('disk').blocks).toHaveLength(1)
  })
  it('persists source state separately from identity, rejects traversal and deletes only on request', () => {
    const s = store(); s.begin('sources')
    s.event('sources', { atMs: 10, message: 'microphone ended', source: { source: 'microphone', status: 'ended', level: 0, atMs: 10 } })
    expect(() => s.remove('sources')).toThrow()
    s.finish('sources')
    expect(s.read('sources').sources[0].status).toBe('ended')
    expect(readFileSync(join(s.directory, 'sources', 'index.json'), 'utf8')).not.toContain('speaker')
    expect(() => s.begin('../escape')).toThrow()
    s.remove('sources'); expect(s.list()).toEqual([])
  })
  it('reports damaged audio instead of advertising playback', () => {
    const s = store(); s.begin('damage'); s.append('damage', packet()); s.finish('damage')
    writeFileSync(join(s.directory, 'damage', '0', 'mix.wav'), 'broken')
    const reopened = new RecordingStore(s.directory)
    expect(() => reopened.read('damage')).toThrow(/损坏/)
    expect(reopened.list()[0].error).toContain('损坏')
    reopened.remove('damage')
    expect(reopened.list()).toEqual([])
  })
})
