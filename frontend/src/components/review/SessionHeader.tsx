import { useConfirmation } from '../../hooks/useConfirmation'
import { memo, useState } from 'react'
import { X, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { canExportTimed, downloadReview, selectedReviewVersion, versionLabel, reviewStatus } from '../../utils/reviewVersions'
import { useSessionStore } from '../../stores/sessionStore'
import { cancelAiTasks } from '../../services/aiTransport'
import { Button } from '../ui'
import { Select } from '../ui/Select'
import { useTopicStore } from '../../stores/topicStore'
import { useUIStore } from '../../stores/uiStore'

interface SessionHeaderProps { session:TranscriptSession;onClose:()=>void;sidebarCollapsed?:boolean;onToggleSidebar?:()=>void }
export const SessionHeader = memo(function SessionHeader({session,onClose,sidebarCollapsed,onToggleSidebar}:SessionHeaderProps) {
  const current=useSessionStore(s=>s.sessions.find(item=>item.id===session.id))??session
  const version=selectedReviewVersion(current),[open,setOpen]=useState(false),[error,setError]=useState('')
  const { t } = useUIStore()
  const topics = useTopicStore(state => state.topics)
  const [topicError, setTopicError] = useState('')
  const changeTopic = async (value: string) => {
    setTopicError('')
    try {
      await useSessionStore.getState().updateSessionTopic(current.id, value || undefined)
      setTopicError('')
    } catch (cause) {
      setTopicError(String(cause))
    }
  }
  const {confirm,dialog}=useConfirmation()
  const [purpose, setPurpose] = useState<'reading' | 'proofreading'>('reading')
  const pending=version.merge?.groups.filter(g=>g.status==='pending').length??0
  const timed=canExportTimed(version)
  const aiRunning = current.postProcess?.status === 'pending' || current.mindMap?.status === 'pending'
    || current.askHistory?.some(turn => turn.status === 'pending') || ['detecting', 'correcting'].includes(current.correction?.status || '')
  const download=async(format:'txt'|'md'|'srt'|'vtt')=>{
    if(pending&&!await confirm(`当前稿还有 ${pending} 处待确认，尚未全部校对。仍导出？`))return
    try{downloadReview(current,format,purpose);setError('');setOpen(false)}catch(e){setError((e as Error).message)}
  }
  return <div className="review-session-header shrink-0 px-3 pb-1 pt-3 sm:px-6 sm:pt-4">
    {dialog}<div className="mx-auto flex max-w-[52rem] items-start justify-between gap-2 sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {onToggleSidebar&&<button aria-label={sidebarCollapsed?'显示会话列表':'隐藏会话列表'} className="rounded border p-2" onClick={onToggleSidebar}>{sidebarCollapsed?<PanelLeftOpen className="h-4 w-4"/>:<PanelLeftClose className="h-4 w-4"/>}</button>}
        <div className="min-w-0"><h2 id="session-review-title" title={current.title} className="review-session-title line-clamp-2 break-words text-lg font-semibold leading-snug tracking-tight sm:text-2xl">{current.title}</h2><p className="review-session-meta mt-1 break-words text-xs text-muted-foreground">{current.date} {current.time} · {version.text.length} 字</p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t.topics.title}</span>
            <Select aria-label={t.topics.selectTopic} value={current.topicId ?? ''}
              disabled={!topics.length && !current.topicId}
              onChange={event => void changeTopic(event.target.value)}
              className="max-w-full rounded-md border border-border bg-background px-2.5 py-1.5 sm:max-w-[260px]">
              <option value="">{t.topics.uncategorized}</option>
              {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.emoji} {topic.name}</option>)}
            </Select>
            {current.topicId && <button onClick={() => void changeTopic('')} className="rounded px-2 py-1.5 text-muted-foreground hover:bg-muted">{t.topics.removeFromTopic}</button>}
            {!topics.length && <span className="text-muted-foreground">{t.topics.noTopicsHint}</span>}
          </div>
          {topicError && <p role="alert" className="mt-1 text-xs text-destructive">{topicError}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {aiRunning && <button className="rounded border px-3 py-2 text-sm" onClick={() => cancelAiTasks(current.id)}>停止 AI</button>}
        <div className="relative" onKeyDown={event => {
          if (event.key !== 'Escape' || !open) return
          event.preventDefault()
          setOpen(false)
          event.currentTarget.querySelector('button')?.focus()
        }}>
          <Button size="sm" variant="ghost" aria-label="导出采用稿" aria-expanded={open} title="导出采用稿" onClick={() => setOpen(!open)}>
            <Download className="h-4 w-4" /><span className="hidden lg:inline">导出</span>
          </Button>
          {open&&<><div className="fixed inset-0 z-40" onClick={()=>setOpen(false)}/><div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-card p-2 shadow-lg" aria-label="当前版本导出选项">
            <p className="break-words px-3 py-1 text-xs text-muted-foreground">采用稿 · {versionLabel(version)}</p>
            <p className="px-3 py-1 text-xs text-muted-foreground">{reviewStatus(version)}</p>
            <fieldset className="flex flex-wrap gap-3 px-3 py-2 text-sm"><legend className="sr-only">导出用途</legend>{(['reading', 'proofreading'] as const).map(value => <label key={value}><input type="radio" name="export-purpose" checked={purpose === value} onChange={() => setPurpose(value)} /> {value === 'reading' ? '阅读稿' : '校对稿'}</label>)}</fieldset>
            {(['txt','md','srt','vtt'] as const).map(format=><button key={format} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40" disabled={(format==='srt'||format==='vtt')&&!timed} onClick={()=>void download(format)}>{format==='md'?'Markdown':format.toUpperCase()}</button>)}
            {!timed&&<p className="p-2 text-xs text-muted-foreground">缺少有效逐句时间，字幕导出不可用；可在校对中填写时间，或导出 TXT / Markdown。</p>}
          </div></>}
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} title="关闭会话" aria-label="关闭会话"><X className="h-4 w-4" /></Button>
      </div>
    </div>
    {error&&<p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </div>
})
