import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { PreviewModal } from './PreviewModal'
import { HistoryPanel } from './HistoryPanel'
import { ActivityHeatmap } from './ActivityHeatmap'
import './review/review-workspace.css'
import './review/review-home.css'

const HEATMAP_COLLAPSED_KEY = 'heatmap-collapsed'
const ACTIVITY_ID = 'review-activity'

export function ReviewDeskView() {
  const { reviewSessionId, openReview, t } = useUIStore()
  const sessions = useSessionStore(state => state.sessions)
  const [date, setDate] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(HEATMAP_COLLAPSED_KEY) === 'true')
  const home = useRef<HTMLDivElement>(null)
  const previous = useRef<{ top: number; trigger: HTMLButtonElement }>()
  const session = sessions.find(item => item.id === reviewSessionId)

  const closeReview = useCallback(() => useUIStore.getState().setView('review'), [])
  const clearDate = () => setDate(null)
  const toggleActivity = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(HEATMAP_COLLAPSED_KEY, String(next))
  }

  useLayoutEffect(() => {
    if (session || !home.current || !previous.current) return
    home.current.scrollTop = previous.current.top
    const trigger = previous.current.trigger
    if (trigger.isConnected) trigger.focus({ preventScroll: true })
    else home.current.querySelector('input')?.focus({ preventScroll: true })
    previous.current = undefined
  }, [session])

  return <>
    <div className="review-home-page" ref={home} hidden={!!session}>
      <div className="review-home-content">
        <header className="review-home-heading">
          <h1>{t.nav.review}</h1>
          <button type="button" className="review-home-overview" aria-expanded={!collapsed} aria-controls={collapsed ? undefined : ACTIVITY_ID} onClick={toggleActivity}>
            <CalendarDays size={16} aria-hidden="true" />{t.heatmap.title}<ChevronDown size={14} aria-hidden="true" />
          </button>
        </header>
        <HistoryPanel date={date} onClearDate={clearDate}
          aboveList={!collapsed && <ActivityHeatmap id={ACTIVITY_ID} sessions={sessions} activeDate={date} onDateClick={value => setDate(old => old === value ? null : value)} />}
          onOpenSession={(id, trigger) => {
            previous.current = { trigger, top: home.current?.scrollTop ?? 0 }
            openReview(id)
          }} />
      </div>
    </div>
    {session && <div className="review-workspace h-full min-w-0">
      <div className="review-workspace-layout flex h-full min-h-0">
        <aside className="review-meeting-list flex min-h-0 shrink-0 flex-col border-r border-border/60 bg-muted/25" aria-label={t.history.meetingList}>
          <HistoryPanel variant="rail" date={date} onClearDate={clearDate} />
        </aside>
        <div className="min-h-0 min-w-0 flex-1">
          <PreviewModal key={session.id} session={session} onClose={closeReview} mode="view" preserveTab />
        </div>
      </div>
    </div>}
  </>
}
