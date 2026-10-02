import { useState } from 'react'
import { CANVAS_PRESETS, parseCanvasSize, presetForSize } from '../lib/canvasPresets'

interface CanvasSizeSelectProps {
  width: number
  height: number
  onChange: (size: { width: number; height: number }) => void
}

/** Canvas size picker: common presets, or "Custom..." to type any size. */
export function CanvasSizeSelect({ width, height, onChange }: CanvasSizeSelectProps) {
  const preset = presetForSize(width, height)
  return (
    <label className="canvas-size-select">
      <span className="canvas-size-select__label">Canvas</span>
      <select
        className="mono"
        value={preset?.id ?? 'custom'}
        onChange={(event) => {
          if (event.target.value === 'custom') {
            const typed = window.prompt('Canvas size in pixels (width x height)', `${width}x${height}`)
            const size = typed ? parseCanvasSize(typed) : null
            if (size) onChange(size)
            return
          }
          const next = CANVAS_PRESETS.find((entry) => entry.id === event.target.value)
          if (next) onChange({ width: next.width, height: next.height })
        }}
      >
        {CANVAS_PRESETS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label} ({entry.width}×{entry.height})
          </option>
        ))}
        <option value="custom">{preset ? 'Custom size…' : `Custom (${width}×${height})…`}</option>
      </select>
    </label>
  )
}

interface NewTemplateDialogProps {
  defaultSize: { width: number; height: number }
  onCreate: (name: string, size: { width: number; height: number }) => void
  onCancel: () => void
}

/** Name + size for a blank template. */
export function NewTemplateDialog({ defaultSize, onCreate, onCancel }: NewTemplateDialogProps) {
  const [name, setName] = useState('Untitled Template')
  const [size, setSize] = useState(defaultSize)
  const [customDraft, setCustomDraft] = useState(`${defaultSize.width}x${defaultSize.height}`)
  const preset = presetForSize(size.width, size.height)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="modal new-template-dialog"
        role="dialog"
        aria-label="New template"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onCreate(name.trim(), size)
        }}
      >
        <div className="panel-title">New Template</div>
        <label className="field-label">
          Name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="field-label">
          Size
          <div className="new-template-dialog__sizes">
            {CANVAS_PRESETS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`new-template-dialog__size ${preset?.id === entry.id ? 'new-template-dialog__size--active' : ''}`.trim()}
                onClick={() => {
                  setSize({ width: entry.width, height: entry.height })
                  setCustomDraft(`${entry.width}x${entry.height}`)
                }}
              >
                <span
                  className="new-template-dialog__shape"
                  style={entry.width >= entry.height ? { width: 28, height: Math.round((28 * entry.height) / entry.width) } : { height: 28, width: Math.round((28 * entry.width) / entry.height) }}
                  aria-hidden
                />
                <span className="new-template-dialog__size-label">{entry.label}</span>
                <span className="mono new-template-dialog__size-px">{entry.width}×{entry.height}</span>
              </button>
            ))}
          </div>
          <input
            className="mono"
            aria-label="Custom size"
            value={customDraft}
            placeholder="Custom, e.g. 1500x500"
            onChange={(event) => {
              setCustomDraft(event.target.value)
              const parsed = parseCanvasSize(event.target.value)
              if (parsed) setSize(parsed)
            }}
          />
        </div>
        <div className="new-template-dialog__actions">
          <button type="button" className="btn btn--small btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--small btn--accent" disabled={!name.trim()}>
            Create {size.width}×{size.height}
          </button>
        </div>
      </form>
    </div>
  )
}
