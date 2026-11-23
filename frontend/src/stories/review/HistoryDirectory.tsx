import { useState } from 'react'
import { DirectoryPopover } from '../../components/review/DirectoryPopover'
import { ChevronDown, Ellipsis, FileDown, ListFilter, Pencil, Search, Tag, Trash2, X } from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { ActionDialog } from '../../components/ActionDialog'
import { HighlightMatch } from './TranscriptFind'
import { historyMetadata } from './historyFixtures'
import { meeting } from './fixtures'
import '../../components/review/history-directory.css'

interface Props {
  sessions: TranscriptSession[]
  selected: string
  titles: Record<string, string>
  metadata: Record<string, { topic: string; tags: string }>
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onTags: (id: string, tags: string) => void
  onExport: (id: string) => void
  onDelete: (id: string) => void
}
type Popup = { kind: 'filter'; anchor: HTMLButtonElement } |
  { kind: 'actions' | 'rename' | 'tags'; id: string; anchor: HTMLButtonElement }

function groupFor(date: string) {
  const age = (Date.parse(meeting.date) - Date.parse(date)) / 86_400_000
  if (age === 0) return '今天'
  if (age === 1) return '昨天'
  if (age < 7 && age > 1) return '近 7 天'
  const [year, month] = date.split('-')
  return year + ' 年 ' + Number(month) + ' 月'
}

function matchedExcerpt(text: string, query: string) {
  if (!query) return ''
  const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  if (at < 0) return ''
  const from = Math.max(0, at - 6), to = Math.min(text.length, at + query.length + 20)
  return (from ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '')
}

const splitTags = (value = '') => value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
const toggle = (items: string[], id: string) => items.includes(id) ? items.filter(i => i !== id) : [...items, id]

