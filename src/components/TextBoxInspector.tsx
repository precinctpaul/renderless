import type { TextBoxStyle } from '../types/scene'

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

function toNumber(raw: string): number | null {
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) ? value : null
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
              <input
                className="mono"
                type="number"
                min={0}
                value={Math.round((box.paddingLeft + box.paddingRight) / 2)}
                onChange={(event) => {
                  const value = toNumber(event.target.value)
                  if (value !== null) onChange({ ...box, paddingLeft: value, paddingRight: value })
                }}
              />
            </label>
            <label>
              Padding V
              <input
                className="mono"
                type="number"
                min={0}
                value={Math.round((box.paddingTop + box.paddingBottom) / 2)}
                onChange={(event) => {
                  const value = toNumber(event.target.value)
                  if (value !== null) onChange({ ...box, paddingTop: value, paddingBottom: value })
                }}
              />
            </label>
            <label>
              Radius
              <input
                className="mono"
                type="number"
                min={0}
                value={box.radius ?? 0}
                onChange={(event) => {
                  const value = toNumber(event.target.value)
                  if (value !== null) onChange({ ...box, radius: Math.max(0, value) })
                }}
              />
            </label>
          </div>
        </>
      ) : null}
    </div>
  )
}
