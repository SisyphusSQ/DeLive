import type { RealtimeRecognition } from '../types/realtime'

export class VolcUtteranceError extends Error {
  readonly details: Record<string, unknown>
  constructor(index: number, utterance: Record<string, unknown>) {
    super('火山分句时间或状态错误')
    const scalar = (value: unknown) => typeof value === 'number' || typeof value === 'boolean' ? value : value === null ? 'null' : typeof value
    // 固定白名单帮助定位偶发响应，不携带正文或任意服务字段。
    this.details = { utteranceIndex: index, textType: utterance.text === null ? 'null' : typeof utterance.text,
      textPresent: Object.prototype.hasOwnProperty.call(utterance, 'text'), startTime: scalar(utterance.start_time),
      endTime: scalar(utterance.end_time), definite: scalar(utterance.definite) }
  }
}

/** Whitelisted protocol evidence only: no headers, URLs, credentials or arbitrary additions. */
export function parseVolcSnapshot(raw: unknown, id: string, offsetMs: number, revision: number, final: boolean, sequence?: number): RealtimeRecognition {
  const result = (raw as { result?: { text?: unknown; utterances?: unknown } })?.result
  if (!result || typeof result.text !== 'string') throw new Error('火山响应缺少 result.text')
  if (result.utterances !== undefined && !Array.isArray(result.utterances)) throw new Error('火山分句格式错误')
  const utterances = ((result.utterances ?? []) as Array<Record<string, unknown>>).map((u, index) => {
    if (!u || typeof u !== 'object' || Array.isArray(u)) throw new Error('火山分句格式错误')
    // 实际流式响应会省略识别段起点的零值 start_time。
    const startTime = u.start_time === undefined ? 0 : u.start_time
    // 临时分句可能先返回时间、后返回正文；保留占位，等待下一份完整快照。
    const text = u.text === undefined && u.definite === false ? '' : u.text
    if (typeof text !== 'string' || typeof startTime !== 'number' || !Number.isFinite(startTime) || startTime < 0 ||
        typeof u.end_time !== 'number' || !Number.isFinite(u.end_time) || u.end_time < startTime || typeof u.definite !== 'boolean') throw new VolcUtteranceError(index, u)
    const additions = u.additions as { speaker_id?: unknown; source?: unknown } | undefined
    return { text, start_time: startTime, end_time: u.end_time, definite: u.definite,
      additions: { speaker_id: typeof additions?.speaker_id === 'string' && additions.speaker_id !== '' ? additions.speaker_id : undefined,
        source: typeof additions?.source === 'string' ? additions.source : undefined } }
  })
  return { id, offsetMs, revision, sequence, status: final ? 'complete' : 'streaming', text: result.text,
    response: { text: result.text, utterances },
    segments: utterances.map((u, index) => ({ id: id + ':' + index, recognitionId: id,
      text: u.text, startMs: offsetMs + u.start_time, endMs: offsetMs + u.end_time,
      speakerId: u.additions.speaker_id === undefined ? undefined : id + ':speaker:' + u.additions.speaker_id,
      isFinal: u.definite })).filter(segment => segment.text.length > 0),
  }
}
