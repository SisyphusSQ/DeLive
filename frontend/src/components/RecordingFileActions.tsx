import { ReviewToolPanel } from './review/ReviewToolPanel'
import { useEffect, useState, type ReactNode } from 'react'
import type { TranscriptSession } from '../types'
import { useFileTaskStore, refreshFileTasks } from '../stores/fileTaskStore'
import { useReviewDraftStore } from '../stores/reviewDraftStore'
import { getVolcCredentialIssue, useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { fileTaskApi, generateReconciledVersion, startRecordingFileTask } from '../utils/volcFileApi'
import { reviewVersions, versionLabel } from '../utils/reviewVersions'
import { needsTranscriptRecovery, reconciliationBase } from '../utils/transcriptMerge'
import { ActionDialog } from './ActionDialog'
import { Select } from './ui/Select'

export const taskActive = (status: string) => !['completed','failed','cancelled'].includes(status)
export function RecordingFileActions({ session, onSelect, children, asPanel = false }: { session: TranscriptSession; onSelect?: (id: string)=>void; children?: ReactNode; asPanel?: boolean }) {
  const credentialIssue = useSettingsStore(getVolcCredentialIssue)
  const [configured,setConfigured]=useState<boolean>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [confirm,setConfirm]=useState(false),[postId,setPostId]=useState('')
  const jobs=useFileTaskStore(s=>s.jobs), active=jobs.find(job=>job.sessionId===session.id&&taskActive(job.status))
  const awaitingRecovery = jobs.find(job => job.sessionId === session.id && !taskActive(job.status) && (job.cleanup === 'pending' || job.cleanup === 'failed' || (job.status === 'completed' && job.version && !session.versions?.some(version => version.id === job.version?.id))))
  const draft=useReviewDraftStore(s=>s.drafts[session.id])
  const versions=reviewVersions(session), posts=versions.filter(v=>v.kind==='post-meeting'), post=posts.find(v=>v.id===postId)??posts[posts.length-1]
  const merged=post&&versions.filter(v=>v.merge?.postVersionId===post.id && !needsTranscriptRecovery(v)).slice(-1)[0]
  const postHasTask = post && jobs.some(job => job.sessionId === session.id && job.version?.id === post.id)
  let canMerge=false
  try { canMerge=!!reconciliationBase(session).text.trim() } catch { /* Pure audio imports have no real-time baseline. */ }
  useEffect(()=>{void Promise.resolve().then(()=>fileTaskApi().settings()).then(value=>setConfigured(value.configured)).catch(e=>setError(e.message))},[])
  const action=async(run:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await run();await refreshFileTasks()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const button='rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-40'
  const submitButton = !active && !awaitingRecovery && session.audioRecordingId && <button
        className={button}
        data-settings-entry={credentialIssue || !configured ? 'recording-file-config' : undefined}
        disabled={busy||!!draft||session.status==='recording'||(configured===undefined&&!error)}
        onClick={()=>{
          if (credentialIssue) useUIStore.getState().openSettings('provider', 'volc')
          else if (!configured) useUIStore.getState().openSettings('fileStorage')
          else setConfirm(true)
        }}
      >{credentialIssue ? '配置火山凭据' : !configured ? '配置私有存储' : posts.length ? '重新转写原音' : '会后转写'}</button>
  const body = <div className="space-y-2" aria-label="原音会后转写">
    {asPanel && post && !postHasTask && <div className="review-post-result"><strong>会后稿已保存</strong><time>{new Date(post.createdAt).toLocaleString()}</time></div>}
    <div className="flex flex-wrap items-center gap-2">
      {asPanel && post && !postHasTask && onSelect && <button className={button} disabled={!!draft} onClick={() => onSelect(post.id)}>查看此稿</button>}
      {post&&canMerge&&<>
        {posts.length>1&&<Select aria-label="用于校正的会后稿" className={button+' max-w-72'} value={post.id} onChange={e=>setPostId(e.target.value)}>{posts.map(v=><option key={v.id} value={v.id}>{versionLabel(v)}</option>)}</Select>}
        <button className={button} disabled={busy||!!draft||session.status==='recording'} onClick={()=>void action(async()=>{await generateReconciledVersion(session.id,post.id);setNotice('修订已保存，可在稿件菜单查看')})}>生成校正版</button>
        {merged&&!postHasTask&&onSelect&&<button className={button+' text-primary'} disabled={!!draft} onClick={()=>onSelect(merged.id)}>{merged.merge?.strategy===2?'查看恢复修订':'查看校正版'}{merged.merge?.groups.some(g=>g.status==='pending')?' · '+merged.merge.groups.filter(g=>g.status==='pending').length+' 处待确认':''}</button>}
      </>}
      {!asPanel && submitButton}
      {awaitingRecovery && <span className="text-xs text-muted-foreground">请先处理现有任务的保存或清理状态</span>}
      {active&&<span className="text-xs text-muted-foreground">已有转写任务，下方可查看进度</span>}
      {!session.audioRecordingId&&<span className="text-xs text-muted-foreground">此会议没有本地原音</span>}
      {draft&&<span className="text-xs text-amber-700 dark:text-amber-400">请先保存或放弃校对草稿</span>}
    </div>
    {!active&&session.audioRecordingId&&credentialIssue&&<p className="text-xs text-amber-700 dark:text-amber-400">{credentialIssue}</p>}
    {notice&&<p role="status" className="text-xs text-success">{notice}</p>}{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {children}
    <ActionDialog open={confirm} title="提交会后转写"
      description={`${session.title} · ${Math.ceil((session.duration??0)/60000)} 分钟。将同步混音的临时副本上传至火山标准文件转写，可能计费；${posts.length?'已有会后稿可直接本地校正，无需再次识别。':''}完成后另存会后稿，保留原稿与人工修改；需要时再对照生成校正版。`}
      onClose={()=>setConfirm(false)} actions={[{label:'取消',onClick:()=>setConfirm(false)},{label:'确认提交（可能计费）',variant:'primary',onClick:()=>{setConfirm(false);void action(async()=>{await startRecordingFileTask(session.id,session.audioRecordingId!);setNotice('')})}}]} />
  </div>
  return asPanel ? <ReviewToolPanel title="会后转写" collapsedSummary={active ? "任务进行中" : post ? "已有会后稿" : ""} action={submitButton}>{body}</ReviewToolPanel> : body
}
