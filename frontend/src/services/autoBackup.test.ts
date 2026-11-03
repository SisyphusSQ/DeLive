import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({listeners:new Set<()=>void>(),config:{enabled:true,autoBackupOnComplete:true},state:'idle',snapshot:vi.fn(),upload:vi.fn()}))
vi.mock('../stores/sessionStore',()=>({useSessionStore:{getState:()=>({recordingState:m.state}),subscribe:(f:()=>void)=>{m.listeners.add(f);return()=>m.listeners.delete(f)}}}))
vi.mock('../stores/settingsStore',()=>({useSettingsStore:{getState:()=>({settings:{cloudBackup:m.config}}),subscribe:()=>()=>{}}}))
vi.mock('../stores/tagStore',()=>({useTagStore:{subscribe:()=>()=>{}}}))
vi.mock('../stores/topicStore',()=>({useTopicStore:{subscribe:()=>()=>{}}}))
vi.mock('./completeBackup',()=>({backupSnapshot:m.snapshot,uploadCompleteBackup:m.upload,restoringBackup:false}))
import {startAutoBackup} from './autoBackup'
let stop:()=>void
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();m.listeners.clear();m.config={enabled:true,autoBackupOnComplete:true};m.state='idle';m.snapshot.mockResolvedValue({sessions:[{id:'one'}],exportedAt:'now'});m.upload.mockResolvedValue(undefined);const values=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k),setItem:(k:string,v:string)=>values.set(k,v)});vi.stubGlobal('crypto',{subtle:{digest:async(_name:string,raw:Uint8Array)=>raw.buffer}})})
afterEach(()=>{stop?.();vi.useRealTimers();vi.unstubAllGlobals()})
it('coalesces changes, waits for recording to stop, and includes later AI changes',async()=>{
 m.state='recording';stop=startAutoBackup(vi.fn());await vi.advanceTimersByTimeAsync(5000);expect(m.upload).not.toHaveBeenCalled()
 m.state='idle';for(const f of m.listeners){f();f();f()}await vi.advanceTimersByTimeAsync(5000);expect(m.upload).toHaveBeenCalledTimes(1)
 for(const f of m.listeners)f();await vi.advanceTimersByTimeAsync(5000);expect(m.upload).toHaveBeenCalledTimes(1)
 m.snapshot.mockResolvedValue({sessions:[{id:'one',postProcess:'updated'}],exportedAt:'later'});for(const f of m.listeners)f();await vi.advanceTimersByTimeAsync(5000);expect(m.upload).toHaveBeenCalledTimes(2)
})
it('does not upload with auto backup disabled and surfaces unknown failures without repeated attempts',async()=>{
 m.config.autoBackupOnComplete=false;const report=vi.fn();stop=startAutoBackup(report);await vi.advanceTimersByTimeAsync(5000);expect(m.upload).not.toHaveBeenCalled()
 m.config.autoBackupOnComplete=true;m.upload.mockRejectedValue(new Error('unknown original task'));for(const f of m.listeners)f();await vi.advanceTimersByTimeAsync(5000);expect(report).toHaveBeenCalledWith(expect.stringContaining('unknown original task'))
 for(const f of m.listeners)f();await vi.advanceTimersByTimeAsync(5000);expect(m.upload).toHaveBeenCalledTimes(1)
})
