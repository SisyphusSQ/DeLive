import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'

import { blocksPreviewSubmission, fileTaskStates, previewStates, type PreviewState } from './previewStates'

export type PreviewImage = { id: number; caption: string; seconds: number }

export function PreviewDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current!
    element.showModal()
    return () => { element.close(); if (previous?.isConnected) previous.focus() }
  }, [open])
  return <dialog ref={dialog} className="note-dialog" aria-label={title} onCancel={onClose} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }} onClick={e => { if (e.target === dialog.current) onClose() }}><header><h2>{title}</h2><button className="note-icon" aria-label={`关闭${title}`} onClick={onClose}><X size={18} /></button></header><div className="note-dialog-body">{children}</div></dialog>
}

export function PreviewStateNotice({ state, onState, onConfigureAi }: { state: PreviewState; onState: (state: PreviewState) => void; onConfigureAi?: () => void }) {
  const [dialog, setDialog] = useState(false)
  if (!['unconfigured', 'generating', 'failed', 'stale', 'saveFailed', 'sourceMissing'].includes(state)) return null
  const messages: Partial<Record<PreviewState, [string, string, string]>> = {
    unconfigured: ['还没有配置 AI 服务', '现有内容仍可阅读。配置 AI 后再由你发起生成，不会自动提交。', '查看配置入口'],
    generating: ['正在整理会议内容…', '已生成内容继续保留，你可以停止本次生成。', '停止生成'],
    failed: ['本次生成失败', '示例错误：服务暂时不可用。原有结果和输入均已保留。', '重试生成'],
    stale: ['资料已变化，内容尚未更新', '采用稿、文字或图片说明已改变。以下结果仍基于此前资料，重新生成后再核对。', '重新生成'],
    saveFailed: ['保存失败，草稿仍保留', '示例错误：本地写入失败。输入与选择仍保留。解除失败示例后，可在编辑区重新保存；成功前不会采用。', '解除失败示例'],
    sourceMissing: ['校正来源不完整', '来源片段缺失，不能应用建议。请先检查原稿与会后稿；现有内容保留。', '查看来源说明'],
  }
  const [title, detail, action] = messages[state]!
  return <><aside className={`note-state ${state === 'failed' || state === 'saveFailed' ? 'is-error' : ''}`} role="status"><div><strong>{title}</strong><p>{detail}</p></div><button className="note-text-button" onClick={() => state === 'unconfigured' && onConfigureAi ? onConfigureAi() : state === 'unconfigured' || state === 'sourceMissing' ? setDialog(true) : onState(state === 'failed' || state === 'stale' ? 'generating' : 'ready')}>{action}</button></aside><ActionDialog open={dialog} title={title} description={state === 'unconfigured' ? '正式页面入口：设置 → AI 服务。云端 ASR 的收敛不影响此设置。本预览不保存凭据，也不调用模型。' : '请切换原稿和会后稿检查缺失内容。无法可靠对应时保留为待确认，不补造时间与说话人。'} onClose={() => setDialog(false)} actions={[{ label: '返回阅读', onClick: () => setDialog(false) }]} /></>
}

