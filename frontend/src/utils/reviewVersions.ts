import type { TranscriptSession } from '../types'
import type { TranscriptVersion } from '../../../shared/fileTranscription'

export function versionLabel(version: TranscriptVersion): string {
  const kind = version.editNote?.startsWith('历史译文') ? '历史译文' : { realtime:'实时稿', 'post-meeting':'会后稿', edited:'人工修订', legacy:'历史原稿', reconciled:version.merge?.strategy === 2 ? '恢复修订' : '自动校正版' }[version.kind]
  return kind + ' · ' + new Date(version.createdAt).toLocaleString()
}
export function reviewVersions(session: TranscriptSession): TranscriptVersion[] {
  const versions = [...(session.versions ?? [])]
  const segmentKey = (segments: TranscriptVersion['segments']) => JSON.stringify(segments.map(s => ({
    id:s.id,text:s.text,startMs:s.startMs,endMs:s.endMs,speakerId:s.speakerId,isFinal:s.isFinal,
  })))
  const speakerKey = (speakers: TranscriptVersion['speakers']) => JSON.stringify(speakers.map(s=>({id:s.id,label:s.label,displayName:s.displayName})))
  const sameContent = (v: TranscriptVersion) => v.text === session.transcript &&
    segmentKey(v.segments) === segmentKey(session.segments ?? []) && speakerKey(v.speakers) === speakerKey(session.speakers ?? [])
  let original = versions.find(v => v.kind !== 'edited' && sameContent(v))
  const freeId = (prefix: string) => { let id=prefix, n=1;while(versions.some(v=>v.id===id))id=prefix+'-'+(++n);return id }
  if (!original && (session.transcript || session.segments?.length || !versions.length)) {
    original = { id:freeId('original-'+session.id),kind:session.realtime?.length?'realtime':'legacy',
      createdAt:session.updatedAt || session.createdAt,text:session.transcript,segments:structuredClone(session.segments ?? []),speakers:structuredClone(session.speakers ?? []) }
    versions.unshift(original)
  }
  const corrected = session.correction?.correctedText
  if (corrected && !session.correction?.requiresAdoption && !versions.some(v=>v.kind==='edited' && v.text===corrected)) versions.push({
    id:freeId('correction-'+session.id),kind:'edited',createdAt:session.correction?.completedAt ?? session.updatedAt,
    parentVersionId:original?.id,text:corrected,segments:[],speakers:[],editNote:'旧会话校对结果；没有逐句时间对齐',
  })
  return versions
}
export function selectedReviewVersion(session: TranscriptSession, versions = reviewVersions(session)): TranscriptVersion {
  return versions.find(v=>v.id===session.selectedVersionId) ?? versions.find(v=>v.text.trim()) ?? versions[0]
}
export function editedVersion(source: TranscriptVersion, draft: TranscriptVersion, note: string): TranscriptVersion {
  // Full proofreading presents one editable row for unsegmented text. Older saved drafts use ":0".
  const [row] = draft.segments
  if (!source.segments.length && draft.segments.length === 1 && row.text === source.text &&
      (row.id === source.id + ':text' || row.id === source.id + ':0') &&
      row.startMs === undefined && row.endMs === undefined && !row.speakerId && row.isFinal === undefined) {
    draft = { ...draft, segments: [] }
  }
  const sameWords = draft.segments.length === source.segments.length &&
    draft.segments.every((segment, i) => segment.text === source.segments[i].text)
  const unchangedSpans = sameWords && draft.segments.every((segment, i) => {
    const before = source.segments[i]
    return segment.id === before.id && segment.startMs === before.startMs &&
      segment.endMs === before.endMs && segment.isFinal === before.isFinal
  })
  const speakerIds=new Set(draft.speakers.map(s=>s.id))
  for (const [index, s] of draft.segments.entries()) {
    if (s.speakerId && !speakerIds.has(s.speakerId)) {
      const existingUnknown = unchangedSpans && source.segments[index].speakerId === s.speakerId &&
        !source.speakers.some(speaker => speaker.id === s.speakerId)
      if (!existingUnknown) throw new Error('片段说话人不在当前稿件中')
    }
    if (unchangedSpans) continue
    if((s.startMs===undefined)!==(s.endMs===undefined))throw new Error('开始和结束时间必须同时填写，或同时留空')
    if(s.startMs!==undefined && (!Number.isFinite(s.startMs)||s.startMs<0||!Number.isFinite(s.endMs)||s.endMs!<=s.startMs))throw new Error('片段时间必须有限且结束晚于开始')
  }
  return { ...structuredClone({ ...draft, response: undefined }),id:'edit-'+crypto.randomUUID(),kind:'edited',parentVersionId:source.id,
    createdAt:Date.now(),text:!draft.segments.length ? draft.text : sameWords ? source.text : draft.segments.map(s=>s.text).join('\n'),
    response:undefined,editNote:note,
    merge: draft.merge ? { ...structuredClone(draft.merge), groups: draft.merge.groups.map(group => {
      const previous=source.merge?.groups.find(g=>g.id===group.id)
      if(unchangedSpans || (previous && JSON.stringify(previous)!==JSON.stringify(group)))return group
      const before = source.segments.filter(s => group.outputIds.includes(s.id ?? ''))
      const after = draft.segments.filter(s => group.outputIds.includes(s.id ?? ''))
      return JSON.stringify(before) === JSON.stringify(after) ? group : { ...group, outputIds: after.map(s => s.id!), status: 'confirmed', decision: 'edited' }
    }) } : undefined }
}
/** Explicit mapping copies confirmed names into a NEW revision; IDs and both input versions stay intact. */
export function mapSpeakers(target: TranscriptVersion, source: TranscriptVersion, pairs: Record<string,string>): TranscriptVersion {
  if(target.id===source.id)throw new Error('请选择另一个稿件作为映射来源')
  const targetIds=new Set(target.speakers.map(s=>s.id)),sourceNames=new Map(source.speakers.map(s=>[s.id,s.displayName || s.label]))
  for(const [to,from]of Object.entries(pairs))if(!targetIds.has(to)||!sourceNames.has(from))throw new Error('说话人映射已失效，请重新选择')
  if(!Object.keys(pairs).length)throw new Error('请至少确认一项映射')
  const draft=structuredClone(target)
  draft.speakers=draft.speakers.map(s=>({...s,displayName:pairs[s.id]?sourceNames.get(pairs[s.id]):s.displayName}))
  draft.speakerMapping={sourceVersionId:source.id,confirmedAt:Date.now(),pairs:{...pairs}}
  return editedVersion(target,draft,'人工确认跨版本说话人映射；仅复制选定姓名，未自动合并身份')
}
export function appendRevision(session: TranscriptSession, revision: TranscriptVersion, source?: TranscriptVersion): TranscriptSession {
  const versions=reviewVersions(session)
  if(source && !versions.some(v=>v.id===source.id && JSON.stringify(v)===JSON.stringify(source))){
    const snapshot={...structuredClone(source),id:'source-'+crypto.randomUUID()}
    versions.push(snapshot);revision={...revision,parentVersionId:snapshot.id}
  }
  if(!versions.some(v=>v.id===revision.parentVersionId))throw new Error('原版本不存在，请重新打开会话')
  if(versions.some(v=>v.id===revision.id))return session
  return {...session,versions:[...versions,revision],selectedVersionId:revision.id}
}
export function revisionPatch(session: TranscriptSession, revision: TranscriptVersion, parent: TranscriptVersion, adopt = false): Partial<TranscriptSession> {
  const latest = reviewVersions(session).find(value => value.id === parent.id)
  if (!latest || JSON.stringify(latest) !== JSON.stringify(parent)) throw new Error('来源稿件已变化，请重新打开后确认；原稿与草稿保留')
  if (adopt && selectedReviewVersion(session).id !== parent.id) throw new Error('采用稿已切换，请核对当前稿件后再保存')
  const { versions } = appendRevision(session, revision, parent)
  return adopt ? { versions, selectedVersionId: revision.id } : { versions }
}

