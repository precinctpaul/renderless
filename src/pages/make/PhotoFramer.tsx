import { useRef } from 'react'
import { framingWindow } from '../../lib/imageFraming'
import type { ImageFraming } from '../../types/scene'

interface PhotoFramerProps {
  src: string
  framing: ImageFraming
  slotWidth: number
  slotHeight: number
  round: boolean
  label: string
  onChange: (patch: Partial<Pick<ImageFraming, 'x' | 'y' | 'zoom'>>) => void
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 1)

/**
 * The whole photo with this layout's crop drawn on it. Drag (or use the arrow keys) to choose
 * what stays in the shot; the zoom slider tightens the crop. The same framing follows the photo
 * into every layout and style.
 */
export function PhotoFramer({ src, framing, slotWidth, slotHeight, round, label, onChange }: PhotoFramerProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const crop = framingWindow(framing, slotWidth, slotHeight)
  // Sized from the photo's shape so a tall photo is never squashed (at most 240px tall).
  const aspect = framing.imageWidth / framing.imageHeight
  const pct = (value: number, total: number) => `${(value / total) * 100}%`

  const centerAt = (clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    onChange({ x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) })
  }

  return (
    <div className="photo-framer">
      <div
        ref={boxRef}
        className="photo-framer__photo"
        style={{ aspectRatio: `${framing.imageWidth} / ${framing.imageHeight}`, width: `min(100%, ${Math.round(240 * aspect)}px)` }}
        role="group"
        tabIndex={0}
        aria-label={`Framing for ${label}: drag the frame, or use the arrow keys and + / -`}
        onPointerDown={(event) => {
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          centerAt(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (dragging.current) centerAt(event.clientX, event.clientY)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerCancel={() => {
          dragging.current = false
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.02
          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
          if (moves[event.key]) {
            event.preventDefault()
            onChange({ x: clamp(framing.x + moves[event.key][0]), y: clamp(framing.y + moves[event.key][1]) })
          } else if (event.key === '+' || event.key === '=') {
            onChange({ zoom: Math.min(3, framing.zoom + 0.1) })
          } else if (event.key === '-') {
            onChange({ zoom: Math.max(1, framing.zoom - 0.1) })
          }
        }}
      >
        <img src={src} alt="" draggable={false} />
        <span
          className={`photo-framer__window ${round ? 'photo-framer__window--round' : ''}`.trim()}
          style={{
            left: pct(crop.left, framing.imageWidth),
            top: pct(crop.top, framing.imageHeight),
            width: pct(crop.width, framing.imageWidth),
            height: pct(crop.height, framing.imageHeight),
          }}
          aria-hidden="true"
        />
      </div>
      <label className="photo-framer__zoom">
        <span>Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={framing.zoom}
          onChange={(event) => onChange({ zoom: Number(event.target.value) })}
        />
        <span className="mono">{framing.zoom.toFixed(1)}×</span>
      </label>
    </div>
  )
}
