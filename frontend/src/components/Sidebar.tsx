import { Mic, FileText, FolderOpen, FileAudio, Settings, PanelLeftClose, PanelLeft } from 'lucide-react'
import { AnimatedThemeToggler } from './AnimatedThemeToggler'
import { useUIStore, type WorkspaceView } from '../stores/uiStore'
import type { RecordingState } from '../types'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  currentView: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  recordingState: RecordingState
}

interface NavItem {
  id: WorkspaceView
  icon: typeof Mic
}

const NAV_MAIN: NavItem[] = [
  { id: 'live', icon: Mic },
  { id: 'file', icon: FileAudio },
  { id: 'review', icon: FileText },
  { id: 'topics', icon: FolderOpen },
]

const NAV_AUX: NavItem[] = [
  { id: 'settings', icon: Settings },
]

export function Sidebar({
  collapsed,
  onToggle,
  currentView,
  onNavigate,
  recordingState,
}: SidebarProps) {
  const { t } = useUIStore()
  const isElectron = !!window.electronAPI?.isElectron
  const platform = window.electronAPI?.platform

  const navT = t.nav
  const getLabel = (id: string): string => {
    return (navT as Record<string, string>)?.[id] ?? id
  }

  const renderNavItem = (item: NavItem) => {
    const active = currentView === item.id
    const Icon = item.icon
    const label = getLabel(item.id)
    const showRecDot = item.id === 'live' && recordingState === 'recording'

    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className={`
          group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
          transition-all duration-150 w-full
          ${active
            ? 'bg-accent/60 text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
          }
          ${collapsed ? 'justify-center px-0' : ''}
        `}
        title={collapsed ? label : undefined}
        aria-current={active ? 'page' : undefined}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-foreground/70 rounded-r" />
        )}
        <span className="relative flex-shrink-0">
          <Icon className="h-[18px] w-[18px]" />
          {showRecDot && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
          )}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    )
  }

  return (
    <aside
      className={`
        fixed left-0 top-0 z-40 flex h-full flex-col
        border-r border-border/40 bg-background/95 backdrop-blur
        transition-all duration-200
        ${collapsed ? 'w-14' : 'w-56'}
      `}
      style={isElectron && platform === 'darwin' ? { paddingTop: 32 } : undefined}
    >
      {/* macOS traffic light spacer (non-macOS gets TitleBar height via marginTop in parent) */}
      {isElectron && platform !== 'darwin' && <div className="h-8 shrink-0" />}

      {/* Logo area + collapse toggle */}
      <div className={`flex items-center h-12 shrink-0 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight select-none">DeLive</span>
        )}
        <button
          onClick={onToggle}
          className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={collapsed ? getLabel('expand') : getLabel('collapse')}
          aria-label={collapsed ? getLabel('expand') : getLabel('collapse')}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Main navigation */}
      <nav className={`flex flex-col gap-1 ${collapsed ? 'px-2' : 'px-3'}`} role="navigation" aria-label="Main navigation">
        {NAV_MAIN.map(renderNavItem)}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Auxiliary navigation */}
      <nav className={`flex flex-col gap-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        {NAV_AUX.map(renderNavItem)}
      </nav>

      {/* Bottom: theme toggle — ml matches nav icon center alignment */}
      <div className={`border-t border-border/40 py-2 shrink-0 ${collapsed ? 'flex justify-center px-2' : 'pl-[17px]'}`}>
        <AnimatedThemeToggler className="h-8 w-8" />
      </div>
    </aside>
  )
}
