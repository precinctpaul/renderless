import type { TextBoxStyle } from '../types/scene'
import { NumberField } from './NumberField'

/** New boxes default to the brand's near-black (#111111) with comfortable padding. */
const DEFAULT_TEXT_BOX: TextBoxStyle = {
  fill: '#111111',
  paddingTop: 16,
  paddingRight: 24,
  paddingBottom: 16,
  paddingLeft: 24,
  radius: 0,
}

interface TextBoxInspectorProps {
  box: TextBoxStyle | undefined
  onChange: (box: TextBoxStyle | null) => void
}

export function TextBoxInspector({ box, onChange }: TextBoxInspectorProps) {
  return (
    <div className="inspector-section">
      <div className="inspector-section__label">Text Box</div>
      <label className="inspector-toggle">
        <input type="checkbox" checked={Boolean(box)} onChange={(event) => onChange(event.target.checked ? { ...DEFAULT_TEXT_BOX } : null)} />
        Box grows and shrinks with the text
      </label>
      {box ? (
        <>
          <label>
            Box Fill
            <input className="mono" value={box.fill} onChange={(event) => onChange({ ...box, fill: event.target.value })} />
          </label>
          <div className="transform-grid">
            <label>
              Padding H
              <NumberField
                min={0}
                value={Math.round((box.paddingLeft + box.paddingRight) / 2)}
                onCommit={(value) => onChange({ ...box, paddingLeft: value, paddingRight: value })}
              />
            </label>
            <label>
              Padding V
              <NumberField
                min={0}
                value={Math.round((box.paddingTop + box.paddingBottom) / 2)}
                onCommit={(value) => onChange({ ...box, paddingTop: value, paddingBottom: value })}
              />
            </label>
            <label>
              Radius
              <NumberField
                min={0}
                value={box.radius ?? 0}
                onCommit={(value) => onChange({ ...box, radius: Math.max(0, value) })}
              />
            </label>
          </div>
        </>
      ) : null}
    </div>
  )
}
