import fs from 'node:fs'
import path from 'node:path'
import { RecordingStore, wav } from '../recordingStore'
import { validateFileLimits } from '../../shared/volcFileContract'

/** Stream-sized block conversion. Silence preserves missing capture intervals on the common timeline. */
export async function exportRecordingWav(store: RecordingStore, id: string, output: string, signal?: AbortSignal): Promise<{ sizeBytes: number; durationMs: number }> {
  const manifest = store.read(id)
  if (manifest.status === 'recording') throw new Error('请先停止录音')
  const frames = Math.ceil(manifest.durationMs * 16)
  const sizeBytes = 44 + frames * 2
  validateFileLimits(sizeBytes, manifest.durationMs)
  const free = fs.statfsSync(path.dirname(output))
  if (Number(free.bavail) * Number(free.bsize) < sizeBytes + 1024 * 1024) throw new Error('磁盘空间不足，无法准备会后转写')
  const fd = fs.openSync(output, 'wx', 0o600)
  try {
    fs.writeSync(fd, wav(new Uint8Array(), 16000))
    fs.ftruncateSync(fd, sizeBytes) // zero-filled gaps, never squeeze timestamps
    for (const block of manifest.blocks) {
      if (signal?.aborted) throw new Error('CANCELLED')
      const source = Buffer.from(store.readBlock(id, block.index, 'mix')).subarray(44)
      const count = Math.round(block.frames / block.sampleRate * 16000)
      const pcm = Buffer.alloc(count * 2)
      // Average source samples in each output interval; capture normally supplies 48k or imported 16k.
      for (let n = 0; n < count; n++) {
        const first = Math.floor(n * block.sampleRate / 16000)
        const end = Math.min(block.frames, Math.max(first + 1, Math.floor((n + 1) * block.sampleRate / 16000)))
        let sum = 0
        for (let i = first; i < end; i++) sum += source.readInt16LE(i * 2)
        pcm.writeInt16LE(Math.round(sum / (end - first)), n * 2)
      }
      const start = Math.round(block.startMs * 16)
      const bytes = Math.min(pcm.length, Math.max(0, (frames - start) * 2))
      if (bytes) fs.writeSync(fd, pcm, 0, bytes, 44 + start * 2)
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    const lengths = Buffer.alloc(4)
    lengths.writeUInt32LE(sizeBytes - 8); fs.writeSync(fd, lengths, 0, 4, 4)
    lengths.writeUInt32LE(sizeBytes - 44); fs.writeSync(fd, lengths, 0, 4, 40)
    fs.fsyncSync(fd)
    return { sizeBytes, durationMs: manifest.durationMs }
  } catch (error) { fs.rmSync(output, { force: true }); throw error }
  finally { fs.closeSync(fd) }
}