/** Legacy overview names are reusable only when the full ID identifies a known recognition run. */
export function legacySpeakerNames(session: TranscriptSession, version: TranscriptVersion) {
  const scopes = [
    ...(session.versions ?? []).filter(v => v.kind === 'post-meeting' && v.sourceJobId && v.id === 'file-' + v.sourceJobId).map(v => v.id),
    ...(session.realtime ?? []).map(snapshot => snapshot.id),
  ]
  const ids = new Set(version.speakers.map(s => s.id))
  return new Map((session.speakers ?? []).flatMap(speaker => {
    const name = speaker.displayName?.trim()
    if (!name || name === speaker.id || name === speaker.label || !ids.has(speaker.id) ||
      !scopes.some(scope => speaker.id.startsWith(scope + ':speaker:'))) return []
    return [[speaker.id, name] as const]
  }))
}
export function timestamp(ms: number, separator=':'): string {
  const value=Math.max(0,Math.round(ms))
  return [Math.floor(value/3600000),Math.floor(value/60000)%60,Math.floor(value/1000)%60].map(n=>String(n).padStart(2,'0')).join(separator)+'.'+String(value%1000).padStart(3,'0')
}
export function canExportTimed(version: TranscriptVersion): boolean {
  return version.segments.length>0 && version.segments.every(s=>s.startMs!==undefined && s.endMs!==undefined &&
    Number.isFinite(s.startMs)&&Number.isFinite(s.endMs)&&s.startMs>=0&&s.endMs>s.startMs)
}
export function reviewExport(session: TranscriptSession, format:'txt'|'md'|'srt'|'vtt', purpose: 'reading' | 'proofreading' = 'proofreading'): string {
  const version=selectedReviewVersion(session),names=new Map(version.speakers.map(s=>[s.id,s.displayName || s.label]))
  const label=(id?:string)=>id?names.get(id)||'未知说话人':'未知说话人'
  if(format==='srt'||format==='vtt'){
    if(!canExportTimed(version))throw new Error('所选版本缺少有效逐句时间，无法导出字幕；可填写时间，或导出 TXT / Markdown')
    const cues=[...version.segments].sort((a,b)=>a.startMs!-b.startMs!).map((s,i)=>{
      const start=timestamp(s.startMs!),end=timestamp(s.endMs!)
      return (i+1)+'\n'+(format==='srt'?start.replace('.',','):start)+' --> '+(format==='srt'?end.replace('.',','):end)+'\n['+label(s.speakerId)+'] '+s.text+'\n'
    }).join('\n')
    return (format==='vtt'?'WEBVTT\n\n':'')+cues
  }
  const namesForReading = (id?: string) => version.kind === 'post-meeting' ? label(id).replace(/ · 会后稿$/, '') : label(id)
  const content = purpose === 'reading' && version.segments.length
    ? readingParagraphs(version).map(group => {
      const first = group[0].segment
      return '[' + (first.startMs === undefined ? '无时间' : timestamp(first.startMs).slice(0, -4)) + '] [' + namesForReading(first.speakerId) + '] ' + group.map(({ segment }) => segment.text).join(' ')
    }).join('\n\n')
    : version.segments.length ? version.segments.map(s => {
      const time = s.startMs === undefined ? '无时间' : timestamp(s.startMs)
      const groups = version.merge?.groups.filter(group => group.outputIds.includes(s.id ?? '')) ?? []
      const review = groups.some(group => group.status === 'pending') ? ' [待确认]' : groups.some(group => group.decision === 'keep-current') ? ' [批量确认]' : ''
      return '[' + time + '] [' + label(s.speakerId) + ']' + (s.isFinal === false ? ' [临时片段]' : '') + review + ' ' + s.text
    }).join('\n\n') : version.text
  const title = session.title + ' · ' + versionLabel(version)
  const source = purpose === 'proofreading' ? '\n版本 ID：' + version.id + (version.merge ? '\n校正来源：' + [version.merge.baseVersionId, version.merge.postVersionId, version.merge.currentVersionId].join(' / ') : '') : ''
  return (format === 'md' ? '# ' : '') + title + '\n' + session.date + ' ' + session.time + '\n' + reviewStatus(version) + source + '\n\n' + content + '\n'
}

