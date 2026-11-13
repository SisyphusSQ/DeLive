import { Select } from '../ui/Select'
import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '../ui'
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
import { useSessionStore } from '../../stores/sessionStore'
import { sessionRepository } from '../../utils/sessionRepository'
import { appendRevision, editedVersion, mapSpeakers, reviewVersions, selectedReviewVersion, timestamp, versionLabel } from '../../utils/reviewVersions'
import type { useRecordingPlayback } from '../../hooks/useRecordingPlayback'
import { SessionImages } from '../SessionImages'

const input='min-h-8 rounded-md border border-border bg-background px-2 py-1 text-sm'
interface TranscriptTabProps {
  session: TranscriptSession
  playback: ReturnType<typeof useRecordingPlayback>
  citation?: { quote: string }
  onCitationHandled?: () => void
}

export function TranscriptTab(props: TranscriptTabProps) {
  // Changing sessions remounts this editor; arriving machine results never reset its in-progress draft.
  return <ReviewTranscript key={props.session.id} {...props} />
}
function ReviewTranscript({ session, playback, citation, onCitationHandled }: TranscriptTabProps) {
  const versions = useMemo(() => reviewVersions(session), [session])
  const adopted = useMemo(() => selectedReviewVersion(session), [session])
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
  const compare = versions.find(value => value.id === compareId && value.id !== version.id)
  const [reviewOpen, setReviewOpen] = useState(false)
  const pendingCount = version.merge?.groups.filter(group => group.status === 'pending').length ?? 0
  const [citationTarget, setCitationTarget] = useState<{ index: number; startMs?: number }>()
  const readingRef = useRef<HTMLDivElement>(null)
  const handledCitation = useRef<typeof citation>()

  useEffect(() => {
    if (!citation || handledCitation.current === citation) return
    handledCitation.current = citation
    onCitationHandled?.()
    if (edit) { setNotice('请先保存或放弃校对草稿，再定位引用。'); return }
    const quote = citation.quote.trim()
    const matches = adopted.segments.flatMap((segment, index) => segment.text.includes(quote) ? [index] : [])
    setFilter('')
    setCompareId('')
    if (viewedId !== adopted.id) setViewedId(adopted.id)
    if (!quote || matches.length !== 1) {
      setNotice('当前采用稿没有唯一匹配的段落。可根据引用文字核对原稿。')
      return
    }
    const index = matches[0]
    setCitationTarget({ index, startMs: adopted.segments[index].startMs })
  }, [citation, adopted, edit, onCitationHandled, viewedId])

  useEffect(() => {
    if (citationTarget === undefined) return
    const passage = readingRef.current?.querySelector<HTMLElement>('[data-passage-index="' + citationTarget.index + '"]')
    passage?.scrollIntoView({ block: 'center' })
    passage?.focus({ preventScroll: true })
    if (playback.loading) return
    if (citationTarget.startMs !== undefined && playback.manifest) void playback.seek(citationTarget.startMs)
    setCitationTarget(undefined)
  }, [citationTarget, playback])

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
  const renderVersion = (value: TranscriptVersion, secondary = false) => {
    const names = new Map(value.speakers.map(speaker => [speaker.id, speaker.displayName || speaker.label]))
    const segments = value.segments.map((segment, index) => ({ segment, index })).filter(({ segment }) => segment.text.trim() && (
      secondary || !filter || (filter === 'unknown' ? !names.has(segment.speakerId ?? '') : segment.speakerId === filter)
    ))
    return (
      <div className="min-w-0" aria-label={secondary ? '对照稿内容' : '当前稿内容'}>
        {compare && <h3 className="mb-4 text-xs font-semibold text-muted-foreground">{versionLabel(value)}</h3>}
        {value.kind === 'post-meeting' && value.segments.length > 0 && !value.segments.some(segment => names.has(segment.speakerId ?? '')) && (
          <p className="mb-4 text-xs text-muted-foreground">这份会后结果没有说话人归属。文字和有效时间仍可使用。</p>
        )}
        {segments.map(({ segment, index }) => {
          const { startMs, endMs } = segment
          const active = (playback.state.playing || playback.state.positionMs > 0) && startMs !== undefined && endMs !== undefined &&
            playback.state.positionMs >= startMs && playback.state.positionMs < endMs
          const time = startMs === undefined ? '无时间戳' : timestamp(startMs)
          const canSeek = startMs !== undefined && !!playback.manifest
          const seek = () => { if (canSeek) void playback.seek(startMs, true) }
          return (
            <article
              key={segment.id ?? index}
              data-segment-id={segment.id ?? index}
              data-passage-index={secondary ? undefined : index}
              tabIndex={-1}
              data-playback-active={active || undefined}
              className={'review-passage mb-5 min-w-0 border-l-2 pl-3 ' + (active ? 'border-primary' : 'border-transparent')}
            >
              <div className="review-passage-meta mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                <span className="break-words font-semibold text-foreground">{names.get(segment.speakerId ?? '') || '未知说话人'}</span>
                {canSeek ? (
                  <button
                    type="button"
                    title={endMs === undefined ? time : time + ' – ' + timestamp(endMs)}
                    aria-label={'定位原音 ' + time}
                    className="rounded px-1 tabular-nums hover:bg-primary/10 hover:text-primary"
                    onClick={seek}
                  >
                    {time}
                  </button>
                ) : <span className="tabular-nums">{time}</span>}
                {segment.isFinal === false && <span>临时片段</span>}
              </div>
              {canSeek ? (
                <button
                  type="button"
                  className="block w-full select-text whitespace-pre-wrap break-words text-left text-[15px] leading-[1.9]"
                  onClick={() => { if (!window.getSelection()?.toString()) seek() }}
                >{segment.text}</button>
              ) : <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.9]">{segment.text}</p>}
            </article>
          )
        })}
        {!value.segments.length && <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.9]">{value.text || '此版本没有文字'}</p>}
        {!!value.segments.length && !segments.length && <p className="text-sm text-muted-foreground">此筛选下没有片段</p>}
      </div>
    )
  }
  return <div ref={readingRef} className="review-reading min-h-0 min-w-0 flex-1 overflow-y-auto" aria-label="稿件阅读区">{dialog}
    <div className={'review-reading-content mx-auto space-y-3 px-3 py-3 sm:px-6 sm:py-4 ' + (compare ? 'max-w-6xl' : 'max-w-[52rem]')}>
    {draftError&&<p role="alert" className="text-sm text-destructive">{draftError}</p>}
    <section aria-label="稿件版本" className="review-version-toolbar space-y-2 border-b border-border/60 pb-3">
      <div className="review-version-controls flex flex-wrap items-end gap-x-3 gap-y-2">
        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <span className="review-control-label block">查看稿件</span>
          <Select aria-label="当前稿件版本" className={input + ' review-version-select w-44 max-w-full text-foreground'} disabled={busy} value={version.id} onChange={e => void select(e.target.value)}>
            {versions.map(value => <option key={value.id} value={value.id}>{versionLabel(value)}</option>)}
          </Select>
        </label>
        <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <span className="review-control-label block">对照</span>
          <Select aria-label="对照稿件版本" className={input + ' review-compare-select w-36 max-w-full text-foreground'} value={compare?.id ?? ''} onChange={e => setCompareId(e.target.value)}>
            <option value="">不对照</option>
            {versions.filter(value => value.id !== version.id).map(value => <option key={value.id} value={value.id}>{versionLabel(value)}</option>)}
          </Select>
        </label>
        {!draft && <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <span className="review-control-label block">说话人</span>
          <Select aria-label="按说话人筛选" className={input + ' review-speaker-select w-32 max-w-full text-foreground'} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">全部片段</option><option value="unknown">未知说话人</option>
            {version.speakers.map(speaker => <option key={speaker.id} value={speaker.id}>{speaker.displayName || speaker.label}</option>)}
          </Select>
        </label>}
        {!draft && <Button size="sm" variant="secondary" className="review-edit-button" disabled={busy || !!groupDraft || session.status === 'recording'} onClick={startEdit}>
          <Pencil className="h-3.5 w-3.5" />校对当前稿件
        </Button>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="break-words" aria-live="polite">已采用 · {versionLabel(adopted)}</span>
        {version.id !== adopted.id && <>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">查看中 · 尚未采用</span>
          <Button size="sm" disabled={busy || !!edit} onClick={() => void action(async () => {
            if (pendingCount && !await confirm('此稿还有 ' + pendingCount + ' 处待确认，尚未全部校对。仍采用为当前稿，用于导出和 AI？')) return
            await persist(current => ({ versions: reviewVersions(current), selectedVersionId: version.id }))
          })}>采用为当前稿</Button>
        </>}
        {edit && <span className="text-warning">校对草稿未保存</span>}
        {session.status === 'recording' && <span>停止录音后可校对</span>}
        <details className="min-w-0 open:basis-full open:space-y-2">
          <summary className="cursor-pointer rounded px-1 py-1 font-medium text-foreground hover:bg-muted">会后转写与校正</summary>
          <RecordingFileActions session={session} onSelect={id => void select(id)} />
          {taskError && <p role="alert" className="text-xs text-destructive">任务读取失败：{taskError}</p>}
          {jobs.map(job => <FileTaskRow key={job.id} job={job} compact />)}
        </details>
      </div>
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
            const ui = useUIStore.getState()
            if (ui.reviewSessionId !== session.id || ui.reviewVersionId !== viewedId) return
            setViewedId(id);setFilter('');setCompareId('');setPairs({});setMappingSource('');playback.pause()
            setNotice('已保存恢复修订。请核对旧稿中的人工修改，再按需采用。')
          })}>另存恢复修订</button>
        </div>}
      </section>}
      {session.realtime?.some(r=>r.status==='incomplete')&&<p className="text-xs text-amber-600">此会议包含未完成的实时识别段；已保存原音与结果仍可校对。</p>}
    </section>

    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {!draft && (!needsRecovery || groupDraft) && (version.merge || version.kind === 'reconciled') && (
      <details open={!!groupDraft || reviewOpen} onToggle={event => {
        if (!groupDraft) setReviewOpen(event.currentTarget.open)
      }} className="rounded-md border border-primary/15 bg-primary/[0.03] px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          逐句校正审阅{pendingCount > 0 ? ' · ' + pendingCount + ' 处待确认' : ''}
        </summary>
        <div className="mt-2">
          <MergeReview
            key={version.id}
            version={version}
            versions={versions}
            busy={busy || session.status === 'recording'}
            draft={groupDraft}
            onDraft={group => {
              if (!group) {
                void confirm('放弃尚未保存的区段修改？').then(ok => { if (ok) setDraft(undefined) })
                return
              }
              setViewedId(version.id)
              useReviewDraftStore.getState().put(session.id, { source: structuredClone(version), group })
            }}
            onCompare={setCompareId}
            onEdit={startEdit}
            onSeek={playback.manifest ? ms => void playback.seek(ms, true) : undefined}
            onSave={async next => {
              setBusy(true)
              setError('')
              try {
                const note = next.merge?.strategy === 2 ? '已核对历史稿件，保留当前正文' : '人工确认自动校正区段，保留审阅进度'
                await saveRevision(editedVersion(version, next, note), version)
              } finally {
                setBusy(false)
              }
            }}
          />
        </div>
      </details>
    )}
    {draft&&source&&<fieldset aria-label="稿件校对编辑" disabled={busy} className="min-w-0 space-y-3 rounded-lg border border-primary/30 p-3">
      <p className="text-sm">校对尚未保存。保存会生成新版本，保留原稿与此前修订；导出使用已保存的当前版本。</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void action(() => saveRevision(editedVersion(source, draft, '人工校对文字、时间或说话人归属/姓名'), source))}>
          保存为修订版本
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void confirm('放弃未保存的校对内容？').then(ok => { if (ok) setDraft(undefined) })}>
          放弃校对
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDraft({
          ...draft,
          speakers: [...draft.speakers, { id: 'manual-' + crypto.randomUUID(), label: '新增匿名说话人 ' + (draft.speakers.length + 1) }],
        })}>新增匿名说话人</Button>
      </div>
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
    </fieldset>}
    {!draft && <div className={compare ? 'review-comparison grid grid-cols-1 gap-5 lg:grid-cols-2' : ''}>
      {renderVersion(version)}{compare && renderVersion(compare, true)}
    </div>}
    <details className="space-y-2">
      <summary className="cursor-pointer text-sm font-medium">图片资料{session.images?.length ? ' · ' + session.images.length : ''}</summary>
      <SessionImages session={session} getTime={() => playback.state.positionMs} onSeek={playback.manifest ? ms => void playback.seek(ms, true) : undefined} />
    </details>
    {!!playback.manifest?.events.length && <details className="space-y-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">录音来源与中断记录</summary>
      {playback.manifest.events.map((event, index) => <p key={index}>{timestamp(event.atMs)} {event.message}</p>)}
    </details>}

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
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">版本与编辑记录（{versions.length}）</summary><p className="my-1">说话人编号按稿件独立，录音来源与说话人归属分别记录。</p>{versions.map(v=><p className="py-1" key={v.id}>{versionLabel(v)} · {v.id}{v.parentVersionId?' · 基于 '+v.parentVersionId:''}{v.editNote?' · '+v.editNote:''}{v.speakerMapping?' · 已人工确认映射':''}</p>)}</details>
  </div></div>
}
