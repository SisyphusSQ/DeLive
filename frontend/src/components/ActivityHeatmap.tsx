import { addDays, format, startOfDay } from 'date-fns'
import { useId, useMemo } from 'react'
import type { TranscriptSession } from '../types'
import { useUIStore } from '../stores/uiStore'

const WEEKS = 53
const DAYS_IN_WEEK = 7
const LEVELS = [0, 1, 2, 3, 4]

function intensity(count: number) {
  return count < 3 ? count : count < 5 ? 3 : 4
}

export function ActivityHeatmap({ sessions, onDateClick, activeDate, id }: {
  sessions: TranscriptSession[]
  onDateClick: (date: string) => void
  activeDate: string | null
  id: string
}) {
  const { language, t } = useUIStore()
  const labelId = useId()
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const monthLabel = useMemo(() => new Intl.DateTimeFormat(language, { month: 'short' }), [language])
  const dayLabel = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: 'long' }), [language])
  const hourFormat = useMemo(() => new Intl.NumberFormat(language, { style: 'unit', unit: 'hour' }), [language])
  const minuteFormat = useMemo(() => new Intl.NumberFormat(language, { style: 'unit', unit: 'minute' }), [language])
  const durationLabel = (duration: number) => {
    const minutes = Math.round(duration / 60_000)
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    return [hours > 0 ? hourFormat.format(hours) : '', !hours || remainder ? minuteFormat.format(remainder) : ''].filter(Boolean).join(' ')
  }

  const { days, months, stats, counts } = useMemo(() => {
    const today = startOfDay(new Date(todayKey + 'T00:00:00'))
    const monthKey = todayKey.slice(0, 7)
    const counts = new Map<string, { count: number; duration: number }>()
    let monthCount = 0
    let duration = 0
    for (const item of sessions) {
      const totals = counts.get(item.date) ?? { count: 0, duration: 0 }
      totals.count++
      totals.duration += item.duration ?? 0
      counts.set(item.date, totals)
      if (item.date.startsWith(monthKey)) monthCount++
      duration += item.duration ?? 0
    }
    let streak = 0
    while (counts.has(format(addDays(today, -streak), 'yyyy-MM-dd'))) streak++
    const end = addDays(today, DAYS_IN_WEEK - 1 - today.getDay())
    const length = WEEKS * DAYS_IN_WEEK
    const days = Array.from({ length }, (_, index) => addDays(end, index - length + 1))
    const months = days.flatMap((date, index) => {
      if (date > today || (date.getDate() !== 1 && index !== 0)) return []
      return [{ date, column: Math.min(WEEKS - 1, Math.floor(index / DAYS_IN_WEEK) + 2) }]
    }).filter((item, index, all) => !all[index + 1] || all[index + 1].column - item.column >= 3)
    return { days, months, stats: { monthCount, duration, streak }, counts }
  }, [sessions, todayKey])

  const weekdays = [[1, t.heatmap.dayMon], [3, t.heatmap.dayWed], [5, t.heatmap.dayFri]] as const
  return <section id={id} className="review-home-activity" aria-labelledby={labelId} data-heatmap>
    <h2 id={labelId} className="sr-only">{t.heatmap.title}</h2>
    <div className="review-home-stats">
      <span>{t.heatmap.total} <strong>{sessions.length}</strong></span>
      <span>{t.heatmap.thisMonth} <strong>{stats.monthCount}</strong></span>
      <span>{t.heatmap.totalDuration} <strong>{durationLabel(stats.duration)}</strong></span>
      {stats.streak > 0 && <span>{t.heatmap.streak} <strong>{stats.streak} {t.heatmap.days}</strong></span>}
    </div>
    <div className="review-home-calendar-scroll">
      <div className="review-home-calendar" style={{ gridTemplateColumns: `minmax(14px, max-content) repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {months.map(({ date, column }) => <span className="review-home-week-label" key={date.getTime()} style={{ gridColumn: `${column} / span 3`, gridRow: 1 }}>{monthLabel.format(date)}</span>)}
        {weekdays.map(([day, label]) => <span className="review-home-week-label review-home-weekday" aria-hidden="true" key={day} style={{ gridColumn: 1, gridRow: day + 2 }}>{label}</span>)}
        {days.map((date, index) => {
          const key = format(date, 'yyyy-MM-dd')
          if (key > todayKey) return null
          const entry = counts.get(key)
          const style = { gridColumn: Math.floor(index / DAYS_IN_WEEK) + 2, gridRow: index % DAYS_IN_WEEK + 2 }
          if (!entry) return <span className="review-home-day" aria-hidden="true" key={key} style={style} />
          const label = dayLabel.format(date) + ' · ' + entry.count + ' ' + t.heatmap.recording +
            (entry.duration > 0 ? ' · ' + durationLabel(entry.duration) : '')
          return <button type="button" key={key} className="review-home-day" style={style} data-level={intensity(entry.count)} data-date={key}
            aria-label={label} title={label} aria-pressed={key === activeDate} onClick={() => onDateClick(key)} />
        })}
      </div>
    </div>
    <div className="review-home-legend" aria-hidden="true">
      {t.heatmap.less}{LEVELS.map(level => <span key={level} className="review-home-day" data-level={level} />)}{t.heatmap.more}
    </div>
  </section>
}
