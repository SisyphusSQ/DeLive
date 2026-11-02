import type { RealtimeRecognition } from '../types/realtime'

/** Whitelisted protocol evidence only: no headers, URLs, credentials or arbitrary additions. */
export function parseVolcSnapshot(raw: unknown, id: string, offsetMs: number, revision: number, final: boolean, sequence?: number): RealtimeRecognition {
  const result = (raw as { result?: { text?: unknown; utterances?: unknown } })?.result
  if (!result || typeof result.text !== 'string') throw new Error('火山响应缺少 result.text')
  if (result.utterances !== undefined && !Array.isArray(result.utterances)) throw new Error('火山分句格式错误')
  const utterances = ((result.utterances ?? []) as Array<Record<string, unknown>>).map(u => {
    if (typeof u.text !== 'string' || typeof u.start_time !== 'number' || !Number.isFinite(u.start_time) || u.start_time < 0 ||
        typeof u.end_time !== 'number' || !Number.isFinite(u.end_time) || u.end_time < u.start_time || typeof u.definite !== 'boolean') throw new Error('火山分句时间或状态错误')
    const additions = u.additions as { speaker_id?: unknown; source?: unknown } | undefined
    return { text: u.text, start_time: u.start_time, end_time: u.end_time, definite: u.definite,
      additions: { speaker_id: typeof additions?.speaker_id === 'string' && additions.speaker_id !== '' ? additions.speaker_id : undefined,
        source: typeof additions?.source === 'string' ? additions.source : undefined } }
  })
  return { id, offsetMs, revision, sequence, status: final ? 'complete' : 'streaming', text: result.text,
    response: { text: result.text, utterances },
    segments: utterances.map((u, index) => ({ id: id + ':' + index, recognitionId: id,
      text: u.text, startMs: offsetMs + u.start_time, endMs: offsetMs + u.end_time,
      speakerId: u.additions.speaker_id === undefined ? undefined : id + ':speaker:' + u.additions.speaker_id,
      isFinal: u.definite })),
  }
}
