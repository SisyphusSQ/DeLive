import type { FileRecognitionResult, TranscriptVersion } from './fileTranscription'
import type { VolcCredentials } from './volcProtocol'
export const VOLC_FILE_RESOURCE = 'volc.seedasr.auc'
export const VOLC_FILE_SUBMIT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'
export const VOLC_FILE_QUERY = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query'
export const MAX_FILE_BYTES = 512 * 1024 * 1024
export const MAX_FILE_DURATION_MS = 5 * 60 * 60 * 1000

export function validateFileLimits(bytes: number, durationMs: number) {
  if (!Number.isSafeInteger(bytes) || bytes <= 44 || bytes >= MAX_FILE_BYTES) throw new Error('音频为空或达到 512 MB 限制，未提交')
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs >= MAX_FILE_DURATION_MS) throw new Error('音频时长为空或达到 5 小时限制，未提交')
}
export function fileHeaders(credentials: VolcCredentials, id: string, submit = false): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Api-Resource-Id': VOLC_FILE_RESOURCE, 'X-Api-Request-Id': id }
  if (submit) headers['X-Api-Sequence'] = '-1'
  if (credentials.apiKey && credentials.apiKey !== '{{SAFE_STORAGE}}') headers['X-Api-Key'] = credentials.apiKey
  else if (credentials.appKey && credentials.accessKey && ![credentials.appKey, credentials.accessKey].includes('{{SAFE_STORAGE}}')) {
    headers['X-Api-App-Key'] = credentials.appKey; headers['X-Api-Access-Key'] = credentials.accessKey
  } else throw new Error('请先配置火山 API Key，或 APP ID 与 Access Token')
  return headers
}
export function fileRequest(url: string, durationMs: number, enableDdc: boolean) {
  return { user: { uid: 'delive' }, audio: { url, format: 'wav', rate: 16000, bits: 16, channel: 1 },
    request: { model_name: 'bigmodel', enable_speaker_info: true, show_utterances: true,
      ssd_version: durationMs > 180000 ? '300' : '200', enable_itn: true, enable_punc: true, enable_ddc: enableDdc } }
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('文件转写响应格式错误')
  return v as Record<string, unknown>
}
export function parseFileResult(raw: unknown): FileRecognitionResult {
  const root = object(raw), result = object(root.result)
  if (typeof result.text !== 'string' || !Array.isArray(result.utterances)) throw new Error('文件转写缺少完整分句结果')
  const durationMs = object(root.audio_info).duration
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) throw new Error('文件转写时长无效')
  function span(value: unknown) {
    const item = object(value)
    if (typeof item.text !== 'string' || typeof item.start_time !== 'number' || !Number.isFinite(item.start_time) || item.start_time < 0 ||
      typeof item.end_time !== 'number' || !Number.isFinite(item.end_time) || item.end_time < item.start_time) throw new Error('文件转写分句时间无效')
    return { text: item.text, startMs: item.start_time, endMs: item.end_time }
  }
  return { text: result.text, durationMs, utterances: result.utterances.map(value => {
    const u = object(value), additions = u.additions ? object(u.additions) : {}
    return { ...span(u), speaker: typeof additions.speaker === 'string' && additions.speaker ? additions.speaker : undefined,
      words: Array.isArray(u.words) ? u.words.map(span) : undefined }
  }) }
}
export function fileVersion(id: string, result: FileRecognitionResult, ssdVersion: '200' | '300'): TranscriptVersion {
  const scope = 'file-' + id
  const speakers = [...new Set(result.utterances.map(u => u.speaker).filter((s): s is string => s !== undefined))]
  return { id: scope, sourceJobId: id, kind: 'post-meeting', createdAt: Date.now(), resource: VOLC_FILE_RESOURCE, ssdVersion,
    text: result.text, response: result,
    segments: result.utterances.map((u, i) => ({ id: scope + ':' + i, text: u.text, startMs: u.startMs, endMs: u.endMs, isFinal: true, speakerId: u.speaker === undefined ? undefined : scope + ':speaker:' + u.speaker })),
    speakers: speakers.map((speaker, i) => ({ id: scope + ':speaker:' + speaker, label: '说话人 ' + (i + 1) + ' · 会后稿' })) }
}
