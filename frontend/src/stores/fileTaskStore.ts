import { create } from 'zustand'
import type { FileTask } from '../../../shared/fileTranscription'
import { fileTaskApi, ingestFileTasks } from '../utils/volcFileApi'
import { restoringBackup } from '../services/completeBackup'
import { useReviewDraftStore } from './reviewDraftStore'

export const useFileTaskStore = create<{ jobs: FileTask[]; error: string; ingestionErrors: Record<string,string> }>(()=>({ jobs: [], error: '', ingestionErrors: {} }))
let refreshing: Promise<void> | undefined
export function refreshFileTasks(retry = false): Promise<void> {
  if (refreshing) return refreshing
  if (!window.electronAPI?.fileTasks || restoringBackup) return Promise.resolve()
  refreshing = (async()=>{
    try {
      const jobs = await fileTaskApi().list()
      useFileTaskStore.setState({ jobs, error: '' })
      const previous = useFileTaskStore.getState().ingestionErrors
      const attempted = jobs.filter(job=>retry || !previous[job.id] || (previous[job.id].includes('保存或放弃校对草稿') && !useReviewDraftStore.getState().drafts[job.sessionId]))
      const remaining = Object.fromEntries(Object.entries(previous).filter(([id])=>jobs.some(j=>j.id===id)&&!attempted.some(j=>j.id===id)))
      const ingestionErrors = {...remaining,...await ingestFileTasks(attempted)}
      useFileTaskStore.setState({ ingestionErrors })
    } catch (e) { useFileTaskStore.setState({ error: (e as Error).message }) }
  })().finally(()=>{ refreshing=undefined })
  return refreshing
}
