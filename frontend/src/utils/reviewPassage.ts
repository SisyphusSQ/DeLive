import type { TranscriptVersion } from '../../../shared/fileTranscription'

export interface ReviewCitation { quote: string; startMs?: number }

/** Link only to evidence present in this manuscript, including older plain-text versions. */
export function findReviewPassage(version: TranscriptVersion, { quote, startMs }: ReviewCitation) {
  const text = quote.trim()
  const items = version.segments.length ? version.segments : [{ text: version.text, startMs: undefined, endMs: undefined }]
  if (startMs !== undefined) {
    const exact = items.findIndex(item => item.startMs === startMs)
    if (exact >= 0) return { index: exact, ...items[exact] }
    const index = items.findIndex(item => item.startMs !== undefined && item.endMs !== undefined && item.startMs < startMs && startMs < item.endMs)
    if (index >= 0) return { index, ...items[index] }
  }
  if (!text) return
  const index = items.findIndex(item => item.text.includes(text))
  if (index < 0 || items.slice(index + 1).some(item => item.text.includes(text))) return
  const item = items[index]
  if (version.segments.length || item.text.length <= 240) return { index, ...item }
  const at = item.text.indexOf(text)
  const from = Math.max(0, at - 48), to = Math.min(item.text.length, at + text.length + 72)
  return { index, ...item, text: (from ? '…' : '') + item.text.slice(from, to) + (to < item.text.length ? '…' : '') }
}
