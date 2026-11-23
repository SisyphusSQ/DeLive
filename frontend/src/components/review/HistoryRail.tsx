import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, Ellipsis, FileDown, ListFilter, Pencil, Search, Tag, Trash2 } from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { useUIStore } from '../../stores/uiStore'
import { useTagStore } from '../../stores/tagStore'
import { useTopicStore } from '../../stores/topicStore'
import { useSessionStore } from '../../stores/sessionStore'
import { exportToTxt } from '../../utils/storage'
import { TagSelector } from '../TagSelector'
import { HighlightMatch } from './HighlightMatch'
import { DirectoryPopover } from './DirectoryPopover'
import './history-directory.css'

type Target = { kind: 'filter'; anchor: HTMLButtonElement } |
  { kind: 'menu' | 'rename' | 'tags'; id: string; anchor: HTMLButtonElement }
type Props = { sessions: TranscriptSession[]; total: number; search: string; onSearch: (value: string) => void; onDelete: (session: TranscriptSession) => void }

function excerpt(texts: string[], query: string) {
  if (!query) return ''
  for (const text of texts) {
    const index = text.toLocaleLowerCase().indexOf(query)
    if (index < 0) continue
    const start = Math.max(0, index - 8), end = Math.min(text.length, index + query.length + 26)
    return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  }
  return ''
}

