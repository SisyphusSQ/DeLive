import { useState, useMemo, useEffect, useRef } from 'react'
import { History, Calendar, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Search, FileText } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTagStore } from '../stores/tagStore'
import { exportToTxt } from '../utils/storage'
import { ActionDialog } from './ActionDialog'
import { TagSelector, TagFilter } from './TagSelector'
import type { TranscriptSession } from '../types'

interface HistoryPanelProps {
  variant?: 'full' | 'rail'
  className?: string
  contentHeightClassName?: string
}

export function HistoryPanel({
  variant = 'full',
  className = '',
  contentHeightClassName,
}: HistoryPanelProps) {
  const { t, openReview, reviewSessionId } = useUIStore()
  const isRail = variant === 'rail'
  const { sessions, updateSessionTitle, deleteSession } = useSessionStore()
  const { tags, selectedTagIds, searchQuery, setSearchQuery } = useTagStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [dateOverrides, setDateOverrides] = useState<Record<string, boolean>>({})
  const [inputValue, setInputValue] = useState(searchQuery)
  const [pendingDeleteSession, setPendingDeleteSession] = useState<TranscriptSession | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input when searchQuery changes externally (e.g. from another panel)
  useEffect(() => {
    setInputValue(searchQuery)
  }, [searchQuery])

  // Debounce setSearchQuery by 200ms for instant search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchQuery(inputValue.trim())
      debounceRef.current = null
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue, setSearchQuery])

  const clearSearch = () => {
    setInputValue('')
    setSearchQuery('')
  }

  const getSessionPreviewText = (session: TranscriptSession) => {
    const summary = session.postProcess?.summary?.trim()
    if (summary) {
      return summary
    }

    return (session.versions?.find(version => version.id === session.selectedVersionId)?.text ?? session.transcript).trim()
  }

  // 按标签和搜索词筛选会话
  const filteredSessions = useMemo(() => {
    let result = sessions

    // 搜索时包含所有 session（含主题内的），否则隐藏有 topicId 的 session
    if (!searchQuery.trim()) {
      result = result.filter((session) => !session.topicId || (isRail && session.id === reviewSessionId))
    }
    
    // 标签筛选
    if (selectedTagIds.length > 0) {
      result = result.filter(session => 
        selectedTagIds.some(tagId => session.tagIds?.includes(tagId))
      )
    }
    
    // 搜索筛选
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(session => {
        const tagNames = (session.tagIds || [])
          .map((tagId) => tags.find((tag) => tag.id === tagId)?.name || '')
          .filter(Boolean)
        const postProcessSearch = [
          session.postProcess?.summary || '',
          ...(session.postProcess?.actionItems || []),
          ...(session.postProcess?.keywords || []),
          ...(session.postProcess?.tagSuggestions || []),
          ...(session.postProcess?.chapters || []).flatMap((chapter) => [
            chapter.title || '',
            chapter.summary || '',
          ]),
        ]
        const speakerSearch = [
          ...(session.speakers || []).flatMap((speaker) => [
            speaker.id,
            speaker.label,
            speaker.displayName || '',
          ]),
          ...(session.segments || []).map((segment) => segment.speakerId || ''),
        ]
        const searchableContent = [
          session.title,
          session.date,
          session.time,
          session.transcript,
          session.versions?.find(version => version.id === session.selectedVersionId)?.text || '',
          session.providerId || '',
          ...tagNames,
          ...postProcessSearch,
          ...speakerSearch,
        ]
          .join('\n')
          .toLowerCase()

        return searchableContent.includes(query)
      })
    }
    
    return result
  }, [sessions, selectedTagIds, searchQuery, tags, isRail, reviewSessionId])

  // 按日期分组
  const groupedSessions = useMemo(() => {
    const groups: Record<string, TranscriptSession[]> = {}
    
    for (const session of filteredSessions) {
      if (!groups[session.date]) {
        groups[session.date] = []
      }
      groups[session.date].push(session)
    }

    // 按日期降序排列
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredSessions])

  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  const defaultExpanded = (date: string) => date === today || date === yesterday ||
    (isRail && (groupedSessions[0]?.[0] === date || groupedSessions.some(
      ([groupDate, items]) => groupDate === date && items.some(item => item.id === reviewSessionId)
    )))

  const isExpanded = (date: string) => dateOverrides[date] ?? defaultExpanded(date)
  const toggleDate = (date: string) => setDateOverrides(previous => ({ ...previous, [date]: !isExpanded(date) }))

  const startEditing = (e: React.MouseEvent, session: TranscriptSession) => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditingTitle(session.title)
  }

  const saveTitle = () => {
    if (editingId && editingTitle.trim()) {
      updateSessionTitle(editingId, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const session = sessions.find((item) => item.id === id) || null
    setPendingDeleteSession(session)
  }

  const handleExport = (e: React.MouseEvent, session: TranscriptSession) => {
    e.stopPropagation()
    exportToTxt(session, tags)
  }

  const handlePreview = (session: TranscriptSession) => {
    if (editingId) return
    openReview(session.id)
  }

  const formatDateDisplay = (dateStr: string) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (dateStr === today.toISOString().split('T')[0]) {
      return t.common.today
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return t.common.yesterday
    }
    return dateStr
  }

  const resolvedContentHeightClassName = contentHeightClassName || (isRail ? 'min-h-0 flex-1' : 'max-h-[400px]')
  const railDescription = (t.history as Record<string, unknown>).railDescription as string | undefined
    || 'Search, reopen, and organize finished sessions.'

  return (
    <>
      <div className={`${isRail ? 'flex min-h-0 flex-1 flex-col' : 'workspace-panel overflow-hidden'} ${className}`}>
        {/* 头部 */}
        <div className={`shrink-0 border-b border-border/50 ${isRail ? 'review-history-toolbar space-y-2 px-3 py-2 sm:px-4' : 'space-y-3 bg-muted/20 px-6 py-4'}`}>
          <div className="review-history-heading flex items-center justify-between gap-2">
            <div className="space-y-1">
              <div className={isRail ? 'text-sm font-semibold text-foreground' : 'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary/80'}>
                {!isRail && <History className="h-3.5 w-3.5" />}
                {t.history.title}
              </div>
              {!isRail && <p className="text-xs text-muted-foreground">{railDescription}</p>}
            </div>
            <span className={isRail ? 'shrink-0 text-xs text-muted-foreground' : 'workspace-badge'}>
              {(selectedTagIds.length > 0 || searchQuery.trim())
                ? `${filteredSessions.length}/${sessions.length} ${t.common.items}`
                : `${sessions.length} ${t.common.items}`
              }
            </span>
          </div>
          
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isRail ? t.history.searchCompact : t.history.searchPlaceholder}
              aria-label={t.history.searchCompact}
              className="w-full h-9 pl-9 pr-8 text-sm rounded-md border border-input bg-background
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            />
            {(inputValue || searchQuery) && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 min-h-8 min-w-8 flex items-center justify-center text-muted-foreground hover:text-foreground rounded"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          {/* 标签筛选栏 */}
          <div className={isRail ? 'max-h-10 overflow-y-auto empty:hidden' : undefined}><TagFilter /></div>
        </div>

        {/* 内容 */}
        <div className={`${resolvedContentHeightClassName} overflow-y-auto ${isRail ? '' : 'bg-background/40'}`}>
          {groupedSessions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                {searchQuery.trim() ? (
                  <Search className="w-8 h-8 opacity-50" />
                ) : (
                  <History className="w-8 h-8 opacity-50" />
                )}
              </div>
              <p className="text-sm">
                {searchQuery.trim() 
                  ? t.history.noSearchResults(searchQuery)
                  : selectedTagIds.length > 0 
                    ? t.history.noMatchingRecords
                    : t.history.noRecords
                }
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupedSessions.map(([date, dateSessions]) => (
                <div key={date}>
                  {/* 日期头部 */}
                  <button
                    onClick={() => toggleDate(date)}
                    aria-expanded={isExpanded(date)}
                    className={`group flex w-full items-center gap-2 transition-colors hover:bg-muted/50 ${isRail ? 'review-history-date px-4 py-1.5' : 'px-6 py-3'}`}
                  >
                    {isExpanded(date) ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                    {!isRail && <Calendar className="w-4 h-4 text-primary/70" />}
                    <span className="text-sm font-medium text-foreground">
                      {formatDateDisplay(date)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({dateSessions.length})
                    </span>
                  </button>

                  {/* 会话列表 */}
                  {isExpanded(date) && (
                    <div className="px-2 pb-2 space-y-1">
                      {dateSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`group rounded-lg border ${reviewSessionId === session.id ? 'border-primary/25 bg-card' : 'border-transparent hover:bg-muted/65'}`}
                        >
                          {editingId === session.id ? (
                            <div className="flex items-center gap-1 p-1">
                              <input
                                type="text"
                                aria-label={t.history.editTitle}
                                value={editingTitle}
                                onChange={e => setEditingTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveTitle()
                                  if (e.key === 'Escape') {
                                    e.stopPropagation()
                                    cancelEditing()
                                  }
                                }}
                                className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm"
                                autoFocus
                              />
                              <button onClick={saveTitle} className="h-8 w-8 shrink-0 rounded text-success hover:bg-muted" aria-label={t.common.save}>
                                <Check className="mx-auto h-4 w-4" />
                              </button>
                              <button onClick={cancelEditing} className="h-8 w-8 shrink-0 rounded text-muted-foreground hover:bg-muted" aria-label={t.common.cancel}>
                                <X className="mx-auto h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                title={session.title}
                                onClick={() => handlePreview(session)}
                                aria-current={reviewSessionId === session.id ? 'true' : undefined}
                                className={`block w-full rounded-lg px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isRail ? 'review-history-row py-1.5' : 'py-3'}`}
                              >
                                <span className="flex min-w-0 items-baseline gap-2">
                                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{session.time}</span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{session.title}</span>
                                  {reviewSessionId === session.id && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                                </span>
                                <span className="review-history-preview mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
                                  {getSessionPreviewText(session).slice(0, 180)}
                                </span>
                              </button>
                              <div className="hidden flex-wrap items-center gap-1 px-2 pb-1 group-focus-within:flex group-hover:flex group-has-[[aria-expanded=true]]:flex">
                                <TagSelector sessionId={session.id} sessionTagIds={session.tagIds || []} compact />
                                <div className="ml-auto flex shrink-0 items-center gap-1">
                                  <button onClick={e => startEditing(e, session)} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" title={t.history.editTitle} aria-label={t.history.editTitle}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={e => handleExport(e, session)} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" title={t.history.exportTxt} aria-label={t.history.exportTxt}>
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={e => handleDelete(e, session.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title={t.common.delete} aria-label={t.common.delete}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ActionDialog
        open={pendingDeleteSession !== null}
        title={t.common.delete}
        description={t.history.deleteConfirm}
        onClose={() => setPendingDeleteSession(null)}
        actions={[
          {
            label: t.common.cancel,
            onClick: () => setPendingDeleteSession(null),
            variant: 'secondary',
          },
          {
            label: t.common.delete,
            onClick: () => {
              if (pendingDeleteSession) {
                void deleteSession(pendingDeleteSession.id).catch(error => window.alert(`会话删除或素材清理失败：${error.message}。未清理素材将在重启时重试。`))
              }
              setPendingDeleteSession(null)
            },
            variant: 'danger',
          },
        ]}
      />
    </>
  )
}
