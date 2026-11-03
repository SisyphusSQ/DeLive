import type { TranscriptSession } from '../types'
import { validImagePath } from '../../../shared/sessionImages'

const key = 'delive:image-cleanup'
type Removal = { sessionId: string; assetPath?: string }
function pending(): Removal[] {
  const value: unknown = JSON.parse(localStorage.getItem(key) || '[]')
  if (!Array.isArray(value) || value.some(v => !v || !/^[a-zA-Z0-9_-]{1,128}$/.test(v.sessionId) || (v.assetPath !== undefined && !validImagePath(v.sessionId, v.assetPath)))) throw new Error('图片清理队列无效，未删除文件')
  return value
}
export function queueImageRemoval(item: Removal): void {
  const items = pending()
  if (!items.some(v => v.sessionId === item.sessionId && v.assetPath === item.assetPath)) localStorage.setItem(key, JSON.stringify([...items, item]))
}
// Only explicit deletions are retried; an unavailable/empty database never triggers a directory sweep.
export async function flushImageRemovals(sessions: TranscriptSession[]): Promise<void> {
  const api = window.electronAPI?.sessionImages
  if (!api) return
  for (const item of pending()) {
    const session = sessions.find(s => s.id === item.sessionId)
    if (item.assetPath ? session?.images?.some(i => i.assetPath === item.assetPath) : session) continue
    if (item.assetPath) await api.remove(item.sessionId, item.assetPath)
    else await api.removeSession(item.sessionId)
    localStorage.setItem(key, JSON.stringify(pending().filter(v => v.sessionId !== item.sessionId || v.assetPath !== item.assetPath)))
  }
}
