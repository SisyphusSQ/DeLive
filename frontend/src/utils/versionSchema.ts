import type { TranscriptVersion, FileRecognitionResult } from '../../../shared/fileTranscription'
const obj = (v: unknown): Record<string, unknown> | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
const str = (v: unknown) => typeof v === 'string' ? v : undefined
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
function span(raw: unknown) {
  const v = obj(raw)
  if (!v || typeof v.text !== 'string') return []
  const startMs = num(v.startMs), endMs = num(v.endMs)
  return [{ text: v.text, startMs, endMs: endMs !== undefined && startMs !== undefined && endMs < startMs ? undefined : endMs }]
}
function response(raw: unknown): FileRecognitionResult | undefined {
  const v = obj(raw)
  if (!v || typeof v.text !== 'string' || num(v.durationMs) === undefined || !Array.isArray(v.utterances)) return undefined
  return { text: v.text, durationMs: num(v.durationMs)!, utterances: v.utterances.flatMap(raw => {
    const u = obj(raw), s = span(raw)[0]
    if (!u || !s || s.startMs === undefined || s.endMs === undefined) return []
    return [{ ...s, startMs: s.startMs, endMs: s.endMs, speaker: str(u.speaker),
      words: Array.isArray(u.words) ? u.words.flatMap(raw => { const w = span(raw)[0]; return w && w.startMs !== undefined && w.endMs !== undefined ? [{ text:w.text,startMs:w.startMs,endMs:w.endMs }] : [] }) : undefined }]
  }) }
}
export function normalizeVersions(raw: unknown): TranscriptVersion[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  return raw.flatMap(raw => {
    const v = obj(raw), id = str(v?.id)
    if (!v || !id || seen.has(id) || !['realtime','post-meeting','edited','legacy'].includes(String(v.kind)) || typeof v.text !== 'string') return []
    seen.add(id)
    const mapping = obj(v.speakerMapping), pairs = obj(mapping?.pairs)
    return [{ id, kind: v.kind as TranscriptVersion['kind'], createdAt: num(v.createdAt) ?? 0, text: v.text,
      segments: Array.isArray(v.segments) ? v.segments.flatMap(raw => { const s = obj(raw); return span(raw).map(span => ({ ...span, id:str(s?.id),speakerId:str(s?.speakerId),isFinal:typeof s?.isFinal === 'boolean' ? s.isFinal : undefined })) }) : [],
      speakers: Array.isArray(v.speakers) ? v.speakers.flatMap(raw => { const s = obj(raw); return str(s?.id) ? [{ id:str(s?.id)!,label:str(s?.label) || str(s?.id)!,displayName:str(s?.displayName) }] : [] }) : [],
      editNote:str(v.editNote),parentVersionId:str(v.parentVersionId),sourceJobId:str(v.sourceJobId),resource:str(v.resource),
      ssdVersion:v.ssdVersion === '200' || v.ssdVersion === '300' ? v.ssdVersion : undefined,response:response(v.response),
      speakerMapping: mapping && str(mapping.sourceVersionId) && num(mapping.confirmedAt) !== undefined && pairs ? {
        sourceVersionId:str(mapping.sourceVersionId)!,confirmedAt:num(mapping.confirmedAt)!,
        pairs:Object.fromEntries(Object.entries(pairs).filter((pair): pair is [string,string] => typeof pair[1] === 'string')),
      } : undefined,
    }]
  })
}
