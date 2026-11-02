import type { TranscriptSession } from '../types'
import type { TranscriptVersion } from '../../../shared/fileTranscription'

export function versionLabel(version: TranscriptVersion): string {
  const kind = version.editNote?.startsWith('历史译文') ? '历史译文' : { realtime:'实时稿', 'post-meeting':'会后稿', edited:'人工修订', legacy:'历史原稿' }[version.kind]
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
  if (corrected && !versions.some(v=>v.kind==='edited' && v.text===corrected)) versions.push({
    id:freeId('correction-'+session.id),kind:'edited',createdAt:session.correction?.completedAt ?? session.updatedAt,
    parentVersionId:original?.id,text:corrected,segments:[],speakers:[],editNote:'旧会话校对结果；没有逐句时间对齐',
  })
  const translation = session.translatedTranscript?.text?.trim()
  if (translation && !versions.some(v=>v.editNote?.startsWith('历史译文') && v.text===translation)) versions.push({
    id:freeId('translation-'+session.id),kind:'legacy',createdAt:session.translatedTranscript?.updatedAt ?? session.updatedAt,
    text:translation,segments:[],speakers:[],editNote:'历史译文 · '+(session.translatedTranscript?.targetLanguage || '未标语言')+'；无逐句时间对齐',
  })
  return versions
}
export function selectedReviewVersion(session: TranscriptSession): TranscriptVersion {
  const versions=reviewVersions(session)
  return versions.find(v=>v.id===session.selectedVersionId) ?? versions.find(v=>v.text.trim()) ?? versions[0]
}
export function editedVersion(source: TranscriptVersion, draft: TranscriptVersion, note: string): TranscriptVersion {
  const speakerIds=new Set(draft.speakers.map(s=>s.id))
  for(const s of draft.segments){
    if(s.speakerId && !speakerIds.has(s.speakerId))throw new Error('片段说话人不在当前稿件中')
    if((s.startMs===undefined)!==(s.endMs===undefined))throw new Error('开始和结束时间必须同时填写，或同时留空')
    if(s.startMs!==undefined && (!Number.isFinite(s.startMs)||s.startMs<0||!Number.isFinite(s.endMs)||s.endMs!<=s.startMs))throw new Error('片段时间必须有限且结束晚于开始')
  }
  return { ...structuredClone(draft),id:'edit-'+crypto.randomUUID(),kind:'edited',parentVersionId:source.id,
    createdAt:Date.now(),text:draft.segments.length?draft.segments.map(s=>s.text).join('\n'):draft.text,
    response:undefined,editNote:note }
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
export function timestamp(ms: number, separator=':'): string {
  const value=Math.max(0,Math.round(ms))
  return [Math.floor(value/3600000),Math.floor(value/60000)%60,Math.floor(value/1000)%60].map(n=>String(n).padStart(2,'0')).join(separator)+'.'+String(value%1000).padStart(3,'0')
}
export function canExportTimed(version: TranscriptVersion): boolean {
  return version.segments.length>0 && version.segments.every(s=>s.startMs!==undefined && s.endMs!==undefined &&
    Number.isFinite(s.startMs)&&Number.isFinite(s.endMs)&&s.startMs>=0&&s.endMs>s.startMs)
}
export function reviewExport(session: TranscriptSession, format:'txt'|'md'|'srt'|'vtt'): string {
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
  const content=version.segments.length?version.segments.map(s=>{
    const time=s.startMs===undefined?'无时间':timestamp(s.startMs)
    return '['+time+'] ['+label(s.speakerId)+']'+(s.isFinal===false?' [临时片段]':'')+' '+s.text
  }).join('\n\n'):version.text
  const title=session.title+' · '+versionLabel(version)
  return (format==='md'?'# ':'')+title+'\n\n'+content+'\n'
}
export function downloadReview(session: TranscriptSession, format:'txt'|'md'|'srt'|'vtt') {
  const content=reviewExport(session,format),url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download=(session.title || 'transcript')+'-'+selectedReviewVersion(session).kind+'.'+format
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
