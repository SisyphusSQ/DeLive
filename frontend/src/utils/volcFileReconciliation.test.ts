import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSession } from '../types'
import type { FileTask, TranscriptVersion } from '../../../shared/fileTranscription'
import { normalizeTranscriptSession } from './sessionSchema'
import { editedVersion } from './reviewVersions'
const state=vi.hoisted(()=>({sessions:[] as TranscriptSession[],drafts:{} as Record<string,unknown>,fail:false,queue:Promise.resolve(),beforeWrite:undefined as undefined|(()=>void)}))
vi.mock('../stores/sessionStore',()=>({useSessionStore:{getState:()=>({sessions:state.sessions}),setState:(patch:{sessions:TranscriptSession[]})=>{state.sessions=patch.sessions}}}))
vi.mock('../stores/reviewDraftStore',()=>({useReviewDraftStore:{getState:()=>({drafts:state.drafts})}}))
vi.mock('../stores/settingsStore',()=>({useSettingsStore:{getState:()=>({settings:{}})}}))
vi.mock('./sessionRepository',()=>({sessionRepository:{mutateDurable:async(id:string,update:(s:TranscriptSession)=>Partial<TranscriptSession>)=>{
 const operation=state.queue.catch(()=>{}).then(()=>{state.beforeWrite?.();state.beforeWrite=undefined;if(state.fail)throw new Error('disk unavailable');state.sessions=state.sessions.map(s=>s.id===id?normalizeTranscriptSession({...s,...update(s)}):s)})
 state.queue=operation;await operation;return state.sessions
}}}))
import { ingestFileTasks } from './volcFileApi'
const original:TranscriptVersion={id:'base',kind:'realtime',createdAt:1,text:'原文',speakers:[],segments:[{id:'s',text:'原文',startMs:0,endMs:1000}]}
const result:TranscriptVersion={id:'post',kind:'post-meeting',createdAt:2,text:'会后稿',speakers:[],segments:[{id:'p',text:'会后稿',startMs:0,endMs:1000}]}
const job=():FileTask=>({id:'j',taskId:'j',sessionId:'session',recordingId:'session',status:'completed',createdAt:1,updatedAt:2,durationMs:1000,sizeBytes:32044,uploadedBytes:32044,objectKey:'temp/j.wav',ssdVersion:'200',enableDdc:false,cleanup:'done',version:result,reconcileBaseId:'base'})
beforeEach(()=>{state.sessions=[normalizeTranscriptSession({id:'session',transcript:original.text,segments:original.segments,versions:[original],selectedVersionId:original.id})];state.drafts={};state.fail=false;state.queue=Promise.resolve();state.beforeWrite=undefined})
describe('会后结果共享导入与自动校正',()=>{
 it('有明确意图才生成；重复通知幂等且不切换采用稿',async()=>{await ingestFileTasks([job()]);await ingestFileTasks([job()]);expect(state.sessions[0].versions).toHaveLength(3);expect(state.sessions[0].selectedVersionId).toBe('base');expect(state.sessions[0].versions?.[2].kind).toBe('reconciled')})
 it('普通或历史任务不自动合并',async()=>{await ingestFileTasks([{...job(),reconcileBaseId:undefined}]);expect(state.sessions[0].versions).toHaveLength(2)})
 it('先保存会后稿，草稿结束后基于最新人工修改继续合并',async()=>{state.drafts.session={};expect((await ingestFileTasks([job()])).j).toContain('校对草稿');expect(state.sessions[0].versions).toHaveLength(2);const manual=editedVersion(original,{...original,text:'人工',segments:[{...original.segments[0],text:'人工'}]},'人工');state.sessions[0].versions!.push(manual);state.sessions[0].selectedVersionId=manual.id;state.drafts={};await ingestFileTasks([job()]);expect(state.sessions[0].versions?.slice(-1)[0].text).toBe('人工');expect(state.sessions[0].selectedVersionId).toBe(manual.id)})
 it('磁盘失败不报已保存，重试保留结果且不重复生成',async()=>{state.fail=true;expect((await ingestFileTasks([job()])).j).toContain('待保存');expect(state.sessions[0].versions).toHaveLength(1);state.fail=false;await ingestFileTasks([job()]);expect(state.sessions[0].versions).toHaveLength(3)})
 it('合并失败保留会后稿和可重试错误',async()=>{expect((await ingestFileTasks([{...job(),reconcileBaseId:'missing'}])).j).toContain('自动合并未完成');expect(state.sessions[0].versions).toHaveLength(2)})
 it('静音保留原稿，不生成空校正版',async()=>{await ingestFileTasks([{...job(),version:{...result,text:'',segments:[]}}]);expect(state.sessions[0].versions).toHaveLength(2);expect(state.sessions[0].transcript).toBe('原文')})
 it('删除的会议不复活',async()=>{state.sessions=[];await ingestFileTasks([job()]);expect(state.sessions).toHaveLength(0)})
 it('写入期间出现的人工版本不会被旧快照覆盖',async()=>{state.beforeWrite=()=>{const manual=editedVersion(original,{...original,segments:[{...original.segments[0],text:'并发人工'}]},'人工');state.sessions[0].versions!.push(manual);state.sessions[0].selectedVersionId=manual.id};await ingestFileTasks([job()]);expect(state.sessions[0].versions?.slice(-1)[0].text).toBe('并发人工')})
})
