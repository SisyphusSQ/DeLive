import { useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'

interface FindProps {
  segments: TranscriptVersion['segments']
  query: string
  onQuery: (query: string) => void
  onLocate: (index: number) => void
}

export function TranscriptFind({ segments, query, onQuery, onLocate }: FindProps) {
  const [position, setPosition] = useState<number | null>(null)
  const needle = query.trim().toLocaleLowerCase()
  const matches = segments.flatMap((segment, index) => needle && segment.text.toLocaleLowerCase().includes(needle) ? [index] : [])
  const move = (step: number) => {
    if (!matches.length) return
    const next = ((position ?? (step > 0 ? -1 : 0)) + step + matches.length) % matches.length
    setPosition(next)
    onLocate(matches[next])
  }
  return <div className="transcript-find" role="search" aria-label="正文查找">
    <h2>转录正文</h2>
    <div><label><Search size={14} aria-hidden="true" />
      <input type="search" aria-label="查找当前稿" placeholder="查找当前稿" value={query}
        onChange={event => { onQuery(event.target.value); setPosition(null) }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); move(event.shiftKey ? -1 : 1) } }} />
    </label>
    {needle && <><span role="status">{matches.length ? position === null ? `${matches.length} 段` : `${position + 1} / ${matches.length}` : '无匹配'}</span>
      <button aria-label="上一处匹配" disabled={!matches.length} onClick={() => move(-1)}><ChevronUp size={16} /></button>
      <button aria-label="下一处匹配" disabled={!matches.length} onClick={() => move(1)}><ChevronDown size={16} /></button>
    </>}</div>
  </div>
}

export { HighlightMatch } from '../../components/review/HighlightMatch'
