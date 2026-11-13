import { useMemo, useState } from 'react'
import { Search, Plus, Mic, Pencil, Trash2, FolderOpen, ArrowUpRight } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useTopicStore } from '../stores/topicStore'
import { useSessionStore } from '../stores/sessionStore'
import { TopicDialog } from './TopicDialog'
import { ActionDialog } from './ActionDialog'
import { TopicDetailView } from './TopicDetailView'
import type { Topic } from '../types'

export function TopicsView() {
  const { t } = useUIStore()
  const { topics, addTopic, updateTopic, deleteTopic, selectedTopicId, setSelectedTopic } = useTopicStore()
  const sessions = useSessionStore(s => s.sessions)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null)
  const [error, setError] = useState('')
  const selectedTopic = topics.find(topic => topic.id === selectedTopicId)
  const matches = useMemo(() => topics.filter(topic => `${topic.name} ${topic.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())), [topics, search])
  const openEditor = (topic: Topic | null) => { setEditingTopic(topic); setDialogOpen(true); setError('') }
  const record = (id: string) => { useTopicStore.getState().setActiveTopic(id); useUIStore.getState().setView('live') }

  return <>
    {selectedTopic ? <TopicDetailView key={selectedTopic.id} topic={selectedTopic} onBack={() => setSelectedTopic(null)} onStartRecording={() => record(selectedTopic.id)} onEdit={() => openEditor(selectedTopic)} onDelete={() => { setError(''); setDeleteTarget(selectedTopic) }} /> : <section className="app-page-scroll" aria-label={t.topics.title}>
      <div className="app-page-content">
        <header className="app-page-heading"><div><h1>{t.topics.title}</h1><p>{t.workspace.topicsHint}</p></div><button className="app-primary" onClick={() => openEditor(null)}><Plus size={16} />{t.topics.newTopic}</button></header>
        <label className="app-search"><Search size={16} /><input aria-label={t.topics.searchTopics} placeholder={t.topics.searchTopics} value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="app-topic-grid">
          {matches.map(topic => {
            const records = sessions.filter(session => session.topicId === topic.id)
            const minutes = Math.floor(records.reduce((total, session) => total + (session.duration ?? 0), 0) / 60000)
            return <article className="app-topic-card" key={topic.id}>
              <button className="app-topic-open" onClick={() => setSelectedTopic(topic.id)}><span className="app-topic-icon">{topic.emoji}</span><h2>{topic.name}</h2><p>{topic.description || t.topics.noTopicsHint}</p><span className="app-topic-meta">{records.length} {t.topics.sessions}{minutes > 0 && ` · ${minutes} ${t.topics.minutesShort}`}<ArrowUpRight size={15} /></span></button>
              <div className="app-topic-actions"><button className="app-text-button" onClick={() => record(topic.id)}><Mic size={14} />{t.topics.recordNew}</button><button className="app-icon-button" aria-label={`${t.topics.editTopic} ${topic.name}`} onClick={() => openEditor(topic)}><Pencil size={15} /></button><button className="app-icon-button text-destructive" aria-label={`${t.topics.deleteTopic} ${topic.name}`} onClick={() => { setError(''); setDeleteTarget(topic) }}><Trash2 size={15} /></button></div>
            </article>
          })}
        </div>
        {!matches.length && <div className="app-empty"><FolderOpen size={28} /><h2>{search ? t.history.noSearchResults(search) : t.topics.noTopics}</h2><p>{t.topics.noTopicsHint}</p>{search && <button className="app-text-button" onClick={() => setSearch('')}>{t.workspace.clearSearch}</button>}</div>}
      </div>
    </section>}
    <TopicDialog open={dialogOpen} topic={editingTopic} onClose={() => setDialogOpen(false)} onSave={(name, emoji, description) => {
      if (editingTopic) updateTopic(editingTopic.id, { name, emoji, description })
      else addTopic(name, emoji, description)
    }} />
    <ActionDialog open={!!deleteTarget} title={t.topics.deleteTopic} description={[deleteTarget ? t.topics.deleteConfirm(deleteTarget.name) : '', error].filter(Boolean).join(' — ')} onClose={() => setDeleteTarget(null)} actions={[
      { label: t.common.cancel, onClick: () => setDeleteTarget(null), variant: 'secondary' },
      { label: t.common.delete, variant: 'danger', onClick: () => { if (!deleteTarget) return; try { deleteTopic(deleteTarget.id); setDeleteTarget(null); setError('') } catch (cause) { setError(String(cause)) } } },
    ]} />
  </>
}
