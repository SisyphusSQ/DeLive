import * as pako from 'pako'

export const VOLC_REALTIME_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
export const VOLC_REALTIME_RESOURCE = 'volc.seedasr.sauc.duration'
export interface VolcCredentials { apiKey?: string; appKey?: string; accessKey?: string; enableDdc?: boolean }

export function volcHeaders(config: VolcCredentials, id: string): Record<string, string> {
  const auth: Record<string, string> | null = config.apiKey
    ? { 'X-Api-Key': config.apiKey }
    : config.appKey && config.accessKey
      ? { 'X-Api-App-Key': config.appKey, 'X-Api-Access-Key': config.accessKey }
      : null
  if (!auth) throw new Error('请配置 API Key，或 APP ID 与 Access Token')
  return { ...auth, 'X-Api-Resource-Id': VOLC_REALTIME_RESOURCE, 'X-Api-Connect-Id': id }
}
export function volcRequest(config: VolcCredentials) {
  return {
    user: { uid: 'delive' },
    audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1 },
    request: { model_name: 'bigmodel', result_type: 'full', enable_itn: true,
      enable_punc: true, enable_ddc: config.enableDdc === true, enable_speaker_info: true,
      show_utterances: true, enable_nonstream: true, ssd_version: '200' },
  }
}
export function volcClientFrame(type: 1 | 2, data: Uint8Array, last = false): Buffer {
  const payload = Buffer.from(pako.gzip(data))
  const header = Buffer.from([0x11, (type << 4) | (last ? 2 : 0), type === 1 ? 0x11 : 0x01, 0])
  const size = Buffer.alloc(4); size.writeUInt32BE(payload.length)
  return Buffer.concat([header, size, payload])
}
export function decodeVolcFrame(data: Buffer): { final: boolean; sequence?: number; raw?: unknown; errorCode?: number } {
  if (data.length < 8 || data[0] >> 4 !== 1) throw new Error('无效的火山协议头')
  let offset = (data[0] & 15) * 4
  const type = data[1] >> 4, flags = data[1] & 15, compression = data[2] & 15
  if (offset < 4 || offset + 4 > data.length || ![0, 1].includes(compression)) throw new Error('不支持的火山协议')
  let sequence: number | undefined, errorCode: number | undefined
  if (type === 15) { errorCode = data.readUInt32BE(offset); offset += 4 }
  else if (type === 9) { if (flags & 1) { sequence = data.readInt32BE(offset); offset += 4 } }
  else throw new Error('不支持的火山消息类型')
  if (offset + 4 > data.length) throw new Error('火山消息缺少长度')
  const size = data.readUInt32BE(offset); offset += 4
  if (size !== data.length - offset) throw new Error('火山消息长度不匹配')
  const payload = compression === 1 ? pako.ungzip(data.subarray(offset)) : data.subarray(offset)
  if (errorCode !== undefined) return { final: true, errorCode } // 服务端原文可能回显凭据，不能转发。
  if (data[2] >> 4 !== 1) throw new Error('火山响应不是 JSON')
  return { final: Boolean(flags & 2), sequence, raw: JSON.parse(Buffer.from(payload).toString('utf8')) }
}
