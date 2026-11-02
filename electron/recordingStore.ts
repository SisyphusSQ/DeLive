import fs from 'node:fs'
import path from 'node:path'
import type { AudioBlock, AudioTrack, RecordingManifest, RecordingPacket, RecordingSettings, SourceState } from '../shared/recording'

const TRACKS: AudioTrack[] = ['system', 'microphone', 'mix']
function validId(id: string) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid recording ID')
}
function durableJson(file: string, value: unknown) {
  const temp = file + '.tmp'
  const fd = fs.openSync(temp, 'w', 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(temp, file)
}
export function wav(pcm: Uint8Array, sampleRate: number): Buffer {
  const b = Buffer.alloc(44 + pcm.byteLength)
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.byteLength, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28)
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36)
  b.writeUInt32LE(pcm.byteLength, 40); b.set(pcm, 44)
  return b
}
export class RecordingStore {
  private usedBytes: number | undefined
  private active = new Map<string, RecordingManifest>()
  constructor(readonly directory: string, public quotaBytes = 0) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  private folder(id: string): string {
    validId(id)
    const folder = path.join(this.directory, id)
    if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw new Error('Recording symlinks are not allowed')
    return folder
  }
  settings(): RecordingSettings & { bytes: number } {
    return { directory: this.directory, quotaBytes: this.quotaBytes, retention: 'manual', bytes: this.list().reduce((n, x) => n + x.bytes, 0) }
  }
  begin(id: string): RecordingManifest {
    const folder = this.folder(id)
    fs.mkdirSync(folder, { mode: 0o700 }) // Never overwrite an existing recording.
    const m: RecordingManifest = { schemaVersion: 1, sessionId: id, createdAt: Date.now(), status: 'recording', durationMs: 0, bytes: 0, blocks: [], sources: [], events: [] }
    durableJson(path.join(folder, 'index.json'), m)
    this.active.set(id, m)
    return m
  }
  append(id: string, packet: RecordingPacket): AudioBlock {
    const m = this.active.get(id)
    if (!m) throw new Error('Recording is not active')
    const { sampleRate, startMs, tracks } = packet
    const names = TRACKS.filter(t => tracks[t] !== undefined)
    if (!Number.isFinite(startMs) || startMs < m.durationMs - 0.1
      || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000
      || !names.includes('mix')) throw new Error('Invalid audio timeline or format')
    const size = tracks.mix!.byteLength
    if (!size || size % 2 || size > sampleRate * 2 * 2
      || names.some(t => !(tracks[t] instanceof ArrayBuffer) || tracks[t]!.byteLength !== size)) throw new Error('Invalid PCM block')
    const bytes = names.length * (size + 44)
    this.usedBytes ??= this.settings().bytes
    if (this.quotaBytes && this.usedBytes + bytes > this.quotaBytes) throw new Error('录音磁盘配额已满，已保存分片保留')
    const free = fs.statfsSync(this.directory)
    if (Number(free.bavail) * Number(free.bsize) < bytes + 1024 * 1024) throw new Error('磁盘空间不足，已保存分片保留')
    const block: AudioBlock = { index: m.blocks.length, startMs, frames: size / 2, sampleRate, tracks: names, bytes }
    const folder = this.folder(id)
    const temp = path.join(folder, 'pending')
    fs.mkdirSync(temp, { mode: 0o700 })
    try {
      for (const name of names) {
        const fd = fs.openSync(path.join(temp, name + '.wav'), 'wx', 0o600)
        try { fs.writeFileSync(fd, wav(new Uint8Array(tracks[name]!), sampleRate)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      }
      durableJson(path.join(temp, 'block.json'), block)
      fs.renameSync(temp, path.join(folder, String(block.index)))
      m.blocks.push(block)
      m.bytes += bytes
      this.usedBytes += bytes
      m.durationMs = startMs + block.frames / sampleRate * 1000
      // The committed block directory is the append journal. index.json stores lifecycle metadata.
      return block
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true })
      throw error
    }
  }
  event(id: string, event: { atMs: number; message: string; source?: SourceState }) {
    const m = this.active.get(id)
    if (!m) throw new Error('Recording is not active')
    if (!Number.isFinite(event.atMs) || event.atMs < 0 || typeof event.message !== 'string' || event.message.length > 500) throw new Error('Invalid recording event')
    m.events.push({ atMs: event.atMs, message: event.message })
    if (event.source) m.sources = [...m.sources.filter(s => s.source !== event.source!.source), event.source]
    durableJson(path.join(this.folder(id), 'index.json'), { ...m, blocks: [] })
  }
  read(id: string): RecordingManifest {
    const active = this.active.get(id)
    if (active) return structuredClone(active)
    const folder = this.folder(id)
    const m: RecordingManifest = JSON.parse(fs.readFileSync(path.join(folder, 'index.json'), 'utf8'))
    if (m.schemaVersion !== 1 || m.sessionId !== id) throw new Error('Unsupported audio index')
    m.blocks = fs.readdirSync(folder).filter(x => /^\d+$/.test(x)).map(x => {
      if (!fs.lstatSync(path.join(folder, x)).isDirectory()) throw new Error('Invalid block directory')
      const block: AudioBlock = JSON.parse(fs.readFileSync(path.join(folder, x, 'block.json'), 'utf8'))
      for (const track of block.tracks) {
        if (!TRACKS.includes(track)) throw new Error('Invalid audio track')
        const stat = fs.lstatSync(path.join(folder, x, track + '.wav'))
        if (!stat.isFile() || stat.size !== 44 + block.frames * 2) throw new Error('音频分片缺失或损坏')
      }
      return block
    }).sort((a, b) => a.index - b.index)
    m.bytes = m.blocks.reduce((n, b) => n + b.bytes, 0)
    m.durationMs = Math.max(0, ...m.blocks.map(b => b.startMs + b.frames / b.sampleRate * 1000))
    if (m.status === 'recording') {
      m.status = 'interrupted'
      m.events.push({ atMs: m.durationMs, message: '进程中断：已恢复完整分片，末尾未提交音频不可恢复' })
      durableJson(path.join(folder, 'index.json'), { ...m, blocks: [] })
    }
    return m
  }
  finish(id: string, interrupted = false) {
    const m = this.active.get(id)
    if (!m) return this.read(id)
    m.status = interrupted ? 'interrupted' : 'completed'
    durableJson(path.join(this.folder(id), 'index.json'), { ...m, blocks: [] })
    this.active.delete(id)
    return structuredClone(m)
  }
  list(): RecordingManifest[] {
    return fs.readdirSync(this.directory, { withFileTypes: true })
      .filter(x => x.isDirectory() && fs.existsSync(path.join(this.directory, x.name, 'index.json')))
      .map(x => {
        try { return this.read(x.name) }
        catch {
          // One damaged archive must not prevent opening intact recordings or text history.
          const folder = this.folder(x.name)
          const stat = fs.statSync(folder)
          let bytes = 0
          for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            for (const file of fs.readdirSync(path.join(folder, entry.name), { withFileTypes: true })) {
              if (file.isFile()) bytes += fs.statSync(path.join(folder, entry.name, file.name)).size
            }
          }
          return { schemaVersion: 1 as const, sessionId: x.name, createdAt: stat.birthtimeMs,
            status: 'interrupted' as const, error: '原音索引或分片损坏，无法播放；文件仍保留',
            durationMs: 0, bytes, blocks: [], sources: [], events: [] }
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  }
  readBlock(id: string, index: number, track: AudioTrack): Uint8Array {
    if (!Number.isInteger(index) || index < 0 || !TRACKS.includes(track)) throw new Error('Invalid block')
    const m = this.read(id)
    if (!m.blocks.some(b => b.index === index && b.tracks.includes(track))) throw new Error('音频分片不存在')
    return fs.readFileSync(path.join(this.folder(id), String(index), track + '.wav'))
  }
  remove(id: string) {
    if (this.active.has(id)) throw new Error('不能删除正在录制的原音')
    const folder = this.folder(id)
    if (!fs.existsSync(path.join(folder, 'index.json'))) throw new Error('Recording not found')
    fs.rmSync(folder, { recursive: true })
    this.usedBytes = undefined
  }
  interruptAll() {
    for (const id of this.active.keys()) this.finish(id, true)
  }
}
