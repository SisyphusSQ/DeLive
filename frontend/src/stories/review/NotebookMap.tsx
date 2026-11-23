import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, FileText, List, Maximize2, Network, Pencil, RotateCcw } from 'lucide-react'
import Markdown from 'react-markdown'
import type { Markmap } from 'markmap-view'
import { exportMindMapPng, exportMindMapSvg } from '../../utils/mindMapExport'
import { post } from './fixtures'
import { PreviewDialog } from './NotebookExtras'
import type { meetingTopics } from './insightFixtures'

async function drawMap(svg: SVGSVGElement, markdown: string) {
  const [{ Transformer }, { Markmap }] = await Promise.all([import('markmap-lib'), import('markmap-view')])
  if (!svg.isConnected) return
  const { root } = new Transformer().transform(markdown)
  const map = Markmap.create(svg, { duration: 0, fitRatio: .9, maxWidth: 180, color: () => 'hsl(var(--primary))', spacingVertical: 16 })
  try { await map.setData(root); await map.fit(); return map }
  catch (error) { map.destroy(); throw error }
}

function MapCanvas({ markdown }: { markdown: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    let rendered: Markmap | undefined
    const svg = ref.current!
    const resize = new ResizeObserver(() => { if (rendered) void rendered.fit() })
    resize.observe(svg)
    setError('')
    void drawMap(svg, markdown).then(map => {
      if (disposed) map?.destroy()
      else rendered = map
    }).catch(() => { if (!disposed) setError('导图渲染失败，请重开导图。') })
    return () => { disposed = true; resize.disconnect(); rendered?.destroy() }
  }, [markdown])
  return <div className="note-map-canvas"><svg ref={ref} aria-label="可缩放和拖动的思维导图" />{error && <p role="alert">{error}</p>}</div>
}

type MapProps = {
  visible: boolean
  imagesOnly: boolean
  topics: typeof meetingTopics
  citation: (seconds: number) => ReactNode
  blocked: boolean
  saveFailed: boolean
  onRegenerate: () => void
}

