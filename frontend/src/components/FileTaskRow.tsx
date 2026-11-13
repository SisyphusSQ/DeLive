import { useState } from 'react'
import type { FileTask } from '../../../shared/fileTranscription'
import { useFileTaskStore, refreshFileTasks } from '../stores/fileTaskStore'
import { useSessionStore } from '../stores/sessionStore'
import { useReviewDraftStore } from '../stores/reviewDraftStore'
import { useUIStore } from '../stores/uiStore'
import { fileTaskApi, volcFileCredentials } from '../utils/volcFileApi'
import { taskActive } from './RecordingFileActions'
import { ActionDialog } from './ActionDialog'
import { needsTranscriptRecovery } from '../utils/transcriptMerge'

const statusText: Record<FileTask['status'],string>={preparing:'准备音频',uploading:'上传临时副本',submitting:'正在提交','submission-unknown':'提交结果未知',queued:'服务端排队',processing:'正在转写',completed:'会后稿已保存',failed:'任务失败',cancelled:'已停止'}
export function FileTaskRow({job,compact=false}:{job:FileTask;compact?:boolean}) {
  const session=useSessionStore(s=>s.sessions.find(item=>item.id===job.sessionId))
  const ingestionError=useFileTaskStore(s=>s.ingestionErrors[job.id])
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false)
  const saved = !!session?.versions?.some(version => version.id === job.version?.id)
  const merged = job.version && session?.versions?.filter(version => version.merge?.postVersionId === job.version?.id && !needsTranscriptRecovery(version)).slice(-1)[0]
  const status = job.status === 'completed' && !saved
    ? session ? '会后稿待保存到会议' : '转写已完成，来源会议已删除'
    : statusText[job.status]
  const action=async(run:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await run();await refreshFileTasks()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const open=async()=>{
    if(useReviewDraftStore.getState().drafts[job.sessionId]){useUIStore.getState().openReview(job.sessionId);return}
    useUIStore.getState().openReview(job.sessionId,merged?.id??job.version?.id)
  }
  return <article className={'space-y-2 py-3 '+(compact?'':'border-t border-border/60')} aria-label="会后转写任务">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="min-w-0 break-words font-medium">{!compact&&(session?.title??'已删除的会议')+' · '}{status}{merged?' · 校正版可用':''}</span>
      <span className="text-xs text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</span>
    </div>
    {job.status==='uploading'&&<div><progress aria-label="音频上传进度" className="w-full" max={job.sizeBytes||1} value={job.uploadedBytes}/><span className="text-xs">{(job.uploadedBytes/1048576).toFixed(1)} / {(job.sizeBytes/1048576).toFixed(1)} MB</span></div>}
    {job.cleanup === 'failed' && <p className="text-xs font-medium text-warning">临时副本清理未确认</p>}
    {(error||ingestionError||job.error?.message||job.cleanupError)&&<p role="alert" className="text-sm text-amber-700 dark:text-amber-400">{[error,ingestionError,job.error?.message,job.cleanupError].filter(Boolean).join('；')}</p>}
    <div className="flex flex-wrap gap-4 text-xs">
      {['submission-unknown','queued','processing'].includes(job.status)&&<button disabled={busy} className="text-primary underline" onClick={()=>void action(()=>fileTaskApi().query(job.id,volcFileCredentials()))}>查询 / 继续查询</button>}
      {taskActive(job.status)&&<button disabled={busy} className="text-muted-foreground underline" onClick={()=>setConfirm(true)}>停止并清理</button>}
      {!taskActive(job.status)&&['pending','failed'].includes(job.cleanup)&&<button disabled={busy} className="text-primary underline" onClick={()=>void action(()=>fileTaskApi().cleanup(job.id))}>重试清理</button>}
      {session && (ingestionError || (job.status === 'completed' && !saved)) && <button disabled={busy} className="text-primary underline" onClick={()=>void action(()=>refreshFileTasks(true))}>重试保存 / 本地合并</button>}
      {saved&&<button disabled={busy} className="text-primary underline" onClick={()=>void action(open)}>{merged?'打开校正版':'打开会后稿'}</button>}
      <details className="min-w-0 text-muted-foreground"><summary className="cursor-pointer">任务详情</summary><div className="mt-2 space-y-1 break-all">
        <p>任务 ID：{job.taskId} · {job.durationMs?Math.ceil(job.durationMs/60000)+' 分钟':''}</p>
        <p>临时副本：{({none:'尚未上传',pending:'保留中',done:'已清理确认',failed:'清理未确认'})[job.cleanup]}</p>
        {job.expiresAt&&job.cleanup!=='done'&&<p>访问到期 {new Date(job.expiresAt).toLocaleString()}（到期不等于删除）</p>}
        <p>火山标准文件转写 2.0 · SSD {job.ssdVersion} · 本地原音保留</p>
        {job.error&&<p>错误码：{job.error.code}</p>}
      </div></details>
    </div>
    <ActionDialog open={confirm} onClose={()=>setConfirm(false)} title="停止本地任务并清理？" description="删除云端临时副本并停止本机跟踪，无法撤销服务端已经接受的任务或计费。本地原音和稿件继续保留。" actions={[{label:'保留任务',onClick:()=>setConfirm(false)},{label:'停止并清理',variant:'danger',onClick:()=>{setConfirm(false);void action(()=>fileTaskApi().cancel(job.id))}}]}/>
  </article>
}
