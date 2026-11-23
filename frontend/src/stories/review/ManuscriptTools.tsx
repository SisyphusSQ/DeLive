import { Pencil } from 'lucide-react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import { versionNames } from './fixtures'
import { Select } from '../../components/ui/Select'
import { ReviewToolPanel } from '../../components/review/ReviewToolPanel'

interface ManuscriptToolsProps {
  versions: TranscriptVersion[]
  viewed: TranscriptVersion
  adopted: TranscriptVersion
  compare: string
  speaker: string
  locked: boolean
  canAdopt: boolean
  onView: (id: string) => void
  onCompare: (id: string) => void
  onSpeaker: (id: string) => void
  onEdit: () => void
  onAdopt: () => void
}


export function ManuscriptTools(props: ManuscriptToolsProps) {
  const { versions, viewed, adopted, compare, speaker, locked } = props
  function label(version: TranscriptVersion) {
    const peers = versions.filter(item => item.kind === version.kind)
    return peers.length > 1 ? versionNames[version.kind] + ' · ' + (peers.indexOf(version) + 1) : versionNames[version.kind]
  }
  const pending = viewed.merge?.groups.filter(group => group.status === 'pending').length ?? 0
  const summary = viewed.id === adopted.id ? label(viewed) + ' · 已采用' : '查看 ' + label(viewed) + ' · 已采用 ' + label(adopted)
  return <ReviewToolPanel title="稿件与校对" collapsedSummary={summary} action={
    <button className="tool-edit" disabled={locked} onClick={props.onEdit}><Pencil size={13} />校对当前稿</button>
  }>
    <div className="tool-fields">
      <label>正在查看<Select aria-label="正在查看" disabled={locked} value={viewed.id} onChange={event => props.onView(event.target.value)}>
        {versions.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}
      </Select></label>
      <label>对照稿件<Select aria-label="对照稿件" disabled={locked} value={compare} onChange={event => props.onCompare(event.target.value)}>
        <option value="">不对照</option>
        {versions.filter(item => item.id !== viewed.id).map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}
      </Select></label>
      <label>说话人筛选<Select aria-label="说话人筛选" value={speaker} onChange={event => props.onSpeaker(event.target.value)}>
        <option value="">全部说话人</option><option value="unknown">未知说话人</option>
        {viewed.speakers.map(item => <option key={item.id} value={item.id}>{item.displayName || item.label}</option>)}
      </Select></label>
    </div>
    <div className="tool-adoption">
      <strong>已采用 · {label(adopted)}</strong><span>用于导出和 AI</span>
      <span title="待确认项数量不代表逐句核听的情况">当前稿待确认 {pending} 处</span>
      {adopted.id !== viewed.id && <button className="tool-link" disabled={!props.canAdopt} onClick={props.onAdopt}>采用此稿</button>}
    </div>
  </ReviewToolPanel>
}
