import { useState } from 'react'
import { ArrowUpRight, ChevronDown, FileText } from 'lucide-react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import { useUIStore } from '../../stores/uiStore'
import { findReviewPassage, type ReviewCitation } from '../../utils/reviewPassage'
import { timestamp } from '../../utils/reviewVersions'

export type MapTopic = { label: string; children: MapTopic[] }
type TreeProps = { root: MapTopic; outline: boolean; version: TranscriptVersion; onCitation: (source: ReviewCitation) => void }
export function MeetingMapTree({ root, outline, version, onCitation }: TreeProps) {
  const { t } = useUIStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<MapTopic>()
  const match = selected ? findReviewPassage(version, { quote: selected.label }) : undefined
  function branch(node: MapTopic, path: string, depth: number): React.ReactNode {
    const open = expanded[path] ?? depth < 2
    const parent = node.children.length > 0
    return <li key={path}>
      {parent ? <button className="ins-branch" aria-expanded={open} onClick={() => setExpanded(old => ({ ...old, [path]: !open }))}><ChevronDown size={13}/>{node.label}</button>
        : <button className="map-leaf" aria-pressed={selected === node} onClick={() => setSelected(node)}>{node.label}<ArrowUpRight size={12}/></button>}
      {parent && open && <ul className="ins-leaves">{node.children.map((child,i) => branch(child,path+'.'+i,depth+1))}</ul>}
    </li>
  }
  return <>
    <div className="review-tree-scroll"><div className={'ins-tree review-tree' + (outline ? ' ins-outline' : '')}>
      <strong className="ins-root">{root.label || t.preview.discussionMap}</strong>
      {!!root.children.length && <ul className="ins-branches">{root.children.map((node,i) => branch(node,String(i),1))}</ul>}
    </div></div>
    {selected && <aside className="ins-source-detail" aria-label={t.preview.quoteText}><header><strong><FileText size={13}/>{selected.label}</strong>
      {match && <button className="ins-cite" onClick={() => onCitation({quote:selected.label,startMs:match.startMs})}>{match.startMs === undefined ? t.preview.viewPassage : timestamp(match.startMs).slice(0,-4)}<ArrowUpRight size={12}/></button>}</header>
      <p>{match ? match.text : t.preview.noMatchingPassage}</p>
    </aside>}
  </>
}
