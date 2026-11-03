import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { QuarkConfig, BackupProgress } from '../../shared/backup'

export interface QuarkEvent { code: number; type: string; msg?: string; data?: Record<string, unknown> }
export interface QuarkFile { fid: string; filename: string; size: number; file_type: string; updated_at?: number }
export function redactQuarkError(value: string): string {
  return value.replace(/https?:\/\/\S+/gi,'[链接已隐藏]').replace(/(bearer\s+)[^\s]+/gi,'$1[隐藏]').replace(/((?:token|cookie|authorization|secret|password)["\x27]?\s*[=:]\s*)(?:"[^"]*"|\x27[^\x27]*\x27|[^\s,;]+)/gi,'$1[隐藏]').slice(0,500)
}
export class QuarkProvider {
  constructor(readonly config: QuarkConfig, readonly resultDir: string, readonly progress: (value: BackupProgress)=>void = ()=>{}) {}
  async command(args: string[], onEvent?: (value: QuarkEvent)=>void): Promise<QuarkEvent[]> {
    const script=this.config.runtimeScript
    if(typeof script!=='string'||!path.isAbsolute(script))throw new Error('请配置本机受限夸克 CLI 入口的绝对路径')
    await fs.access(script).catch(()=>{throw new Error('夸克入口不存在，请在 CLI 侧完成安装或修复；应用不会安装或登录')})
    let executable=script,argv=args
    if(script.endsWith('.py')){
      const candidates=this.config.pythonPath?[this.config.pythonPath]:['/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3']
      executable=''
      for(const candidate of candidates){if(!path.isAbsolute(candidate))throw new Error('Python 入口必须为绝对路径');try{await fs.access(candidate);executable=candidate;break}catch{}}
      if(!executable)throw new Error('本机缺少此 CLI 包装器所需的 Python，请在 CLI 侧处理')
      argv=[script,...args]
    }
    await fs.mkdir(this.resultDir,{recursive:true})
    return new Promise((resolve,reject)=>{
      const child=spawn(executable,argv,{cwd:this.resultDir,env:{...process.env,PATH:[process.env.PATH,'/opt/homebrew/bin','/usr/local/bin',path.join(os.homedir(),'.local/bin')].filter(Boolean).join(path.delimiter)},stdio:['ignore','pipe','pipe']})
      let killer:ReturnType<typeof setTimeout>|undefined;let line='',failure:Error|undefined,stderr='';const events:QuarkEvent[]=[]
      const fail=(error:Error)=>{failure??=error;child.kill('SIGTERM');killer??=setTimeout(()=>child.kill('SIGKILL'),2000)}
      const timer=setTimeout(()=>fail(new Error('夸克命令超时，结果未知；请检查或继续原任务')),30*60*1000)
      const receive=(raw:string)=>{
        try{
          const event=JSON.parse(raw) as QuarkEvent
          if(!event||typeof event.code!=='number'||typeof event.type!=='string')throw new Error('夸克输出协议不兼容')
          if(event.code!==0)failure=new Error(`夸克错误 ${event.code}：${redactQuarkError(event.msg||'操作失败，请检查 CLI 授权及任务状态')}`)
          if(event.type!=='progress')events.push(event)
          onEvent?.(event)
          if(event.type==='progress')this.progress({stage:'quark',message:'夸克传输中',taskId:typeof event.data?.recordId==='string'?event.data.recordId:undefined,completed:Number(event.data?.transferredSize)||0,total:Number(event.data?.fileSize)||undefined})
          if(events.length>100_000)throw new Error('夸克返回结果过多')
        }catch(error){fail(error instanceof Error?error:new Error('夸克输出无效'))}
      }
      child.stdout.on('data',bytes=>{line+=bytes.toString();let index;while((index=line.indexOf('\n'))>=0){const item=line.slice(0,index).trim();line=line.slice(index+1);if(item)receive(item)}if(line.length>4*1024*1024)fail(new Error('夸克输出行超限'))})
      child.stderr.on('data',bytes=>{stderr=redactQuarkError((stderr+bytes.toString()).slice(-2000))})
      child.on('error',error=>{clearTimeout(timer);reject(new Error('无法启动夸克入口：'+redactQuarkError(error.message)))})
      child.on('close',code=>{clearTimeout(timer);if(killer)clearTimeout(killer);if(line.trim())receive(line.trim());const result=events.filter(e=>e.type==='result').pop();if(failure||code!==0||!result)reject(failure||new Error(`夸克命令未确认完成（退出 ${code}）${stderr}`));else resolve(events)})
    })
  }
  async inspect():Promise<void>{
    const events=await this.command(['status']),status=events.filter(e=>e.type==='result').pop()?.data
    if(status?.status!=='READY'||status.selected_backend!=='go'||typeof status.runtime_path!=='string'||!/[\\/]v0\.1\.0-[a-f0-9]+[\\/]quark-drive-plugin$/.test(status.runtime_path))throw new Error('需要已验证的 Go 0.1.0 受限运行入口；请在 CLI 侧处理安装、版本或后端选择')
    await this.command(['run','get-user-info'])
  }
  async browse(fid:string):Promise<QuarkFile[]>{
    const events=await this.command(['run','browse','--parent-fid',fid,'--all','--result-dir',this.resultDir])
    const result=events.filter(e=>e.type==='result').pop()?.data,artifact=events.find(e=>e.type==='artifact')?.data
    if(result?.complete!==true||typeof artifact?.file_path!=='string')throw new Error('夸克未返回完整目录结果')
    const file=path.resolve(artifact.file_path),root=path.resolve(this.resultDir)+path.sep
    if(!file.startsWith(root)||(await fs.lstat(file)).isSymbolicLink()||(await fs.stat(file)).size>64*1024*1024)throw new Error('夸克查询结果文件无效')
    const text=await fs.readFile(file,'utf8'),items=text.trim()?text.trim().split('\n').map(line=>JSON.parse(line) as QuarkFile):[]
    if(items.length!==artifact.count||items.some(i=>!i||typeof i.fid!=='string'||typeof i.filename!=='string'||!Number.isFinite(i.size)))throw new Error('夸克目录结果不完整')
    return items
  }
  async directory(create=false):Promise<string>{
    const directory=this.config.directory||'ai-agent/coding/delive/backups'
    if(!/^ai-agent\/(?:[a-z0-9-]+|_scratch)(?:\/[a-z0-9-]+)*\/?$/.test(directory))throw new Error('云目录必须位于 ai-agent/，使用小写字母、数字和中划线')
    let fid='0'
    for(const name of directory.replace(/\/$/,'').split('/')){
      let found=(await this.browse(fid)).filter(f=>f.filename===name&&String(f.file_type)==='0')
      if(found.length>1)throw new Error('云端目录重名，请在 CLI 侧处理：'+name)
      if(!found.length){if(!create)throw new Error('云端备份目录尚未创建；首次备份时创建');await this.command(['run','create-folder','--dir-path',name,'--parent-fid',fid]);found=(await this.browse(fid)).filter(f=>f.filename===name&&String(f.file_type)==='0');if(found.length!==1)throw new Error('云端目录创建后回读未确认，请检查原目录，不要重复创建')}
      fid=found[0].fid
    }
    return fid
  }
  async upload(file:string,parentFid:string,onEvent:(event:QuarkEvent)=>void,recordId?:string):Promise<void>{
    const events=await this.command(recordId?['run','upload','resume','--record-id',recordId]:['run','upload',file,'--parent-fid',parentFid],onEvent)
    const result=events.filter(e=>e.type==='result').pop()?.data
    const items=events.filter(e=>e.type==='list')
    if(items.length!==1||items.some(e=>!['succeeded','success'].includes(String(e.data?.state)))||(recordId ? result?.recordId!==recordId : result?.successCount!==1||result?.fileCount!==1))throw new Error('夸克上传没有确认单文件完整成功，请检查原任务')
  }
  async originalTask(name:string,bytes:number):Promise<string>{
    const events=await this.command(['run','upload','list']),items=events.filter(e=>e.type==='list'&&e.data?.fileName===name&&e.data?.fileSize===bytes)
    if(items.length!==1||typeof items[0].data?.recordId!=='string')throw new Error('无法唯一确认原上传任务；不会重新上传，请在 CLI 侧核对')
    return items[0].data.recordId
  }
  async download(fid:string,output:string):Promise<string>{
    const events=await this.command(['run','download',fid,'--output-dir',output]),result=events.filter(e=>e.type==='result').pop()?.data
    if(result?.state!=='completed'||typeof result.filePath!=='string')throw new Error('夸克下载未完整完成')
    const file=path.resolve(result.filePath)
    if(!file.startsWith(path.resolve(output)+path.sep)||(await fs.lstat(file)).isSymbolicLink())throw new Error('夸克下载文件路径无效')
    return file
  }
}
