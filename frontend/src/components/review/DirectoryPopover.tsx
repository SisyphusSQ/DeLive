import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function DirectoryPopover({ anchor, title, onClose, children }: { anchor: HTMLButtonElement; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const dismiss = useRef(onClose)
  dismiss.current = onClose
  useLayoutEffect(() => {
    if (!anchor.isConnected) dismiss.current()
  })
  useLayoutEffect(() => {
    const panel = ref.current!
    function position() {
      const rect = anchor.getBoundingClientRect()
      const list = anchor.closest('.directory-list')?.getBoundingClientRect()
      if (list && (rect.bottom <= list.top || rect.top >= list.bottom)) {
        dismiss.current()
        return
      }
      const maxX = window.innerWidth - panel.offsetWidth - 8
      panel.style.left = Math.max(8, Math.min(rect.right - panel.offsetWidth, maxX)) + 'px'
      const top = rect.bottom + panel.offsetHeight + 12 <= window.innerHeight ? rect.bottom + 4 : rect.top - panel.offsetHeight - 4
      panel.style.top = Math.max(8, Math.min(top, window.innerHeight - panel.offsetHeight - 8)) + 'px'
    }
    position()
    panel.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true })
    const observer = new ResizeObserver(position)
    observer.observe(panel)
    const reposition = () => position()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => { observer.disconnect(); window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition) }
  }, [anchor, title])
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !anchor.contains(event.target)) dismiss.current()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        anchor.focus({ preventScroll: true })
        dismiss.current()
      }
    }
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
    }
  }, [anchor])
  return createPortal(<div className="directory-popup" ref={ref} role="dialog" aria-label={title}>{children}</div>, document.body)
}
