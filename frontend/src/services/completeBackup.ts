import type { BackupArtifact, PreparedRestore } from '../../../shared/backup'
import type { CloudBackupIpcConfig } from '../../../shared/electronApi'
import type { AppSettings, CloudBackupConfig } from '../types'
import { portableSettings } from '../../../shared/backup'
import { sessionRepository } from '../utils/sessionRepository'
import { getSettings, getTags, getTopics } from '../utils/settingsStorage'
import { CURRENT_BACKUP_VERSION, CURRENT_BACKUP_SCHEMA_VERSION, upgradeBackupData, type BackupData } from '../utils/backupStorage'
import { openAppDatabase, getMetaValue, META_STORE, SESSION_STORE, SETTINGS_STORE, TAGS_STORE, SETTINGS_SINGLETON_KEY, TAGS_SINGLETON_KEY, STORAGE_KEYS } from '../utils/storageShared'
import { useSessionStore } from '../stores/sessionStore'
import { cancelAiTasks } from './aiTransport'

let busy = false
export let restoringBackup = false
export function buildIpcConfig(config: CloudBackupConfig): CloudBackupIpcConfig {
  return { provider:config.provider||'s3', s3:config.s3, webdav:config.webdav, quark:config.quark }
}
export async function backupSnapshot(): Promise<BackupData> {
  if (useSessionStore.getState().recordingState !== 'idle') throw new Error('请先停止录音，等待资料落盘后备份')
  return {version:CURRENT_BACKUP_VERSION,schemaVersion:CURRENT_BACKUP_SCHEMA_VERSION,exportedAt:new Date().toISOString(),sessions:await sessionRepository.snapshot(),tags:getTags(),topics:getTopics(),settings:portableSettings(getSettings()) as unknown as AppSettings}
}
export async function uploadCompleteBackup(config:CloudBackupConfig):Promise<void>{
  if(busy)throw new Error('已有备份或恢复任务正在进行')
  busy=true
  try{
    const api=window.electronAPI!.completeBackup
    if((await api.jobs()).some(j=>j.state!=='complete'))throw new Error('有尚未确认的上传，请先检查或继续原任务')
    const artifact=await api.build(JSON.stringify(await backupSnapshot()),config.includeAudio!==false)
    await api.upload(buildIpcConfig(config),artifact.id)
  }finally{busy=false}
}
interface RestoreMarker { token:string; settings:AppSettings; tags:BackupData['tags']; topics:NonNullable<BackupData['topics']> }
const MARKER='complete-backup-restore'
function writeMirrors(marker:RestoreMarker){
  localStorage.setItem(STORAGE_KEYS.SETTINGS,JSON.stringify(marker.settings))
  localStorage.setItem(STORAGE_KEYS.TAGS,JSON.stringify(marker.tags))
  localStorage.setItem(STORAGE_KEYS.TOPICS,JSON.stringify(marker.topics))
}
export async function recoverBackupRestore():Promise<void>{
  const api=window.electronAPI?.completeBackup
  if(!api)return
  const pending=await api.pendingRestore();if(!pending)return
  const marker=await getMetaValue<RestoreMarker>(MARKER)
  if(marker?.token===pending.token){writeMirrors(marker);await api.settle(pending.token,true)}
  else await api.settle(pending.token,false)
}
export function planRestore(current:BackupData,incoming:BackupData,mode:'merge'|'overwrite'){
  const conflicts=incoming.sessions.filter(s=>current.sessions.some(c=>c.id===s.id || (s.audioRecordingId && c.audioRecordingId===s.audioRecordingId))).map(s=>s.id)
  const add=<T extends {id:string}>(old:T[],next:T[])=>[...old,...next.filter(n=>!old.some(o=>o.id===n.id))]
  const sessions=mode==='merge'?add(current.sessions,incoming.sessions):incoming.sessions
  return {conflicts,sessionIds:incoming.sessions.filter(s=>mode==='overwrite'||!conflicts.includes(s.id)).map(s=>s.id),data:{...incoming,sessions,tags:mode==='merge'?add(current.tags,incoming.tags):incoming.tags,topics:mode==='merge'?add(current.topics||[],incoming.topics||[]):incoming.topics||[]}}
}
export async function commitRestoreMetadata(data:BackupData,marker:RestoreMarker):Promise<void>{
  const db=await openAppDatabase()
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction([SESSION_STORE,META_STORE,SETTINGS_STORE,TAGS_STORE],'readwrite')
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||new Error('恢复数据库事务失败'))
    try{
      const sessions=tx.objectStore(SESSION_STORE);sessions.clear();for(const session of data.sessions)sessions.put(session)
      tx.objectStore(META_STORE).put({key:MARKER,value:marker})
      tx.objectStore(SETTINGS_STORE).put({id:SETTINGS_SINGLETON_KEY,data:marker.settings})
      tx.objectStore(TAGS_STORE).put({id:TAGS_SINGLETON_KEY,data:marker.tags})
    }catch(error){tx.abort();reject(error)}
  })
}
export async function restoreCompleteBackup(stage:PreparedRestore,mode:'merge'|'overwrite'):Promise<boolean>{
  if(busy)throw new Error('已有备份或恢复任务正在进行')
  busy=true;restoringBackup=true
  window.dispatchEvent(new Event('backup-restore-state'))
  let token:string|undefined,committed=false
  const api=window.electronAPI!.completeBackup
  try{
    for(const session of useSessionStore.getState().sessions)cancelAiTasks(session.id)
    const current=await backupSnapshot(),incoming=upgradeBackupData(JSON.parse(stage.metadataJson) as BackupData),plan=planRestore(current,incoming,mode)
    const detail=`${stage.legacy?'旧 JSON：仅文字，图片和原音不在备份内。':stage.includeAudio?'含图片和原音。':'含图片，主动排除原音。'}\n${mode==='merge'?`合并 ${plan.sessionIds.length} 个会话，同 ID 保留本地 ${plan.conflicts.length} 个`:`覆盖本地 ${current.sessions.length} 个会话，恢复为 ${incoming.sessions.length} 个`}；标签 ${plan.data.tags.length}，主题 ${plan.data.topics.length}。\n${plan.conflicts.length?'冲突会话：'+plan.conflicts.join('、')+'\n':''}继续前会保存完整本地回退包。`
    if(!confirm(detail))return false
    const revision=JSON.stringify([useSessionStore.getState().sessions,getTags(),getTopics()])
    const rollback=await api.build(JSON.stringify(current),true)
    token=await api.apply(stage.id,plan.sessionIds,rollback.id)
    if(revision!==JSON.stringify([useSessionStore.getState().sessions,getTags(),getTopics()]))throw new Error('恢复期间会话发生变化，请重试；本次未提交')
    const local=getSettings(),portable=mode==='overwrite'?portableSettings(incoming.settings):{}
    const settings={...local,...portable,aiPostProcess:{...local.aiPostProcess,...(portable.aiPostProcess as object||{}),apiKey:local.aiPostProcess?.apiKey,codexPath:local.aiPostProcess?.codexPath}} as AppSettings
    const marker:RestoreMarker={token,settings,tags:plan.data.tags,topics:plan.data.topics}
    await commitRestoreMetadata(plan.data,marker);committed=true
    writeMirrors(marker);await api.settle(token,true)
    window.location.reload();return true
  }catch(error){
    window.dispatchEvent(new CustomEvent('backup-error',{detail:(error as Error).message}))
    if(token&&!committed)await api.settle(token,false)
    if(committed)throw new Error('恢复数据已提交，收尾未完成，请重启应用继续；原回退包保留。'+(error as Error).message)
    throw error
  }finally{
    busy=false
    // After a committed transaction, only restart recovery may expose the new data.
    if(!committed){restoringBackup=Boolean(await api.pendingRestore());window.dispatchEvent(new Event('backup-restore-state'))}
  }
}
export async function localRollbacks():Promise<BackupArtifact[]>{return window.electronAPI!.completeBackup.rollbacks()}
