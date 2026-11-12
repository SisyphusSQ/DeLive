import type { TranscriptVersion, FileRecognitionResult, TranscriptMerge } from '../../../shared/fileTranscription'
import { fileVersion } from '../../../shared/volcFileContract'
const obj = (v: unknown): Record<string, unknown> | undefined => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
const str = (v: unknown) => typeof v === 'string' ? v : undefined
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
function merge(raw: unknown): TranscriptMerge | undefined {
  const v = obj(raw)
  if (!v || (v.strategy !== 1 && v.strategy !== 2) || !str(v.key) || !str(v.baseVersionId) || !str(v.postVersionId) || !str(v.currentVersionId) || !Array.isArray(v.groups)) return undefined
  const groups: TranscriptMerge['groups'] = []
  const seen = new Set<string>()
  for (const rawGroup of v.groups) {
    const g = obj(rawGroup)
    if (!g || !str(g.id) || seen.has(String(g.id)) || !['automatic','added','manual','pending','confirmed'].includes(String(g.status))) return undefined
    if (!['baseIds','postIds','currentIds','outputIds'].every(key=>Array.isArray(g[key]) && (g[key] as unknown[]).every(id=>typeof id==='string'))) return undefined
    seen.add(String(g.id))
    const comparisonOnly = v.strategy === 2 && g.comparisonOnly === true ? true : undefined
    if (comparisonOnly && ((g.postIds as string[]).length || (g.outputIds as string[]).length ||
      (g.status !== 'pending' && !(g.status === 'confirmed' && g.decision === 'reviewed')))) return undefined
    groups.push({ id: String(g.id), status: g.status as TranscriptMerge['groups'][number]['status'],
      baseIds: [...g.baseIds as string[]], postIds: [...g.postIds as string[]], currentIds: [...g.currentIds as string[]], outputIds: [...g.outputIds as string[]],
      reason: str(g.reason), ...(comparisonOnly && { comparisonOnly }),
      decision: comparisonOnly && g.decision === 'reviewed' ? 'reviewed'
        : ['original','incoming','edited'].includes(String(g.decision)) ? g.decision as 'original'|'incoming'|'edited' : undefined })
  }
  if (v.strategy === 2 && (groups.length !== 1 || !groups[0].comparisonOnly)) return undefined
  return { key: String(v.key), strategy: v.strategy, baseVersionId: String(v.baseVersionId), postVersionId: String(v.postVersionId), currentVersionId: String(v.currentVersionId), groups }
}
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
export function restoreFileStructure(version: TranscriptVersion, savedJobVersion?: TranscriptVersion): TranscriptVersion {
  if (version.kind !== 'post-meeting') return version
  const names = new Map(version.speakers.map(s => [s.id, s]))
  if (version.segments.length && version.segments.every(s => s.speakerId && names.has(s.speakerId))) return version
  const { response, sourceJobId } = version
  const saved = savedJobVersion ?? (sourceJobId && response && version.text === response.text
    ? fileVersion(sourceJobId, response, version.ssdVersion ?? '200') : undefined)
  if (!saved || saved.kind !== 'post-meeting' || (savedJobVersion && saved.id !== version.id) || saved.text !== version.text ||
    !saved.sourceJobId || (sourceJobId && sourceJobId !== saved.sourceJobId) || !saved.segments.length) return version
  const savedNames = new Map(saved.speakers.map(s => [s.id, s]))
  if (!version.segments.length) return { ...version, segments: saved.segments, speakers: [...new Map([...savedNames, ...names]).values()] }
  const key = (s: TranscriptVersion['segments'][number]) => JSON.stringify([s.text, s.startMs, s.endMs])
  const speakersBySpan = new Map<string, string | undefined>()
  for (const segment of saved.segments) {
    const span = key(segment)
    if (!speakersBySpan.has(span)) speakersBySpan.set(span, segment.speakerId)
    else if (speakersBySpan.get(span) !== segment.speakerId) speakersBySpan.set(span, undefined)
  }
  const segments = version.segments.map(segment => {
    const matched = speakersBySpan.get(key(segment))
    const speakerId = segment.speakerId ?? (matched && savedNames.has(matched) ? matched : undefined)
    if (!speakerId) return segment
    const speaker = savedNames.get(speakerId)
    if (!names.has(speakerId) && speaker) names.set(speakerId, speaker)
    return speakerId === segment.speakerId ? segment : { ...segment, speakerId }
  })
  if (names.size === version.speakers.length && segments.every((segment, index) => segment === version.segments[index])) return version
  return { ...version, segments, speakers: [...names.values()] }
}
export function normalizeVersions(raw: unknown): TranscriptVersion[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  return raw.flatMap(raw => {
    const v = obj(raw), id = str(v?.id)
    if (!v || !id || seen.has(id) || !['realtime','post-meeting','edited','legacy','reconciled'].includes(String(v.kind)) || typeof v.text !== 'string') return []
    seen.add(id)
    const mapping = obj(v.speakerMapping), pairs = obj(mapping?.pairs)
    return [restoreFileStructure({ id, kind: v.kind as TranscriptVersion['kind'], createdAt: num(v.createdAt) ?? 0, text: v.text,
      segments: Array.isArray(v.segments) ? v.segments.flatMap(raw => { const s = obj(raw); return span(raw).map(span => ({ ...span, id:str(s?.id),speakerId:str(s?.speakerId),isFinal:typeof s?.isFinal === 'boolean' ? s.isFinal : undefined })) }) : [],
      speakers: Array.isArray(v.speakers) ? v.speakers.flatMap(raw => { const s = obj(raw); return str(s?.id) ? [{ id:str(s?.id)!,label:str(s?.label) || str(s?.id)!,displayName:str(s?.displayName) }] : [] }) : [],
      editNote:str(v.editNote),parentVersionId:str(v.parentVersionId),sourceJobId:str(v.sourceJobId),resource:str(v.resource),merge:merge(v.merge),
      ssdVersion:v.ssdVersion === '200' || v.ssdVersion === '300' ? v.ssdVersion : undefined,response:response(v.response),
      speakerMapping: mapping && str(mapping.sourceVersionId) && num(mapping.confirmedAt) !== undefined && pairs ? {
        sourceVersionId:str(mapping.sourceVersionId)!,confirmedAt:num(mapping.confirmedAt)!,
        pairs:Object.fromEntries(Object.entries(pairs).filter((pair): pair is [string,string] => typeof pair[1] === 'string')),
      } : undefined,
    })]
  })
}