export function downloadReview(session: TranscriptSession, format:'txt'|'md'|'srt'|'vtt', purpose: 'reading' | 'proofreading' = 'proofreading') {
  const content=reviewExport(session,format,purpose),url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download=(session.title || 'transcript')+'-'+selectedReviewVersion(session).kind+'.'+format
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

/** Reading layout only: retain every sentence and its original index for audio/citations. */
export function readingParagraphs(version: TranscriptVersion) {
  const paragraphs: Array<Array<{ segment: TranscriptVersion['segments'][number]; index: number }>> = []
  const known = new Set(version.speakers.map(speaker => speaker.id))
  version.segments.forEach((segment, index) => {
    const last = paragraphs[paragraphs.length - 1]
    const previous = last?.[last.length - 1].segment
    const continuous = previous && segment.speakerId && known.has(segment.speakerId) && previous.speakerId === segment.speakerId &&
      previous.isFinal !== false && segment.isFinal !== false && previous.endMs !== undefined && segment.startMs !== undefined &&
      segment.startMs >= previous.endMs && segment.startMs - previous.endMs <= 1000
    if (continuous) last.push({ segment, index })
    else paragraphs.push([{ segment, index }])
  })
  return paragraphs
}

export function reviewStatus(version: TranscriptVersion): string {
  const pending = version.merge?.groups.filter(group => group.status === 'pending').length ?? 0
  const batch = version.merge?.groups.filter(group => group.decision === 'keep-current').length ?? 0
  return [pending ? `${pending} 处待确认（尚未全部校对）` : '无待确认项（不代表逐句核听）',
    batch ? `${batch} 处批量确认，保留当前正文` : ''].filter(Boolean).join('；')
}
