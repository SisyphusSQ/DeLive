import { useEffect, useState } from 'react'
import type { FileTaskConfig } from '../../../../shared/fileTranscription'
import { fileTaskApi } from '../../utils/volcFileApi'
import { useUIStore } from '../../stores/uiStore'

export function FileStorageSettings() {
  const [config,setConfig]=useState<Partial<FileTaskConfig>>({endpoint:'',region:'',bucket:'',prefix:'delive-transcription',forcePathStyle:true,urlTtlSeconds:86400})
  const [configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{void Promise.resolve().then(()=>fileTaskApi().settings()).then(value=>{setConfig(value);setConfigured(value.configured)}).catch(e=>setError(e.message))},[])
  const action=async(run:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await run()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const sessionId=useUIStore(s=>s.fileSessionId)
  return <section className="space-y-5" aria-label="火山文件转写存储">
    <div><h2 className="font-semibold">火山文件转写 · 私有存储</h2><p className="mt-2 text-sm text-muted-foreground">{configured?'已配置':'尚未配置'} · 仅用于上传待识别音频的临时副本，原音继续保存在本机。</p></div>
    <button className="text-sm text-primary underline" onClick={()=>sessionId?useUIStore.getState().openReview(sessionId):useUIStore.getState().setView('file')}>{sessionId?'返回会议继续':'返回文件转写'}</button>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm text-success">{notice}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(['endpoint','region','bucket','prefix','accessKeyId','secretAccessKey','sessionToken'] as const).map(key =>
        <label className="text-sm space-y-1" key={key}>{({ endpoint:'HTTPS endpoint',region:'区域',bucket:'私有桶',prefix:'独立对象前缀',accessKeyId:'Access Key ID',secretAccessKey:'Secret Access Key',sessionToken:'Session Token（可选）' })[key]}
          <input className="w-full rounded border border-border bg-background p-2" type={['accessKeyId','secretAccessKey','sessionToken'].includes(key) ? 'password' : 'text'}
            autoComplete="off" value={String(config[key] ?? '')} placeholder={['accessKeyId','secretAccessKey','sessionToken'].includes(key) ? '留空保留已加密值' : ''}
            onChange={e => setConfig({ ...config, [key]: e.target.value })} />
        </label>)}
      <label className="text-sm">访问有效期（小时）<input className="w-full border rounded p-2 bg-background" type="number" min={1/60} max={168} value={(config.urlTtlSeconds ?? 86400)/3600} onChange={e => setConfig({ ...config, urlTtlSeconds: Math.round(Number(e.target.value)*3600) })}/></label>
      <label className="text-sm"><input type="checkbox" checked={config.forcePathStyle ?? true} onChange={e=>setConfig({...config,forcePathStyle:e.target.checked})}/> 使用路径式桶地址</label>
      <p className="sm:col-span-2 text-xs text-muted-foreground">使用专用私有桶，必须从未启用版本控制，并允许上传、读取、删除和分片上传清理。成功或明确失败后清理临时副本；清理失败可重试。凭据由系统安全存储加密，配置和签名链接不进入稿件或导出。</p>
      <button disabled={busy} className="rounded border p-2" onClick={() => void action(async () => { await fileTaskApi().configure(config); setConfigured(true); setConfig({...config,accessKeyId:'',secretAccessKey:'',sessionToken:''}); setNotice('存储配置已加密保存') })}>加密保存配置</button>
    </div>
    <details className="text-xs text-muted-foreground"><summary>火山 TOS 配置示例</summary><p className="mt-2 break-all">北京：endpoint https://tos-s3-cn-beijing.volces.com；区域 cn-beijing。使用专用私有桶，关闭路径式桶地址。凭据留空保留原值；保存配置不会自动提交音频。</p></details>
  </section>
}
