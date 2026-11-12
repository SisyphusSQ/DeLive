import {afterEach,expect,it,vi} from 'vitest'
import {loadReviewDrafts,useReviewDraftStore} from './reviewDraftStore'
const draft={source:{id:'a',kind:'realtime' as const,createdAt:1,text:'原文',segments:[],speakers:[]},value:{id:'a',kind:'realtime' as const,createdAt:1,text:'未保存修改',segments:[],speakers:[]}}
afterEach(()=>vi.unstubAllGlobals())
it('重开恢复未保存草稿，移除已删除会话；写入失败显式报告',()=>{
 const items=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>items.get(k),setItem:(k:string,v:string)=>items.set(k,v)})
 loadReviewDrafts(['s']);useReviewDraftStore.getState().put('s',draft);useReviewDraftStore.setState({drafts:{}});loadReviewDrafts(['s']);expect(useReviewDraftStore.getState().drafts.s).toMatchObject({value:{text:'未保存修改'}})
 loadReviewDrafts([]);expect(useReviewDraftStore.getState().drafts).toEqual({})
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('full')}});useReviewDraftStore.getState().put('s',draft);expect(useReviewDraftStore.getState().error).toContain('暂未写入磁盘');expect(useReviewDraftStore.getState().drafts.s).toEqual(draft)
})
it('损坏草稿不被静默覆盖',()=>{
 const setItem=vi.fn();vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem});loadReviewDrafts(['s']);useReviewDraftStore.getState().put('s',draft);expect(setItem).not.toHaveBeenCalled();expect(useReviewDraftStore.getState().error).toContain('尚未覆盖')
})

it('恢复对应版本和区段的未保存文字，包括待确认的删除', () => {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {getItem: (key: string) => items.get(key), setItem: (key: string, value: string) => items.set(key, value)})
  loadReviewDrafts(['s'])
  const source = {
    ...draft.source, kind: 'reconciled' as const,
    merge: { key: 'key', strategy: 1 as const, baseVersionId: 'base', postVersionId: 'post', currentVersionId: 'base',
      groups: [{ id: 'group', status: 'pending' as const, baseIds: [], postIds: [], currentIds: [], outputIds: [] }] },
  }
  useReviewDraftStore.getState().put('s', { source, group: { id: 'group', text: '' } })
  useReviewDraftStore.setState({drafts:{}})
  loadReviewDrafts(['s'])
  expect(useReviewDraftStore.getState().drafts.s).toMatchObject({ source: { id: source.id }, group: { id: 'group', text: '' } })
})

it('保存完成只清除提交时的草稿，保留等待期间的新编辑', () => {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {getItem: (key: string) => items.get(key), setItem: (key: string, value: string) => items.set(key, value)})
  loadReviewDrafts(['s'])
  const store = useReviewDraftStore.getState()
  store.put('s', draft)
  const newer = { ...draft, value: { ...draft.value, text: '等待保存时的新编辑' } }
  store.put('s', newer)
  store.clear('s', draft)
  expect(useReviewDraftStore.getState().drafts.s).toBe(newer)
  loadReviewDrafts(['s'])
  const reloaded = useReviewDraftStore.getState().drafts.s
  expect(reloaded).toMatchObject(newer)
  store.clear('s', reloaded)
  expect(useReviewDraftStore.getState().drafts.s).toBeUndefined()
})
