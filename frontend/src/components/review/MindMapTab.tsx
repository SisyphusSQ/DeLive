import { MeetingMapTree, type MapTopic } from './MeetingMapTree'
import type { IPureNode } from 'markmap-common'
import { selectedReviewVersion } from '../../utils/reviewVersions'
import type { ReviewCitation } from '../../utils/reviewPassage'
import { resolveInputText } from '../../services/aiSessionContext'
import { sessionRepository } from '../../utils/sessionRepository'
import { useConfirmation } from '../../hooks/useConfirmation'
import { AiStaleNotice } from './AiStaleNotice'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Copy,
  Download,
  List,
  Pencil,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Save,
  ChevronDown,
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
  onCitation: (source: ReviewCitation) => void
}

function mapTopic(node: IPureNode): MapTopic {
  const template = document.createElement('template')
  template.innerHTML = node.content
  return { label: (template.content.textContent ?? '').trim(), children: node.children.map(mapTopic) }
}

interface MarkmapTransformerLike {
  transform: (content: string) => { root: IPureNode }
}

interface MarkmapInstanceLike {
  svg: { interrupt: () => unknown }
  state: { rect: { x1: number; x2: number; y1: number; y2: number } }
  setData: (data: unknown) => Promise<void>
  fit: () => Promise<void>
  destroy: () => void
}

function fitMap(svg: SVGSVGElement, map: MarkmapInstanceLike | null) {
  const bounds = map?.state.rect
  if (map && bounds && bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1 && svg.isConnected && svg.clientWidth && svg.clientHeight) {
    void map.fit()
  }
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
      fitMap(svg, instanceRef.current)
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [svgRef, instanceRef, visible])
}