export function HistoryDirectory({ sessions, selected, titles, metadata, onSelect, onRename, onTags, onExport, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [popup, setPopup] = useState<Popup | null>(null)
  const [name, setName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TranscriptSession | null>(null)
  const query = search.trim(), lower = query.toLocaleLowerCase()
  const tagNames = [...new Set([...Object.values(historyMetadata), ...Object.values(metadata)].flatMap(item => splitTags(item.tags)))]
  const groups = new Map<string, TranscriptSession[]>()
  const sorted = [...sessions].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  let count = 0
  for (const item of sorted) {
    const tags = splitTags(metadata[item.id]?.tags)
    if (filters.length && !tags.some(tag => filters.includes(tag))) continue
    const text = [titles[item.id] ?? item.title, item.transcript, metadata[item.id]?.topic, ...tags].join(' ').toLocaleLowerCase()
    if (query && !text.includes(lower)) continue
    const group = groupFor(item.date)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(item)
    count++
  }
  const target = popup && 'id' in popup ? sessions.find(item => item.id === popup.id) : undefined
  const targetTitle = target ? titles[target.id] ?? target.title : ''
  const close = () => { popup?.anchor.focus({ preventScroll: true }); setPopup(null) }
  const reset = () => { setSearch(''); setFilters([]) }
  const filtering = !!query || !!filters.length
  return <aside className="history-directory" aria-label="会议历史记录">
    <header className="directory-header">
      <div className="directory-title"><h2>历史记录</h2><span>{filtering ? count + ' / ' : ''}{sessions.length} 条</span></div>
      <div className="directory-tools">
        <label className="directory-search"><Search size={15} /><input type="search" aria-label="搜索会议" placeholder="搜索标题或正文" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <button className="directory-filter" aria-label={filters.length ? '筛选标签，已选 ' + filters.length + ' 项' : '筛选标签'} title="按标签筛选" aria-haspopup="dialog" aria-expanded={popup?.kind === 'filter'} data-active={filters.length > 0}
          onClick={e => setPopup(popup?.kind === 'filter' ? null : { kind: 'filter', anchor: e.currentTarget })}><ListFilter size={16} />{filters.length > 0 && <span>{filters.length}</span>}</button>
      </div>
    </header>
    <div className="directory-list">
      {[...groups].map(([group, items]) => {
        const open = !collapsed.includes(group) || filtering
        return <section key={group}>
          <h3>{filtering ? <span className="directory-group"><span>{group}</span><small>{items.length}</small></span> :
            <button className="directory-group" aria-expanded={open} onClick={() => setCollapsed(old => toggle(old, group))}>
              <ChevronDown size={12} /><span>{group}</span><small>{items.length}</small>
            </button>}</h3>
          {open && items.map(item => {
            const title = titles[item.id] ?? item.title
            const excerpt = title.toLocaleLowerCase().includes(lower) ? '' : matchedExcerpt(item.transcript, query)
            const [, month, day] = item.date.split('-')
            const stamp = (group === '今天' || group === '昨天' ? '' : Number(month) + '月' + Number(day) + '日 ') + item.time
            const isOpen = !!popup && 'id' in popup && popup.id === item.id
            return <div className="directory-row" key={item.id} data-selected={selected === item.id} data-open={isOpen}>
              <button className="directory-record" aria-current={selected === item.id ? 'true' : undefined} title={title} onClick={() => onSelect(item.id)}>
                <strong><HighlightMatch text={title} query={query} /></strong>
                <span className="directory-meta"><time>{stamp}</time><span aria-hidden="true">·</span>{metadata[item.id]?.topic || '未分类'}</span>
                {excerpt && <span className="directory-excerpt"><HighlightMatch text={excerpt} query={query} /></span>}
              </button>
              <button className="directory-more" title="更多操作" aria-label={title + '的更多操作'} aria-haspopup="dialog" aria-expanded={isOpen}
                onClick={e => setPopup(isOpen ? null : { kind: 'actions', id: item.id, anchor: e.currentTarget })}><Ellipsis size={16} /></button>
            </div>
          })}
        </section>
      })}
      {!count && <div className="directory-empty"><p>{filtering ? '没有匹配的会议' : '还没有会议记录'}</p>{filtering && <button onClick={reset}>清除搜索和筛选</button>}</div>}
    </div>
    {popup && (popup.kind === 'filter' || target) && <DirectoryPopover anchor={popup.anchor} title={{filter:'按标签筛选',actions:'会议操作',tags:'管理标签',rename:'重命名会议'}[popup.kind]} onClose={() => setPopup(null)}>
      {popup.kind === 'actions' && target && <div className="directory-menu">
        <button onClick={() => { setName(targetTitle); setPopup({ ...popup, kind: 'rename' }) }}><Pencil />重命名</button>
        <button onClick={() => setPopup({ ...popup, kind: 'tags' })}><Tag />管理标签</button>
        <button onClick={() => { close(); onExport(target.id) }}><FileDown />导出文本</button>
        <button className="directory-danger" onClick={() => { close(); setDeleteTarget(target) }}><Trash2 />删除会议</button>
      </div>}
      {popup.kind === 'rename' && target && <form className="directory-rename" onSubmit={e => { e.preventDefault(); if (name.trim()) { onRename(target.id, name.trim()); close() } }}>
        <label>会议标题<input value={name} onFocus={e => e.currentTarget.select()} onChange={e => setName(e.target.value)} /></label>
        <div><button type="button" onClick={close}>取消</button><button type="submit" disabled={!name.trim()}>保存</button></div>
      </form>}
      {(popup.kind === 'tags' || popup.kind === 'filter') && <div className="directory-choices">
        <div className="directory-popup-title"><strong>{popup.kind === 'filter' ? '按标签筛选' : '管理标签'}</strong><button aria-label="关闭标签面板" onClick={close}><X size={14} /></button></div>
        {tagNames.map(tag => {
          const values = popup.kind === 'filter' ? filters : splitTags(metadata[target!.id]?.tags)
          return <label key={tag}><input type="checkbox" checked={values.includes(tag)} onChange={() => {
            const next = toggle(values, tag)
            if (popup.kind === 'filter') setFilters(next)
            else onTags(target!.id, next.join('，'))
          }} />{tag}</label>
        })}
        {popup.kind === 'filter' && filters.length > 0 && <button className="directory-clear" onClick={() => setFilters([])}>清除筛选</button>}
      </div>}
    </DirectoryPopover>}
    <ActionDialog open={!!deleteTarget} title="删除这场会议？" description={deleteTarget ? '从本次预览中删除「' + (titles[deleteTarget.id] ?? deleteTarget.title) + '」。重置预览可恢复。' : ''}
      onClose={() => setDeleteTarget(null)} actions={[{label:'取消',onClick:() => setDeleteTarget(null)}, {label:'删除会议',variant:'danger',onClick:() => { if (deleteTarget) onDelete(deleteTarget.id); setDeleteTarget(null) }}]} />
  </aside>
}
