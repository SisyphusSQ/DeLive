import { useEffect, useState, type ReactNode } from 'react'
import { useFileTaskStore, refreshFileTasks } from '../stores/fileTaskStore'
import { useSessionStore } from '../stores/sessionStore'
import { getVolcCredentialIssue, useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'
import { fileTaskApi } from '../utils/volcFileApi'
import { Select } from './ui/Select'
import { RecordingFileActions, taskActive } from './RecordingFileActions'
import { FileTaskRow } from './FileTaskRow'

export function FileTaskPanel({ children }: { children: (ready: boolean) => ReactNode }) {
  const {jobs,error,ingestionErrors}=useFileTaskStore(), sessions=useSessionStore(s=>s.sessions)
  const credentialIssue = useSettingsStore(getVolcCredentialIssue)
  const [configured,setConfigured]=useState<boolean>(),[configError,setConfigError]=useState('')
  const source = useUIStore(state => state.fileSource)
  const [filter,setFilter]=useState('all')
  const filteredJobs = jobs.filter(job => {
    if (filter === 'active') return taskActive(job.status)
    if (filter === 'completed') return job.status === 'completed'
    if (filter === 'attention') return !!(ingestionErrors[job.id] || job.error || job.cleanupError ||
      ['failed', 'submission-unknown'].includes(job.status) ||
      (job.status === 'completed' && job.version && !sessions.find(session => session.id === job.sessionId)?.versions?.some(version => version.id === job.version?.id)))
    return true
  })
  const selectedSession=useUIStore(s=>s.fileSessionId)??''
  const recordings=sessions.filter(s=>s.audioRecordingId&&s.status!=='recording'), selected=recordings.find(s=>s.id===selectedSession)
  useEffect(()=>{void Promise.resolve().then(()=>fileTaskApi().settings()).then(value=>setConfigured(value.configured)).catch(e=>setConfigError(e.message));void refreshFileTasks()},[])
  const input='rounded-md border border-input bg-background px-3 py-2 text-sm'
  return <section aria-label="标准文件转写任务" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span className="break-words">识别凭据：{credentialIssue ?? '已配置'}</span>
        <span>私有存储：{configError ? '无法读取' : configured === undefined ? '正在读取' : configured ? '已配置' : '未配置'}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {credentialIssue && <button data-settings-entry="file-provider" className="text-primary underline" onClick={()=>useUIStore.getState().openSettings('provider', 'volc')}>转写服务设置</button>}
        <button data-settings-entry="file-storage" className="text-primary underline" onClick={()=>useUIStore.getState().openSettings('fileStorage')}>存储设置</button>
      </div>
    </div>
    <div className="rounded-xl border border-border p-4 space-y-4">
      <div className="flex gap-1 border-b border-border pb-3" aria-label="音频来源">{(['recording','import'] as const).map(value=><button key={value} aria-pressed={source===value} className={'rounded-md px-3 py-2 text-sm '+(source===value?'bg-primary/10 text-primary':'text-muted-foreground hover:bg-muted')} onClick={()=>useUIStore.setState({ fileSource: value })}>{value==='recording'?'已有会议原音':'导入文件'}</button>)}</div>
      {source==='recording'?<>
        <Select aria-label="选择会议原音" className={input+' w-full'} value={selectedSession} onChange={e=>useUIStore.setState({fileSessionId:e.target.value})}>
          <option value="">选择已保存的会议原音</option>
          {recordings.map(s=><option key={s.id} value={s.id}>{s.title} · {s.date} {s.time} · {Math.ceil((s.duration??0)/60000)} 分钟{s.wasInterrupted?' · 曾中断':''}</option>)}
        </Select>
        {selected?<RecordingFileActions key={selected.id} session={selected}/>:<p className="text-xs text-muted-foreground">选择会议后，可将原音重转写并生成独立校正版，保留原稿。</p>}
      </>:<><p className="text-xs text-muted-foreground">导入后创建新会议。会转换为单声道 WAV，转换后需小于 512 MB / 5 小时；原文件保留。</p>{children(configured === true && !credentialIssue)}</>}
    </div>
    {(error||configError)&&<p role="alert" className="text-sm text-destructive">{error||configError}</p>}
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">转写任务{jobs.length?' · '+jobs.length:''}</h2>
        <Select aria-label="筛选转写任务" className={input} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部</option><option value="active">进行中</option><option value="completed">已完成</option><option value="attention">需处理</option></Select>
      </div>
      {!jobs.length&&<p className="py-6 text-sm text-muted-foreground">暂无任务，选择上方音频来源开始。</p>}
      {jobs.length > 0 && !filteredJobs.length && <p className="py-4 text-sm text-muted-foreground">此筛选下没有任务。</p>}
      {filteredJobs.map(job => <FileTaskRow key={job.id} job={job} />)}
    </div>
  </section>
}
