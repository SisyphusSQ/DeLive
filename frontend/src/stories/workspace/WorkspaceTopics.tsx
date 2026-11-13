import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, FolderOpen, Mic, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { ActionDialog } from '../../components/ActionDialog'
import { useTopicStore } from '../../stores/topicStore'
import { useSessionStore } from '../../stores/sessionStore'
import type { Topic } from '../../types'
import { PreviewDialog } from '../review/NotebookExtras'

export function WorkspaceTopics({ onReview, onRecord, initialTopic, saveFails }: {
  onReview: (id: string) => void
  onRecord: (id: string) => void
  initialTopic?: string
  saveFails: boolean
}) {
  const topics = useTopicStore(s => s.topics)
  const sessions = useSessionStore(s => s.sessions)
  const [selected, setSelected] = useState(initialTopic ?? '')
  const [search, setSearch] = useState('')
  const [meetingSearch, setMeetingSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Topic> | null>(null)
  const [deleting, setDeleting] = useState<Topic | null>(null)
  const [notice, setNotice] = useState('')
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => { page.current?.closest('.workspace-page')?.scrollTo({ top: 0 }) }, [selected])
  const topic = topics.find(item => item.id === selected)
  const matches = topics.filter(item => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const topicSessions = sessions.filter(item => item.topicId === topic?.id)
  const visibleSessions = topicSessions.filter(item => `${item.title} ${item.transcript}`.toLowerCase().includes(meetingSearch.trim().toLowerCase()))
  const openEditor = (value: Partial<Topic>) => { setNotice(''); setEditing(value) }

  return <div ref={page} className="workspace-flow workspace-topics">
    <header className="workspace-page-heading">
      <div>{topic && <button className="note-text-button" onClick={() => setSelected('')}><ArrowLeft size={15} />所有主题</button>}<span className="workspace-eyebrow">{topic ? '主题资料' : '整理与积累'}</span><h1>{topic ? `${topic.emoji} ${topic.name}` : '主题'}</h1><p>{topic ? topic.description || '将相关会议保存在一起。' : '让相关的讨论，汇成一份持续生长的记录。'}</p></div>
      {topic ? <div className="workspace-row"><button className="note-text-button" onClick={() => openEditor(topic)}><Pencil size={15} />编辑主题</button><button className="note-primary" onClick={() => onRecord(topic.id)}><Mic size={15} />在此主题录制</button></div> : <button className="note-primary" onClick={() => openEditor({ name: '', emoji: '📝', description: '' })}><Plus size={15} />新建主题</button>}
    </header>
    <label className="workspace-search"><Search size={16} /><input aria-label={topic ? '搜索主题内会议' : '搜索主题'} placeholder={topic ? '搜索这个主题中的会议与文字' : '搜索主题名称或说明'} value={topic ? meetingSearch : search} onChange={e => topic ? setMeetingSearch(e.target.value) : setSearch(e.target.value)} /></label>
    {topic ? <section className="workspace-section workspace-topic-detail" aria-label="主题会议">
      <div className="workspace-section-heading"><h2>会议记录</h2><span className="workspace-muted">{topicSessions.length} 场会议</span></div>
      {visibleSessions.map(session => <button className="workspace-meeting-row" key={session.id} onClick={() => onReview(session.id)}><span><small>{session.date} · {session.time}</small><strong>{session.title}</strong><p>{session.postProcess?.summary || session.transcript}</p></span><ArrowUpRight size={17} /></button>)}
      {!visibleSessions.length && <div className="workspace-empty"><FolderOpen size={28} /><h3>{meetingSearch ? '没有匹配的会议' : '这个主题还没有会议'}</h3><p>{meetingSearch ? '换一个关键词，或清除搜索。' : '从这里开始录制，保存后会归入当前主题。也可以在回顾的会议信息中调整归属。'}</p>{meetingSearch && <button className="note-text-button" onClick={() => setMeetingSearch('')}>清除会议搜索</button>}</div>}
      <footer className="workspace-row"><button className="note-text-button workspace-danger" onClick={() => setDeleting(topic)}><Trash2 size={14} />删除主题</button><small>仅移除归类，会议继续保留。</small></footer>
    </section> : <div className="workspace-topic-grid">
      {matches.map(item => {
        const records = sessions.filter(session => session.topicId === item.id)
        return <article className="workspace-topic-card" key={item.id}><button className="workspace-topic-open" onClick={() => { setSelected(item.id); setMeetingSearch('') }}><span className="workspace-topic-icon">{item.emoji}</span><h2>{item.name}</h2><p>{item.description || '为相关会议留一个位置。'}</p><span className="workspace-topic-meta">{records.length} 场会议 <ArrowUpRight size={15} /></span></button><div className="workspace-topic-actions"><button className="note-icon" aria-label={`编辑主题 ${item.name}`} onClick={() => openEditor(item)}><Pencil size={15} /></button><button className="note-icon" aria-label={`删除主题 ${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={15} /></button></div></article>
      })}
      {!matches.length && <div className="workspace-empty"><FolderOpen size={28} /><h2>{search ? '没有匹配的主题' : '从一个主题开始'}</h2><p>{search ? '试试更短的关键词。' : '按项目、课程或持续讨论的事情整理会议。'}</p>{search && <button className="note-text-button" onClick={() => setSearch('')}>清除主题搜索</button>}</div>}
    </div>}
    <PreviewDialog open={editing !== null} title={editing?.id ? '编辑主题' : '新建主题'} onClose={() => setEditing(null)}>
      <form className="workspace-flow" onSubmit={e => {
        e.preventDefault()
        if (!editing?.name?.trim()) { setNotice('请填写主题名称。'); return }
        if (saveFails) { setNotice('保存失败，输入已保留。关闭失败示例后可重试。'); return }
        const next: Topic = { id: editing.id ?? `preview-topic-${Date.now()}`, name: editing.name.trim(), emoji: editing.emoji || '📝', description: editing.description?.trim(), createdAt: editing.createdAt ?? Date.now(), updatedAt: Date.now() }
        useTopicStore.setState({ topics: editing.id ? topics.map(item => item.id === editing.id ? next : item) : [...topics, next] })
        setEditing(null); setNotice('')
      }}>
        <fieldset className="workspace-row"><legend>主题图标</legend>{['📝', '💼', '📖', '💡', '🎧', '🎨', '🌱', '🎯'].map(emoji => <button type="button" className="workspace-option" aria-label={`主题图标 ${emoji}`} aria-pressed={editing?.emoji === emoji} key={emoji} onClick={() => setEditing(value => ({ ...value, emoji }))}>{emoji}</button>)}</fieldset>
        <label className="workspace-field">主题名称<input className="workspace-input" maxLength={50} value={editing?.name ?? ''} onChange={e => setEditing(value => ({ ...value, name: e.target.value }))} /></label>
        <label className="workspace-field">主题说明<textarea className="workspace-input" rows={3} maxLength={200} value={editing?.description ?? ''} onChange={e => setEditing(value => ({ ...value, description: e.target.value }))} /></label>
        {notice && <p className="workspace-feedback" role="alert">{notice}</p>}
        <div className="workspace-row"><button type="submit" className="note-primary">保存主题</button><button type="button" className="note-text-button" onClick={() => setEditing(null)}>取消</button></div>
      </form>
    </PreviewDialog>
    <ActionDialog open={!!deleting} title="删除这个主题？" description={`「${deleting?.name ?? ''}」将被移除，其中的会议、文字与原音继续保留。`} onClose={() => setDeleting(null)} actions={[{ label: '取消', onClick: () => setDeleting(null) }, { label: '确认删除主题', variant: 'danger', onClick: () => {
      useTopicStore.setState({ topics: topics.filter(item => item.id !== deleting?.id), activeTopicId: useTopicStore.getState().activeTopicId === deleting?.id ? null : useTopicStore.getState().activeTopicId })
      useSessionStore.setState({ sessions: sessions.map(item => item.topicId === deleting?.id ? { ...item, topicId: undefined } : item) })
      setDeleting(null)
    } }]} />
  </div>
}
