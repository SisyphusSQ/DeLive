import { useCallback, useEffect, useState } from 'react'
import type { FileTask, FileTaskConfig } from '../../../shared/fileTranscription'
import { fileTaskApi, ingestFileTasks, startRecordingFileTask, volcFileCredentials } from '../utils/volcFileApi'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'

const statusText: Record<FileTask['status'], string> = { preparing: '准备音频', uploading: '上传临时副本', submitting: '正在提交', 'submission-unknown': '提交结果未知：先查询', queued: '服务端排队', processing: '正在转写', completed: '会后稿已保存', failed: '任务失败', cancelled: '本地任务已停止' }
export function FileTaskPanel() {
  const [jobs, setJobs] = useState<FileTask[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [selectedSession, setSelectedSession] = useState('')
  const [config, setConfig] = useState<Partial<FileTaskConfig>>({ endpoint: '', region: '', bucket: '', prefix: 'delive-transcription', forcePathStyle: true, urlTtlSeconds: 86400 })
  const sessions = useSessionStore(state => state.sessions)
  const refresh = useCallback(async () => {
    try { const values = await fileTaskApi().list(); await ingestFileTasks(values); setJobs(values) }
    catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => {
    void Promise.resolve().then(() => fileTaskApi().settings()).then(value => { setConfig(value); setConfigured(value.configured) }).catch(e => setError(e.message))
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [refresh])
  const action = async (run: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await run(); await refresh() } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  const recordings = sessions.filter(s => s.audioRecordingId && s.status !== 'recording')
  return <section className="rounded-xl border border-border p-4 space-y-3" aria-label="标准文件转写任务">
    <h3 className="font-semibold">火山标准文件转写 2.0</h3>
    <p className="text-sm text-muted-foreground">会后稿独立保存，保留实时稿和人工修改。未知提交结果先查询，不自动重投；本地原音不自动删除。</p>
    <button className="text-sm underline" onClick={() => setShowSettings(!showSettings)}>私有临时存储配置（{configured ? '已配置' : '未配置'}）</button>
    {showSettings && <div className="grid grid-cols-2 gap-3">
      {(['endpoint','region','bucket','prefix','accessKeyId','secretAccessKey','sessionToken'] as const).map(key =>
        <label className="text-sm space-y-1" key={key}>{({ endpoint:'HTTPS endpoint',region:'区域',bucket:'私有桶',prefix:'独立对象前缀',accessKeyId:'Access Key ID',secretAccessKey:'Secret Access Key',sessionToken:'Session Token（可选）' })[key]}
          <input className="w-full rounded border border-border bg-background p-2" type={['accessKeyId','secretAccessKey','sessionToken'].includes(key) ? 'password' : 'text'}
            autoComplete="off" value={String(config[key] ?? '')} placeholder={['accessKeyId','secretAccessKey','sessionToken'].includes(key) ? '留空保留已加密值' : ''}
            onChange={e => setConfig({ ...config, [key]: e.target.value })} />
        </label>)}
      <label className="text-sm">访问有效期（小时）<input className="w-full border rounded p-2 bg-background" type="number" min={1/60} max={168} value={(config.urlTtlSeconds ?? 86400)/3600} onChange={e => setConfig({ ...config, urlTtlSeconds: Math.round(Number(e.target.value)*3600) })}/></label>
      <label className="text-sm"><input type="checkbox" checked={config.forcePathStyle ?? true} onChange={e=>setConfig({...config,forcePathStyle:e.target.checked})}/> 使用路径式桶地址</label>
      <p className="col-span-2 text-xs text-muted-foreground">使用专用私有桶，必须从未启用版本控制，并允许上传、读取、删除和分片上传清理。成功或明确失败后清理临时副本；清理失败可重试。凭据由系统安全存储加密，配置和签名链接不进入稿件或导出。</p>
      <button disabled={busy} className="rounded border p-2" onClick={() => void action(async () => { await fileTaskApi().configure(config); setConfigured(true); setConfig({...config,accessKeyId:'',secretAccessKey:'',sessionToken:''}) })}>加密保存配置</button>
    </div>}
    <div className="flex flex-wrap gap-2">
      <select aria-label="选择会议原音" className="rounded border bg-background p-2" value={selectedSession} onChange={e=>setSelectedSession(e.target.value)}>
        <option value="">选择已保存的会议原音</option>
        {recordings.map(s=><option key={s.id} value={s.id}>{s.title}{s.wasInterrupted?'（录音曾中断）':''}</option>)}
      </select>
      <button className="rounded border p-2 disabled:opacity-40" disabled={busy || !selectedSession || !configured} onClick={() => void action(async () => {
        const session = recordings.find(s=>s.id===selectedSession)!
        await startRecordingFileTask(session.id,session.audioRecordingId!)
      })}>提交会后转写（可能计费）</button>
    </div>
    <p className="text-xs text-muted-foreground">也可使用下方文件导入；会转换为 16kHz 单声道 WAV 并保存本地副本。原文件不修改，转换后需小于 512 MB / 5 小时。长文件转换会占用内存，失败会明确提示。</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {jobs.map(job=><article key={job.id} className="border-t pt-3 space-y-2">
      <div className="text-sm font-medium">{sessions.find(s=>s.id===job.sessionId)?.title ?? '会议任务'} · {statusText[job.status]}</div>
      {job.status==='uploading' && <div><progress className="w-full" max={job.sizeBytes || 1} value={job.uploadedBytes}/><span className="text-xs">{(job.uploadedBytes/1048576).toFixed(1)} / {(job.sizeBytes/1048576).toFixed(1)} MB</span></div>}
      {job.error && <p className="text-sm text-amber-600">{job.error.code}：{job.error.message}</p>}
      {job.cleanupError && <p role="alert" className="text-sm text-red-600">{job.cleanupError}</p>}
      <p className="text-xs text-muted-foreground">临时副本：{({none:'尚未上传',pending:'保留中',done:'已清理确认',failed:'清理未确认'})[job.cleanup]}{job.expiresAt ? ' · 访问到期 '+new Date(job.expiresAt).toLocaleString() : ''}</p>
      <div className="flex gap-3 text-sm">
        {['submission-unknown','queued','processing'].includes(job.status) && <button disabled={busy} className="underline" onClick={()=>void action(()=>fileTaskApi().query(job.id,volcFileCredentials()))}>查询 / 继续查询</button>}
        {!['completed','failed','cancelled'].includes(job.status) && <button disabled={busy} className="underline" onClick={()=>{
          if(window.confirm('停止本地任务并删除云端临时副本？这不能撤销服务端已接受的任务或计费，本地原音仍保留。')) void action(()=>fileTaskApi().cancel(job.id))
        }}>停止并清理临时副本</button>}
        {['completed','failed','cancelled'].includes(job.status) && ['pending','failed'].includes(job.cleanup) && <button disabled={busy} className="underline" onClick={()=>void action(()=>fileTaskApi().cleanup(job.id))}>重试清理</button>}
        {job.version && sessions.some(s=>s.id===job.sessionId) && <button className="underline" onClick={()=>useUIStore.getState().openReview(job.sessionId)}>打开会后稿所在会话</button>}
      </div>
      {job.version && <details><summary className="text-sm cursor-pointer">会后稿预览（独立版本，尚未确认与其他稿件的说话人映射）</summary><p className="whitespace-pre-wrap text-sm p-2">{job.version.text || '未检测到人声'}</p></details>}
      <details className="text-xs text-muted-foreground"><summary>任务信息</summary><p>任务 ID：{job.taskId} · 模型：volc.seedasr.auc / SSD {job.ssdVersion}</p></details>
    </article>)}
  </section>
}