export function HistoryRail({ sessions, total, search, onSearch, onDelete }: Props) {
  const { t, language, openReview, reviewSessionId } = useUIStore()
  const { tags, selectedTagIds, toggleTagFilter, clearTagFilter, searchQuery } = useTagStore()
  const topics = useTopicStore(s => s.topics)
  const rename = useSessionStore(s => s.updateSessionTitle)
  const [popup, setPopup] = useState<Target>()
  const [name, setName] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>([])
  const close = useCallback(() => setPopup(undefined), [])
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const groups = useMemo(() => {
    const map = new Map<string, TranscriptSession[]>()
    for (const session of [...sessions].sort((a,b) => (b.date + b.time).localeCompare(a.date + a.time))) {
      const age = (today - Date.parse(session.date)) / 86400000
      const key = age === 0 ? t.common.today : age === 1 ? t.common.yesterday : age > 1 && age < 7 ? t.history.recentWeek :
        Number.isFinite(age) ? new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(session.date)) : session.date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(session)
    }
    return [...map]
  }, [sessions, today, t, language])
  const query = searchQuery.trim().toLocaleLowerCase()
  const filtered = !!query || !!selectedTagIds.length
  const target = popup && 'id' in popup ? sessions.find(item => item.id === popup.id) : undefined
  const dismiss = () => { popup?.anchor.focus({ preventScroll: true }); close() }
  const count = (filtered ? sessions.length + '/' : '') + total + ' ' + t.common.items
  return <div className="history-directory">
    <header className="directory-header">
      <div className="directory-title"><h2>{t.history.title}</h2><span>{count}</span></div>
      <div className="directory-tools">
        <label className="directory-search"><Search size={15}/><input type="search" aria-label={t.history.searchCompact} placeholder={t.history.searchCompact} value={search} onChange={event => onSearch(event.target.value)}/></label>
        <button className="directory-filter" title={t.tag.filter} aria-label={t.tag.filter} data-active={!!selectedTagIds.length} aria-haspopup="dialog" aria-expanded={popup?.kind === 'filter'}
          onClick={event => setPopup(popup?.kind === 'filter' ? undefined : { kind: 'filter', anchor: event.currentTarget })}><ListFilter size={16}/>{!!selectedTagIds.length && <span>{selectedTagIds.length}</span>}</button>
      </div>
    </header>
    <div className="directory-list">{groups.map(([label, rows]) => <section key={label}>
      <h3><button className="directory-group" aria-expanded={filtered || !collapsed.includes(label)} disabled={filtered}
        onClick={() => setCollapsed(items => items.includes(label) ? items.filter(i => i !== label) : [...items, label])}><ChevronDown size={12}/><span>{label}</span><small>{rows.length}</small></button></h3>
      {(filtered || !collapsed.includes(label)) && rows.map(item => {
        const hit = !query || item.title.toLocaleLowerCase().includes(query) ? '' : excerpt([
          item.versions?.find(v => v.id === item.selectedVersionId)?.text ?? '', item.transcript, item.postProcess?.summary ?? '',
        ], query)
        const stamp = [t.common.today,t.common.yesterday].includes(label) ? item.time : item.date.slice(5) + ' ' + item.time
        const active = popup && 'id' in popup && popup.id === item.id
        return <div className="directory-row" key={item.id} data-selected={reviewSessionId === item.id} data-open={!!active}>
          <button className="directory-record" title={item.title} aria-current={reviewSessionId === item.id || undefined} onClick={() => openReview(item.id)}>
            <strong><HighlightMatch text={item.title} query={query}/></strong>
            <span className="directory-meta"><time>{stamp}</time><span>·</span>{topics.find(topic => topic.id === item.topicId)?.name ?? t.topics.uncategorized}</span>
            {hit && <span className="directory-excerpt"><HighlightMatch text={hit} query={query}/></span>}
          </button>
          <button className="directory-more" aria-label={item.title + ' · ' + t.history.more} title={t.history.more} aria-haspopup="dialog" aria-expanded={!!active}
            onClick={event => setPopup(active ? undefined : { kind:'menu', anchor:event.currentTarget, id:item.id })}><Ellipsis size={16}/></button>
        </div>
      })}
    </section>)}
    {!sessions.length && <div className="directory-empty">{filtered ? t.history.noMatchingRecords : t.history.noRecords}{filtered && <div><button onClick={() => { onSearch(''); clearTagFilter() }}>{t.tag.clearFilter}</button></div>}</div>}</div>
    {popup?.kind === 'tags' && target && <TagSelector externalAnchor={popup.anchor} sessionId={target.id} sessionTagIds={target.tagIds ?? []} onDismiss={close}/>}
    {popup && popup.kind !== 'tags' && (target || popup.kind === 'filter') && <DirectoryPopover anchor={popup.anchor} title={popup.kind === 'filter' ? t.tag.filter : popup.kind === 'rename' ? t.history.editTitle : t.history.more} onClose={close}>
      {popup.kind === 'filter' && <div className="directory-choices">
        <strong>{t.tag.tags}</strong>{tags.map(tag => <label key={tag.id}><input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={() => toggleTagFilter(tag.id)}/>{tag.name}</label>)}
        {!tags.length && <p>{t.tag.noTags}</p>}{!!selectedTagIds.length && <button className="directory-clear" onClick={clearTagFilter}>{t.tag.clearFilter}</button>}
      </div>}
      {popup.kind === 'menu' && target && <div className="directory-menu">
        <button onClick={() => { setName(target.title); setPopup({...popup,kind:'rename'}) }}><Pencil/>{t.history.editTitle}</button>
        <button onClick={() => setPopup({...popup,kind:'tags'})}><Tag/>{t.tag.manageTags}</button>
        <button onClick={() => { dismiss(); exportToTxt(target,tags) }}><FileDown/>{t.history.exportTxt}</button>
        <button className="directory-danger" onClick={() => { dismiss(); onDelete(target) }}><Trash2/>{t.common.delete}</button>
      </div>}
      {popup.kind === 'rename' && target && <form className="directory-rename" onSubmit={event => { event.preventDefault(); if (name.trim()) { rename(target.id,name.trim()); dismiss() } }}>
        <label>{t.history.editTitle}<input value={name} onFocus={event => event.target.select()} onChange={event => setName(event.target.value)}/></label>
        <div><button type="button" onClick={dismiss}>{t.common.cancel}</button><button disabled={!name.trim()}>{t.common.save}</button></div>
      </form>}
    </DirectoryPopover>}
  </div>
}
