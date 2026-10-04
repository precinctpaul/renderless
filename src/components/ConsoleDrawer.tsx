import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const KEY = 'renderless.consoleDrawers.v1'

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/**
 * A collapsible settings panel under a Control Room monitor (Look, Outputs), so the center
 * console holds only what runs the show. Open or closed is remembered per panel.
 */
export function ConsoleDrawer({
  title,
  summary,
  storageKey,
  defaultOpen = false,
  children,
}: {
  title: string
  /** The current setting, shown even when closed (e.g. "Acid · Centered"). */
  summary?: string
  storageKey: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => readOpen()[storageKey] ?? defaultOpen)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [storageKey]: next }))
    } catch {
      // Remembered for this visit only.
    }
  }
  const id = `console-drawer-${storageKey}`
  return (
    <div className={`console-drawer ${open ? 'console-drawer--open' : ''}`.trim()}>
      <button type="button" className="console-drawer__toggle" aria-expanded={open} aria-controls={id} onClick={toggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        {summary ? <span className="console-drawer__summary">{summary}</span> : null}
      </button>
      {open ? (
        <div id={id} className="console-drawer__body">
          {children}
        </div>
      ) : null}
    </div>
  )
}
