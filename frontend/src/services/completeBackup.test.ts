import {beforeEach,expect,it,vi} from 'vitest'
import type {BackupData} from '../utils/backupStorage'
const mocks=vi.hoisted(()=>({openAppDatabase:vi.fn(),getMetaValue:vi.fn()}))
vi.mock('../utils/storageShared',async original=>({...await original<typeof import('../utils/storageShared')>(),...mocks}))
import {planRestore,commitRestoreMetadata,recoverBackupRestore} from './completeBackup'
const data={version:'3.0',sessions:[{id:'same',transcript:'old',audioRecordingId:'audio'}],tags:[{id:'tag',name:'old'}],topics:[],settings:{}} as unknown as BackupData
beforeEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()})
it('keeps local same-ID and shared-audio conflicts, while importing unrelated sessions',()=>{
 const incoming={...data,sessions:[{id:'same',transcript:'new'},{id:'other',audioRecordingId:'audio'},{id:'new'}]} as BackupData
 const plan=planRestore(data,incoming,'merge')
 expect(plan.conflicts).toEqual(['same','other']);expect(plan.sessionIds).toEqual(['new']);expect(plan.data.sessions[0].transcript).toBe('old')
 expect(planRestore(data,incoming,'overwrite').data.sessions).toEqual(incoming.sessions)
})
it('commits sessions and recovery marker in one transaction, rejecting late abort',async()=>{
 const puts:unknown[]=[],store={clear:vi.fn(),put:(v:unknown)=>puts.push(v)},tx={objectStore:()=>store,oncomplete:()=>{},onabort:()=>{},onerror:()=>{},error:new Error('disk full'),abort:vi.fn()}
 mocks.openAppDatabase.mockResolvedValue({transaction:vi.fn(()=>tx)})
 const marker={token:'token',settings:data.settings,tags:data.tags,topics:[]}
 const result=commitRestoreMetadata(data,marker);await Promise.resolve();expect(puts).toContainEqual({key:'complete-backup-restore',value:marker});tx.onabort();await expect(result).rejects.toThrow('disk full')
})
it('rolls files back when the database never committed',async()=>{
 const settle=vi.fn();vi.stubGlobal('window',{electronAPI:{completeBackup:{pendingRestore:async()=>({token:'pending'}),settle}}});mocks.getMetaValue.mockResolvedValue({token:'older'})
 await recoverBackupRestore();expect(settle).toHaveBeenCalledWith('pending',false)
})
it('finishes mirrors then commits files after a database commit',async()=>{
 const settle=vi.fn(),setItem=vi.fn();vi.stubGlobal('window',{electronAPI:{completeBackup:{pendingRestore:async()=>({token:'pending'}),settle}}});vi.stubGlobal('localStorage',{setItem});mocks.getMetaValue.mockResolvedValue({token:'pending',settings:{apiKey:'local'},tags:[],topics:[]})
 await recoverBackupRestore();expect(setItem).toHaveBeenCalledTimes(3);expect(settle).toHaveBeenCalledWith('pending',true)
})
it('keeps the pending journal if writing the local mirrors fails',async()=>{
 const settle=vi.fn();vi.stubGlobal('window',{electronAPI:{completeBackup:{pendingRestore:async()=>({token:'pending'}),settle}}});vi.stubGlobal('localStorage',{setItem:()=>{throw new Error('quota')}});mocks.getMetaValue.mockResolvedValue({token:'pending'})
 await expect(recoverBackupRestore()).rejects.toThrow('quota');expect(settle).not.toHaveBeenCalled()
})
