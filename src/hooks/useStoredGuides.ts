import { useState } from 'react'

/** A user guide: a vertical line at scene x, or a horizontal line at scene y. */
export interface StageGuide {
  id: string
  axis: 'x' | 'y'
  position: number
}

const GUIDES_STORAGE_KEY = 'renderless.guides.v1'

function readAllGuides(): Record<string, StageGuide[]> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(GUIDES_STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StageGuide[]>) : {}
  } catch {
    return {}
  }
}

function isGuide(value: unknown): value is StageGuide {
  const guide = value as StageGuide
  return Boolean(guide) && typeof guide.id === 'string' && (guide.axis === 'x' || guide.axis === 'y') && Number.isFinite(guide.position)
}

/** Guides for one template, remembered in this browser. */
export function useStoredGuides(storageKey: string): [StageGuide[], (next: StageGuide[]) => void] {
  const [state, setState] = useState(() => ({ key: storageKey, guides: (readAllGuides()[storageKey] ?? []).filter(isGuide) }))
  // Switching templates loads that template's guides.
  const guides = state.key === storageKey ? state.guides : (readAllGuides()[storageKey] ?? []).filter(isGuide)

  const setGuides = (next: StageGuide[]) => {
    setState({ key: storageKey, guides: next })
    try {
      const all = readAllGuides()
      if (next.length > 0) all[storageKey] = next
      else delete all[storageKey]
      window.localStorage.setItem(GUIDES_STORAGE_KEY, JSON.stringify(all))
    } catch {
      // Storage unavailable: guides still work for this session.
    }
  }

  return [guides, setGuides]
}