export function MindMapTab({ session, onCitation }: MindMapTabProps) {
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
  const [more, setMore] = useState(false)
  const [pan, setPan] = useState(false)
  const [root, setRoot] = useState<MapTopic>()
  const version = useMemo(() => selectedReviewVersion(session), [session])
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
      markmapRef.current?.svg.interrupt()
      markmapRef.current?.destroy()
      markmapRef.current = null
      return
    }

    if (!draftMarkdown.trim()) {
      markmapRef.current?.svg.interrupt()
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
            color: () => 'hsl(var(--primary))',
            autoFit: false,
            duration: 0,
            fitRatio: 0.92,
            maxWidth: 240,
            initialExpandLevel: 3,
            paddingX: 12,
            spacingVertical: 6,
            embedGlobalCSS: true,
          }) as MarkmapInstanceLike
        }

        const { root } = transformerRef.current.transform(draftMarkdown)
        setRoot(mapTopic(root))
        await markmapRef.current.setData(root)
        if (!cancelled) fitMap(svg, markmapRef.current)
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
    markmapRef.current?.svg.interrupt()
    markmapRef.current?.destroy()
    markmapRef.current = null
  }, [])

  // Render mind map in fullscreen SVG
  useEffect(() => {
    if (!isFullscreen) {
      fullscreenMarkmapRef.current?.svg.interrupt()
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
            color: () => 'hsl(var(--primary))',
            autoFit: false,
            duration: 0,
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
        if (!cancelled) fitMap(svg, fullscreenMarkmapRef.current)
      } catch {
        // Fullscreen render errors are non-critical
      }
    })()

    return () => {
      cancelled = true
      fullscreenMarkmapRef.current?.svg.interrupt()
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
    try { exportMindMapSvg(svgRef.current, exportBaseName) } catch (error) { setActionError((error as Error).message) }

  }

  const handleExportPng = async () => {
    if (!svgRef.current) return
    try {
      setActionError(null)
      await exportMindMapPng(svgRef.current, exportBaseName)

    } catch (error) {
      console.error('[MindMapTab] export PNG failed:', error)
      setActionError(error instanceof Error ? error.message : 'Export PNG failed')
    }
  }

  const generateButton = <button className="ins-button" disabled={!aiConfigured || !hasTranscript || generating || saving || isDirty} onClick={() => void handleGenerate()}>
    {generating ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
    {generating ? t.preview.mindMapGenerating : hasMindMap ? t.preview.mindMapRegenerate : t.preview.mindMapGenerate}
  </button>
  return (
    <div className="review-pane-scroll">{dialog}<div className="ins-pages review-pane">
      <div className="review-source"><TextSourceBanner session={session}/><AiStaleNotice session={session} result={session.mindMap}/></div>
      <section className="ins-panel review-live-map">
        <header className="ins-head"><h2><Network size={16}/>{t.preview.discussionMap}</h2>
          {hasMindMap ? <div className="ins-view" role="group" aria-label={t.preview.tabMindMap}>
            <button aria-pressed={!showOutline} onClick={() => setShowOutline(false)}><Network size={13}/>{t.preview.mapView}</button>
            <button aria-pressed={showOutline} onClick={() => setShowOutline(true)}><List size={14}/>{t.preview.outlineView}</button>
          </div> : generateButton}
        </header>
        {!aiConfigured && <p className="review-hint">{t.preview.aiNotConfigured} <button data-settings-entry="review-ai" className="text-primary underline" onClick={() => useUIStore.getState().openSettings('aiPostProcess')}>{t.common.settings}</button></p>}
        {!hasTranscript && <p className="review-hint">{t.preview.mindMapNoTranscript}</p>}
        {session.mindMap?.status === 'error' && <p role="alert" className="review-map-notice text-destructive">{session.mindMap.error}</p>}
        {hasMindMap ? <div className="relative">
          <div className={'markmap-container review-map-canvas' + (pan && !showOutline ? '' : ' review-map-measure')} aria-hidden={!pan || showOutline}>
            <svg className="h-full w-full" ref={svgRef}/>
          </div>
          {(!pan || showOutline) && root && <MeetingMapTree key={draftMarkdown} root={root} outline={showOutline} version={version} onCitation={onCitation}/>}
          {!root && !renderError && <p role="status" className="p-4"><Loader2 className="h-4 w-4 animate-spin"/></p>}
        </div> : <div className="ins-chat-empty"><Network size={22}/><p>{t.preview.mindMapEmpty}</p><small>{t.preview.mindMapEmptyHint}</small></div>}
        {renderError && <p role="alert" className="review-map-notice text-destructive">{renderError}</p>}
        <div className="ins-map-tools"><div className="ins-actions">
          <button className="ins-button" aria-expanded={showEditor} onClick={() => setShowEditor(!showEditor)}><Pencil size={13}/>{t.preview.mindMapMarkdown}{isDirty && ' *'}</button>
          {hasMindMap && <button ref={fullscreenTrigger} className="ins-button" aria-label="全屏查看导图" onClick={() => setIsFullscreen(true)}><Maximize2 size={13}/>{t.preview.fullscreenMap}</button>}
        </div>{hasMindMap && <button className="ins-button ins-more" aria-expanded={more} onClick={() => setMore(!more)}><ChevronDown size={13}/>{t.preview.moreTools}</button>}</div>
        {more && hasMindMap && <div className="ins-actions ins-map-extra">
          <button className="ins-button" aria-pressed={pan && !showOutline} onClick={() => { setPan(showOutline || !pan); setShowOutline(false) }}>{pan && !showOutline ? t.preview.mapView : t.preview.panMap}</button>
          <button className="ins-button" onClick={() => void handleCopy()}><Copy size={13}/>{t.preview.mindMapCopyMarkdown}</button>
          <button className="ins-button" disabled={!root || !!renderError} onClick={handleExportSvg}><Download size={13}/>SVG</button>
          <button className="ins-button" disabled={!root || !!renderError} onClick={() => void handleExportPng()}><Download size={13}/>PNG</button>
          {generateButton}
        </div>}
        {showEditor && <div className="ins-map-editor space-y-2">
          <textarea aria-label={t.preview.mindMapMarkdown} value={draftMarkdown} onChange={e => setDraftMarkdown(e.target.value)} placeholder={t.preview.mindMapMarkdownPlaceholder} rows={8} className="block w-full rounded-md border border-input bg-background p-2 text-sm"/>
          <div className="ins-actions"><button disabled={saving || !isDirty || !hasMindMap} className="ins-button" onClick={() => void handleSave()}><Save size={13}/>{t.preview.mindMapSave}</button>
          <button disabled={saving || !isDirty} className="ins-button" onClick={() => void confirm('放弃尚未保存的导图修改？').then(ok => { if (ok) setDraftMarkdown() })}>{t.common.cancel}</button></div>
        </div>}
        {actionError && <p role="alert" className="review-map-notice text-destructive">{actionError}</p>}
      </section></div>
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
