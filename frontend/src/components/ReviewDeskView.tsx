import { useMemo, useCallback } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTagStore } from '../stores/tagStore'
import { PreviewModal } from './PreviewModal'
import { HistoryPanel } from './HistoryPanel'
import { ActivityHeatmap } from './ActivityHeatmap'
import './review/review-workspace.css'

export function ReviewDeskView() {
  const { reviewSessionId, t } = useUIStore()
  const sessions = useSessionStore((s) => s.sessions)
  const { searchQuery, setSearchQuery } = useTagStore()

  const session = useMemo(
    () => sessions.find((s) => s.id === reviewSessionId) ?? null,
    [sessions, reviewSessionId],
  )

  const handleDateClick = useCallback((date: string) => {
    setSearchQuery(searchQuery === date ? '' : date)
  }, [searchQuery, setSearchQuery])

  const closeReview = useCallback(() => useUIStore.getState().setView('review'), [])
  const activeDate = /^\d{4}-\d{2}-\d{2}$/.test(searchQuery) ? searchQuery : null

  if (!session) {
    return (
      <div className="h-full flex flex-col animate-view-enter overflow-y-auto">
        <div className="app-page-content w-full">
          <header className="app-page-heading"><h1>{t.nav.review}</h1></header>
          <ActivityHeatmap
            sessions={sessions}
            onDateClick={handleDateClick}
            activeDate={activeDate}
          />
          <HistoryPanel variant="full" contentHeightClassName="h-[min(60vh,48rem)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="review-workspace h-full min-w-0">
      <div className="review-workspace-layout flex h-full min-h-0">
        <aside className="review-meeting-list flex min-h-0 shrink-0 flex-col border-r border-border/60 bg-muted/25" aria-label="会议列表">
          <HistoryPanel variant="rail" />
        </aside>
        <div className="min-h-0 min-w-0 flex-1">
          <PreviewModal
            key={session.id}
            session={session}
            onClose={closeReview}
            mode="view"
            preserveTab
          />
        </div>
      </div>
    </div>
  )
}
