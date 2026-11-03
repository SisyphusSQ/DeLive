import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranscriptSession } from '../types'
import type { SessionImage } from '../../../shared/sessionImages'
import { deleteSessionImage, editSessionImage, imageDataUrl, importSessionImages } from '../services/sessionImages'
import { DialogShell } from './ui/DialogShell'
import { timestamp } from '../utils/reviewVersions'

const input = 'rounded border border-border bg-background px-2 py-1 text-sm'
function openSessionImage(sessionId: string, imageId: string): void {
  window.dispatchEvent(new CustomEvent('delive:open-image', { detail: { sessionId, imageId } }))
}

export function SessionImageViewer({ session }: { session: TranscriptSession }) {
  const [selected, setSelected] = useState<string>()
  const [url, setUrl] = useState(''), [error, setError] = useState('')
  const image = session.images?.find(item => item.id === selected)
  useEffect(() => {
    const open = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.sessionId === session.id) setSelected(detail.imageId) }
    const link = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.('a[href^="#image-"]')
      const id = anchor?.getAttribute('href')?.slice(7)
      if (id && session.images?.some(item => item.id === id)) { event.preventDefault(); setSelected(id) }
    }
    window.addEventListener('delive:open-image', open); document.addEventListener('click', link)
    return () => { window.removeEventListener('delive:open-image', open); document.removeEventListener('click', link) }
  }, [session.id, session.images])
  useEffect(() => {
    let active = true; setUrl(''); setError('')
    if (image) void imageDataUrl(session.id, image).then(value => { if (active) setUrl(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [session.id, image])
  return <DialogShell open={!!image} onClose={() => setSelected(undefined)} title={image ? `图片 ${timestamp(image.atMs)} · ${image.name}` : '图片'} titleId="session-image-title">
    <div className="flex-1 overflow-auto p-4">{error && <p role="alert">{error}</p>}{url ? <img src={url} alt={image?.caption || image?.name} className="mx-auto max-w-full" /> : !error && <p>正在读取原图…</p>}{image?.caption && <p className="mt-3 whitespace-pre-wrap">{image.caption}</p>}</div>
  </DialogShell>
}

function ImageCard({ sessionId, image, onSeek, onError }: { sessionId: string; image: SessionImage; onSeek?: (ms: number) => void; onError: (message: string) => void }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false), [seconds, setSeconds] = useState(String(image.atMs / 1000)), [caption, setCaption] = useState(image.caption)
  useEffect(() => {
    let active = true
    void imageDataUrl(sessionId, image).then(value => { if (active) setUrl(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [sessionId, image])
  const action = async (run: () => Promise<void>) => { setBusy(true); setError(''); try { await run(); setEditing(false) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <article id={`image-${image.id}`} className="rounded-lg border border-border bg-muted/20 p-3" data-image-id={image.id}>
    <div className="mb-2 flex flex-wrap items-center gap-3 text-sm"><strong>图片 · {timestamp(image.atMs)}</strong><span className="truncate text-muted-foreground">{image.name}</span>
      <button className={input} disabled={!onSeek} onClick={() => onSeek?.(image.atMs)}>定位原音</button>
      <button className={input} disabled={busy} onClick={() => { setSeconds(String(image.atMs / 1000)); setCaption(image.caption); setEditing(!editing) }}>编辑时间与说明</button>
      <button className={input} disabled={busy} onClick={() => { if (window.confirm('删除这张图片及本地副本？原音和其他图片会保留。')) void deleteSessionImage(sessionId, image).catch(e => onError(e.message)) }}>删除图片</button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {url && <button onClick={() => openSessionImage(sessionId, image.id)} aria-label={`查看原图 ${image.name}`}><img src={url} alt={image.caption || image.name} className="max-h-48 max-w-full rounded object-contain" /></button>}
    {image.caption && !editing && <p className="mt-2 whitespace-pre-wrap text-sm">{image.caption}</p>}
    {editing && <div className="mt-3 space-y-2"><label className="block text-sm">图片时间（秒） <input aria-label="图片时间（秒）" className={input} type="number" min="0" step="0.001" value={seconds} onChange={e => setSeconds(e.target.value)} /></label>
      <label className="block text-sm">图片说明<textarea aria-label="图片说明" className={`${input} block w-full`} value={caption} onChange={e => setCaption(e.target.value)} /></label>
      <button className={input} disabled={busy || !seconds.trim()} onClick={() => void action(() => editSessionImage(sessionId, image.id, { atMs: Number(seconds) * 1000, caption }))}>保存图片信息</button></div>}
  </article>
}

export function SessionImages({ session, getTime, onSeek, live = false }: { session: TranscriptSession; getTime: () => number; onSeek?: (ms: number) => void; live?: boolean }) {
  const section = useRef<HTMLElement>(null)
  const picker = useRef<HTMLInputElement>(null), selection = useRef({ sessionId: session.id, atMs: 0 })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const add = useCallback(async (files: File[], atMs: number, sessionId = session.id) => {
    if (!files.length) return
    setBusy(true); setError('')
    try { await importSessionImages(sessionId, files, atMs) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [session.id])
  useEffect(() => {
    const active = () => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      return !dialogs.length || dialogs[dialogs.length - 1].contains(section.current)
    }
    const paste = (e: ClipboardEvent) => {
      if (!active()) return
      if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable=true]')) return
      const files = Array.from(e.clipboardData?.items || []).filter(item => item.type.startsWith('image/')).flatMap(item => { const file = item.getAsFile(); return file ? [file] : [] })
      if (files.length) { e.preventDefault(); if (!busy) void add(files, getTime()) }
    }
    const drag = (e: DragEvent) => { if (!active()) return; if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    const drop = (e: DragEvent) => { if (!active()) return; if (e.dataTransfer?.files.length) { e.preventDefault(); if (!busy) void add(Array.from(e.dataTransfer.files), getTime()) } }
    document.addEventListener('paste', paste); document.addEventListener('dragover', drag); document.addEventListener('drop', drop)
    return () => { document.removeEventListener('paste', paste); document.removeEventListener('dragover', drag); document.removeEventListener('drop', drop) }
  }, [add, busy, getTime])
  return <section ref={section} aria-label="图片时间轴" tabIndex={0} className="space-y-3 rounded-lg border border-dashed border-border p-3 focus-visible:outline-primary">
    <div className="flex flex-wrap items-center gap-3"><button className={input} disabled={busy} onClick={() => { selection.current = { sessionId: session.id, atMs: getTime() }; picker.current?.click() }}>{busy ? '正在保存图片…' : '插入图片'}</button>
      <span className="text-xs text-muted-foreground">{live ? '选择、拖入或在此粘贴图片，关联当前录音时间' : '选择、拖入或在此粘贴图片，关联当前回放位置；可编辑时间'}</span>
      <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="选择时间轴图片" onChange={e => { void add(Array.from(e.target.files || []), selection.current.atMs, selection.current.sessionId); e.target.value = '' }} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {[...(session.images || [])].sort((a, b) => a.atMs - b.atMs).map(image => <ImageCard key={image.id} sessionId={session.id} image={image} onSeek={onSeek} onError={setError} />)}
  </section>
}
