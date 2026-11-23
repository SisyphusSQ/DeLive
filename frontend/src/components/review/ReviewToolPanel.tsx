import { useId, useState, type ReactNode } from 'react'
import './transcript-tools.css'
import { ChevronDown } from 'lucide-react'

export function ReviewToolPanel({ title, collapsedSummary, action, children }: { title: string; collapsedSummary: string; action: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const bodyId = useId()
  return <section className="review-tool-panel" aria-label={title}>
    <header>
      <h2><button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <ChevronDown size={14} aria-hidden="true" />{title}
      </button></h2>
      {!open && <span className="tool-collapsed-summary">{collapsedSummary}</span>}
      {action}
    </header>
    <div id={bodyId} className="review-tool-body" hidden={!open}>{children}</div>
  </section>
}
