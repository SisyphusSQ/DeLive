import { useEffect, useRef, useState } from 'react'
import { PreviewDialog } from './NotebookExtras'
import { exportMindMapPng, exportMindMapSvg } from '../../utils/mindMapExport'

export const mapMarkdown = '# 更舒适的会议回顾\n\n## 把空间交还给正文\n- 紧凑的会议列表\n- 连续、舒适的正文\n\n## 让原音与文字靠近\n- 随时回听原音\n- 按需展开校正\n\n## 保留熟悉的使用习惯\n- 配色与明暗切换\n- 先评审，再开发'

function MapCanvas({ markdown, svgRef }: { markdown: string; svgRef: React.RefObject<SVGSVGElement> }) {
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    let destroy: (() => void) | undefined
    void Promise.all([import('markmap-lib'), import('markmap-view')]).then(([{ Transformer }, { Markmap }]) => {
      if (disposed || !svgRef.current) return
      svgRef.current.setAttribute('width', String(svgRef.current.clientWidth))
      svgRef.current.setAttribute('height', String(svgRef.current.clientHeight))
      const { root } = new Transformer().transform(markdown)
      const map = Markmap.create(svgRef.current, { autoFit: true, duration: 0, fitRatio: .88, maxWidth: 180, color: () => 'hsl(var(--primary))', spacingVertical: 16 }, root)
      destroy = () => map.destroy()
      setError('')
    }).catch(e => { if (!disposed) setError(`导图渲染失败：${String(e)}`) })
    return () => { disposed = true; destroy?.() }
  }, [markdown, svgRef])
  return <div className="note-map-canvas"><svg ref={svgRef} width="800" height="430" aria-label="可缩放和拖动的思维导图" />{error && <p role="alert">{error}</p>}</div>
}
export function NotebookMapEditor({ saveFailed, children, outline, visible, initialMarkdown = mapMarkdown }: { saveFailed: boolean; children: React.ReactNode; outline: boolean; visible: boolean; initialMarkdown?: string }) {
  const [markdown, setMarkdown] = useState(initialMarkdown), [saved, setSaved] = useState(initialMarkdown), [editing, setEditing] = useState(false), [fullscreen, setFullscreen] = useState(false), [notice, setNotice] = useState(''), [custom, setCustom] = useState(false)
  const svg = useRef<SVGSVGElement>(null), fullSvg = useRef<SVGSVGElement>(null)
  const dirty = markdown !== saved
  const copy = async () => { try { await navigator.clipboard.writeText(markdown); setNotice('已复制导图 Markdown') } catch { setNotice('复制失败，请展开编辑器手动复制。') } }
  const exportMap = async (format: 'SVG' | 'PNG') => {
    if (!svg.current) { setCustom(true); setNotice('已打开可缩放导图。渲染完成后，再选择导出格式。'); return }
    try { if (format === 'SVG') exportMindMapSvg(svg.current, 'DeLive-合成导图'); else await exportMindMapPng(svg.current, 'DeLive-合成导图'); setNotice(`已导出本地合成 ${format}，不含真实会议资料`) } catch { setNotice('导出失败，内容仍保留，请重试。') }
  }
  return <><div className="note-tools note-map-tools"><button className="note-text-button" aria-expanded={editing} onClick={() => setEditing(v => !v)}>编辑 Markdown{dirty ? ' · 未保存' : ''}</button><button className="note-text-button" onClick={() => void copy()}>复制 Markdown</button><button className="note-text-button" disabled={custom} onClick={() => setCustom(true)}>缩放与拖动</button><button className="note-text-button" onClick={() => setFullscreen(true)}>全屏</button><details className="note-more"><summary>导出导图</summary><div><button onClick={() => void exportMap('SVG')}>导出 SVG</button><button onClick={() => void exportMap('PNG')}>导出 PNG</button></div></details></div>
    {editing && <div className="note-form"><label>导图 Markdown<textarea aria-label="导图 Markdown" rows={10} value={markdown} onChange={e => setMarkdown(e.target.value)} /></label><div className="note-tools"><button className="note-primary" disabled={!dirty || !markdown.trim()} onClick={() => { if (saveFailed) { setNotice('保存失败，编辑草稿仍保留，请重试。'); return } setSaved(markdown); setCustom(true); setNotice('已保存本次预览导图') }}>保存导图</button><button className="note-text-button" disabled={!dirty} onClick={() => { setMarkdown(saved); setNotice('已恢复到上次保存的导图') }}>放弃导图修改</button></div></div>}
    {custom ? outline ? <pre className="note-map-outline">{saved}</pre> : (visible && <MapCanvas markdown={saved} svgRef={svg} />) : children}
    {notice && <p role="status" className="insight-footnote">{notice}</p>}
    <PreviewDialog open={fullscreen} title="全屏思维导图" onClose={() => setFullscreen(false)}>{fullscreen && <MapCanvas markdown={saved} svgRef={fullSvg} />}<p className="insight-footnote">滚轮缩放、拖动画布；点击节点圆点折叠。按 Esc 返回。</p></PreviewDialog>
  </>
}
