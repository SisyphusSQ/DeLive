import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ActionDialogAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
}

interface ActionDialogProps {
  open: boolean
  title: string
  description: string
  actions: ActionDialogAction[]
  onClose: () => void
}

const actionClassMap: Record<NonNullable<ActionDialogAction['variant']>, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
}

export function ActionDialog({
  open,
  title,
  description,
  actions,
  onClose,
}: ActionDialogProps) {
  const titleId=useId(), panel=useRef<HTMLDivElement>(null), closeRef=useRef(onClose)
  closeRef.current=onClose
  useEffect(() => {
    if (!open) return undefined

    const previous=document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();closeRef.current()
      }
      if(event.key==='Tab'){
        const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')??[])
        const first=items[0],last=items[items.length-1]
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {document.removeEventListener('keydown', handleKeyDown);if(previous?.isConnected)previous.focus()}
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[640px] max-h-[calc(100dvh-40px)] overflow-auto rounded-xl border border-border bg-card text-card-foreground shadow-2xl dark:ring-1 dark:ring-white/[0.08]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
            <h3 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭对话框"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap justify-end gap-3 px-5 py-4">
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              onClick={action.onClick}
              className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors ${
                actionClassMap[action.variant || 'secondary']
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>, document.body
  )
}
