import { useState } from 'react'
import { X, Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { canExportTimed, downloadReview, selectedReviewVersion, versionLabel } from '../../utils/reviewVersions'
import { useSessionStore } from '../../stores/sessionStore'

interface SessionHeaderProps { session:TranscriptSession;onClose:()=>void;sidebarCollapsed?:boolean;onToggleSidebar?:()=>void }
export function SessionHeader({session,onClose,sidebarCollapsed,onToggleSidebar}:SessionHeaderProps) {
  const current=useSessionStore(s=>s.sessions.find(item=>item.id===session.id))??session
  const version=selectedReviewVersion(current),[open,setOpen]=useState(false),[error,setError]=useState('')
  const timed=canExportTimed(version)
  const download=(format:'txt'|'md'|'srt'|'vtt')=>{
    try{downloadReview(current,format);setError('');setOpen(false)}catch(e){setError((e as Error).message)}
  }
  return <div className="border-b border-border bg-muted/30 px-5 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar&&<button aria-label={sidebarCollapsed?'显示会话列表':'隐藏会话列表'} className="rounded border p-2" onClick={onToggleSidebar}>{sidebarCollapsed?<PanelLeftOpen className="h-4 w-4"/>:<PanelLeftClose className="h-4 w-4"/>}</button>}
        <div className="min-w-0"><h2 id="session-review-title" className="truncate text-lg font-semibold">{current.title}</h2><p className="text-xs text-muted-foreground">{current.date} {current.time} · {version.text.length} 字 · {versionLabel(version)}</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative"><button className="flex items-center gap-2 rounded border bg-background px-3 py-2 text-sm" onClick={()=>setOpen(!open)}><Download className="h-4 w-4"/>导出当前版本</button>
          {open&&<><div className="fixed inset-0 z-40" onClick={()=>setOpen(false)}/><div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-card p-2 shadow-lg" aria-label="当前版本导出选项">
            {(['txt','md','srt','vtt'] as const).map(format=><button key={format} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-40" disabled={(format==='srt'||format==='vtt')&&!timed} onClick={()=>download(format)}>{format==='md'?'Markdown':format.toUpperCase()}</button>)}
            {!timed&&<p className="p-2 text-xs text-muted-foreground">缺少有效逐句时间，字幕导出不可用；可在校对中填写时间，或导出 TXT / Markdown。</p>}
          </div></>}
        </div>
        <button className="rounded p-2 hover:bg-muted" onClick={onClose} aria-label="关闭会话"><X className="h-5 w-5"/></button>
      </div>
    </div>
    {error&&<p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </div>
}
