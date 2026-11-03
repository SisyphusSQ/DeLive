import fs from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { BackupManifest, BackupMetadata, BackupArtifact, BackupFile } from '../../shared/backup'
import { portableSettings } from '../../shared/backup'
import { validateSessionImages } from '../../shared/sessionImages'
import { RecordingStore } from '../recordingStore'

const MAGIC = Buffer.from('DELIVE_BACKUP_1\n')
const MAX_MANIFEST = 64 * 1024 * 1024
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
export function safeBackupPath(value: unknown): value is string {
  return typeof value === 'string' && /^(images\/[a-zA-Z0-9_-]{1,128}\/[a-f0-9-]{36}\.(png|jpg|webp)|audio\/[a-zA-Z0-9_-]{1,128}\/(index\.json|\d+\/(block\.json|(system|microphone|mix)\.wav)))$/.test(value)
}
export function parseBackupMetadata(json: string): BackupMetadata {
  const data = JSON.parse(json) as BackupMetadata
  if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.tags) || (data.topics !== undefined && !Array.isArray(data.topics)) || !data.settings || typeof data.settings !== 'object') throw new Error('备份数据结构无效')
  if (typeof data.version !== 'string' || !['1.0','2.0','3.0'].includes(data.version) || (data.schemaVersion !== undefined && (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 0 || data.schemaVersion > 3))) throw new Error('不支持的备份数据版本')
  for (const collection of [data.sessions,data.tags,data.topics || []]) {
    const ids = new Set<string>()
    for (const item of collection) { if (!item || !validId(item.id) || ids.has(item.id)) throw new Error('备份包含无效或重复编号'); ids.add(item.id) }
  }
  for (const session of data.sessions) {
    if (session.schemaVersion !== undefined && (typeof session.schemaVersion !== 'number' || !Number.isInteger(session.schemaVersion) || session.schemaVersion < 0 || session.schemaVersion > 5)) throw new Error('不支持的会话数据版本')
    validateSessionImages(session.images, session.id)
    if (session.audioRecordingId !== undefined && !validId(session.audioRecordingId)) throw new Error('原音引用无效')
  }
  data.settings = portableSettings(data.settings)
  return data
}
export async function fileHash(file: string): Promise<{ bytes: number; sha256: string }> {
  const hash=createHash('sha256');let bytes=0
  const stat=await fs.lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('素材必须是常规文件')
  for await (const part of createReadStream(file)) { bytes+=part.length;hash.update(part) }
  return {bytes,sha256:hash.digest('hex')}
}
async function regularPath(root: string, relative: string): Promise<string> {
  const parts=relative.split('/');let current=root
  for(const part of parts){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw new Error('备份素材不能是符号链接')}
  return current
}
export async function writeArchive(directory: string, metadataJson: string, includeAudio: boolean, imageRoot: string, owner: (id:string)=>RecordingStore): Promise<BackupArtifact> {
  const metadata=parseBackupMetadata(metadataJson),sources:Array<{entry:BackupFile;file:string}>=[],seen=new Set<string>()
  const add=async(relative:string,file:string,expected?:{bytes:number;sha256:string})=>{
    if(seen.has(relative))return
    if(!safeBackupPath(relative))throw new Error('备份文件路径无效')
    const digest=await fileHash(file)
    if(expected&&(digest.bytes!==expected.bytes||digest.sha256!==expected.sha256))throw new Error('图片摘要不匹配：'+relative)
    sources.push({entry:{path:relative,...digest},file});seen.add(relative)
  }
  for(const session of metadata.sessions){
    if(session.status==='recording')throw new Error('请等待录制结束并落盘后备份')
    for(const image of session.images||[])await add('images/'+image.assetPath,await regularPath(imageRoot,image.assetPath),image)
    if(includeAudio&&session.audioRecordingId){
      const id=session.audioRecordingId,store=owner(id),manifest=store.read(id)
      if(manifest.error||manifest.status==='recording')throw new Error('原音不可备份或仍在写入：'+id)
      const index=JSON.parse(await fs.readFile(path.join(store.directory,id,'index.json'),'utf8'))
      if(index.durationMs!==manifest.durationMs||index.bytes!==manifest.bytes)throw new Error('原音索引与分片不一致：'+id)
      for(const block of manifest.blocks)for(const track of block.tracks)store.readBlock(id,block.index,track)
      const prefix='audio/'+id+'/'
      await add(prefix+'index.json',await regularPath(store.directory,id+'/index.json'))
      for(const block of manifest.blocks){
        await add(prefix+block.index+'/block.json',await regularPath(store.directory,id+'/'+block.index+'/block.json'))
        for(const track of block.tracks)await add(prefix+block.index+'/'+track+'.wav',await regularPath(store.directory,id+'/'+block.index+'/'+track+'.wav'))
      }
    }
  }
  const manifest:BackupManifest={format:1,createdAt:new Date().toISOString(),includeAudio,metadata,files:sources.map(s=>s.entry)}
  const json=Buffer.from(JSON.stringify(manifest))
  if(json.length>MAX_MANIFEST)throw new Error('备份清单超过 64 MiB，未创建不完整备份')
  await fs.mkdir(directory,{recursive:true});const id=randomUUID(),name=`delive-${includeAudio?'full':'no-audio'}-${id}.delive`,file=path.join(directory,name)
  const total=sources.reduce((n,s)=>n+s.entry.bytes,0)+json.length+MAGIC.length+40
  const stat=await fs.statfs(directory);if(Number(stat.bavail)*Number(stat.bsize)<total+1024*1024)throw new Error('备份磁盘空间不足')
  const stream=createWriteStream(file+'.tmp',{flags:'wx',mode:0o600}),length=Buffer.alloc(8);length.writeBigUInt64LE(BigInt(json.length))
  let writeError:Error|undefined;stream.on('error',error=>{writeError=error})
  const write=async(bytes:Buffer)=>{if(writeError)throw writeError;if(!stream.write(bytes))await once(stream,'drain');if(writeError)throw writeError}
  try{
    await write(MAGIC);await write(length);await write(createHash('sha256').update(json).digest());await write(json)
    for(const {entry,file:source}of sources){const hash=createHash('sha256');let size=0;for await(const bytes of createReadStream(source)){await write(bytes);hash.update(bytes);size+=bytes.length}if(size!==entry.bytes||hash.digest('hex')!==entry.sha256)throw new Error('备份期间素材变化，请重新备份')}
    const finished=once(stream,'finish');stream.end();await finished
    await fs.rename(file+'.tmp',file)
    return{id,name,...await fileHash(file),includeAudio,sessions:metadata.sessions.length}
  }catch(error){stream.destroy();await fs.rm(file+'.tmp',{force:true});throw error}
}