export function NotebookMapEditor({ visible, topics, imagesOnly, citation, blocked, saveFailed, onRegenerate }: MapProps) {
  const title = imagesOnly ? '回顾页布局草图' : '更舒适的会议回顾'
  const initial = ['# ' + title, ...topics.flatMap(topic => ['## ' + topic.title, ...topic.leaves.map(leaf => '- ' + leaf)])].join('\n')
  const [saved, setSaved] = useState(initial)
  const [markdown, setMarkdown] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [more, setMore] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [outline, setOutline] = useState(false)
  const [pan, setPan] = useState(false)
  const [folded, setFolded] = useState<string[]>([])
  const [source, setSource] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [exporting, setExporting] = useState(false)
  const sourceTopic = topics.find(topic => source !== null && topic.leafTimes.includes(source))
  const passage = post.segments.find(segment => segment.startMs === (source ?? -1) * 1000)
  const dirty = markdown !== saved
  const custom = saved !== initial
  function save() {
    if (saveFailed) { setNotice('保存失败，编辑草稿仍保留，请重试。'); return }
    setSaved(markdown)
    setEditing(false)
    setSource(null)
    setNotice('已保存本次预览导图')
  }
  async function copy() {
    try { await navigator.clipboard.writeText(markdown); setNotice('已复制导图 Markdown') }
    catch { setNotice('复制失败，可在编辑器内选择文字复制。') }
  }
  async function exportMap(format: 'SVG' | 'PNG') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.cssText = 'position:fixed;left:-1200px;top:0;width:960px;height:480px;pointer-events:none'
    document.body.append(svg)
    setExporting(true)
    let map: Markmap | undefined
    try {
      map = await drawMap(svg, saved)
      if (format === 'SVG') exportMindMapSvg(svg, title)
      else await exportMindMapPng(svg, title)
      setNotice(`已导出 ${format}`)
    } catch { setNotice('导出失败，可重试或复制 Markdown。') }
    finally { map?.destroy(); svg.remove(); setExporting(false) }
  }
  function toggleBranch(topic: typeof topics[number]) {
    setFolded(current => current.includes(topic.title) ? current.filter(item => item !== topic.title) : [...current, topic.title])
    if (sourceTopic === topic) setSource(null)
  }

  return <div className="ins-panel">
    <header className="ins-head">
      <h2><Network size={16} />讨论脉络</h2>
      <div className="ins-view" role="group" aria-label="导图视图">
        <button aria-pressed={!outline} onClick={() => setOutline(false)}><Network size={13} />导图</button>
        <button aria-pressed={outline} onClick={() => setOutline(true)}><List size={14} />大纲</button>
      </div>
    </header>
    {custom && outline ? <div className="ins-custom-outline"><Markdown>{saved}</Markdown></div>
      : !outline && (custom || pan) ? visible && <MapCanvas markdown={saved} />
      : <div className={outline ? 'ins-tree ins-outline' : 'ins-tree'}>
        <strong className="ins-root">{title}</strong>
        <ul className="ins-branches">{topics.map(topic => <li key={topic.title}>
          <button className="ins-branch" aria-expanded={!folded.includes(topic.title)} onClick={() => toggleBranch(topic)}>
            <ChevronDown size={13} />{topic.title}
          </button>
          {!folded.includes(topic.title) && <ul className="ins-leaves">{topic.leaves.map((leaf, i) => <li key={leaf}>
            <button aria-pressed={source === topic.leafTimes[i]} onClick={() => setSource(topic.leafTimes[i])}>{leaf}<ArrowUpRight size={12} /></button>
          </li>)}</ul>}
        </li>)}</ul>
      </div>}
    {source !== null && sourceTopic && !custom && (!pan || outline) && <aside className="ins-source-detail" aria-label="导图原文引用">
      <header><strong><FileText size={13} />{sourceTopic.leaves[sourceTopic.leafTimes.indexOf(source)]}</strong>{citation(source)}</header>
      <p>{imagesOnly ? '引用自回顾页布局草图。' : passage?.text}</p>
    </aside>}
    <div className="ins-map-tools">
      <div className="ins-actions">
        <button className="ins-button" aria-expanded={editing} onClick={() => setEditing(!editing)}><Pencil size={13} />编辑 Markdown{dirty && ' · 未保存'}</button>
        <button className="ins-button" onClick={() => setFullscreen(true)}><Maximize2 size={13} />全屏</button>
      </div>
      <button className="ins-button ins-more" aria-expanded={more} onClick={() => setMore(!more)}><ChevronDown size={13} />更多工具</button>
    </div>
    {more && <div className="ins-actions ins-map-extra">
          <button className="ins-button" onClick={() => void copy()}>复制 Markdown</button>
          {!custom && <button className="ins-button" aria-pressed={pan && !outline} onClick={() => { setPan(outline || !pan); setOutline(false) }}>{pan && !outline ? '返回引用导图' : '缩放与拖动'}</button>}
          <button className="ins-button" disabled={exporting} onClick={() => void exportMap('SVG')}>导出 SVG</button>
          <button className="ins-button" disabled={exporting} onClick={() => void exportMap('PNG')}>导出 PNG</button>
          <button className="ins-button" disabled={blocked} onClick={onRegenerate}><RotateCcw size={13} />重新生成思维导图</button>
    </div>}
    {editing && <div className="note-form ins-map-editor">
      <label>导图 Markdown<textarea aria-label="导图 Markdown" rows={8} value={markdown} onChange={event => setMarkdown(event.target.value)} /></label>
      <div className="ins-actions">
        <button className="note-primary" disabled={!dirty || !markdown.trim()} onClick={save}>保存导图</button>
        <button className="ins-button" disabled={!dirty} onClick={() => { setMarkdown(saved); setNotice('已恢复到上次保存的导图') }}>放弃导图修改</button>
      </div>
    </div>}
    {notice && <p role="status" className="ins-map-notice">{notice}</p>}
    <PreviewDialog open={fullscreen} title="全屏思维导图" onClose={() => setFullscreen(false)}>{fullscreen && <MapCanvas markdown={saved} />}<p className="ins-caption">滚轮缩放，拖动画布。按 Esc 返回。</p></PreviewDialog>
  </div>
}
