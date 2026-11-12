import { useState } from 'react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import { editMergeGroup, resolveMergeGroup, versionSegments } from '../../utils/transcriptMerge'
import { timestamp } from '../../utils/reviewVersions'

export function MergeReview({version,versions,busy,onSave,onSeek}:{version:TranscriptVersion;versions:TranscriptVersion[];busy:boolean;onSave:(next:TranscriptVersion)=>Promise<void>;onSeek?:(ms:number)=>void}) {
  const [selected,setSelected]=useState(''),[onlyPending,setOnlyPending]=useState(true),[editing,setEditing]=useState(false),[text,setText]=useState(''),[error,setError]=useState('')
  const merge=version.merge
  if(!merge)return version.kind==='reconciled'?<p role="alert" className="text-sm text-destructive">校正来源记录不完整，请保留此稿并重新生成校正版。</p>:null
  const pending=merge.groups.filter(g=>g.status==='pending'),groups=onlyPending?pending:merge.groups
  const group=groups.find(g=>g.id===selected)??groups[0], index=group?groups.indexOf(group):-1
  const original=versions.find(v=>v.id===merge.currentVersionId),post=versions.find(v=>v.id===merge.postVersionId)
  const current=group&&original?versionSegments(original).filter(s=>group.currentIds.includes(s.id!)):[]
  const incoming=group&&post?versionSegments(post).filter(s=>group.postIds.includes(s.id!)):[]
  const output=group?version.segments.filter(s=>group.outputIds.includes(s.id!)):[]
  const at=output[0]?.startMs??current[0]?.startMs??incoming[0]?.startMs
  const button='rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40'
  const save=async(choice:'original'|'incoming'|'edited')=>{if(!group)return;setError('');try{const next=choice==='edited'?editMergeGroup(version,group.id,text):resolveMergeGroup(version,group.id,choice,versions);await onSave(next);setEditing(false);setSelected('')}catch(e){setError((e as Error).message)}}
  return <section aria-label="逐句校正审阅" className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{pending.length?`${pending.length} 处待确认`:'校正审阅已完成'} <span className="font-normal text-muted-foreground">· 原稿保留</span></h3>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyPending} onChange={e=>{setOnlyPending(e.target.checked);setEditing(false)}}/>只看待确认</label></div>
    {group&&<>
      <div className="flex flex-wrap items-center gap-2"><button className={button} disabled={index<=0||busy} onClick={()=>{setSelected(groups[index-1].id);setEditing(false)}}>上一处</button><span className="text-xs text-muted-foreground">{index+1} / {groups.length}</span><button className={button} disabled={index>=groups.length-1||busy} onClick={()=>{setSelected(groups[index+1].id);setEditing(false)}}>下一处</button>
        {at!==undefined&&<button className={button} disabled={!onSeek} onClick={()=>onSeek?.(at)}>听原音 {timestamp(at)}</button>}
        <span className="text-xs text-muted-foreground">{group.reason??'时间对应明确，已采用会后稿文字；可对照修改'}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 text-sm leading-6"><div><h4 className="mb-1 text-xs font-medium text-muted-foreground">原稿 / 已保存修改</h4><p className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{current.map(s=>s.text).join('\n')||'无原文（或已人工删除）'}</p></div><div><h4 className="mb-1 text-xs font-medium text-muted-foreground">会后稿建议</h4><p className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{incoming.map(s=>s.text).join('\n')||'未对应到会后稿，不能据此删除原文'}</p></div></div>
      {editing&&<label className="block text-xs text-muted-foreground">手动修改（留空表示删除此区段；多句合改不会虚构时间）<textarea aria-label="校正区段文字" className="mt-2 min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground" value={text} onChange={e=>setText(e.target.value)}/></label>}
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||!incoming.length} onClick={()=>void save('incoming')}>采用会后稿</button><button className={button} disabled={busy} onClick={()=>void save('original')}>保留原文</button><button className={button} disabled={busy} onClick={()=>{setText(output.map(s=>s.text).join('\n'));setEditing(!editing)}}>手动修改</button>{editing&&<button className={button} disabled={busy} onClick={()=>void save('edited')}>保存本处修改</button>}</div>
    </>}
    <p className="text-xs text-muted-foreground">每次确认另存审阅进度。采用为当前稿后，导出和 AI 使用该版本；机器合并不代表逐字正确。</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
