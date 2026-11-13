import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useTopicStore } from '../stores/topicStore'
import { TopicDialog } from './TopicDialog'
import { Select } from './ui/Select'

export function TopicPicker() {
  const { t } = useUIStore()
  const { topics, activeTopicId, setActiveTopic, addTopic } = useTopicStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  return <div className="flex flex-wrap items-center justify-center gap-2">
    <Select aria-label={t.topics.selectTopic} value={activeTopicId ?? ''} onChange={e => setActiveTopic(e.target.value || null)} className="max-w-[280px] rounded-md border border-border bg-background px-3 py-2 text-sm">
      <option value="">{t.topics.selectTopic}</option>
      {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.emoji} {topic.name}</option>)}
    </Select>
    <button className="app-text-button" onClick={() => setDialogOpen(true)}><Plus size={14} />{t.topics.newTopic}</button>
    <TopicDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={(name, emoji, description) => { const topic = addTopic(name, emoji, description); setActiveTopic(topic.id) }} />
  </div>
}
