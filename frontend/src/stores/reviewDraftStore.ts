import { create } from 'zustand'
import type { TranscriptVersion } from '../../../shared/fileTranscription'
import { normalizeVersions } from '../utils/versionSchema'

export type MergeGroupDraft = { id: string; text: string }
type Draft = { source: TranscriptVersion } & ({ value: TranscriptVersion } | { group: MergeGroupDraft })
const key='delive_review_drafts'
let unreadable=false
function save(drafts:Record<string,Draft>) {
  if(unreadable)return '原校对草稿存储无法读取，尚未覆盖；请保存为修订版本并恢复草稿存储'
  try { localStorage.setItem(key,JSON.stringify(drafts));return '' }
  catch { return '校对草稿暂未写入磁盘，请先保存为修订版本；此时退出应用可能丢失未保存修改' }
}
export const useReviewDraftStore = create<{
  drafts: Record<string, Draft>
  error: string
  put: (sessionId: string, draft: Draft) => void
  clear: (sessionId: string, expected?: Draft) => void
}>((set) => ({
  drafts: {}, error:'',
  put: (sessionId, draft) => set(state => {const drafts={...state.drafts,[sessionId]:draft};return {drafts,error:save(drafts)}}),
  clear: (sessionId, expected) => set(state => {
    const current = state.drafts[sessionId]
    if (!current || (expected && current !== expected)) return state
    const drafts = { ...state.drafts }
    delete drafts[sessionId]
    return { drafts, error: save(drafts) }
  }),
}))
export function loadReviewDrafts(sessionIds:string[]) {
  try {
    const raw:unknown=JSON.parse(localStorage.getItem(key)||'{}')
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid drafts')
    const drafts:Record<string,Draft>={}
    for(const [id,value]of Object.entries(raw)) {
      if(!sessionIds.includes(id))continue
      const source = normalizeVersions([value?.source])?.[0]
      if (!source) throw new Error('invalid draft source')
      if (value?.group) {
        const { id: groupId, text } = value.group
        if (typeof text !== 'string' || !source.merge?.groups.some(g => g.id === groupId && !g.comparisonOnly)) throw new Error('invalid group draft')
        drafts[id] = { source, group: { id: groupId, text } }
      } else {
        const draft = normalizeVersions([value?.value])?.[0]
        if (!draft) throw new Error('invalid draft')
        drafts[id] = { source, value: draft }
      }
    }
    unreadable=false
    useReviewDraftStore.setState({drafts,error:''})
  } catch { unreadable=true;useReviewDraftStore.setState({error:'校对草稿读取失败，原存储保留；请先恢复草稿存储再继续校对'}) }
}
