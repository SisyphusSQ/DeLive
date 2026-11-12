import { useEffect, useState } from 'react'
import type { TranscriptSession } from '../types'
import { useFileTaskStore, refreshFileTasks } from '../stores/fileTaskStore'
import { useReviewDraftStore } from '../stores/reviewDraftStore'
import { useUIStore } from '../stores/uiStore'
import { fileTaskApi, generateReconciledVersion, startRecordingFileTask } from '../utils/volcFileApi'
import { reviewVersions, versionLabel } from '../utils/reviewVersions'
import { needsTranscriptRecovery, reconciliationBase } from '../utils/transcriptMerge'
import { ActionDialog } from './ActionDialog'
import { Select } from './ui/Select'

export const taskActive = (status: string) => !['completed','failed','cancelled'].includes(status)
export function RecordingFileActions({ session, onSelect }: { session: TranscriptSession; onSelect?: (id: string)=>void }) {
  const [configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [confirm,setConfirm]=useState(false),[postId,setPostId]=useState('')
  const jobs=useFileTaskStore(s=>s.jobs), active=jobs.find(job=>job.sessionId===session.id&&taskActive(job.status))
  const draft=useReviewDraftStore(s=>s.drafts[session.id])
  const versions=reviewVersions(session), posts=versions.filter(v=>v.kind==='post-meeting'), post=posts.find(v=>v.id===postId)??posts[posts.length-1]
  const merged=post&&versions.filter(v=>v.merge?.postVersionId===post.id && !needsTranscriptRecovery(v)).slice(-1)[0]
  let canMerge=false
  try { canMerge=!!reconciliationBase(session).text.trim() } catch { /* Pure audio imports have no real-time baseline. */ }
  useEffect(()=>{void Promise.resolve().then(()=>fileTaskApi().settings()).then(value=>setConfigured(value.configured)).catch(e=>setError(e.message))},[])
  const action=async(run:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await run();await refreshFileTasks()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const button='rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-40'
  return <div className="space-y-2" aria-label="原音会后转写">
    <div className="flex flex-wrap items-center gap-2">
      {post&&canMerge&&<>
        {posts.length>1&&<Select aria-label="用于校正的会后稿" className={button+' max-w-72'} value={post.id} onChange={e=>setPostId(e.target.value)}>{posts.map(v=><option key={v.id} value={v.id}>{versionLabel(v)}</option>)}</Select>}
        <button className={button} disabled={busy||!!draft||session.status==='recording'} onClick={()=>void action(async()=>{await generateReconciledVersion(session.id,post.id);setNotice('修订已保存，可在稿件菜单查看')})}>生成校正版</button>
        {merged&&onSelect&&<button className={button+' text-primary'} disabled={!!draft} onClick={()=>onSelect(merged.id)}>{merged.merge?.strategy===2?'查看恢复修订':'查看校正版'}{merged.merge?.groups.some(g=>g.status==='pending')?' · '+merged.merge.groups.filter(g=>g.status==='pending').length+' 处待确认':''}</button>}
      </>}
      {!active&&session.audioRecordingId&&<button className={button} disabled={busy||!!draft||session.status==='recording'} onClick={()=>configured?setConfirm(true):useUIStore.getState().openFileSettings(session.id)}>{configured?(posts.length?'重新转写原音':canMerge?'转写并校正':'会后转写'):'配置文件转写'}</button>}
      {active&&<span className="text-xs text-muted-foreground">已有转写任务，下方可查看进度</span>}
      {!session.audioRecordingId&&<span className="text-xs text-muted-foreground">此会议没有本地原音</span>}
      {draft&&<span className="text-xs text-amber-700 dark:text-amber-400">请先保存或放弃校对草稿</span>}
    </div>
    {notice&&<p role="status" className="text-xs text-success">{notice}</p>}{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    <ActionDialog open={confirm} title={canMerge?'转写原音并生成校正版':'提交会后转写'}
      description={`${session.title} · ${Math.ceil((session.duration??0)/60000)} 分钟。将同步混音的临时副本上传至火山标准文件转写，可能计费；${posts.length?'已有会后稿可直接本地校正，无需再次识别。':''}完成后另存${canMerge?'会后稿和自动校正版':'会后稿'}，保留原稿与人工修改。`}
      onClose={()=>setConfirm(false)} actions={[{label:'取消',onClick:()=>setConfirm(false)},{label:'确认提交（可能计费）',variant:'primary',onClick:()=>{setConfirm(false);void action(async()=>{await startRecordingFileTask(session.id,session.audioRecordingId!,canMerge);setNotice('任务已提交，可以继续阅读和回放')})}}]} />
  </div>
}
