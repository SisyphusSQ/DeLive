import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { Search, Mic, FileText, FolderOpen, Settings, Download, FileAudio } from 'lucide-react'
import { useUIStore, type WorkspaceView } from '../stores/uiStore'

interface Command {
  id: string
  label: string
  icon: typeof Search
  action: () => void
}

export function CommandPalette() {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { t, setView, commandPaletteOpen: open, setCommandPaletteOpen: setOpen } = useUIStore()

  const commands = useMemo<Command[]>(() => [
    { id: 'nav-live', label: t.nav?.live || 'Live', icon: Mic, action: () => setView('live' as WorkspaceView) },
    { id: 'nav-file', label: t.nav.file, icon: FileAudio, action: () => setView('file') },
    { id: 'nav-review', label: t.nav?.review || 'Review', icon: FileText, action: () => setView('review' as WorkspaceView) },
    { id: 'nav-topics', label: t.nav?.topics || 'Topics', icon: FolderOpen, action: () => setView('topics' as WorkspaceView) },
    { id: 'nav-settings', label: t.nav?.settings || 'Settings', icon: Settings, action: () => setView('settings' as WorkspaceView) },
    { id: 'export-data', label: t.command?.exportData || 'Export Data', icon: Download, action: () => {
      useUIStore.getState().openSettings('dataManagement')
    }},
  ], [t, setView])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(q) || cmd.id.includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const execute = useCallback((cmd: Command) => {
    cmd.action()
    setOpen(false)
    setQuery('')
  }, [setOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!useUIStore.getState().commandPaletteOpen)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, setOpen])

  useEffect(() => {
    if (open) {
      const previous = document.activeElement as HTMLElement | null
      const frame = requestAnimationFrame(() => inputRef.current?.focus())
      return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus() }
    }
  }, [open, setOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!filtered.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      execute(filtered[selectedIndex])
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5"
      onClick={() => { setOpen(false); setQuery('') }}
    >
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.workspace.commands}
        onKeyDown={e => {
          if (e.key !== 'Tab') return
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('input, button')]
          const first = items[0], last = items[items.length - 1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
        }}
        className="relative w-full max-w-[640px] max-h-[calc(100dvh-40px)] rounded-xl border border-border bg-popover shadow-2xl overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={t.workspace.commands}
            placeholder={t.command?.searchPlaceholder || 'Type a command...'}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[300px] overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t.workspace.noCommands}
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon
              const isSelected = idx === selectedIndex
              return (
                <button
                  key={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => execute(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-left">{cmd.label}</span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
