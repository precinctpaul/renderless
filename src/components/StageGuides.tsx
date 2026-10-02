import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { StageGeometry } from './SceneRenderer'
import type { StageGuide } from '../hooks/useStoredGuides'

interface DragState {
  guideId: string
  axis: 'x' | 'y'
  isNew: boolean
}

interface GuideEditorState {
  guideId: string
  left: number
  top: number
  draft: string
}

const newGuideId = () => `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

interface UserGuidesProps {
  geometry: StageGeometry
  guides: StageGuide[]
  onChange: (next: StageGuide[]) => void
  /** Size of the ruler strips (px); releasing a guide over a ruler deletes it. */
  rulerSizePx: number
  snapStep: number | null
  /** Rulers are showing, so guides can be pulled out of them. */
  rulersVisible: boolean
  /** Guides are switched off: only a guide being dragged out of a ruler is drawn. */
  hidden: boolean
}

/**
 * User guides: drag from a ruler to create (top ruler makes a horizontal guide, left ruler a
 * vertical one), drag a guide back onto a ruler to delete it, right-click to type an exact value.
 */
export function UserGuides({ geometry, guides, onChange, rulerSizePx, snapStep, rulersVisible, hidden }: UserGuidesProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [dragOverRuler, setDragOverRuler] = useState(false)
  const [editor, setEditor] = useState<GuideEditorState | null>(null)
  const latest = useRef({ geometry, guides, onChange, snapStep })
  useEffect(() => {
    latest.current = { geometry, guides, onChange, snapStep }
  })

  const toScene = (axis: 'x' | 'y', clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect()
    const { geometry: g, snapStep: step } = latest.current
    if (!rect) return 0
    const raw = axis === 'x' ? (clientX - rect.left - g.stageLeftPx) / g.scale : (clientY - rect.top - g.stageTopPx) / g.scale
    return step ? Math.round(raw / step) * step : Math.round(raw)
  }

  const isOverRuler = (axis: 'x' | 'y', clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return false
    // Horizontal guides go back to the top ruler, vertical ones to the left ruler.
    return axis === 'y' ? clientY - rect.top < rulerSizePx : clientX - rect.left < rulerSizePx
  }

  useEffect(() => {
    if (!drag) return
    const handleMove = (event: PointerEvent) => {
      const position = toScene(drag.axis, event.clientX, event.clientY)
      setDragOverRuler(isOverRuler(drag.axis, event.clientX, event.clientY))
      const { guides: current, onChange: change } = latest.current
      change(current.map((guide) => (guide.id === drag.guideId ? { ...guide, position } : guide)))
    }
    const handleUp = (event: PointerEvent) => {
      const { guides: current, onChange: change } = latest.current
      if (isOverRuler(drag.axis, event.clientX, event.clientY)) change(current.filter((guide) => guide.id !== drag.guideId))
      setDrag(null)
      setDragOverRuler(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    // toScene/isOverRuler read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const startFromRuler = (axis: 'x' | 'y', event: ReactPointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setEditor(null)
    const guide: StageGuide = { id: newGuideId(), axis, position: toScene(axis, event.clientX, event.clientY) }
    onChange([...guides, guide])
    setDrag({ guideId: guide.id, axis, isNew: true })
  }

  const commitEditor = () => {
    if (!editor) return
    const value = Number(editor.draft)
    if (editor.draft.trim() !== '' && Number.isFinite(value)) {
      onChange(guides.map((guide) => (guide.id === editor.guideId ? { ...guide, position: Math.round(value * 100) / 100 } : guide)))
    }
    setEditor(null)
  }

  const { scale, stageLeftPx, stageTopPx } = geometry

  return (
    <div ref={rootRef} className="user-guides">
      {rulersVisible ? (
        <>
          <div
            className="guide-ruler-hit guide-ruler-hit--top"
            style={{ height: rulerSizePx }}
            title="Drag down to add a horizontal guide"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => startFromRuler('y', event)}
          />
          <div
            className="guide-ruler-hit guide-ruler-hit--left"
            style={{ width: rulerSizePx }}
            title="Drag right to add a vertical guide"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => startFromRuler('x', event)}
          />
        </>
      ) : null}
      {guides.filter((guide) => !hidden || guide.id === drag?.guideId).map((guide) => {
        const offset = Math.round((guide.axis === 'x' ? stageLeftPx : stageTopPx) + guide.position * scale)
        const active = drag?.guideId === guide.id
        return (
          <div
            key={guide.id}
            className={`user-guide user-guide--${guide.axis === 'x' ? 'v' : 'h'} ${active ? 'user-guide--dragging' : ''} ${active && dragOverRuler ? 'user-guide--deleting' : ''}`.trim()}
            style={guide.axis === 'x' ? { left: offset } : { top: offset }}
            title={`${guide.axis === 'x' ? 'X' : 'Y'} ${guide.position}px. Drag to move, drag onto the ruler to delete, right-click to type a value.`}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()
              setEditor(null)
              setDrag({ guideId: guide.id, axis: guide.axis, isNew: false })
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const rect = rootRef.current?.getBoundingClientRect()
              setEditor({
                guideId: guide.id,
                left: event.clientX - (rect?.left ?? 0) + 8,
                top: event.clientY - (rect?.top ?? 0) + 8,
                draft: String(guide.position),
              })
            }}
          >
            <span className="user-guide__line" />
            {active ? (
              <span className="user-guide__readout mono">{dragOverRuler ? 'Release to delete' : `${guide.axis === 'x' ? 'X' : 'Y'} ${guide.position}`}</span>
            ) : null}
          </div>
        )
      })}

      {editor ? (
        <form
          className="guide-editor"
          style={{ left: editor.left, top: editor.top }}
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault()
            commitEditor()
          }}
        >
          <label className="guide-editor__label">
            {guides.find((guide) => guide.id === editor.guideId)?.axis === 'x' ? 'Guide X (px)' : 'Guide Y (px)'}
            <input
              className="mono"
              type="number"
              autoFocus
              value={editor.draft}
              onChange={(event) => setEditor({ ...editor, draft: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditor(null)
              }}
            />
          </label>
          <div className="guide-editor__actions">
            <button type="submit" className="btn btn--small btn--accent">Set</button>
            <button
              type="button"
              className="btn btn--small btn--warning"
              onClick={() => {
                onChange(guides.filter((guide) => guide.id !== editor.guideId))
                setEditor(null)
              }}
            >
              Delete
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
