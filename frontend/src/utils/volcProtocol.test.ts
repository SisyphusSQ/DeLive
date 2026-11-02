import { describe, it, expect } from 'vitest'
import * as pako from 'pako'
import { decodeVolcFrame, volcHeaders, volcRequest } from '../../../shared/volcProtocol'

// Synthetic frames following the linked official binary protocol; never a live service fixture.
function response(flags: number, gzip = true, type = 9) {
  const payload = Buffer.from(JSON.stringify({ result: { text: '合成样本', utterances: [] } }))
  const body = gzip ? Buffer.from(pako.gzip(payload)) : payload
  const size = Buffer.alloc(4); size.writeUInt32BE(body.length)
  const extra = type === 15 || flags & 1 ? Buffer.alloc(4) : Buffer.alloc(0)
  if (extra.length) extra.writeInt32BE(type === 15 ? 45000001 : flags & 2 ? -3 : 3)
  return Buffer.concat([Buffer.from([0x11, type << 4 | flags, 0x10 | Number(gzip), 0]), extra, size, body])
}
describe('Volc 2.0 contract', () => {
  it('supports final with and without sequence, and gzip/plain snapshots', () => {
    for (const flags of [0, 1, 2, 3]) for (const gzip of [false, true]) {
      const frame = decodeVolcFrame(response(flags, gzip))
      expect(frame.final).toBe(Boolean(flags & 2))
      expect(frame.raw).toEqual({ result: { text: '合成样本', utterances: [] } })
    }
  })
  it('rejects corrupt/truncated lengths and compressed payloads', () => {
    expect(() => decodeVolcFrame(response(1).subarray(0, 10))).toThrow()
    const invalid = response(1); invalid[invalid.length - 1] ^= 255
    expect(() => decodeVolcFrame(invalid)).toThrow()
  })
  it('keeps numeric service errors without echoing arbitrary upstream text', () => {
    expect(decodeVolcFrame(response(0, true, 15))).toEqual({ final: true, errorCode: 45000001 })
  })
  it('uses async 2.0 speaker parameters, no unsupported language or credential-bearing uid', () => {
    const request = volcRequest({ appKey: 'synthetic-app', accessKey: 'synthetic-token' })
    expect(request.request).toMatchObject({ enable_speaker_info: true, show_utterances: true, enable_nonstream: true, result_type: 'full', enable_ddc: false })
    expect(request.audio).not.toHaveProperty('language')
    expect(JSON.stringify(request)).not.toContain('synthetic-')
    expect(volcHeaders({ apiKey: 'test' }, 'id')['X-Api-Key']).toBe('test')
    expect(volcHeaders({ appKey: 'app', accessKey: 'token' }, 'id')['X-Api-Resource-Id']).toBe('volc.seedasr.sauc.duration')
    expect(() => volcHeaders({}, 'id')).toThrow()
  })
})
