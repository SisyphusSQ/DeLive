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
import { ingestFileTasks, recoverReconciledVersion } from './volcFileApi'
import { fileVersion } from '../../../shared/volcFileContract'
import { reviewExport, selectedReviewVersion } from './reviewVersions'
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

it('无实时稿时采用首份有文字的会后稿，按实际三人及未知归属保存和导出', async () => {
  const empty = { ...original, id: 'empty', text: '', segments: [] }
  state.sessions = [normalizeTranscriptSession({ id: 'session', transcript: '', versions: [empty], selectedVersionId: empty.id })]
  const post = fileVersion('speakers', { text: '甲乙丙甲未知', durationMs: 5000, utterances:
    ['22', '10', '7', '22', undefined].map((speaker, i) => ({ speaker, text: ['甲','乙','丙','甲','未知'][i], startMs: i*1000, endMs: (i+1)*1000 })),
  }, '200')
  const completed = { ...job(), version: post, reconcileBaseId: undefined }
  await ingestFileTasks([completed])
  await ingestFileTasks([completed])
  const session = state.sessions[0], version = selectedReviewVersion(session)
  expect(version.id).toBe(post.id)
  expect(session.versions?.map(v => v.kind)).toEqual(['realtime','post-meeting'])
  expect(version.speakers).toHaveLength(3)
  expect(version.segments.map(s => s.speakerId)).toEqual([
    'file-speakers:speaker:22','file-speakers:speaker:10','file-speakers:speaker:7','file-speakers:speaker:22',undefined,
  ])
  expect(reviewExport(session, 'vtt')).toContain('[说话人 3 · 会后稿] 丙')
  expect(reviewExport(session, 'md')).toContain('[未知说话人] 未知')
  const edited = editedVersion(version, version, '人工保留')
  state.sessions[0] = { ...session, versions: [...session.versions!,edited], selectedVersionId: edited.id }
  await ingestFileTasks([{ ...completed, version: { ...post, id: 'later' } }])
  expect(state.sessions[0].selectedVersionId).toBe(edited.id)
})

it('恢复在串行写入处检查草稿，失败可重试，并发请求只创建一个恢复稿', async () => {
  await ingestFileTasks([{ ...job(), reconcileBaseId: undefined }])
  const legacy = { ...original, id: 'legacy', kind: 'edited' as const, segments: [], text: '旧人工稿' }
  state.sessions[0].versions!.push(legacy)
  state.beforeWrite = () => { state.drafts.session = {} }
  await expect(recoverReconciledVersion('session', legacy.id, result.id)).rejects.toThrow('草稿')
  state.drafts = {}
  state.fail = true
  await expect(recoverReconciledVersion('session', legacy.id, result.id)).rejects.toThrow('disk')
  expect(state.sessions[0].versions).toHaveLength(3)
  state.fail = false
  const ids = await Promise.all(Array.from({length:2}, () => recoverReconciledVersion('session', legacy.id, result.id)))
  expect(ids[0]).toBe(ids[1])
  expect(state.sessions[0].versions).toHaveLength(4)
  expect(state.sessions[0].selectedVersionId).toBe(original.id)
})

it('同一已完成任务补齐历史会后稿缺失的说话人，不覆盖已有归属、不新增版本', async () => {
  const post = fileVersion('history', { text:'甲乙未知', durationMs:3000, utterances:[
    {text:'甲',startMs:0,endMs:1000,speaker:'a'},
    {text:'乙',startMs:1000,endMs:2000,speaker:'b'},
    {text:'未知',startMs:2000,endMs:3000},
  ] }, '200')
  const saved = { ...post, response:undefined, speakers:[{...post.speakers[0],displayName:'确认甲'}],
    segments:post.segments.map((s,i)=>i===1?{...s,speakerId:undefined}:s) }
  state.sessions[0] = { ...state.sessions[0], versions:[original,saved], selectedVersionId:post.id }
  const completed = { ...job(), version:post, reconcileBaseId:undefined }
  await ingestFileTasks([completed])
  const current = state.sessions[0]
  expect(current.versions).toHaveLength(2)
  expect(current.selectedVersionId).toBe(post.id)
  expect(current.versions?.[1].segments).toEqual(normalizeTranscriptSession({versions:[post]}).versions?.[0].segments)
  expect(current.versions?.[1].speakers[0].displayName).toBe('确认甲')
  state.beforeWrite = vi.fn()
  await ingestFileTasks([completed])
  expect(state.beforeWrite).not.toHaveBeenCalled()
})
