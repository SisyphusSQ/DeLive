import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import type { Topic } from '../types'

const EMOJI_PRESETS = ['📖', '📚', '🎓', '💼', '🎧', '🎤', '🎵', '📝', '💡', '🔬', '🩺', '⚖️', '🏗️', '🎨', '🌍', '💻', '📊', '🗣️', '🏋️', '🎯', '🚀', '☕', '🎬', '📱']
interface TopicDialogProps {
  open: boolean
  topic?: Topic | null
  onClose: () => void
  onSave: (name: string, emoji: string, description?: string) => void
}

export function TopicDialog({ open, topic, onClose, onSave }: TopicDialogProps) {
  const { t } = useUIStore()
  const [name, setName] = useState(''), [emoji, setEmoji] = useState(EMOJI_PRESETS[0]), [description, setDescription] = useState(''), [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) { dialog.current?.close(); return }
    const previous = document.activeElement as HTMLElement | null
    setName(topic?.name ?? ''); setEmoji(topic?.emoji ?? EMOJI_PRESETS[0]); setDescription(topic?.description ?? ''); setError('')
    const element = dialog.current
    element?.showModal(); input.current?.focus()
    return () => { element?.close(); if (previous?.isConnected) previous.focus() }
  }, [open, topic])
  return <dialog ref={dialog} className="app-form-dialog" aria-labelledby="topic-dialog-title" onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <header><h2 id="topic-dialog-title">{topic ? t.topics.editTopic : t.topics.newTopic}</h2><button className="app-icon-button" aria-label={t.common.close} onClick={onClose}><X size={18} /></button></header>
    <form className="app-dialog-body" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; try { onSave(name.trim(), emoji, description.trim() || undefined); onClose() } catch (cause) { setError(String(cause)) } }}>
      <fieldset><legend>{t.topics.topicEmoji}</legend><div className="app-emoji-list">{EMOJI_PRESETS.map(value => <button type="button" key={value} aria-label={`${t.topics.topicEmoji} ${value}`} aria-pressed={emoji === value} onClick={() => setEmoji(value)}>{value}</button>)}</div></fieldset>
      <label>{t.topics.topicName}<input ref={input} value={name} onChange={e => setName(e.target.value)} maxLength={50} placeholder={t.topics.topicNamePlaceholder} required /></label>
      <label>{t.topics.topicDescription}<textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={200} placeholder={t.topics.topicDescriptionPlaceholder} /></label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="app-actions"><button className="app-primary" type="submit" disabled={!name.trim()}>{topic ? t.common.save : t.common.create}</button><button className="app-text-button" type="button" onClick={onClose}>{t.common.cancel}</button></div>
    </form>
  </dialog>
}
