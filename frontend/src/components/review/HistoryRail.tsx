import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Ellipsis, FileDown, ListFilter, Pencil, Search, Tag, Trash2, X } from 'lucide-react'
import type { Tag as SessionTag, TranscriptSession } from '../../types'
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

interface Props {
  variant: 'full' | 'rail'
  sessions: TranscriptSession[]
  total: number
  search: string
  query: string
  onSearch: (value: string) => void
  onDelete: (session: TranscriptSession) => void
  date?: string | null
  onClearDate?: () => void
  aboveList?: ReactNode
  onOpenSession?: (id: string, trigger: HTMLButtonElement) => void
}

function excerpt(texts: string[], query: string) {
  if (!query) return ''
  for (const text of texts) {
    const index = text.toLocaleLowerCase().indexOf(query)
    if (index < 0) continue
    const start = Math.max(0, index - 18)
    const end = index + query.length + 42
    return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  }
  return ''
}

function RecordTags({ tags, priorityIds, query, extraLabel }: {
  tags: SessionTag[]
  priorityIds: string[]
  query: string
  extraLabel: (names: string) => string
}) {
  if (!tags.length) return null
  const matching = tags.filter(tag => priorityIds.includes(tag.id) || (query && tag.name.toLocaleLowerCase().includes(query)))
  const ordered = [...matching, ...tags.filter(tag => !matching.includes(tag))]
  const extra = ordered.slice(2)
  const extraNames = extra.map(tag => tag.name).join('、')
  return <span className="review-home-row-tags">
    {ordered.slice(0, 2).map(tag => <span className="review-home-row-tag" title={tag.name} key={tag.id}><HighlightMatch text={tag.name} query={query} /></span>)}
    {extra.length > 0 && <span className="review-home-row-tag" title={extraNames}>
      <span aria-hidden="true">+{extra.length}</span><span className="sr-only">{extraLabel(extraNames)}</span>
    </span>}
  </span>
}

