import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Sparkles,
  MessageSquareQuote,
  Network,
  FileText,
  LayoutList,
} from 'lucide-react'
import { useUIStore, type ReviewTab } from '../../stores/uiStore'
export type { ReviewTab } from '../../stores/uiStore'


interface SessionTabBarProps {
  activeTab: ReviewTab
  onTabChange: (tab: ReviewTab) => void
}

const TAB_CONFIG: { id: ReviewTab; icon: typeof Sparkles; labelKey: string }[] = [
  { id: 'transcript', icon: FileText, labelKey: 'tabTranscript' },
  { id: 'summary', icon: LayoutList, labelKey: 'tabSummary' },
  { id: 'chat', icon: MessageSquareQuote, labelKey: 'tabChat' },
  { id: 'mindmap', icon: Network, labelKey: 'tabMindMap' },
]

export function SessionTabBar({ activeTab, onTabChange }: SessionTabBarProps) {
  const { t } = useUIStore()
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  const updateIndicator = useCallback(() => {
    const el = tabRefs.current.get(activeTab)
    if (el) {
      const parent = el.parentElement
      if (parent) {
        setIndicator({
          left: el.offsetLeft,
          width: el.offsetWidth,
        })
      }
    }
  }, [activeTab])

  useEffect(() => {
    updateIndicator()
  }, [updateIndicator])

  useEffect(() => {
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [updateIndicator])

  return (
    <div
      className="relative mx-3 flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/60 sm:mx-6"
      role="tablist"
      aria-label="Review tabs"
    >
      {TAB_CONFIG.map(({ id, icon: Icon, labelKey }, index) => {
        const isActive = activeTab === id
        const label = (t.preview as Record<string, unknown>)[labelKey] as string | undefined

        return (
          <button
            key={id}
            ref={(el) => {
              if (el) tabRefs.current.set(id, el)
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(id)}
            onKeyDown={(e) => {
              let nextIndex = index
              if (e.key === 'ArrowRight') nextIndex = (index + 1) % TAB_CONFIG.length
              else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TAB_CONFIG.length) % TAB_CONFIG.length
              else return
              e.preventDefault()
              const next = TAB_CONFIG[nextIndex]
              onTabChange(next.id)
              tabRefs.current.get(next.id)?.focus()
            }}
            className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-xs transition-colors sm:text-[13px] ${
              isActive
                ? 'text-foreground font-medium'
                : 'text-muted-foreground font-normal hover:text-foreground'
            }`}
          >
            <Icon className="hidden h-3.5 w-3.5 sm:block" />
            <span>{label || id}</span>
          </button>
        )
      })}

      {/* Animated active indicator */}
      <span
        className="absolute bottom-0 h-0.5 rounded-t-full bg-primary transition-all duration-250 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  )
}