export interface PreviewTaskWorkflow {
  fileOnly?: boolean
  hasResult: boolean
  taskList?: boolean
  hideStart?: boolean
  source?: string
  sourceDeleted?: boolean
  onConfigure?: (section: 'provider' | 'storage') => void
  onOpen?: () => void
  onSubmit?: () => void
}
export function PreviewTasks({ state, onState, onCorrect, workflow }: { state: PreviewState; onState: (state: PreviewState) => void; onCorrect: () => void; workflow?: PreviewTaskWorkflow }) {
  const [confirm, setConfirm] = useState<'submit' | 'stop' | ''>('')
  const [notice, setNotice] = useState('')
  const taskState = (['credentials', 'storage', ...fileTaskStates] as PreviewState[]).includes(state)
  const sourceAvailable = state !== 'deletedSource' && !workflow?.sourceDeleted
  const canCorrect = sourceAvailable && (!workflow || (!workflow.fileOnly && workflow.hasResult))
  const canSubmit = !workflow?.hideStart && sourceAvailable
  const confirmStart = () => {
    if (workflow?.onConfigure && (state === 'credentials' || state === 'storage')) {
      workflow.onConfigure(state === 'credentials' ? 'provider' : 'storage')
    } else setConfirm('submit')
  }
  const details: Partial<Record<PreviewState, string>> = {
    credentials: '尚未配置火山文件转写凭据。实时转写可用不代表文件转写配置已齐全。', storage: '私有临时存储未配置。不会自动上传原音或提交任务。',
    preparing: '正在准备同步混音。本地原音保留。', uploading: '正在上传临时副本 · 12 / 32 MB', submitting: '正在等待服务端接收确认，请勿重复提交。',
    unknown: '尚未确认服务端是否接收。先查询原任务，避免重复提交和计费。', queued: '服务端排队中，可以继续阅读。', processing: '服务端正在转写，可以继续阅读。',
    completed: workflow?.fileOnly ? '会后稿已保存，可按匿名说话人查看并逐句回听。' : '会后稿已保存，自动校正版可用。本地原音保留。', awaitingSave: '服务端已完成，本地保存失败。结果仍保留，重试保存不会重新识别或计费。',
    taskFailed: '示例错误：服务端转写失败。查看任务详情后，再决定是否重新提交。', cleanupFailed: '会后稿已保存，但临时副本删除未确认。访问到期不代表文件已删除。',
    cancelled: '已停止本机跟踪并清理临时副本。服务端已受理的任务与计费无法撤销。', deletedSource: '转写已完成，但来源会议已删除。不会自动恢复已删除会议。',
  }
  return <details className="note-disclosure" open={taskState || undefined}><summary>{workflow?.taskList ? '转写任务' : '会后转写与校正'}{taskState && <span>{previewStates[state]}</span>}</summary><div className="note-panel-content">
    {canCorrect && <p>已有会后稿可直接生成校正版，无需再次上传或识别。</p>}
    {(canCorrect || canSubmit) && <div className="note-tools">{canCorrect && <button className="note-text-button" onClick={onCorrect}>生成校正版</button>}{canSubmit && <button className="note-text-button" disabled={blocksPreviewSubmission(state) || (!workflow && ['credentials', 'storage'].includes(state))} onClick={confirmStart}>{state === 'credentials' ? '配置火山凭据' : state === 'storage' ? '配置私有存储' : !workflow || workflow.hasResult ? '重新转写原音' : '会后转写'}</button>}</div>}
    {taskState && <div className="note-task-state" role="status"><strong>{previewStates[state]}</strong><p>{details[state]}</p>{workflow?.sourceDeleted && state !== 'deletedSource' && <p>来源会议已删除，仍可处理原任务。</p>}{state === 'uploading' && <progress aria-label="临时音频上传进度" value={12} max={32} />}
      <div className="note-tools">{!workflow && ['credentials', 'storage'].includes(state) && <button className="note-text-button" onClick={() => setNotice('正式入口：设置 → 文件转写。分别配置火山凭据和私有临时存储，返回此会议后需手动提交。')}>前往文件转写配置</button>}
      {['unknown', 'queued', 'processing'].includes(state) && <button className="note-text-button" onClick={() => onState(state === 'unknown' ? 'processing' : 'awaitingSave')}>查询 / 继续查询</button>}
      {['preparing', 'uploading', 'submitting', 'unknown', 'queued', 'processing'].includes(state) && <button className="note-text-button" onClick={() => setConfirm('stop')}>停止并清理</button>}
      {state === 'awaitingSave' && <button className="note-primary" onClick={() => onState('completed')}>重试保存 / 本地合并</button>}
      {state === 'cleanupFailed' && <button className="note-text-button" onClick={() => { onState('completed'); setNotice('示例临时副本已清理确认') }}>重试清理</button>}
      {sourceAvailable && (state === 'completed' || state === 'cleanupFailed') && (workflow?.onOpen || canCorrect) && <button className="note-text-button" onClick={workflow?.onOpen ?? onCorrect}>{workflow?.fileOnly ? '打开会后稿' : '打开校正版'}</button>}</div>
      <details><summary>任务详情</summary><p>来源：火山标准文件转写 2.0 · 合成任务 demo-task</p>{workflow?.source && <p>音频来源：{workflow.source}</p>}<p>临时副本：{state === 'cleanupFailed' ? '清理未确认' : state === 'completed' || state === 'cancelled' ? '已清理确认' : '尚未确认清理'} · 原音本地保留</p></details>
    </div>}{notice && <p role="status">{notice}</p>}
  </div><ActionDialog open={!!confirm} title={confirm === 'submit' ? '重新转写原音？' : '停止本地任务并清理？'} description={confirm === 'submit' ? '将同步混音的临时副本上传到火山，可能计费。已有会后稿可以直接本地校正，无需重新识别。此预览只模拟状态，不上传。' : '将停止本机跟踪并清理临时副本，不能撤销服务端已接受的任务和计费。本地原音与稿件保留。'} onClose={() => setConfirm('')} actions={[{ label: '取消', onClick: () => setConfirm('') }, { label: confirm === 'submit' ? '预览提交状态' : '预览停止并清理', variant: confirm === 'submit' ? 'primary' : 'danger', onClick: () => { if (confirm === 'submit' && workflow?.onSubmit) workflow.onSubmit(); else onState(confirm === 'submit' ? 'uploading' : 'cancelled'); setConfirm('') } }]} /></details>
}

