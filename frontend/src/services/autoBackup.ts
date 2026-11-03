import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTagStore } from '../stores/tagStore'
import { useTopicStore } from '../stores/topicStore'
import { backupSnapshot, uploadCompleteBackup, restoringBackup } from './completeBackup'

export function startAutoBackup(report:(error:string)=>void):()=>void{
  let timer:ReturnType<typeof setTimeout>|undefined,running=false,dirty=false,stopped=false,lastAttempt=''
  const schedule=()=>{
    if(stopped)return
    dirty=true
    if(timer)clearTimeout(timer)
    timer=setTimeout(()=>void run(),5000)
  }
  const run=async()=>{
    if(stopped||running||restoringBackup)return
    const config=useSettingsStore.getState().settings.cloudBackup
    if(!config?.enabled||!config.autoBackupOnComplete||useSessionStore.getState().recordingState!=='idle')return
    running=true;dirty=false
    try{
      const snapshot=await backupSnapshot()
      const raw=new TextEncoder().encode(JSON.stringify({...snapshot,exportedAt:'',target:config}))
      const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('')
      if(localStorage.getItem('delive-last-auto-backup')===fingerprint)return
      if(fingerprint===lastAttempt)return
      lastAttempt=fingerprint
      await uploadCompleteBackup(config)
      localStorage.setItem('delive-last-auto-backup',fingerprint)
    }catch(error){report('自动备份未完成：'+(error as Error).message)}
    finally{running=false;if(dirty)schedule()}
  }
  const off=[useSessionStore.subscribe(schedule),useSettingsStore.subscribe(schedule),useTagStore.subscribe(schedule),useTopicStore.subscribe(schedule)]
  schedule()
  return()=>{stopped=true;if(timer)clearTimeout(timer);off.forEach(fn=>fn())}
}
