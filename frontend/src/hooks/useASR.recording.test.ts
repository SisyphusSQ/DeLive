import { beforeEach, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  settings: { currentVendor:'volc', recordingMode:'audio-only', autoTranscribeAfterRecording:true },
  state: { recordingState:'idle', currentSessionId:null as string|null, sessions:[] as {id:string}[] },
  order: [] as string[], stop:vi.fn(), connect:vi.fn(), startTask:vi.fn(), wait:vi.fn(), error:vi.fn(),
  captureCallbacks: {} as {onTrackEnded?:()=>void;onDeviceChange?:()=>void},
}))
vi.mock('react', () => ({ useCallback:(fn:unknown)=>fn, useRef:(current:unknown)=>({current}), useEffect:vi.fn() }))
vi.mock('../stores/settingsStore', () => ({ useSettingsStore:{getState:()=>({settings:f.settings})}, getVolcCredentialIssue:()=> '未配置实时密钥' }))
vi.mock('../stores/recordingStore', () => ({ useRecordingStore:{getState:()=>({system:true,microphone:true,update:vi.fn()})} }))
vi.mock('../stores/topicStore', () => ({ useTopicStore:{getState:()=>({})} }))
const state = () => ({ ...f.state, setRecordingState:(value:string)=>{f.state.recordingState=value},
  startNewSession:()=>{f.state.currentSessionId='saved';f.state.sessions=[{id:'saved'}];return 'saved'}, endCurrentSession:()=>{}, applyTranscriptEvent:()=>{} })
vi.mock('../stores/sessionStore', () => ({ useSessionStore:Object.assign(()=>state(),{getState:()=>state(),setState:vi.fn()}) }))
vi.mock('../utils/sessionRepository', () => ({ sessionRepository:{updateMetadata:()=>f.state.sessions,waitForSessionWrite:f.wait} }))
vi.mock('../services/captureManager', () => ({ CaptureManager:class {stop=f.stop;acquireStream=async()=>{};startArchive=async()=>{};startWithStream=async(_cap:unknown,callbacks:typeof f.captureCallbacks)=>{f.captureCallbacks=callbacks};restartStreamOnly=async()=>{throw new Error('设备断开')};finishRestart=()=>{};} }))
vi.mock('../services/providerSession', () => ({ ProviderSessionManager:class {connect=f.connect;disconnect=async()=>{};} }))
vi.mock('../utils/volcFileApi', () => ({startRecordingFileTask:f.startTask}))
vi.mock('../stores/fileTaskStore', () => ({refreshFileTasks:async()=>{}}))
import { useASR } from './useASR'
beforeEach(() => {
  vi.clearAllMocks(); f.settings.autoTranscribeAfterRecording=true;f.state.recordingState='idle';f.state.currentSessionId=null;f.state.sessions=[];f.order=[]
  Object.assign(globalThis,{window:{electronAPI:{platform:'darwin'}}})
  f.stop.mockImplementation(async()=>{f.order.push('audio');return {status:'completed',sessionId:'saved',durationMs:2000}})
  f.wait.mockImplementation(async()=>{f.order.push('session')})
  f.startTask.mockImplementation(async()=>{f.order.push('task')})
})
it('只录音跳过实时凭据和连接，停止先保存音频及索引，再提交一次会后任务',async()=>{
  const hook=useASR({onError:f.error});await hook.startRecording()
  expect(f.connect).not.toHaveBeenCalled();expect(f.state.recordingState).toBe('recording')
  await Promise.all([hook.stopRecording(),hook.stopRecording()]);await hook.stopRecording()
  expect(f.order).toEqual(['audio','session','task']);expect(f.startTask).toHaveBeenCalledExactlyOnceWith('saved','saved')
})
it('采用录音开始时的开关，不因中途设置改变而上传',async()=>{
  f.settings.autoTranscribeAfterRecording=false;const hook=useASR();await hook.startRecording();f.settings.autoTranscribeAfterRecording=true
  await hook.stopRecording();expect(f.startTask).not.toHaveBeenCalled()
})
it.each(['audio','session','interrupted'])('保存未完成不自动上传：%s',async failure=>{
  const hook=useASR({onError:f.error});await hook.startRecording()
  if(failure==='audio')f.stop.mockRejectedValue(new Error('disk'))
  if(failure==='session')f.wait.mockRejectedValue(new Error('index'))
  if(failure==='interrupted')f.stop.mockResolvedValue({status:'interrupted',sessionId:'saved'})
  await hook.stopRecording();expect(f.startTask).not.toHaveBeenCalled();expect(f.state.recordingState).toBe('idle')
})
it('会后服务失败保留原音并恢复空闲，不重复提交',async()=>{
  const hook=useASR({onError:f.error});await hook.startRecording();f.startTask.mockRejectedValue(new Error('未配置存储'))
  await hook.stopRecording();expect(f.error).toHaveBeenCalledWith(expect.stringContaining('原音已保存，会后转写未启动'))
  expect(f.state.recordingState).toBe('idle');await hook.stopRecording();expect(f.startTask).toHaveBeenCalledOnce()
})
it.each(['onTrackEnded','onDeviceChange'] as const)('设备异常不自动上传已保存的部分原音：%s',async callback=>{
  const hook=useASR();await hook.startRecording();f.captureCallbacks[callback]?.()
  await vi.waitFor(()=>expect(f.state.recordingState).toBe('idle'))
  expect(f.stop).toHaveBeenCalledOnce();expect(f.startTask).not.toHaveBeenCalled()
})
