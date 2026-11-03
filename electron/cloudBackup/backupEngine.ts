import fs from 'node:fs/promises'
import { writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { BackupArtifact, PreparedRestore, BackupManifest, CloudJob, BackupProgress } from '../../shared/backup'
import type { CloudBackupIpcConfig, CloudBackupIpcFileInfo } from '../../shared/electronApi'
import type { RecordingStore } from '../recordingStore'
import { writeArchive, readArchive, parseBackupMetadata, fileHash } from './backupArchive'
import { QuarkProvider, redactQuarkError } from './quarkProvider'
import { s3List, s3UploadArchive, s3DownloadArchive } from './s3Provider'
import { webdavList, webdavUploadArchive, webdavDownloadArchive } from './webdavProvider'

interface RecordingAccess { owner(id:string):RecordingStore; restoreDirectory(id:string):string; assertIdle():void; refresh():void }
interface Stage extends PreparedRestore { directory: string; manifest?: BackupManifest }
interface Swap { target:string; stage:string; previous:string; existed:boolean }
interface Journal { token:string; rollbackId:string; actions:Swap[] }
function validId(id:string):void{if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw new Error('备份任务编号无效')}
async function exists(file:string){try{await fs.access(file);return true}catch{return false}}
function durableJson(file:string,value:unknown){writeFileSync(file+'.tmp',JSON.stringify(value),{mode:0o600});const fd=openSync(file+'.tmp','r');try{fsyncSync(fd)}finally{closeSync(fd)};renameSync(file+'.tmp',file)}
function targetHash(config:CloudBackupIpcConfig):string{return createHash('sha256').update(JSON.stringify({provider:config.provider,quark:config.quark,s3:config.s3&&{endpoint:config.s3.endpoint,bucket:config.s3.bucket,prefix:config.s3.prefix},webdav:config.webdav&&{url:config.webdav.url,basePath:config.webdav.basePath,username:config.webdav.username}})).digest('hex')}
export class BackupEngine {
  readonly directory:string
  private active=new Set<string>()
  constructor(readonly userData:string,readonly recording:RecordingAccess,readonly progress:(value:BackupProgress)=>void=()=>{}){this.directory=path.join(userData,'backups')}
  private async init(){await fs.mkdir(this.directory,{recursive:true})}
  private artifactFile(id:string){validId(id);return path.join(this.directory,id+'.artifact.json')}
  private async artifact(id:string):Promise<BackupArtifact>{return JSON.parse(await fs.readFile(this.artifactFile(id),'utf8'))}
  private quark(config:CloudBackupIpcConfig):QuarkProvider{if(config.provider!=='quark'||!config.quark)throw new Error('请配置夸克 CLI');return new QuarkProvider(config.quark,path.join(this.directory,'cli-results'),this.progress)}
  private jobFile(id:string){validId(id);return path.join(this.directory,id+'.job.json')}
  private saveJob(job:CloudJob){durableJson(this.jobFile(job.id),job)}
  async build(json:string,includeAudio=true):Promise<BackupArtifact>{
    await this.init();this.recording.assertIdle();if(await this.pendingRestore())throw new Error('请先完成待处理的恢复')
    this.progress({stage:'snapshot',message:'正在校验并打包文字、图片和原音'})
    const artifact=await writeArchive(this.directory,json,includeAudio,path.join(this.userData,'session-images'),this.recording.owner)
    durableJson(this.artifactFile(artifact.id),artifact);return artifact
  }
  async jobs():Promise<CloudJob[]>{await this.init();const jobs:CloudJob[]=[];for(const name of await fs.readdir(this.directory)){if(!name.endsWith('.job.json'))continue;const job:CloudJob=JSON.parse(await fs.readFile(path.join(this.directory,name),'utf8'));if(job.state==='uploading'&&!this.active.has(job.id)){job.state='unknown';job.error='应用退出，需检查或继续原任务';this.saveJob(job)}jobs.push(job)}return jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
  async list(config:CloudBackupIpcConfig):Promise<CloudBackupIpcFileInfo[]>{
    await this.init();let files:CloudBackupIpcFileInfo[]
    if(config.provider==='quark'){const quark=this.quark(config),fid=await quark.directory();files=(await quark.browse(fid)).filter(f=>String(f.file_type)!=='0'&&(/\.delive$|\.json$/.test(f.filename))).map(f=>({key:f.filename,name:f.filename,size:f.size,lastModified:new Date(f.updated_at||0).toISOString()}))}
    else {const result=config.provider==='s3'&&config.s3?await s3List(config.s3):config.provider==='webdav'&&config.webdav?await webdavList(config.webdav):undefined;if(!result?.ok)throw new Error(redactQuarkError(result?.error||'备份配置缺失'));files=result.files||[]}
    return files.map(f=>{const name=f.name||f.key.split('/').pop()||f.key;return{...f,name,legacy:name.endsWith('.json'),includeAudio:name.startsWith('delive-full-')?true:name.startsWith('delive-no-audio-')?false:undefined}})
  }
  async upload(config:CloudBackupIpcConfig,artifactId:string):Promise<CloudJob>{
    await this.init();if(config.provider==='quark')await this.quark(config).inspect();const artifact=await this.artifact(artifactId)
    if((await this.jobs()).some(j=>j.artifact.id===artifactId))throw new Error('该备份已有上传任务，请检查或继续原任务')
    const parentFid=config.provider==='quark'?await this.quark(config).directory(true):undefined
    const job:CloudJob={id:randomUUID(),artifact,provider:config.provider,state:'uploading',createdAt:new Date().toISOString(),parentFid,targetHash:targetHash(config)}
    this.saveJob(job);return this.transfer(config,job,false)
  }
  async resume(config:CloudBackupIpcConfig,id:string):Promise<CloudJob>{if(config.provider==='quark')await this.quark(config).inspect();const job:CloudJob=JSON.parse(await fs.readFile(this.jobFile(id),'utf8'));if(job.targetHash!==targetHash(config))throw new Error('目标配置已变化，请恢复此任务的原配置后继续');if(job.state==='complete')return job;return this.transfer(config,job,true)}
  private async download(config:CloudBackupIpcConfig,key:string,directory:string,name:string):Promise<string>{
    await fs.mkdir(directory,{recursive:true})
    if(config.provider==='quark'){
      const quark=this.quark(config),parent=await quark.directory(),matches=(await quark.browse(parent)).filter(f=>f.filename===key&&String(f.file_type)!=='0')
      if(matches.length!==1)throw new Error('云端文件不存在或重名')
      return quark.download(matches[0].fid,directory)
    }
    const file=path.join(directory,path.basename(name))
    if(config.provider==='s3'&&config.s3)await s3DownloadArchive(config.s3,key,file)
    else if(config.provider==='webdav'&&config.webdav)await webdavDownloadArchive(config.webdav,key,file)
    else throw new Error('备份服务配置缺失')
    return file
  }
  private async transfer(config:CloudBackupIpcConfig,job:CloudJob,resume:boolean):Promise<CloudJob>{
    if(this.active.has(job.id))throw new Error('原备份任务仍在运行');this.active.add(job.id)
    job.state='uploading';job.error=undefined;this.saveJob(job)
    try{
      const file=path.join(this.directory,job.artifact.name)
      const digest=await fileHash(file);if(digest.sha256!==job.artifact.sha256||digest.bytes!==job.artifact.bytes)throw new Error('本地备份文件已变化')
      this.progress({stage:'upload',message:resume?'正在对账原备份任务':'正在上传完整备份',taskId:job.taskId})
      if(config.provider==='quark'){
        const quark=this.quark(config)
        if(!job.parentFid)throw new Error('原任务缺少目标目录，不能重新提交')
        if(resume&&!job.taskId){job.taskId=await quark.originalTask(job.artifact.name,job.artifact.bytes);this.saveJob(job)}
        await quark.upload(file,job.parentFid,event=>{if(typeof event.data?.recordId==='string'&&event.data.recordId!==job.taskId){job.taskId=event.data.recordId;this.saveJob(job)}},resume?job.taskId:undefined)
        const matches=(await quark.browse(job.parentFid)).filter(f=>f.filename===job.artifact.name&&f.size===job.artifact.bytes)
        if(matches.length!==1)throw new Error('上传后目录回读不唯一或大小不匹配')
        job.key=matches[0].filename;job.cloudFid=matches[0].fid
      }else if(resume){
        const files=await this.list(config),match=files.find(f=>f.name===job.artifact.name&&f.size===job.artifact.bytes)
        if(!match)throw new Error('原云端对象尚未确认，未重复上传；请检查服务状态')
        job.key=match.key
      }else if(config.provider==='s3'&&config.s3)job.key=await s3UploadArchive(config.s3,file,job.artifact.name,(completed,total)=>this.progress({stage:'upload',message:'上传中',completed,total}))
      else if(config.provider==='webdav'&&config.webdav)job.key=await webdavUploadArchive(config.webdav,file,job.artifact.name)
      else throw new Error('备份配置缺失')
      this.saveJob(job)
      const listed=(await this.list(config)).find(f=>f.key===job.key||f.name===job.artifact.name)
      if(!listed||listed.size!==job.artifact.bytes)throw new Error('云端备份大小回读不匹配')
      this.progress({stage:'verify',message:'正在下载回读并核对 SHA-256'})
      const verified=await this.download(config,job.key!,path.join(this.directory,'verify-'+job.id+'-'+randomUUID()),job.artifact.name)
      const actual=await fileHash(verified)
      if(actual.bytes!==job.artifact.bytes||actual.sha256!==job.artifact.sha256)throw new Error('云端回读摘要不匹配')
      await fs.rm(path.dirname(verified),{recursive:true,force:true})
      job.state='complete';this.saveJob(job);this.progress({stage:'complete',message:job.artifact.includeAudio?'完整备份已上传并校验':'备份已上传并校验（主动排除原音）'});return job
    }catch(error){job.state='unknown';job.error=redactQuarkError((error as Error).message);this.saveJob(job);throw new Error(job.error+'；原任务已保留，请检查或继续，未自动重复上传')}
    finally{this.active.delete(job.id)}
  }
  async prepare(config:CloudBackupIpcConfig,key:string):Promise<PreparedRestore>{
    await this.init();if(config.provider==='quark')await this.quark(config).inspect();const file=(await this.list(config)).find(f=>f.key===key);if(!file)throw new Error('备份不在当前目标目录')
    this.progress({stage:'download',message:'正在下载并校验恢复材料'})
    const id=randomUUID(),directory=path.join(this.directory,'restore-'+id),download=await this.download(config,key,path.join(directory,'download'),file.name||'backup.delive')
    if((await fs.stat(download)).size!==file.size)throw new Error('下载长度不匹配')
    return this.prepareFile(download,id,directory,Boolean(file.legacy))
  }
  private async prepareFile(file:string,id:string,directory:string,legacy=false):Promise<PreparedRestore>{
    let manifest:BackupManifest|undefined,metadata
    if(legacy){if((await fs.stat(file)).size>64*1024*1024)throw new Error('旧 JSON 备份超过读取上限');metadata=parseBackupMetadata(await fs.readFile(file,'utf8'));for(const session of metadata.sessions){session.images=[];delete session.audioRecordingId}}
    else {manifest=await readArchive(file,path.join(directory,'assets'));metadata=manifest.metadata;if(!manifest.includeAudio)for(const session of metadata.sessions)delete session.audioRecordingId}
    const stage:Stage={id,directory,metadataJson:JSON.stringify(metadata),includeAudio:manifest?.includeAudio||false,legacy,files:manifest?.files.length||0,manifest}
    durableJson(path.join(this.directory,id+'.stage.json'),stage)
    return {id,metadataJson:stage.metadataJson,includeAudio:stage.includeAudio,legacy,files:stage.files}
  }
  async pendingRestore():Promise<{token:string}|null>{const file=path.join(this.directory,'pending-restore.json');if(!await exists(file))return null;const value:Journal=JSON.parse(await fs.readFile(file,'utf8'));return{token:value.token}}
  async apply(stageId:string,sessionIds:string[],rollbackId:string):Promise<string>{
    validId(stageId);validId(rollbackId);this.recording.assertIdle();if(await this.pendingRestore())throw new Error('有未完成的恢复，请先重启应用处理')
    const stage:Stage=JSON.parse(await fs.readFile(path.join(this.directory,stageId+'.stage.json'),'utf8')),metadata=parseBackupMetadata(stage.metadataJson),rollback=await this.artifact(rollbackId)
    if(!rollback.includeAudio)throw new Error('恢复回退快照必须包含原音')
    const selected=new Set(sessionIds);if(!Array.isArray(sessionIds)||selected.size!==sessionIds.length||sessionIds.some(id=>!metadata.sessions.some(s=>s.id===id)))throw new Error('恢复会话范围无效')
    const token=randomUUID(),actions:Swap[]=[],backupRoot=path.join(this.directory,'rollback-'+token)
    await fs.mkdir(backupRoot,{recursive:true})
    for(const session of metadata.sessions.filter(s=>selected.has(s.id))){
      const imageStage=path.join(stage.directory,'assets','images',session.id);await fs.mkdir(imageStage,{recursive:true})
      const target=path.join(this.userData,'session-images',session.id)
      actions.push({target,stage:imageStage,previous:path.join(backupRoot,'images-'+session.id),existed:await exists(target)})
      if(stage.includeAudio&&session.audioRecordingId){const id=session.audioRecordingId,target=path.join(this.recording.restoreDirectory(id),id);if(!actions.some(a=>a.target===target))actions.push({target,stage:path.join(path.dirname(target),'.delive-restore',token,'new-'+id),previous:path.join(path.dirname(target),'.delive-restore',token,'previous-'+id),existed:await exists(target)})}
    }
    // Stage beside the destination so custom recording volumes also use atomic renames.
    for(const action of actions)if(path.basename(action.stage).startsWith('new-')){
      await fs.mkdir(path.dirname(action.stage),{recursive:true})
      await fs.cp(path.join(stage.directory,'assets','audio',path.basename(action.target)),action.stage,{recursive:true,errorOnExist:true,force:false})
    }
    const journal:Journal={token,rollbackId,actions};durableJson(path.join(this.directory,'pending-restore.json'),journal)
    try{
      for(const action of actions){await fs.mkdir(path.dirname(action.target),{recursive:true});if(action.existed)await fs.rename(action.target,action.previous);await fs.rename(action.stage,action.target)}
      durableJson(path.join(this.directory,rollbackId+'.rollback.json'),rollback)
      this.recording.refresh();return token
    }catch(error){await this.settle(token,false);throw error}
  }
  async settle(token:string,committed:boolean):Promise<void>{
    validId(token);const file=path.join(this.directory,'pending-restore.json');if(!await exists(file))return
    const journal:Journal=JSON.parse(await fs.readFile(file,'utf8'));if(journal.token!==token)throw new Error('恢复事务不匹配')
    if(!committed)for(const action of [...journal.actions].reverse()){
      if(!await exists(action.stage)&&await exists(action.target))await fs.rename(action.target,action.stage)
      if(await exists(action.previous))await fs.rename(action.previous,action.target)
    }
    // The complete rollback package remains available after commit.
    if(committed)for(const action of journal.actions)await fs.rm(action.previous,{recursive:true,force:true})
    await fs.rm(file);this.recording.refresh()
  }
  async rollbacks():Promise<BackupArtifact[]>{await this.init();const result:BackupArtifact[]=[];for(const name of await fs.readdir(this.directory))if(name.endsWith('.rollback.json'))result.push(JSON.parse(await fs.readFile(path.join(this.directory,name),'utf8')));return result}
  async prepareRollback(id:string):Promise<PreparedRestore>{const artifact=await this.artifact(id);if(!await exists(path.join(this.directory,id+'.rollback.json')))throw new Error('不是恢复回退快照');const stageId=randomUUID();return this.prepareFile(path.join(this.directory,artifact.name),stageId,path.join(this.directory,'restore-'+stageId))}
}
