import React from 'react'
import {loadReviewDrafts} from '../../src/stores/reviewDraftStore'
import {createRoot} from 'react-dom/client'
import '../../src/index.css'
import {PreviewModal} from '../../src/components/PreviewModal'
import {FileTranscriptionView} from '../../src/components/FileTranscriptionView'
import {ApiKeyConfig} from '../../src/components/ApiKeyConfig'
import {useUIStore} from '../../src/stores/uiStore'
import {useSessionStore} from '../../src/stores/sessionStore'
import {useSettingsStore} from '../../src/stores/settingsStore'
import {useFileTaskStore} from '../../src/stores/fileTaskStore'
import {upsertSession} from '../../src/utils/sessionStorage'
import {sessionRepository} from '../../src/utils/sessionRepository'
import {normalizeTranscriptSession} from '../../src/utils/sessionSchema'
import {ingestFileTasks} from '../../src/utils/volcFileApi'
import {fileVersion} from '../../../shared/volcFileContract'
const v=(id,kind,segments)=>({id,kind,createdAt:1794450000000,text:segments.map(s=>s.text).join('\n'),segments,speakers:[{id:'live:1',label:'说话人 1',displayName:'王同学'},{id:'post:1',label:'说话人 1 · 会后稿'}]})
const base=v('base','realtime',[{id:'a',text:'下周三交付会议记录功能。',startMs:0,endMs:3000,speakerId:'live:1'},{id:'b',text:'接口需要先确认。',startMs:4000,endMs:6000,speakerId:'live:1'},{id:'c',text:'无时间记录，需要听原音确认。'}])
const post=v('post','post-meeting',[{id:'p',text:'下周四交付会议记录功能。',startMs:50,endMs:3050,speakerId:'post:1'},{id:'q',text:'接口权限需要先确认，再讨论发布。',startMs:4500,endMs:9500,speakerId:'post:1'},{id:'r',text:'补回中断期间的结论。',startMs:10000,endMs:13000,speakerId:'post:1'}])
const scenario = new URLSearchParams(location.search).get('scenario')
const recovery = scenario === 'recovery', fileOnly = scenario === 'file-only'
const historical = { ...v('old-correction', 'edited', []), parentVersionId:base.id,
  text:'旧校对稿：需要保留人工修改并对照会后分句。', speakers:[] }
const utterances = ['第一位发言', '第二位发言', '第三位发言', '第一位补充', '没有标注归属'].map((text, index) => ({
  text, startMs:index*1000, endMs:(index+1)*1000, speaker:['9','4','17','9',undefined][index],
}))
const audioPost = fileVersion('fixture-three', {text:utterances.map(u=>u.text).join(''),durationMs:15000,utterances}, '200')
const seedId = recovery ? 'fixture-707-recovery' : fileOnly ? 'fixture-707-file' : 'fixture-704'
const seed = normalizeTranscriptSession({
  id:seedId, title:recovery?'历史纯文字稿恢复':fileOnly?'无实时稿 · 三位匿名说话人':'产品周会 · 原音校正验收',
  date:'2026-11-12',time:'14:00',createdAt:1794450000000,updatedAt:1794450000000,duration:15000,
  transcript:fileOnly?'':base.text, segments:fileOnly?[]:base.segments, speakers:fileOnly?[]:base.speakers,
  versions:fileOnly?[]:recovery?[base,post,historical]:[base,post], selectedVersionId:recovery?historical.id:base.id,
  status:'completed', audioRecordingId:seedId,
})
const job={id:'fixture-job',taskId:'synthetic-task',sessionId:seed.id,status:'completed',createdAt:1794450000000,cleanup:'done',ssdVersion:'200',version:fileOnly?audioPost:post,durationMs:15000}
window.electronAPI={platform:'darwin',fileTasks:{settings:async()=>({configured:true,endpoint:'https://tos-s3-cn-beijing.volces.com',region:'cn-beijing',bucket:'fixture-private',prefix:'delive-transcription',urlTtlSeconds:86400}),list:async()=>[job],configure:async()=>{},start:async()=>{throw new Error('验收环境不提交付费识别')}},recording:{read:async()=>({schemaVersion:1,sessionId:seed.id,createdAt:1,status:'completed',durationMs:15000,bytes:0,blocks:[{index:0,startMs:0,frames:240000,sampleRate:16000,tracks:['mix','microphone','system'],bytes:480000}],sources:[],events:[]}),readBlock:async()=>{const a=new ArrayBuffer(480044),d=new DataView(a);for(const [o,s]of[[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<s.length;i++)d.setUint8(o+i,s.charCodeAt(i));d.setUint32(4,480036,true);d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,16000,true);d.setUint32(28,32000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);d.setUint32(40,480000,true);return new Uint8Array(a)}}}
const seedKey = recovery || fileOnly ? seedId : 'fixture704seed'
if(!localStorage.getItem(seedKey)){await upsertSession(seed);localStorage.setItem(seedKey,'yes')}
const loaded=await sessionRepository.loadForLaunch();useSessionStore.setState({sessions:loaded.sessions});loadReviewDrafts(loaded.sessions.map(s=>s.id));useFileTaskStore.setState({jobs:[job]})
if (fileOnly) await ingestFileTasks([job])
useSettingsStore.setState(s=>({settings:{...s.settings,currentVendor:'volc',providerConfigs:{volc:{apiKey:'synthetic-only'}}}}))
useUIStore.getState().initTheme();useUIStore.getState().openReview(seed.id)
function Preview(){const ui=useUIStore(),session=useSessionStore(s=>s.sessions.find(s=>s.id===seed.id));return <div className="h-screen flex flex-col bg-background text-foreground"><nav className="flex gap-4 border-b p-3 text-sm"><strong>{recovery||fileOnly?'TOO-707':'TOO-704'} 隔离验收</strong><button onClick={()=>ui.openReview(seed.id)}>回顾</button><button onClick={()=>ui.setView('file')}>文件</button><button onClick={()=>ui.openSettings('fileStorage')}>存储设置</button><button onClick={()=>ui.setTheme(ui.resolvedTheme==='dark'?'light':'dark')}>切换明暗</button></nav><main className="flex-1 min-h-0">{ui.currentView==='file'?<FileTranscriptionView/>:ui.currentView==='settings'?<ApiKeyConfig isOpen mode="view" onClose={ui.returnFromSettings}/>:<PreviewModal session={session} mode="view" onClose={()=>ui.setView('file')}/>}</main></div>}
createRoot(document.getElementById('root')!).render(<Preview/>);
