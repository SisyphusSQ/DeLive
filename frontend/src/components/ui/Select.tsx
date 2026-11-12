import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'multiple' | 'size'> & {
  onChange?: (event: { target: { value: string } }) => void
}
type Option = { value: string; label: ReactNode; text: string; disabled: boolean }
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child)) return []
    if (child.type === Fragment) return optionsFrom(child.props.children)
    if (child.type !== 'option') return []
    const text = Children.toArray(child.props.children).join('')
    return [{ value: String(child.props.value ?? text), label: child.props.children, text, disabled: !!child.props.disabled }]
  })
}

/** Application-owned single-choice menu, including keyboard navigation and focus return. */
export function Select({ children, value, onChange, disabled, className = '', id, 'aria-label': label, 'aria-labelledby': labelledBy, title, name }: Props) {
  const options = optionsFrom(children), selected = options.findIndex(option => option.value === String(value ?? ''))
  const [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, height: 280 })
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const search = useRef({ text: '', at: 0 }), menuId = useId()
  const show = () => {
    if (disabled) return
    const rect = button.current!.getBoundingClientRect(), below = window.innerHeight - rect.bottom - 12
    const height = Math.min(280, Math.max(below, rect.top - 12)), width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24)
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: below >= height ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), width, height })
    setActive(selected >= 0 && !options[selected].disabled ? selected : Math.max(0, options.findIndex(option => !option.disabled)))
    setOpen(true)
  }
  const close = (returnFocus = true) => { setOpen(false); if (returnFocus) button.current?.focus() }
  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange?.({ target: { value: option.value } }); close()
  }
  useEffect(() => {
    if (!open) return
    menu.current?.focus()
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false) }
    const layout = () => setOpen(false)
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', layout)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', layout) }
  }, [open])
  useEffect(() => { if (open) document.getElementById(`${menuId}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, open, menuId])
  return <>
    <button ref={button} id={id} type="button" name={name} role="combobox" aria-label={label} aria-labelledby={labelledBy}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} title={title}
      className={`inline-flex min-w-0 items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${className}`}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() }
      }}><span className="min-w-0 truncate">{options[selected]?.label ?? '请选择'}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" /></button>
    {open && createPortal(<div ref={menu} id={menuId} role="listbox" tabIndex={-1} aria-label={label} aria-labelledby={labelledBy}
      aria-activedescendant={options[active] ? `${menuId}-${active}` : undefined}
      className="fixed z-[200] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
      style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
        if (event.key === 'Tab') { close(); return }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); return }
        const enabled = options.map((option, i) => option.disabled ? -1 : i).filter(i => i >= 0)
        if (!enabled.length) return
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          const index = enabled.indexOf(active)
          setActive(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1] : enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length])
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          search.current = { text: (Date.now() - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), at: Date.now() }
          const match = options.findIndex(option => !option.disabled && option.text.toLocaleLowerCase().startsWith(search.current.text))
          if (match >= 0) setActive(match)
        }
      }}>
      {options.map((option, i) => <div key={option.value} id={`${menuId}-${i}`} role="option" aria-selected={i === selected} aria-disabled={option.disabled}
        className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm ${i === active ? 'bg-accent text-accent-foreground' : ''} ${option.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        onPointerMove={() => { if (!option.disabled) setActive(i) }} onClick={() => choose(i)}>
        <Check className={`h-3.5 w-3.5 shrink-0 ${i === selected ? '' : 'invisible'}`} /><span className="break-words">{option.label}</span>
      </div>)}
      {!options.length && <p className="px-3 py-2 text-sm text-muted-foreground">暂无选项</p>}
    </div>, document.body)}
  </>
}
