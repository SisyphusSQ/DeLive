import {afterEach,expect,it,vi} from 'vitest'
import {loadReviewDrafts,useReviewDraftStore} from './reviewDraftStore'
const draft={source:{id:'a',kind:'realtime' as const,createdAt:1,text:'原文',segments:[],speakers:[]},value:{id:'a',kind:'realtime' as const,createdAt:1,text:'未保存修改',segments:[],speakers:[]}}
afterEach(()=>vi.unstubAllGlobals())
it('重开恢复未保存草稿，移除已删除会话；写入失败显式报告',()=>{
 const items=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>items.get(k),setItem:(k:string,v:string)=>items.set(k,v)})
 loadReviewDrafts(['s']);useReviewDraftStore.getState().put('s',draft);useReviewDraftStore.setState({drafts:{}});loadReviewDrafts(['s']);expect(useReviewDraftStore.getState().drafts.s.value.text).toBe('未保存修改')
 loadReviewDrafts([]);expect(useReviewDraftStore.getState().drafts).toEqual({})
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('full')}});useReviewDraftStore.getState().put('s',draft);expect(useReviewDraftStore.getState().error).toContain('暂未写入磁盘');expect(useReviewDraftStore.getState().drafts.s).toEqual(draft)
})
it('损坏草稿不被静默覆盖',()=>{
 const setItem=vi.fn();vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem});loadReviewDrafts(['s']);useReviewDraftStore.getState().put('s',draft);expect(setItem).not.toHaveBeenCalled();expect(useReviewDraftStore.getState().error).toContain('尚未覆盖')
})
