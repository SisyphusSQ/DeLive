import { MarkdownRenderer } from './MarkdownRenderer'
import { resolveInputText } from '../../services/aiSessionContext'
import { sessionRepository } from '../../utils/sessionRepository'
import { useConfirmation } from '../../hooks/useConfirmation'
import { AiStaleNotice } from './AiStaleNotice'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Copy,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Save,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'
import { isAiPostProcessConfigured } from '../../services/aiPostProcess'
import { TextSourceBanner } from './TextSourceBanner'
import {
  buildMindMapExportBaseName,
  exportMindMapPng,
  exportMindMapSvg,
} from '../../utils/mindMapExport'

interface MindMapTabProps {
  session: TranscriptSession
}

interface MarkmapTransformerLike {
  transform: (content: string) => { root: unknown }
}

interface MarkmapInstanceLike {
  setData: (data: unknown) => Promise<void>
  fit: () => Promise<void>
  destroy: () => void
}

function useMapSize(
  svgRef: { current: SVGSVGElement | null },
  instanceRef: { current: MarkmapInstanceLike | null },
  visible: boolean,
) {
  useEffect(() => {
    const svg = svgRef.current
    if (!visible || !svg) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      if (!width || !height) return
      svg.setAttribute('width', String(width))
      svg.setAttribute('height', String(height))
      void instanceRef.current?.fit()
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [svgRef, instanceRef, visible])
}

export function MindMapTab({ session }: MindMapTabProps) {
  const { t } = useUIStore()
  const settings = useSettingsStore((state) => state.settings)
  const generateSessionMindMap = useSessionStore((state) => state.generateSessionMindMap)
  const draft = useUIStore(state => state.mindMapDrafts[session.id])
  const draftMarkdown = draft ?? session.mindMap?.markdown ?? ''
  const { confirm, dialog } = useConfirmation()
  const setDraftMarkdown = (value?: string) => useUIStore.setState(state => {
    const mindMapDrafts = { ...state.mindMapDrafts }
    if (value === undefined) delete mindMapDrafts[session.id]
    else mindMapDrafts[session.id] = value
    return { mindMapDrafts }
  })
  const [saving, setSaving] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const fullscreenTrigger = useRef<HTMLButtonElement>(null)
  const fullscreenClose = useRef<HTMLButtonElement>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const fullscreenSvgRef = useRef<SVGSVGElement | null>(null)
  const fullscreenTransformerRef = useRef<MarkmapTransformerLike | null>(null)
  const fullscreenMarkmapRef = useRef<MarkmapInstanceLike | null>(null)
  const transformerRef = useRef<MarkmapTransformerLike | null>(null)
  const markmapRef = useRef<MarkmapInstanceLike | null>(null)
  useMapSize(svgRef, markmapRef, Boolean(draftMarkdown.trim()))
  useMapSize(fullscreenSvgRef, fullscreenMarkmapRef, isFullscreen && Boolean(draftMarkdown.trim()))

  useEffect(() => {
    setActionError(null)
  }, [session.id])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      markmapRef.current?.destroy()
      markmapRef.current = null
      return
    }

    if (!draftMarkdown.trim()) {
      markmapRef.current?.destroy()
      markmapRef.current = null
      svg.innerHTML = ''
      setRenderError(null)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        if (!transformerRef.current || !markmapRef.current) {
          const [{ Transformer }, { Markmap }] = await Promise.all([
            import('markmap-lib'),
            import('markmap-view'),
          ])

          if (cancelled || !svgRef.current) return

          const { width, height } = svg.getBoundingClientRect()
          svg.setAttribute('width', String(Math.max(1, Math.round(width))))
          svg.setAttribute('height', String(Math.max(1, Math.round(height))))
          transformerRef.current = new Transformer()
          markmapRef.current = Markmap.create(svg, {
            autoFit: true,
            fitRatio: 0.92,
            maxWidth: 240,
            initialExpandLevel: 3,
            paddingX: 12,
            spacingVertical: 6,
            embedGlobalCSS: true,
          }) as MarkmapInstanceLike
        }

        const { root } = transformerRef.current.transform(draftMarkdown)
        await markmapRef.current.setData(root)
        await markmapRef.current.fit()
        if (!cancelled) setRenderError(null)
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : 'Failed to render mind map')
        }
      }
    })()

    return () => { cancelled = true }
  }, [draftMarkdown])

  useEffect(() => () => {
    markmapRef.current?.destroy()
    markmapRef.current = null
  }, [])

  // Render mind map in fullscreen SVG
  useEffect(() => {
    if (!isFullscreen) {
      fullscreenMarkmapRef.current?.destroy()
      fullscreenMarkmapRef.current = null
      fullscreenTransformerRef.current = null
      return
    }

    const svg = fullscreenSvgRef.current
    if (!svg || !draftMarkdown.trim()) return

    let cancelled = false

    void (async () => {
      try {
        if (!fullscreenTransformerRef.current || !fullscreenMarkmapRef.current) {
          const [{ Transformer }, { Markmap }] = await Promise.all([
            import('markmap-lib'),
            import('markmap-view'),
          ])
          if (cancelled || !fullscreenSvgRef.current) return

          const { width, height } = svg.getBoundingClientRect()
          svg.setAttribute('width', String(Math.max(1, Math.round(width))))
          svg.setAttribute('height', String(Math.max(1, Math.round(height))))
          fullscreenTransformerRef.current = new Transformer()
          fullscreenMarkmapRef.current = Markmap.create(svg, {
            autoFit: true,
            fitRatio: 0.95,
            maxWidth: 300,
            initialExpandLevel: 4,
            paddingX: 16,
            spacingVertical: 8,
            embedGlobalCSS: true,
          }) as MarkmapInstanceLike
        }

        const { root } = fullscreenTransformerRef.current.transform(draftMarkdown)
        await fullscreenMarkmapRef.current.setData(root)
        await fullscreenMarkmapRef.current.fit()
      } catch {
        // Fullscreen render errors are non-critical
      }
    })()

    return () => {
      cancelled = true
      fullscreenMarkmapRef.current?.destroy()
      fullscreenMarkmapRef.current = null
      fullscreenTransformerRef.current = null
    }
  }, [isFullscreen, draftMarkdown])

  // Escape to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const trigger = fullscreenTrigger.current
    fullscreenClose.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setIsFullscreen(false) }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); trigger?.focus() }
  }, [isFullscreen])

  const aiConfigured = isAiPostProcessConfigured(settings, 'mindmap')
  const generating = session.mindMap?.status === 'pending'
  const hasTranscript = Boolean((resolveInputText(session, 'auto') || session.images?.length))
  const hasMindMap = Boolean(draftMarkdown.trim())
  const isDirty = draftMarkdown.trim() !== (session.mindMap?.markdown || '').trim()
  const exportBaseName = useMemo(
    () => buildMindMapExportBaseName(session.mindMap?.title || session.title),
    [session.mindMap?.title, session.title],
  )

  const handleGenerate = async () => {
    try {
      setActionError(null)
      await generateSessionMindMap(session.id)
    } catch (error) {
      console.error('[MindMapTab] mind map generation failed:', error)
      setActionError(error instanceof Error ? error.message : 'Mind map generation failed')
    }
  }

  const handleSave = async () => {
    if (saving || !isDirty) return
    setActionError(null)
    setSaving(true)
    try {
      const sessions = await sessionRepository.mutateDurable(session.id, current => ({
        mindMap: {
          ...current.mindMap,
          markdown: draftMarkdown,
          title: current.mindMap?.title || current.title,
          status: 'success',
          error: undefined,
          updatedAt: Date.now(),
        },
      }))
      useSessionStore.setState({ sessions })
      if (useUIStore.getState().mindMapDrafts[session.id] === draftMarkdown) setDraftMarkdown()
    } catch (error) {
      setActionError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    try {
      setActionError(null)
      await navigator.clipboard.writeText(draftMarkdown)
    } catch (error) {
      console.error('[MindMapTab] copy markdown failed:', error)
      setActionError(error instanceof Error ? error.message : 'Copy markdown failed')
    }
  }

  const handleExportSvg = () => {
    if (!svgRef.current) return
    setActionError(null)
    exportMindMapSvg(svgRef.current, exportBaseName)
    setShowExportMenu(false)
  }

  const handleExportPng = async () => {
    if (!svgRef.current) return
    try {
      setActionError(null)
      await exportMindMapPng(svgRef.current, exportBaseName)
      setShowExportMenu(false)
    } catch (error) {
      console.error('[MindMapTab] export PNG failed:', error)
      setActionError(error instanceof Error ? error.message : 'Export PNG failed')
    }
  }

  return (
    <div className="review-map flex h-full min-h-0 flex-col overflow-y-auto">
      {dialog}
      {/* Toolbar */}
      <div className="review-map-toolbar flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2 sm:px-5">
        <details className="basis-full text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">导图来源与状态</summary>
          <TextSourceBanner session={session} /><AiStaleNotice session={session} result={session.mindMap} />
        </details>
        <button
          onClick={() => void handleGenerate()}
          disabled={!aiConfigured || !hasTranscript || generating || saving || isDirty}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            !aiConfigured || !hasTranscript
              ? 'cursor-not-allowed border border-border bg-muted text-muted-foreground'
              : generating
                ? 'border border-primary/30 bg-primary/10 text-primary'
                : 'border border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.preview.mindMapGenerating}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              {hasMindMap ? t.preview.mindMapRegenerate : t.preview.mindMapGenerate}
            </>
          )}
        </button>

        <div className="h-5 w-px bg-border" />

        <button
          onClick={() => setShowEditor(!showEditor)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {showEditor ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          {t.preview.mindMapMarkdown}
        </button>

        {hasMindMap && <button type="button" className="rounded border border-border px-2 py-1.5 text-sm" aria-pressed={showOutline} onClick={() => {
          setShowOutline(value => !value)
          if (showOutline) requestAnimationFrame(() => void markmapRef.current?.fit())
        }}>{showOutline ? '查看导图' : '查看大纲'}</button>}
        {isDirty && <button type="button" disabled={saving} className="rounded px-2 py-1.5 text-sm text-muted-foreground" onClick={() => void confirm('放弃尚未保存的导图修改？').then(confirmed => { if (confirmed) setDraftMarkdown() })}>放弃修改</button>}
        {hasMindMap && isDirty && (
          <button
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <Save className="w-4 h-4" />
            {t.preview.mindMapSave}
          </button>
        )}

        {hasMindMap && (
          <>
            <button
              onClick={() => void handleCopy()}
              aria-label={t.preview.mindMapCopyMarkdown}
              title={t.preview.mindMapCopyMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Copy className="w-4 h-4" />
              <span className="review-map-optional-label">{t.preview.mindMapCopyMarkdown}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                aria-label={t.common.export}
                title={t.common.export}
                aria-expanded={showExportMenu}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Download className="w-4 h-4" />
                <span className="review-map-optional-label">{t.common.export}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1 w-32 rounded-lg border border-border bg-card p-1 shadow-lg">
                    <button
                      onClick={handleExportSvg}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                    >
                      SVG
                    </button>
                    <button
                      onClick={() => void handleExportPng()}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                    >
                      PNG
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {hasMindMap && (
          <>
            <div className="h-5 w-px bg-border" />
            <button
              ref={fullscreenTrigger}
              aria-label="全屏查看导图"
              onClick={() => setIsFullscreen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </>
        )}

        {!aiConfigured && (
          <p className="ml-2 text-xs text-muted-foreground">{t.preview.aiNotConfigured}{' '}
              <button data-settings-entry="review-ai" type="button" className="text-primary underline" onClick={() => useUIStore.getState().openSettings('aiPostProcess')}>{t.common.settings}</button></p>
        )}
        {!hasTranscript && (
          <p className="ml-2 text-xs text-muted-foreground">{t.preview.mindMapNoTranscript}</p>
        )}
        {session.mindMap?.status === 'error' && session.mindMap.error && (
          <p className="ml-2 text-xs text-destructive">{session.mindMap.error}</p>
        )}
      </div>

      {actionError && (
        <div className="mx-5 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError}
        </div>
      )}

      {/* Content area */}
      <div className="review-map-layout flex min-h-40 flex-1 overflow-hidden">
        {/* Editor panel (collapsible) */}
        {showEditor && (
          <div className="review-map-editor flex w-72 shrink-0 flex-col overflow-hidden border-r border-border p-3">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              {t.preview.mindMapMarkdown}
            </div>
            <textarea
              aria-label={t.preview.mindMapMarkdown}
              value={draftMarkdown}
              onChange={(event) => setDraftMarkdown(event.target.value)}
              placeholder={t.preview.mindMapMarkdownPlaceholder}
              className="flex-1 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        )}

        {/* Mind map preview (takes remaining space) */}
        <div className="relative min-h-24 min-w-0 flex-1 overflow-hidden bg-background/40 dark:bg-muted/20 markmap-container">
          {hasMindMap ? (
            <>
              <svg ref={svgRef} aria-hidden={showOutline} className={'h-full w-full ' + (showOutline ? 'invisible' : '')} />
              {showOutline && <div className="absolute inset-0 overflow-auto p-5"><MarkdownRenderer content={draftMarkdown} /></div>}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <Network className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t.preview.mindMapEmpty}</p>
                <p className="text-xs text-muted-foreground">{t.preview.mindMapEmptyHint}</p>
              </div>
            </div>
          )}

          {renderError && (
            <div className="absolute inset-x-3 bottom-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {renderError}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && createPortal(
        <div role="dialog" aria-modal="true" aria-label={t.preview.mindMapTitle} className="fixed inset-0 z-[100] flex flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Network className="w-4 h-4 text-primary" />
              {t.preview.mindMapTitle}
            </div>
            <button
              ref={fullscreenClose}
              aria-label="退出全屏"
              onClick={() => setIsFullscreen(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Minimize2 className="w-4 h-4" />
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 relative overflow-hidden bg-background/40 dark:bg-muted/20 markmap-container">
            <svg ref={fullscreenSvgRef} className="h-full w-full" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