export async function readArchive(file:string,directory:string):Promise<BackupManifest>{
  const handle=await fs.open(file,'r');let position=0
  const read=async(size:number)=>{const buffer=Buffer.alloc(size);let read=0;while(read<size){const result=await handle.read(buffer,read,size-read,position);if(!result.bytesRead)throw new Error('备份包截断');read+=result.bytesRead;position+=result.bytesRead}return buffer}
  try{
    if(!(await read(MAGIC.length)).equals(MAGIC))throw new Error('不是受支持的完整备份包')
    const length=Number((await read(8)).readBigUInt64LE());if(!Number.isSafeInteger(length)||length<2||length>MAX_MANIFEST)throw new Error('备份清单长度无效')
    const digest=await read(32),raw=await read(length)
    if(!createHash('sha256').update(raw).digest().equals(digest))throw new Error('备份清单校验失败')
    const manifest=JSON.parse(raw.toString('utf8')) as BackupManifest
    if(manifest.format!==1||typeof manifest.includeAudio!=='boolean'||!Array.isArray(manifest.files))throw new Error('不支持的备份包版本')
    manifest.metadata=parseBackupMetadata(JSON.stringify(manifest.metadata))
    const paths=new Set<string>();let expected=position
    for(const entry of manifest.files){if(!entry||!safeBackupPath(entry.path)||paths.has(entry.path)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw new Error('备份文件清单无效');paths.add(entry.path);expected+=entry.bytes}
    if(!Number.isSafeInteger(expected)||(await handle.stat()).size!==expected)throw new Error('备份包长度或文件数量不匹配')
    await fs.mkdir(directory,{recursive:true});const stat=await fs.statfs(directory);if(Number(stat.bavail)*Number(stat.bsize)<expected+1024*1024)throw new Error('恢复磁盘空间不足')
    for(const entry of manifest.files){
      const target=path.join(directory,entry.path);await fs.mkdir(path.dirname(target),{recursive:true});const out=await fs.open(target,'wx',0o600),hash=createHash('sha256');let remaining=entry.bytes
      try{while(remaining){const bytes=await read(Math.min(remaining,1024*1024));let offset=0;while(offset<bytes.length)offset+=(await out.write(bytes,offset,bytes.length-offset)).bytesWritten;hash.update(bytes);remaining-=bytes.length}}finally{await out.close()}
      if(hash.digest('hex')!==entry.sha256)throw new Error('备份文件校验失败：'+entry.path)
    }
    const referenced=new Set<string>()
    for(const session of manifest.metadata.sessions){
      for(const image of session.images||[]){const relative='images/'+image.assetPath,entry=manifest.files.find(f=>f.path===relative);if(!entry||entry.sha256!==image.sha256||entry.bytes!==image.bytes)throw new Error('备份缺少有效图片：'+image.name);referenced.add(relative)}
      if(manifest.includeAudio&&session.audioRecordingId){
        const id=session.audioRecordingId,prefix='audio/'+id+'/'
        if(!paths.has(prefix+'index.json'))throw new Error('备份缺少原音索引')
        const rawAudio=JSON.parse(await fs.readFile(path.join(directory,prefix,'index.json'),'utf8'))
        if(rawAudio.status==='recording')throw new Error('备份包含未完成的录音')
        const store=new RecordingStore(path.join(directory,'audio')),audio=store.read(id)
        if(rawAudio.durationMs!==audio.durationMs||rawAudio.bytes!==audio.bytes)throw new Error('备份原音索引与分片不一致')
        referenced.add(prefix+'index.json')
        for(const block of audio.blocks){
          if(!Number.isSafeInteger(block.index)||block.index<0||!Array.isArray(block.tracks)||!block.tracks.includes('mix'))throw new Error('原音分片索引无效')
          for(const track of block.tracks)store.readBlock(id,block.index,track)
          for(const suffix of ['block.json',...block.tracks.map(t=>t+'.wav')]){const relative=prefix+block.index+'/'+suffix;if(!paths.has(relative))throw new Error('备份缺少原音分片');referenced.add(relative)}
        }
      }
    }
    if([...paths].some(p=>!referenced.has(p)))throw new Error('备份含有未被清单引用的素材')
    return manifest
  }finally{await handle.close()}
}
