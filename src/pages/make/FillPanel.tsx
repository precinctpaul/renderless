import { useRef } from 'react'
import { AlertTriangle, ImageUp, RotateCcw } from 'lucide-react'
import { SheetSection } from './SheetSection'
import type { MakeState } from './useMake'
import { fieldToggleKey, isToggleOn } from '../../lib/makeFields'

interface FillPanelProps {
  make: MakeState
  /** Fields whose text no longer fits its box on the canvas. */
  overflowKeys: Set<string>
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** One on/off control for everything a staffer can leave out (optional text, photos). */
function OnOffSwitch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Show ${label}`}
      className={`make-switch ${on ? 'make-switch--on' : ''}`.trim()}
      onClick={() => onChange(!on)}
    >
      <span className="make-switch__track" aria-hidden="true">
        <span className="make-switch__thumb" />
      </span>
      {on ? 'On' : 'Off'}
    </button>
  )
}

/**
 * Center column: the template's fill-in fields and replaceable images. Turning a piece off is
 * the only thing that moves the layout (the rest closes the gap); the template never changes.
 */
export function FillPanel({ make, overflowKeys }: FillPanelProps) {
  const { template, fields, values, imageSlots, swaps, toggles, libraryImages, setValue, clearValues, swapImage, setToggle } = make
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const hasContent =
    Object.values(values).some((value) => value.trim()) || Object.keys(swaps).length > 0 || Object.keys(toggles).length > 0

  if (!template) {
    return (
      <section className="panel make-fill" aria-label="Fill in">
        <div className="panel-title">2 · Fill in</div>
        <p className="make-empty">No templates yet. A template builder can add one in Studio → Design.</p>
      </section>
    )
  }

  return (
    <section className="panel make-fill" aria-label="Fill in">
      <div className="make-fill__head">
        <div className="panel-title">2 · Fill in</div>
        <button type="button" className="btn btn--small btn--ghost" onClick={clearValues} disabled={!hasContent}>
          <RotateCcw size={13} />
          Clear
        </button>
      </div>

      <SheetSection make={make} />

      {fields.length === 0 && imageSlots.length === 0 ? (
        <p className="make-empty">
          This template has nothing to fill in yet. A template builder can connect text layers to fields, or mark images as
          swappable, in Studio → Design.
        </p>
      ) : null}

      {fields.map((field) => {
        const value = values[field.key] ?? ''
        const overflowing = overflowKeys.has(field.key)
        const inputId = `make-field-${field.key}`
        const hintId = `${inputId}-hint`
        const common = {
          id: inputId,
          value,
          placeholder: field.sample,
          'aria-describedby': hintId,
          'aria-invalid': overflowing || undefined,
          onChange: (event: { target: { value: string } }) => setValue(field.key, event.target.value),
        }
        const on = !field.optional || !template || isToggleOn(template.scene, toggles, fieldToggleKey(field.key))
        return (
          <div key={field.key} className={`make-field ${overflowing && on ? 'make-field--overflow' : ''}`.trim()}>
            <div className="make-field__head">
              <label className="make-field__label" htmlFor={inputId}>
                {field.label}
              </label>
              {field.optional ? <OnOffSwitch label={field.label} on={on} onChange={(next) => setToggle(fieldToggleKey(field.key), next)} /> : null}
            </div>
            {!on ? (
              <p className="make-off-note">Off. Not in this graphic.</p>
            ) : (
              <>
                {field.multiline ? <textarea rows={field.key === 'quote' ? 4 : 2} {...common} /> : <input type="text" {...common} />}
                <div id={hintId} className="make-field__hint">
                  {overflowing ? (
                    <span className="make-field__warning">
                      <AlertTriangle size={13} aria-hidden="true" />
                      Too long to fit. Shorten it.
                    </span>
                  ) : (
                    <span>{value.trim() ? '' : 'Showing sample text'}</span>
                  )}
                  <span className="mono">{value.length}</span>
                </div>
              </>
            )}
          </div>
        )
      })}

      {imageSlots.map((slot) => {
        const current = swaps[slot.id] ?? slot.src
        const on = isToggleOn(template.scene, toggles, slot.id)
        return (
          <div key={slot.id} className="make-image">
            <div className="make-field__head">
              <div className="make-field__label">{slot.name}</div>
              <OnOffSwitch label={slot.name} on={on} onChange={(next) => setToggle(slot.id, next)} />
            </div>
            {!on ? (
              <p className="make-off-note">Off. Turn it on to add a {slot.name.toLowerCase()}.</p>
            ) : (
              <div className="make-image__row">
                <img className="make-image__thumb" src={current} alt="" />
                <div className="make-image__actions">
                  <input
                    ref={(node) => {
                      fileInputs.current[slot.id] = node
                    }}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) swapImage(slot.id, await readAsDataUrl(file))
                    }}
                  />
                  <button type="button" className="btn btn--small" onClick={() => fileInputs.current[slot.id]?.click()}>
                    <ImageUp size={14} />
                    Upload photo
                  </button>
                  {libraryImages.length > 0 ? (
                    <select
                      className="make-image__library"
                      aria-label={`Choose ${slot.name} from the team library`}
                      value=""
                      onChange={(event) => {
                        const entry = libraryImages.find((image) => image.id === event.target.value)
                        if (entry) swapImage(slot.id, entry.dataUrl)
                      }}
                    >
                      <option value="">From library…</option>
                      {libraryImages.map((image) => (
                        <option key={image.id} value={image.id}>
                          {image.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {swaps[slot.id] ? (
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => swapImage(slot.id, null)}>
                      Use original
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
