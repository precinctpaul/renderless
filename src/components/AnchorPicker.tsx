import { ANCHOR_PRESETS } from '../lib/layerAnchor'
import type { AnchorPresetId } from '../lib/layerAnchor'

interface AnchorPickerProps {
  /** Active preset, or null when the anchor is a custom point (or selections differ). */
  value: AnchorPresetId | null
  onChange: (preset: AnchorPresetId) => void
}

/** 3×3 anchor point picker. Picking a point moves the anchor only; the artwork stays put. */
export function AnchorPicker({ value, onChange }: AnchorPickerProps) {
  return (
    <div className="anchor-picker" role="radiogroup" aria-label="Anchor point">
      {ANCHOR_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-checked={value === preset.id}
          aria-label={preset.label}
          title={preset.label}
          className={`anchor-picker__point ${value === preset.id ? 'anchor-picker__point--active' : ''}`.trim()}
          onClick={() => onChange(preset.id)}
        />
      ))}
    </div>
  )
}
