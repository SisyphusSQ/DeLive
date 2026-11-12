import { Select } from '../ui/Select'
import { useState, type SetStateAction } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useReviewDraftStore } from '../../stores/reviewDraftStore'
import { useConfirmation } from '../../hooks/useConfirmation'
import { useFileTaskStore } from '../../stores/fileTaskStore'
import { RecordingFileActions } from '../RecordingFileActions'
import { FileTaskRow } from '../FileTaskRow'
import { MergeReview } from './MergeReview'
import { needsTranscriptRecovery, transcriptRecoverySources, versionSegments } from '../../utils/transcriptMerge'
import { recoverReconciledVersion } from '../../utils/volcFileApi'
import type { TranscriptSession } from '../../types'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import type { AudioTrack } from '../../../../shared/recording'
import { useSessionStore } from '../../stores/sessionStore'
import { sessionRepository } from '../../utils/sessionRepository'
import { appendRevision, editedVersion, mapSpeakers, reviewVersions, selectedReviewVersion, timestamp, versionLabel } from '../../utils/reviewVersions'
import { useRecordingPlayback } from '../../hooks/useRecordingPlayback'
import { SessionImages } from '../SessionImages'

const input='rounded border border-border bg-background px-2 py-1 text-sm'
export function TranscriptTab({session}:{session:TranscriptSession}) {
  // Changing sessions remounts this editor; arriving machine results never reset its in-progress draft.
  return <ReviewTranscript key={session.id} session={session}/>
}
function ReviewTranscript({session}:{session:TranscriptSession}) {
  const versions=reviewVersions(session), adopted=selectedReviewVersion(session)
  const viewedId=useUIStore(s=>s.reviewVersionId)
  const setViewedId=(id:string)=>useUIStore.setState({reviewVersionId:id})
  const {confirm,dialog}=useConfirmation()
  const jobs=useFileTaskStore(s=>s.jobs).filter(job=>job.sessionId===session.id)
  const taskError=useFileTaskStore(s=>s.error)
  const [compareId,setCompareId]=useState(''),[filter,setFilter]=useState('')
  const [recoverySelection,setRecoverySelection]=useState<{ originalId: string; postId: string }>()
  const draftError=useReviewDraftStore(s=>s.error)
  const edit=useReviewDraftStore(s=>s.drafts[session.id]), source=edit?.source
  const draft=edit && 'value' in edit ? edit.value : undefined
  const groupDraft=edit && 'group' in edit ? edit.group : undefined
  const version=source ?? versions.find(v=>v.id===viewedId)??adopted
  const historicalSource = source?.merge?.strategy === 2 ? versions.find(v => v.id === source.merge?.currentVersionId) : undefined
  const needsRecovery = needsTranscriptRecovery(version)
  const recoverySources = needsRecovery ? transcriptRecoverySources(versions, version) : []
  const chooseRecoverySource = recoverySources.length > 1 ||
    (!!version.merge?.postVersionId && recoverySources.length > 0 && recoverySources[0].id !== version.merge.postVersionId)
  const recoverySource = chooseRecoverySource
    ? recoverySources.find(v => recoverySelection?.originalId === version.id && recoverySelection.postId === v.id)
    : recoverySources[0]
  const setDraft=(value:SetStateAction<TranscriptVersion|undefined>)=>{
    const current=useReviewDraftStore.getState().drafts[session.id]
    const next=typeof value==='function'?value(current && 'value' in current ? current.value : undefined):value
    if(next)useReviewDraftStore.getState().put(session.id,{source:current?.source??structuredClone(version),value:next})
    else useReviewDraftStore.getState().clear(session.id)
  }
  const [mappingSource,setMappingSource]=useState(''),[pairs,setPairs]=useState<Record<string,string>>({})
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const playback=useRecordingPlayback(session.audioRecordingId),compare=versions.find(v=>v.id===compareId)
  const action=async(run:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await run()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const persist=async(update:(current:TranscriptSession)=>Partial<TranscriptSession>)=>{
    const sessions=await sessionRepository.mutateDurable(session.id,update);useSessionStore.setState({sessions})
  }
  const select=async(id:string)=>{
    if(busy)return
    if(edit&&!await confirm('放弃尚未保存的校对内容并切换版本？'))return
    await action(async()=>{setViewedId(id);setDraft(undefined);setFilter('');setPairs({});setMappingSource('');playback.pause()})
  }
  const saveRevision=async(revision:TranscriptVersion,parent:TranscriptVersion)=>{
    await persist(current=>{const next=appendRevision(current,revision,parent);return {versions:next.versions}})
    if(edit)useReviewDraftStore.getState().clear(session.id,edit)
    const ui=useUIStore.getState()
    if(ui.reviewSessionId===session.id && ui.reviewVersionId===viewedId && !useReviewDraftStore.getState().drafts[session.id]) {
      setViewedId(revision.id);setPairs({});setMappingSource('');setNotice('已保存独立修订版本，原稿保留；采用后用于导出与 AI')
    }
  }
  const startEdit=()=>{
    const copy={...structuredClone(version),segments:versionSegments(version)}
    if(!copy.segments.length && copy.text)copy.segments=[{id:copy.id+':text',text:copy.text}]
    setViewedId(version.id)
    useReviewDraftStore.getState().put(session.id,{source:structuredClone(version),value:copy});setError('')
  }
  const updateSegment=(index:number,patch:Partial<TranscriptVersion['segments'][number]>)=>setDraft(old=>old?{...old,segments:old.segments.map((s,i)=>i===index?{...s,...patch}:s)}:old)
  const renderVersion=(value:TranscriptVersion,secondary=false)=>{
    const names=new Map(value.speakers.map(s=>[s.id,s.displayName || s.label]))
    const segments=value.segments.filter(s=>s.text.trim() && (secondary || !filter || (filter==='unknown'?!names.has(s.speakerId ?? ''):s.speakerId===filter)))
    return <div className="space-y-2 min-w-0" aria-label={secondary?'对照稿内容':'当前稿内容'}>
      <h4 className="text-sm font-semibold">{versionLabel(value)}</h4>
      {value.editNote&&<p className="text-xs text-muted-foreground">{value.editNote}</p>}
      {value.kind==='post-meeting'&&value.segments.length>0&&!value.segments.some(s=>names.has(s.speakerId ?? ''))&&
        <p className="text-xs text-muted-foreground">这份会后结果没有说话人归属。文字和有效时间仍可使用。</p>}
      {segments.map((s,i)=><article key={s.id??i} className={'border-b py-3 px-1 '+(playback.state.playing&&s.startMs!==undefined&&playback.state.positionMs>=s.startMs&&playback.state.positionMs<(s.endMs??s.startMs)?'border-primary bg-primary/5':'border-border')} data-segment-id={s.id??i}>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{s.speakerId?names.get(s.speakerId)||'未知说话人':'未知说话人'}</span>
          <span>{s.isFinal===false?'临时片段':value.kind==='reconciled'?(value.merge?.strategy===2?'会后分句':'自动校正'):value.kind==='edited'?'人工修订':value.kind==='legacy'?'历史片段':'稳定片段'}</span>
          <span>{s.startMs===undefined?'无时间戳':timestamp(s.startMs)+' – '+(s.endMs===undefined?'未确定':timestamp(s.endMs))}</span>
        </div>
        <button className="mt-2 block w-full whitespace-pre-wrap text-left text-sm leading-relaxed disabled:cursor-text" disabled={!playback.manifest || s.startMs===undefined} title={s.startMs===undefined?'没有时间戳':!playback.manifest?'原音不可用':'点击文字定位原音'} onClick={()=>void playback.seek(s.startMs!,true)}>{s.text}</button>
      </article>)}
      {!value.segments.length&&<p className="whitespace-pre-wrap text-sm">{value.text || '此版本没有文字'}</p>}
      {!!value.segments.length&&!segments.length&&<p className="text-sm text-muted-foreground">此筛选下没有片段</p>}
    </div>
  }
  return <div className="flex-1 overflow-y-auto">{dialog}<div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-5">
    {draftError&&<p role="alert" className="text-sm text-destructive">{draftError}</p>}
    <section aria-label="稿件版本" className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">查看稿件 <Select aria-label="当前稿件版本" className={input+' max-w-72'} disabled={busy} value={version.id} onChange={e=>void select(e.target.value)}>{versions.map(v=><option key={v.id} value={v.id}>{versionLabel(v)}</option>)}</Select></label>
        <label className="text-sm">对照 <Select aria-label="对照稿件版本" className={input+' max-w-72'} value={compareId} onChange={e=>setCompareId(e.target.value)}><option value="">不对照</option>{versions.filter(v=>v.id!==version.id).map(v=><option key={v.id} value={v.id}>{versionLabel(v)}</option>)}</Select></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{version.id===adopted.id?'当前稿 · 用于导出和 AI':'正在查看其他版本 · 尚未采用'}</span>{version.id!==adopted.id&&<button className={input+' text-primary'} disabled={busy||!!edit} onClick={()=>void action(async()=>{
        const pending=version.merge?.groups.filter(g=>g.status==='pending').length??0
        if(pending&&!await confirm(`此稿还有 ${pending} 处待确认，尚未全部校对。仍采用为当前稿，用于导出和 AI？`))return
        await persist(current=>({versions:reviewVersions(current),selectedVersionId:version.id}));setNotice('已采用为当前稿；原稿可随时切回')
      })}>采用为当前稿</button>}<details><summary className="cursor-pointer">版本说明</summary><p>人工修订另存版本；各稿件的说话人编号独立，不能据相同编号推断身份。录音来源不是说话人。</p></details></div>
      {needsRecovery&&<section aria-label="恢复历史稿件" className="space-y-2 rounded-md border border-border p-3">
        <p className="text-sm">{recoverySources.length ? '此稿的历史文字未逐句对齐，可用已有会后稿恢复说话人与时间。' : '此稿的历史文字未逐句对齐，暂时没有可用于恢复的结构化会后稿。'}</p>
        {recoverySources.length>0&&<div className="flex flex-wrap items-center gap-2">
          {chooseRecoverySource&&<Select aria-label="用于恢复的会后稿" className={input+' max-w-72'} disabled={busy||!!edit} value={recoverySource?.id ?? ''} onChange={e=>setRecoverySelection({originalId:version.id,postId:e.target.value})}>
            <option value="">选择会后稿</option>{recoverySources.map(post=><option key={post.id} value={post.id}>{versionLabel(post)}</option>)}
          </Select>}
          <button className={input} disabled={busy||!!edit||!recoverySource} onClick={()=>recoverySource&&void select(recoverySource.id)}>查看会后稿</button>
          <button className={input+' text-primary'} disabled={busy||!!edit||!recoverySource||session.status==='recording'} onClick={()=>void action(async()=>{
            if (!recoverySource || !await confirm('从已有会后稿另存恢复修订？历史全文将保留供核对，当前采用稿保持原样。')) return
            const id = await recoverReconciledVersion(session.id,version.id,recoverySource.id)
            setViewedId(id);setFilter('');setCompareId('');setPairs({});setMappingSource('');playback.pause()
            setNotice('已保存恢复修订。请核对旧稿中的人工修改，再按需采用。')
          })}>另存恢复修订</button>
        </div>}
      </section>}
      {session.realtime?.some(r=>r.status==='incomplete')&&<p className="text-xs text-amber-600">此会议包含未完成的实时识别段；已保存原音与结果仍可校对。</p>}
    </section>

    <section aria-label="原音回放" className="sticky top-0 z-10 rounded-lg border border-border bg-background/95 p-3 space-y-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">原音回放</span>
        {playback.manifest&&<><button className={input} onClick={()=>playback.state.playing?playback.pause():void playback.play()}>{playback.state.playing?'暂停':'播放'}</button>
          <Select aria-label="回放录音来源" className={input} value={playback.track} onChange={e=>playback.changeTrack(e.target.value as AudioTrack)}>{(['mix','system','microphone'] as const).filter(t=>playback.manifest!.blocks.some(b=>b.tracks.includes(t))).map(t=><option key={t} value={t}>{{mix:'同步混音',system:'系统声音',microphone:'麦克风'}[t]}</option>)}</Select>
          <span className="font-mono text-xs" data-playback-position={Math.round(playback.state.positionMs)}>{timestamp(playback.state.positionMs)} / {timestamp(playback.manifest.durationMs)}</span></>}
      </div>
      {playback.manifest&&<input aria-label="原音播放位置" className="w-full" type="range" min={0} max={playback.manifest.durationMs} step={10} value={playback.state.positionMs} onChange={e=>void playback.seek(Number(e.target.value),playback.state.playing)}/>}
      {playback.loading&&<p className="text-sm">正在读取原音索引…</p>}
      {playback.state.message&&<p role="status" className="text-sm text-amber-700 dark:text-amber-400">{playback.state.message}</p>}
      {playback.state.nextMs!==undefined&&<button className={input} onClick={()=>void playback.seek(playback.state.nextMs!,true)}>跳到下一段可用原音 {timestamp(playback.state.nextMs)}</button>}
      {!!playback.manifest?.events.length&&<details className="text-xs text-muted-foreground"><summary>录音来源与中断记录</summary>{playback.manifest.events.map((e,i)=><p key={i}>{timestamp(e.atMs)} {e.message}</p>)}</details>}
    </section>

    <RecordingFileActions session={session} onSelect={id=>void select(id)} />
    {taskError&&<p role="alert" className="text-xs text-destructive">任务读取失败：{taskError}</p>}
    {jobs.slice(0,1).map(job=><FileTaskRow key={job.id} job={job} compact/>)}
    {!draft&&(!needsRecovery||groupDraft)&&<MergeReview key={version.id} version={version} versions={versions} busy={busy || session.status==='recording'} draft={groupDraft}
      onDraft={group=>{
        if (!group) { void confirm('放弃尚未保存的区段修改？').then(ok=>{if(ok)setDraft(undefined)}); return }
        setViewedId(version.id)
        useReviewDraftStore.getState().put(session.id,{source:structuredClone(version),group})
      }} onCompare={id=>setCompareId(id)} onEdit={startEdit} onSeek={playback.manifest?ms=>void playback.seek(ms,true):undefined} onSave={async next=>{
      setBusy(true);setError('');try{await saveRevision(editedVersion(version,next,next.merge?.strategy===2
        ? '已核对历史稿件，保留当前正文' : '人工确认自动校正区段，保留审阅进度'),version)}finally{setBusy(false)}
    }}/>}
    <SessionImages session={session} getTime={() => playback.state.positionMs} onSeek={playback.manifest ? ms => void playback.seek(ms, true) : undefined} />
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="text-sm text-emerald-600">{notice}</p>}
    {draft&&source?<fieldset aria-label="稿件校对编辑" disabled={busy} className="min-w-0 space-y-3 rounded-lg border border-primary/30 p-3">
      <p className="text-sm">校对尚未保存。保存会生成新版本，保留原稿与此前修订；导出使用已保存的当前版本。</p>
      {historicalSource&&<details className="text-sm">
        <summary className="cursor-pointer">查看历史全文</summary>
        <p className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words">{historicalSource.text}</p>
      </details>}
      <div className="flex flex-wrap gap-3">{draft.speakers.map(s=><label key={s.id} className="text-xs">{s.label}<input aria-label={'说话人姓名 '+s.id} className={'block '+input} value={s.displayName??''} placeholder="匿名名称" onChange={e=>setDraft({...draft,speakers:draft.speakers.map(item=>item.id===s.id?{...item,displayName:e.target.value}:item)})}/></label>)}</div>
      {draft.segments.map((s,i)=><div key={s.id??i} className="space-y-2 rounded border border-border p-2">
        <div className="flex flex-wrap gap-2"><Select aria-label={'片段 '+(i+1)+' 归属'} className={input} value={s.speakerId??''} onChange={e=>updateSegment(i,{speakerId:e.target.value||undefined})}><option value="">未知说话人</option>{draft.speakers.map(p=><option key={p.id} value={p.id}>{p.displayName||p.label}</option>)}</Select>
          <label className="text-xs">开始（秒）<input aria-label={'片段 '+(i+1)+' 开始秒'} className={input+' w-24'} type="number" min="0" step="0.001" value={s.startMs===undefined?'':s.startMs/1000} onChange={e=>updateSegment(i,{startMs:e.target.value===''?undefined:Number(e.target.value)*1000})}/></label>
          <label className="text-xs">结束（秒）<input aria-label={'片段 '+(i+1)+' 结束秒'} className={input+' w-24'} type="number" min="0" step="0.001" value={s.endMs===undefined?'':s.endMs/1000} onChange={e=>updateSegment(i,{endMs:e.target.value===''?undefined:Number(e.target.value)*1000})}/></label></div>
        <button className="text-xs text-destructive" onClick={()=>setDraft(old=>old?{...old,text:old.segments.length===1?'':old.text,segments:old.segments.filter((_,index)=>index!==i)}:old)}>删除此片段</button>
        <textarea aria-label={'片段 '+(i+1)+' 文字'} className={input+' w-full min-h-20'} value={s.text} onChange={e=>updateSegment(i,{text:e.target.value})}/>
      </div>)}
      {!draft.segments.length&&<textarea aria-label="纯文字校对" className={input+' w-full min-h-40'} value={draft.text} onChange={e=>setDraft({...draft,text:e.target.value})}/>}
      <div className="flex flex-wrap gap-3"><button className={input} disabled={busy} onClick={()=>void action(()=>saveRevision(editedVersion(source,draft,'人工校对文字、时间或说话人归属/姓名'),source))}>保存为修订版本</button><button className={input} disabled={busy} onClick={()=>void confirm('放弃未保存的校对内容？').then(ok=>{if(ok)setDraft(undefined)})}>放弃校对</button>
        <button className={input} onClick={()=>setDraft({...draft,speakers:[...draft.speakers,{id:'manual-'+crypto.randomUUID(),label:'新增匿名说话人 '+(draft.speakers.length+1)}]})}>新增匿名说话人</button></div>
    </fieldset>:<div className="flex flex-wrap gap-3 items-center"><button className={input} disabled={busy || !!groupDraft || session.status==='recording'} onClick={startEdit}>校对当前稿件</button>
      <label className="text-sm">按说话人查看 <Select aria-label="按说话人筛选" className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="">全部片段</option><option value="unknown">未知说话人</option>{version.speakers.map(s=><option key={s.id} value={s.id}>{s.displayName||s.label}</option>)}</Select></label>
      {session.status==='recording'&&<span className="text-xs">停止录音后可校对</span>}</div>}

    {!edit&&version.speakers.length>0&&versions.some(v=>v.id!==version.id&&v.speakers.length>0)&&<details className="space-y-2"><summary className="text-sm cursor-pointer">人工确认跨版本说话人映射</summary>
      <p className="text-xs text-muted-foreground">逐项确认后，将选定姓名复制到一个新的人工修订版本。保留原编号和原版本；多项映射到同一姓名表示你的人工判断，不建立跨会议身份。</p>
      <Select aria-label="姓名映射来源版本" className={input} value={mappingSource} onChange={e=>{setMappingSource(e.target.value);setPairs({})}}><option value="">选择姓名来源稿件</option>{versions.filter(v=>v.id!==version.id&&v.speakers.length).map(v=><option value={v.id} key={v.id}>{versionLabel(v)}</option>)}</Select>
      {mappingSource&&version.speakers.map(s=><label key={s.id} className="flex items-center gap-2 text-sm">{s.displayName||s.label}<Select aria-label={'映射 '+s.id} className={input} value={pairs[s.id]??''} onChange={e=>{const next={...pairs};if(e.target.value)next[s.id]=e.target.value;else delete next[s.id];setPairs(next)}}><option value="">不映射</option>{versions.find(v=>v.id===mappingSource)?.speakers.map(from=><option key={from.id} value={from.id}>{from.displayName||from.label}</option>)}</Select></label>)}
      <button className={input} disabled={busy||!Object.keys(pairs).length||session.status==='recording'} onClick={()=>void action(async()=>{
        if(!await confirm('确认所选说话人对应关系，并另存修订版本？已有版本和姓名不会被改写。'))return
        const from=versions.find(v=>v.id===mappingSource);if(!from)throw new Error('来源稿件不存在')
        await saveRevision(mapSpeakers(version,from,pairs),version)
      })}>确认映射并另存版本</button>
    </details>}
    <div className={compare?'grid grid-cols-1 xl:grid-cols-2 gap-5':''}>{renderVersion(version)}{compare&&renderVersion(compare,true)}</div>
    <details className="text-xs text-muted-foreground"><summary>版本与编辑记录（{versions.length}）</summary>{versions.map(v=><p className="py-1" key={v.id}>{versionLabel(v)} · {v.id}{v.parentVersionId?' · 基于 '+v.parentVersionId:''}{v.editNote?' · '+v.editNote:''}{v.speakerMapping?' · 已人工确认映射':''}</p>)}</details>
  </div></div>
}
