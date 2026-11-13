import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, FolderOpen, Mic, Pencil, Search, Trash2 } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTagStore } from '../stores/tagStore'
import type { Topic } from '../types'

interface TopicDetailViewProps {
  topic: Topic
  onBack: () => void
  onStartRecording: () => void
  onEdit: () => void
  onDelete: () => void
}

export function TopicDetailView({ topic, onBack, onStartRecording, onEdit, onDelete }: TopicDetailViewProps) {
  const { t, openTopicReview } = useUIStore()
  const sessions = useSessionStore(s => s.sessions)
  const tags = useTagStore(s => s.tags)
  const [search, setSearch] = useState('')
  const topicSessions = useMemo(() => sessions.filter(s => s.topicId === topic.id).sort((a, b) => b.createdAt - a.createdAt), [sessions, topic.id])
  const visible = topicSessions.filter(session => [session.title, session.transcript, session.date, session.time, ...(session.tagIds || []).map(id => tags.find(tag => tag.id === id)?.name || '')].join('\n').toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="app-page-scroll" aria-label={topic.name}><div className="app-page-content">
    <header className="app-page-heading"><div><button className="app-text-button" onClick={onBack}><ArrowLeft size={15} />{t.workspace.allTopics}</button><h1>{topic.emoji} {topic.name}</h1><p>{topic.description}</p></div><div className="app-actions"><button className="app-text-button" onClick={onEdit}><Pencil size={15} />{t.topics.editTopic}</button><button className="app-primary" onClick={onStartRecording}><Mic size={15} />{t.topics.recordNew}</button></div></header>
    <label className="app-search"><Search size={16} /><input aria-label={t.history.searchPlaceholder} placeholder={t.history.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} /></label>
    <section className="app-section"><header className="app-section-heading"><h2>{t.workspace.topicMeetings}</h2><span>{topicSessions.length} {t.topics.sessions}</span></header>
      {visible.map(session => <button key={session.id} className="app-meeting-row" onClick={() => openTopicReview(session.id, topic.id)}><span><small>{session.date} · {session.time}</small><strong>{session.title}</strong><p>{session.postProcess?.summary || session.transcript}</p></span><ArrowUpRight size={16} /></button>)}
      {!visible.length && <div className="app-empty"><FolderOpen size={28} /><h2>{search ? t.history.noSearchResults(search) : t.workspace.noTopicMeetings}</h2><p>{t.workspace.topicMeetingsHint}</p>{search && <button className="app-text-button" onClick={() => setSearch('')}>{t.workspace.clearSearch}</button>}</div>}
      <footer className="app-actions"><button className="app-text-button text-destructive" onClick={onDelete}><Trash2 size={15} />{t.topics.deleteTopic}</button></footer>
    </section>
  </div></section>
}