export function HistoryRail({ variant, sessions, total, search, query, onSearch, onDelete, date, onClearDate, aboveList, onOpenSession }: Props) {
  const { t, language, openReview, reviewSessionId } = useUIStore()
  const { tags, selectedTagIds, toggleTagFilter, clearTagFilter } = useTagStore()
  const topics = useTopicStore(state => state.topics)
  const rename = useSessionStore(state => state.updateSessionTitle)
  const [popup, setPopup] = useState<Target>()
  const [name, setName] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>([])
  const searchInput = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setPopup(undefined), [])
  const home = variant === 'full'
  const GroupHeading = home ? 'h2' : 'h3'
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const formatDay = useMemo(() => new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', timeZone: 'UTC' }), [language])
  const groups = useMemo(() => {
    const formatMonth = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', timeZone: 'UTC' })
    const map = new Map<string, TranscriptSession[]>()
    for (const session of [...sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))) {
      const stamp = Date.parse(session.date)
      const age = (today - stamp) / 86400000
      const label = age === 0 ? t.common.today : age === 1 ? t.common.yesterday : age > 1 && age < 7 ? t.history.recentWeek :
        Number.isFinite(stamp) ? formatMonth.format(stamp) : session.date
      const rows = map.get(label) ?? []
      rows.push(session)
      map.set(label, rows)
    }
    return [...map]
  }, [sessions, today, t, language])
  const pickedTags = tags.filter(tag => selectedTagIds.includes(tag.id))
  const filtered = !!(query || selectedTagIds.length || date)
  const target = popup && 'id' in popup ? sessions.find(item => item.id === popup.id) : undefined
  const dismiss = () => { popup?.anchor.focus({ preventScroll: true }); close() }
  const clearFilters = () => { clearTagFilter(); onClearDate?.() }
  const clearAll = () => { onSearch(''); clearFilters(); searchInput.current?.focus() }
  const printDate = (value: string) => {
    const stamp = Date.parse(value)
    return Number.isFinite(stamp) ? formatDay.format(stamp) : value
  }
  const count = (filtered ? sessions.length + '/' : '') + total + ' ' + t.common.items

  return <section className={home ? 'review-home-directory' : 'history-directory'} aria-label={t.history.title}>
    <header className={home ? undefined : 'directory-header'}>
      {!home && <div className="directory-title"><h2>{t.history.title}</h2><span>{count}</span></div>}
      <div className={home ? 'directory-tools review-home-tools' : 'directory-tools'}>
        <label className="directory-search"><Search size={15} aria-hidden="true" />
          <input ref={searchInput} type="search" aria-label={t.history.searchCompact} placeholder={t.history.searchCompact} value={search} onChange={event => onSearch(event.target.value)} />
        </label>
        <button type="button" className="directory-filter" title={t.history.filterTags} aria-label={t.history.filterTags} data-active={!!selectedTagIds.length}
          aria-haspopup="dialog" aria-expanded={popup?.kind === 'filter'}
          onClick={event => setPopup(popup?.kind === 'filter' ? undefined : { kind: 'filter', anchor: event.currentTarget })}>
          <ListFilter size={16} aria-hidden="true" />{home && t.history.filter}{selectedTagIds.length > 0 && <span>{selectedTagIds.length}</span>}
        </button>
        {home && <span className="review-home-count" role="status">{count}</span>}
      </div>
    </header>
    {(date || (home && pickedTags.length > 0)) && <div className="review-home-filters" role="group" aria-label={t.history.activeFilters}>
      {date && <button type="button" onClick={onClearDate} aria-label={t.history.removeFilter(printDate(date))}>
        <CalendarDays size={13} aria-hidden="true" />{printDate(date)}<X size={13} aria-hidden="true" />
      </button>}
      {home && pickedTags.map(tag => <button type="button" key={tag.id} onClick={() => toggleTagFilter(tag.id)} aria-label={t.history.removeFilter(tag.name)}>
        {tag.name}<X size={13} aria-hidden="true" />
      </button>)}
      {home && Number(!!date) + pickedTags.length > 1 && <button type="button" className="review-home-clear" onClick={clearFilters}>{t.tag.clearFilter}</button>}
    </div>}
    {aboveList}
    <div className={home ? 'review-home-records' : 'directory-list'}>
      {groups.map(([label, rows]) => {
        const open = filtered || !collapsed.includes(label)
        return <section key={label} className={home ? 'review-home-group' : undefined}>
          <GroupHeading>{filtered ? <span className="directory-group"><span>{label}</span><small>{rows.length}</small></span> :
            <button type="button" className="directory-group" aria-expanded={open}
              onClick={() => setCollapsed(items => items.includes(label) ? items.filter(item => item !== label) : [...items, label])}>
              {!home && <ChevronDown size={12} aria-hidden="true" />}<span>{label}</span><small>{rows.length}</small>{home && <ChevronDown size={14} aria-hidden="true" />}
            </button>}</GroupHeading>
          {open && rows.map(item => {
            const hit = !query || item.title.toLocaleLowerCase().includes(query) ? '' : excerpt([
              item.versions?.find(version => version.id === item.selectedVersionId)?.text ?? '', item.transcript, item.postProcess?.summary ?? '',
            ], query)
            const stamp = [t.common.today, t.common.yesterday].includes(label) ? item.time :
              (home ? printDate(item.date) : item.date.slice(5)) + ' ' + item.time
            const topic = topics.find(candidate => candidate.id === item.topicId)?.name ?? t.topics.uncategorized
            const active = popup && 'id' in popup && popup.id === item.id
            return <div className="directory-row" key={item.id} data-selected={reviewSessionId === item.id} data-open={!!active}>
              <button type="button" className="directory-record" title={item.title} aria-current={reviewSessionId === item.id || undefined}
                onClick={event => onOpenSession ? onOpenSession(item.id, event.currentTarget) : openReview(item.id)}>
                <strong><HighlightMatch text={item.title} query={query} /></strong>
                <span className="directory-meta">
                  <span className="directory-stamp"><time dateTime={`${item.date}T${item.time}`}>{stamp}</time><span aria-hidden="true">·</span>{topic}</span>
                  {home && <RecordTags tags={tags.filter(tag => item.tagIds?.includes(tag.id))} priorityIds={selectedTagIds} query={query} extraLabel={t.history.extraTags} />}
                </span>
                {hit && <span className="directory-excerpt"><HighlightMatch text={hit} query={query} /></span>}
              </button>
              <button type="button" className="directory-more" aria-label={item.title + ' · ' + t.history.more} title={t.history.more}
                aria-haspopup="dialog" aria-expanded={!!active}
                onClick={event => setPopup(active ? undefined : { kind: 'menu', anchor: event.currentTarget, id: item.id })}><Ellipsis size={16} aria-hidden="true" /></button>
            </div>
          })}
        </section>
      })}
      {!sessions.length && <div className={home ? 'review-home-empty' : 'directory-empty'}>
        {home && <Search size={23} aria-hidden="true" />}
        <p>{filtered ? t.history.noMatchingRecords : t.history.noRecords}</p>
        {filtered && <button type="button" onClick={clearAll}>{t.history.clearSearchAndFilters}</button>}
      </div>}
    </div>
    {popup?.kind === 'tags' && target && <TagSelector externalAnchor={popup.anchor} sessionId={target.id} sessionTagIds={target.tagIds ?? []} onDismiss={close} />}
    {popup && popup.kind !== 'tags' && (target || popup.kind === 'filter') &&
      <DirectoryPopover anchor={popup.anchor} title={popup.kind === 'filter' ? t.history.filterTags : popup.kind === 'rename' ? t.history.editTitle : t.history.more} onClose={close}>
        {popup.kind === 'filter' && <div className="directory-choices">
          <strong>{t.history.filterTags}</strong>
          {tags.map(tag => <label key={tag.id}><input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={() => toggleTagFilter(tag.id)} />{tag.name}</label>)}
          {!tags.length && <p>{t.tag.noTags}</p>}
          {selectedTagIds.length > 0 && <button type="button" className="directory-clear" onClick={clearTagFilter}>{t.tag.clearFilter}</button>}
        </div>}
        {popup.kind === 'menu' && target && <div className="directory-menu">
          <button onClick={() => { setName(target.title); setPopup({ ...popup, kind: 'rename' }) }}><Pencil />{t.history.editTitle}</button>
          <button onClick={() => setPopup({ ...popup, kind: 'tags' })}><Tag />{t.tag.manageTags}</button>
          <button onClick={() => { dismiss(); exportToTxt(target, tags) }}><FileDown />{t.history.exportTxt}</button>
          <button className="directory-danger" onClick={() => { dismiss(); onDelete(target) }}><Trash2 />{t.common.delete}</button>
        </div>}
        {popup.kind === 'rename' && target && <form className="directory-rename" onSubmit={event => {
          event.preventDefault()
          if (name.trim()) { rename(target.id, name.trim()); dismiss() }
        }}>
          <label>{t.history.editTitle}<input value={name} onFocus={event => event.target.select()} onChange={event => setName(event.target.value)} /></label>
          <div><button type="button" onClick={dismiss}>{t.common.cancel}</button><button disabled={!name.trim()}>{t.common.save}</button></div>
        </form>}
      </DirectoryPopover>}
  </section>
}
