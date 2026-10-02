import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const COLLAPSED_STORAGE_KEY = 'renderless.inspector.collapsed.v1'

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeCollapsed(ids: Set<string>) {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage can be unavailable (private mode); collapsing still works for this session.
  }
}

interface InspectorSectionProps {
  /** Stable id used to remember the collapsed state across reloads. */
  id: string
  title: string
  children: ReactNode
}

/** Inspector panel section with a collapsible header that remembers how it was left. */
export function InspectorSection({ id, title, children }: InspectorSectionProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed().has(id))

  const toggle = () => {
    const ids = readCollapsed()
    if (collapsed) ids.delete(id)
    else ids.add(id)
    writeCollapsed(ids)
    setCollapsed(!collapsed)
  }

  return (
    <div className={`inspector-section ${collapsed ? 'inspector-section--collapsed' : ''}`.trim()}>
      <button type="button" className="inspector-section__header" aria-expanded={!collapsed} onClick={toggle}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <span className="inspector-section__label">{title}</span>
      </button>
      {collapsed ? null : <div className="inspector-section__body">{children}</div>}
    </div>
  )
}
