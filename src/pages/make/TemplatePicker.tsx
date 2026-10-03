import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { SceneRenderer } from '../../components/SceneRenderer'
import { canvasShapeOf, type CanvasShape } from '../../lib/makeFields'
import type { TemplateDefinition } from '../../types/scene'

const SHAPES: Array<{ value: CanvasShape | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'feed', label: 'Feed' },
  { value: 'story', label: 'Story' },
  { value: 'wide', label: 'Wide' },
]

const EMPTY_STORY = { bindings: {} }

interface TemplatePickerProps {
  templates: TemplateDefinition[]
  selectedId: string
  onSelect: (id: string) => void
}

/** Left column: every template, searchable and filterable by canvas shape. */
export function TemplatePicker({ templates, selectedId, onSelect }: TemplatePickerProps) {
  const [query, setQuery] = useState('')
  const [shape, setShape] = useState<CanvasShape | 'all'>('all')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return templates.filter(
      (template) =>
        (shape === 'all' || canvasShapeOf(template.scene) === shape) &&
        (!needle || template.label.toLowerCase().includes(needle)),
    )
  }, [templates, query, shape])

  return (
    <aside className="panel make-templates" aria-label="Templates">
      <div className="panel-title">1 · Template</div>
      <div className="make-templates__tools">
        <label className="make-search">
          <Search size={14} aria-hidden="true" />
          <input type="search" placeholder="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search templates" />
        </label>
        <div className="make-shapes" role="group" aria-label="Canvas shape">
          {SHAPES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`make-chip ${shape === option.value ? 'make-chip--active' : ''}`.trim()}
              aria-pressed={shape === option.value}
              onClick={() => setShape(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="make-template-list">
        {visible.length === 0 ? <p className="make-empty">No templates match.</p> : null}
        {visible.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`make-template ${template.id === selectedId ? 'make-template--active' : ''}`.trim()}
            aria-pressed={template.id === selectedId}
            onClick={() => onSelect(template.id)}
          >
            <span className="make-template__thumb" style={{ aspectRatio: `${template.scene.width} / ${template.scene.height}` }}>
              <SceneRenderer scene={template.scene} story={EMPTY_STORY} checkerboard />
            </span>
            <span className="make-template__text">
              <span className="make-template__name">{template.label}</span>
              <span className="make-template__size mono">
                {template.scene.width}×{template.scene.height}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  )
}
