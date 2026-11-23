import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTagStore } from '../stores/tagStore'
import { useTopicStore } from '../stores/topicStore'
import { ActionDialog } from './ActionDialog'
import { HistoryRail } from './review/HistoryRail'
import type { TranscriptSession } from '../types'

interface HistoryPanelProps {
  variant?: 'full' | 'rail'
  date?: string | null
  onClearDate?: () => void
  aboveList?: ReactNode
  onOpenSession?: (id: string, trigger: HTMLButtonElement) => void
}

export function HistoryPanel({ variant = 'full', date, onClearDate, aboveList, onOpenSession }: HistoryPanelProps) {
  const t = useUIStore(state => state.t)
  const { sessions, deleteSession } = useSessionStore()
  const topics = useTopicStore(state => state.topics)
  const { tags, selectedTagIds, searchQuery, setSearchQuery } = useTagStore()
  const [pendingDelete, setPendingDelete] = useState<TranscriptSession | null>(null)
  const query = useDeferredValue(searchQuery.trim().toLocaleLowerCase())

  const filteredSessions = useMemo(() => sessions.filter(session => {
    if (date && session.date !== date) return false
    if (selectedTagIds.length && !selectedTagIds.some(id => session.tagIds?.includes(id))) return false
    if (!query) return true
    const postProcess = session.postProcess
    const searchable = [
      session.title,
      session.date,
      session.time,
      session.transcript,
      session.versions?.find(version => version.id === session.selectedVersionId)?.text,
      topics.find(topic => topic.id === session.topicId)?.name,
      session.providerId,
      ...tags.filter(tag => session.tagIds?.includes(tag.id)).map(tag => tag.name),
      postProcess?.summary,
      ...(postProcess?.actionItems ?? []),
      ...(postProcess?.keywords ?? []),
      ...(postProcess?.tagSuggestions ?? []),
      ...(postProcess?.chapters ?? []).flatMap(chapter => [chapter.title, chapter.summary]),
      ...(session.speakers ?? []).flatMap(speaker => [speaker.id, speaker.label, speaker.displayName]),
      ...(session.segments ?? []).map(segment => segment.speakerId),
    ]
    return searchable.some(value => value?.toLocaleLowerCase().includes(query))
  }), [sessions, date, selectedTagIds, query, tags, topics])

  return <>
    <HistoryRail variant={variant} sessions={filteredSessions} total={sessions.length} search={searchQuery} query={query}
      onSearch={setSearchQuery} onDelete={setPendingDelete} date={date} onClearDate={onClearDate}
      aboveList={aboveList} onOpenSession={onOpenSession} />
    <ActionDialog
      open={pendingDelete !== null}
      title={t.common.delete}
      description={pendingDelete ? `${t.history.deleteConfirm} ${pendingDelete.title}` : t.history.deleteConfirm}
      onClose={() => setPendingDelete(null)}
      actions={[
        { label: t.common.cancel, onClick: () => setPendingDelete(null) },
        {
          label: t.common.delete,
          variant: 'danger',
          onClick: () => {
            if (pendingDelete) {
              void deleteSession(pendingDelete.id).catch(error => window.alert(t.history.deleteFailed(error.message)))
            }
            setPendingDelete(null)
          },
        },
      ]}
    />
  </>
}
