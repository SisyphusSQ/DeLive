import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RecordingStore } from '../../../electron/recordingStore'
import { FileTaskManager } from '../../../electron/fileTranscription/taskManager'
import { exportRecordingWav } from '../../../electron/fileTranscription/audioExport'
import { VolcFileService } from '../../../electron/fileTranscription/volcFileService'
import { fileRequest, fileHeaders, parseFileResult, fileVersion, validateFileLimits, MAX_FILE_BYTES } from '../../../shared/volcFileContract'
import type { FileTaskConfig } from '../../../shared/fileTranscription'
import { addPostMeetingVersion } from './transcriptVersions'
import { normalizeTranscriptSession } from './sessionSchema'

const roots: string[] = [], managers: FileTaskManager[] = []
afterEach(() => { managers.forEach(m=>m.dispose()); roots.forEach(r=>fs.rmSync(r,{recursive:true,force:true})); managers.length=roots.length=0 })
const credentials = { apiKey: 'synthetic-secret' }
const config: FileTaskConfig = { endpoint:'https://fixture.invalid',region:'test',bucket:'private',prefix:'test',forcePathStyle:true,accessKeyId:'fake',secretAccessKey:'fake',urlTtlSeconds:86400 }
const raw = { audio_info:{duration:1500}, result:{text:'one two',utterances:[
  {text:'one',start_time:0,end_time:500,additions:{speaker:'1'},words:[{text:'one',start_time:0,end_time:500,secret:'must disappear'}]},
  {text:'two',start_time:1000,end_time:1500,additions:{speaker:'0'}},
]}, secret:'must disappear' }
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'delive-684-test-'));roots.push(root)
  const store = new RecordingStore(path.join(root,'recordings'))
  store.begin('audio')
  const pcm = new Int16Array(24000).fill(1000).buffer
  store.append('audio',{startMs:0,sampleRate:48000,tracks:{mix:pcm}})
  store.append('audio',{startMs:1000,sampleRate:48000,tracks:{mix:pcm}})
  store.finish('audio',false)
  const storage = {upload:vi.fn(async (_key:string,file:string,_signal:AbortSignal,progress:(bytes:number)=>void)=>{progress(fs.statSync(file).size)}),
    signedUrl:vi.fn(async ()=>'https://fixture.invalid/audio?private-signature=DO_NOT_STORE'),remove:vi.fn(async()=>{}),close:vi.fn()}
  const service = {submit:vi.fn(async()=>({code:'20000000'})),query:vi.fn(async()=>({code:'20000000',raw}))}
  const jobs=path.join(root,'jobs')
  const make = () => { const m=new FileTaskManager(jobs,()=>store,()=>config,()=>storage,service);managers.push(m);return m }
  return {root,store,storage,service,jobs,make,manager:make()}
}
async function idle(m:FileTaskManager,id:string) {
  for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,2));const job=m.list().find(j=>j.id===id)!;if(!['preparing','uploading','submitting'].includes(job.status))return job}
  throw new Error('job did not settle')
}
describe('standard file task lifecycle',()=>{
  it('streams a common timeline with silent gaps and keeps the source',async()=>{
    const t=setup(),file=path.join(t.root,'upload.wav')
    const result=await exportRecordingWav(t.store,'audio',file)
    const wav=fs.readFileSync(file)
    expect(result).toEqual({sizeBytes:48044,durationMs:1500})
    expect(wav.readUInt32LE(24)).toBe(16000);expect(wav.readUInt32LE(40)).toBe(48000)
    expect(wav.readInt16LE(44)).toBe(1000);expect(wav.readInt16LE(44+20000)).toBe(0)
    expect(wav.readInt16LE(44+40000)).toBe(1000)
    expect(t.store.read('audio').blocks).toHaveLength(2)
  })
  it('uploads, persists identity before submission, queries and cleans without deleting original',async()=>{
    const t=setup()
    t.service.submit.mockImplementation(async()=>{const disk=JSON.parse(fs.readFileSync(path.join(t.jobs,t.manager.list()[0].id+'.json'),'utf8'));expect(disk.status).toBe('submitting');return {code:'20000000'}})
    const job=await t.manager.start('session','audio',credentials)
    await idle(t.manager,job.id)
    expect(t.storage.signedUrl).toHaveBeenCalledWith(job.objectKey,86400)
    const done=await t.manager.query(job.id,credentials)
    expect(done.status).toBe('completed');expect(done.cleanup).toBe('done')
    expect(done.version?.segments[0].speakerId).not.toBe(done.version?.segments[1].speakerId)
    expect(t.storage.remove).toHaveBeenCalledOnce()
    expect(t.store.read('audio').blocks).toHaveLength(2)
    expect(fs.existsSync(path.join(t.jobs,job.id+'.wav'))).toBe(false)
    const disk=fs.readFileSync(path.join(t.jobs,job.id+'.json'),'utf8')
    expect(disk).not.toMatch(/synthetic-secret|private-signature|must disappear/)
    expect(t.make().list()[0].version).toEqual(done.version)
  })
  it('keeps unknown submit and resumes exactly the same task after restart without resubmission',async()=>{
    const t=setup();t.service.submit.mockRejectedValueOnce(new Error('lost response'))
    const job=await t.manager.start('session','audio',credentials)
    expect((await idle(t.manager,job.id)).status).toBe('submission-unknown')
    expect(t.storage.remove).not.toHaveBeenCalled()
    t.manager.dispose()
    const restarted=t.make()
    await expect(restarted.start('session','audio',credentials)).rejects.toThrow('已有')
    await restarted.query(job.id,credentials)
    expect(t.service.submit).toHaveBeenCalledOnce()
    expect(t.service.query).toHaveBeenCalledWith(job.taskId,credentials)
  })
  it('recovers process death during submit and removes only derived staging data',async()=>{
    const t=setup();t.service.submit.mockRejectedValueOnce(new Error('offline'))
    const job=await t.manager.start('session','audio',credentials);await idle(t.manager,job.id)
    const file=path.join(t.jobs,job.id+'.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));saved.status='submitting';fs.writeFileSync(file,JSON.stringify(saved))
    fs.writeFileSync(path.join(t.jobs,job.id+'.wav'),'derived')
    const recovered=t.make().list()[0]
    expect(recovered.status).toBe('submission-unknown');expect(recovered.error?.code).toBe('INTERRUPTED_SUBMIT')
    expect(fs.existsSync(path.join(t.jobs,job.id+'.wav'))).toBe(false);expect(t.store.read('audio').blocks).toHaveLength(2)
  })
  it('shows cleanup failure and permits cleanup retry without reupload or resubmit',async()=>{
    const t=setup();t.storage.remove.mockRejectedValueOnce(new Error('denied'))
    const job=await t.manager.start('session','audio',credentials);await idle(t.manager,job.id)
    expect((await t.manager.query(job.id,credentials)).cleanup).toBe('failed')
    expect((await t.manager.cleanup(job.id)).cleanup).toBe('done')
    expect(t.service.submit).toHaveBeenCalledOnce();expect(t.storage.upload).toHaveBeenCalledOnce()
  })
  it('does not submit failed uploads and cleans partial cloud objects',async()=>{
    const t=setup();t.storage.upload.mockRejectedValueOnce(new Error('broken connection'))
    const job=await t.manager.start('session','audio',credentials);const failed=await idle(t.manager,job.id)
    expect(failed.status).toBe('failed');expect(failed.cleanup).toBe('done')
    expect(t.service.submit).not.toHaveBeenCalled();expect(t.storage.remove).toHaveBeenCalledOnce()
  })
  it('pauses failed queries and expired access without declaring failure or resubmitting',async()=>{
    const t=setup();const job=await t.manager.start('session','audio',credentials);await idle(t.manager,job.id)
    t.service.query.mockRejectedValueOnce(new Error('offline'))
    expect((await t.manager.query(job.id,credentials)).error?.code).toBe('QUERY_FAILED')
    t.manager.dispose();const file=path.join(t.jobs,job.id+'.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));saved.expiresAt=1;fs.writeFileSync(file,JSON.stringify(saved))
    t.service.query.mockResolvedValueOnce({code:'20000001',raw})
    const expired=await t.make().query(job.id,credentials)
    expect(expired.error?.code).toBe('URL_EXPIRED');expect(expired.status).toBe('processing')
    expect(t.storage.remove).not.toHaveBeenCalled();expect(t.service.submit).toHaveBeenCalledOnce()
  })
  it('cleans confirmed rejection and requires explicit cancellation for unknown work',async()=>{
    const t=setup();t.service.submit.mockResolvedValueOnce({code:'45000131'})
    const first=await t.manager.start('session','audio',credentials)
    expect((await idle(t.manager,first.id)).status).toBe('failed')
    t.service.submit.mockRejectedValueOnce(new Error('unknown'))
    const second=await t.manager.start('session','audio',credentials);await idle(t.manager,second.id)
    await expect(t.manager.cleanup(second.id)).rejects.toThrow('先查询')
    expect((await t.manager.cancel(second.id)).status).toBe('cancelled')
    expect(t.store.read('audio').status).toBe('completed')
  })
})
describe('task boundary failures',()=>{
  it('rejects empty and over-limit recordings before any upload or submission',async()=>{
    const t=setup()
    t.store.begin('empty');t.store.finish('empty',false)
    await expect(t.manager.start('session','empty',credentials)).rejects.toThrow()
    t.store.begin('long');t.store.append('long',{startMs:18000000,sampleRate:16000,tracks:{mix:new Int16Array(16).buffer}});t.store.finish('long',false)
    await expect(t.manager.start('session','long',credentials)).rejects.toThrow()
    expect(t.storage.upload).not.toHaveBeenCalled();expect(t.service.submit).not.toHaveBeenCalled()
  })
  it('aborts an in-progress upload and cleans its remnants without submitting',async()=>{
    const t=setup()
    t.storage.upload.mockImplementationOnce(async(_key,_file,signal)=>new Promise<void>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})))
    const job=await t.manager.start('session','audio',credentials)
    for(let i=0;i<100&&!t.storage.upload.mock.calls.length;i++)await new Promise(r=>setTimeout(r,2))
    const cancelled=await t.manager.cancel(job.id)
    expect(cancelled.status).toBe('cancelled');expect(cancelled.cleanup).toBe('done')
    expect(t.service.submit).not.toHaveBeenCalled();expect(t.store.read('audio').blocks).toHaveLength(2)
  })
  it('saves silent audio as an empty independent result without resubmitting',async()=>{
    const t=setup();const job=await t.manager.start('session','audio',credentials);await idle(t.manager,job.id)
    t.service.query.mockResolvedValueOnce({code:'20000003',raw})
    const done=await t.manager.query(job.id,credentials)
    expect(done.status).toBe('completed');expect(done.version?.text).toBe('');expect(done.cleanup).toBe('done')
  })
})
describe('standard protocol and version persistence',()=>{
  it('uses standard resource, speaker SSD policy, explicit smoothing and both auth options',()=>{
    expect(fileHeaders(credentials,'id',true)).toMatchObject({'X-Api-Resource-Id':'volc.seedasr.auc','X-Api-Sequence':'-1','X-Api-Key':'synthetic-secret'})
    expect(fileHeaders({appKey:'app',accessKey:'token'},'id')).toMatchObject({'X-Api-App-Key':'app','X-Api-Access-Key':'token'})
    expect(()=>fileHeaders({apiKey:'{{SAFE_STORAGE}}'},'id')).toThrow()
    expect(fileRequest('url',180000,false).request).toMatchObject({ssd_version:'200',enable_ddc:false,enable_speaker_info:true,show_utterances:true})
    expect(fileRequest('url',180001,true).request).toMatchObject({ssd_version:'300',enable_ddc:true})
    expect(()=>validateFileLimits(MAX_FILE_BYTES,1)).toThrow();expect(()=>validateFileLimits(48,18000000)).toThrow()
  })
  it('calls submit/query once, keeps auth in headers and accepts empty submit responses',async()=>{
    const request=vi.fn(async()=>new Response('',{status:200,headers:{'X-Api-Status-Code':'20000000'}}))
    const service=new VolcFileService(request as typeof fetch)
    await service.submit('task','https://fixture.invalid/signed',60000,false,credentials)
    await service.query('task',credentials)
    expect(request).toHaveBeenCalledTimes(2)
    const calls=request.mock.calls as unknown as Array<[string,RequestInit]>
    expect(calls[0][0]).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit')
    expect(calls[1][0]).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/query')
    expect(calls[1][1].body).toBe('{}')
    expect(calls[0][1].redirect).toBe('error')
    expect(calls[0][1].body).not.toContain('synthetic-secret')
  })
  it('distinguishes definite auth/quota rejection from unknown server/network failure',async()=>{
    for (const status of [401,403,429,413]) {
      const request=vi.fn(async()=>new Response('private diagnostic',{status}))
      expect(await new VolcFileService(request as typeof fetch).submit('id','url',1000,false,credentials)).toEqual({code:'HTTP_'+status})
      expect(request).toHaveBeenCalledOnce()
    }
    const request=vi.fn(async()=>new Response('private diagnostic',{status:503}))
    await expect(new VolcFileService(request as typeof fetch).submit('id','url',1000,false,credentials)).rejects.toThrow('未知')
    expect(request).toHaveBeenCalledOnce()
  })
  it('retains real-time text, correction, names and scoped anonymous post-meeting IDs on reopen',()=>{
    const original=normalizeTranscriptSession({id:'session',transcript:'original',correction:{status:'done',mode:'quick',correctedText:'manual'},
      segments:[{text:'original',speakerId:'live:0'}],speakers:[{id:'live:0',label:'speaker 1',displayName:'confirmed'}]})
    const version=fileVersion('job',parseFileResult(raw),'300')
    const merged=addPostMeetingVersion(original,version),reopened=normalizeTranscriptSession(JSON.parse(JSON.stringify(merged)))
    expect(reopened.transcript).toBe('original');expect(reopened.correction?.correctedText).toBe('manual')
    expect(reopened.speakers![0].displayName).toBe('confirmed')
    expect(reopened.versions).toHaveLength(2);expect(reopened.versions?.[1]).toEqual(version)
    expect(reopened.selectedVersionId).toBe('original-session')
    expect(addPostMeetingVersion(reopened,version)).toBe(reopened)
    expect(version.speakerMapping).toBeUndefined();expect(version.segments[0].speakerId).toBe('file-job:speaker:1')
  })
  it('strips undeclared response fields and preserves explicit mapping only',()=>{
    const version=fileVersion('job',parseFileResult(raw),'200')
    version.speakerMapping={sourceVersionId:'original',confirmedAt:123,pairs:{'file-job:speaker:1':'live:0'}}
    const session=normalizeTranscriptSession({versions:[JSON.parse(JSON.stringify({...version,secret:'DO_NOT_KEEP'}))]})
    expect(JSON.stringify(session)).not.toMatch(/DO_NOT_KEEP|must disappear/)
    expect(session.versions?.[0].speakerMapping).toEqual(version.speakerMapping)
    const unknown=parseFileResult({...raw,result:{text:'?',utterances:[{text:'?',start_time:0,end_time:1}]}})
    expect(fileVersion('unknown',unknown,'200').speakers).toEqual([])
    expect(normalizeTranscriptSession({transcript:'legacy'}).versions).toBeUndefined()
  })
})