function ImageDrawing({ caption }: { caption: string }) {
  return <svg viewBox="0 0 480 240" role="img" aria-label={caption} className="note-demo-image"><rect width="480" height="240" rx="8" fill="currentColor" opacity=".04" /><text x="26" y="42" fill="currentColor" fontSize="16">回顾页 · 阅读布局草图</text><rect x="26" y="65" width="100" height="145" rx="5" fill="currentColor" opacity=".07" /><rect x="145" y="65" width="305" height="145" rx="5" fill="currentColor" opacity=".04" />{[90, 112, 134, 156, 178].map(y => <path key={y} d={`M164 ${y} H420`} stroke="currentColor" strokeWidth="3" opacity=".18" />)}</svg>
}
export function PreviewImages({ images, onChange, onJump, hasAudio }: { images: PreviewImage[]; onChange: (images: PreviewImage[]) => void; onJump: (seconds: number) => void; hasAudio: boolean }) {
  const [selected, setSelected] = useState<number | null>(null), [deleting, setDeleting] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null), [caption, setCaption] = useState(''), [seconds, setSeconds] = useState(''), [error, setError] = useState('')
  const insert = () => onChange([...images, { id: Date.now(), caption: '回顾页阅读布局草图', seconds: 428 }])
  return <section className="note-disclosure note-images" aria-label="图片时间轴" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); insert() }} onPaste={e => { if (e.clipboardData.files.length) { e.preventDefault(); insert() } }} tabIndex={0}>
    <div className="note-tools"><strong>图片资料 · {images.length}</strong><button className="note-text-button" onClick={insert}><ImagePlus size={14} />插入示例图片</button></div><p className="insight-footnote">可拖入或粘贴体验插入；仅使用合成草图，不读取你的文件。图片时间独立于稿件。</p>
    {!images.length && <p className="note-muted-callout">还没有图片，文字和已有稿件仍然保留。</p>}
    {images.map(image => <article key={image.id} className="note-image-entry"><button aria-label={`查看原图 ${image.caption}`} onClick={() => setSelected(image.id)}><ImageDrawing caption={image.caption} /></button><div><strong>{image.caption}</strong><p>{Math.floor(image.seconds / 60).toString().padStart(2, '0')}:{(image.seconds % 60).toString().padStart(2, '0')} · 合成图片</p><div className="note-tools"><button className="note-text-button" disabled={!hasAudio} onClick={() => onJump(image.seconds)}>定位原音</button><button className="note-text-button" onClick={() => { setEditing(image.id); setCaption(image.caption); setSeconds(String(image.seconds)); setError('') }}>编辑时间与说明</button><button className="note-text-button" onClick={() => setDeleting(image.id)}>删除图片</button></div></div>
      {editing === image.id && <form className="note-form" onSubmit={e => { e.preventDefault(); if (!seconds.trim() || !Number.isFinite(Number(seconds)) || Number(seconds) < 0) { setError('请输入有效的非负秒数'); return } onChange(images.map(i => i.id === image.id ? { ...i, caption, seconds: Number(seconds) } : i)); setEditing(null) }}><label>图片时间（秒）<input type="number" min="0" step="0.001" value={seconds} onChange={e => setSeconds(e.target.value)} /></label><label>图片说明<input value={caption} onChange={e => setCaption(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<div className="note-tools"><button className="note-primary" type="submit">保存图片信息</button><button type="button" className="note-text-button" onClick={() => setEditing(null)}>取消</button></div></form>}
    </article>)}
    <PreviewDialog open={selected !== null} title="图片原图" onClose={() => setSelected(null)}>{images.find(i => i.id === selected) && <ImageDrawing caption={images.find(i => i.id === selected)!.caption} />}</PreviewDialog>
    <ActionDialog open={deleting !== null} title="删除这张图片？" description="本次预览中的图片和说明将移除，原音与其他资料保留。已有 AI 引用会提示资料变化。" onClose={() => setDeleting(null)} actions={[{ label: '取消', onClick: () => setDeleting(null) }, { label: '删除图片', variant: 'danger', onClick: () => { onChange(images.filter(i => i.id !== deleting)); setDeleting(null) } }]} />
  </section>
}

export function PreviewCorrection({ blocked, onSave, saveFailed }: { blocked: boolean; onSave: (text: string) => void; saveFailed: boolean }) {
  const [mode, setMode] = useState('review'), [detected, setDetected] = useState(false), [filter, setFilter] = useState('全部')
  const [choices, setChoices] = useState<Record<number, 'accept' | 'reject'>>({}), [notice, setNotice] = useState('')
  const issues = [{ category: '同音字', from: '会意回顾', to: '会议回顾', reason: '结合会议语境，建议使用“会议”。' }, { category: '专有名词', from: 'Story book', to: 'Storybook', reason: '统一工具名称写法。' }]
  return <details className="note-disclosure"><summary>AI 校对<span>快速校正 · 逐项确认</span></summary><div className="note-panel-content">
    <p>基于当前采用稿校对；与会后转写的逐句合并分开处理。应用后另存修订版，原稿保留。</p><div className="note-tools"><Select aria-label="AI 校对方式" value={mode} onChange={e => { setMode(e.target.value); setDetected(false) }}><option value="review">检测问题并逐项确认</option><option value="quick">快速校正</option></Select><button className="note-primary" disabled={blocked} onClick={() => { setDetected(true); setNotice('') }}>{mode === 'review' ? '检测问题' : '开始快速校正'}</button></div>
    {detected && <><div className="note-tools"><span>示例结果 · 2 处建议</span><Select aria-label="校对问题类别" value={filter} onChange={e => setFilter(e.target.value)}>{['全部', '同音字', '专有名词', '语法', '标点', '其他'].map(c => <option key={c}>{c}</option>)}</Select><button className="note-text-button" onClick={() => setChoices({ 0: 'accept', 1: 'accept' })}>全部接受</button><button className="note-text-button" onClick={() => setChoices({ 0: 'reject', 1: 'reject' })}>全部拒绝</button></div>
      {issues.map((issue, i) => (filter === '全部' || filter === issue.category) && <div className="note-correction-item" key={issue.from}><span>{issue.category}</span><p><del>{issue.from}</del> → {issue.to}</p><details><summary>修改原因</summary><p>{issue.reason}</p></details><div className="note-tools"><button className="note-text-button" aria-pressed={choices[i] === 'accept'} onClick={() => setChoices(c => ({ ...c, [i]: 'accept' }))}>接受第 {i + 1} 项</button><button className="note-text-button" aria-pressed={choices[i] === 'reject'} onClick={() => setChoices(c => ({ ...c, [i]: 'reject' }))}>拒绝第 {i + 1} 项</button></div></div>)}
      <div className="note-review-columns"><div><span>原文</span><p>会意回顾采用 Story book 设计预览。</p></div><div><span>校正预览</span><p>{mode === 'quick' || choices[0] === 'accept' ? '会议回顾' : '会意回顾'}采用 {mode === 'quick' || choices[1] === 'accept' ? 'Storybook' : 'Story book'} 设计预览。</p></div></div>
      <div className="note-tools"><button className="note-primary" disabled={blocked || (mode === 'review' && !Object.values(choices).includes('accept'))} onClick={() => { if (saveFailed) { setNotice('保存失败，校对选择仍保留。请在上方重试保存后继续应用。'); return } onSave(`${mode === 'quick' || choices[0] === 'accept' ? '会议回顾' : '会意回顾'}采用 ${mode === 'quick' || choices[1] === 'accept' ? 'Storybook' : 'Story book'} 设计预览。`); setNotice('已另存本地预览修订版，采用稿尚未改变。') }}>另存校正修订版</button><button className="note-text-button" onClick={() => { setDetected(false); setChoices({}); setNotice('') }}>重置校对</button></div></>}
    {notice && <p role="status">{notice}</p>}
  </div></details>
}
