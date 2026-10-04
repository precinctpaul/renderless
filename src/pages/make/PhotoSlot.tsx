import { useRef } from 'react'
import { AlertTriangle, ImageUp, RotateCcw } from 'lucide-react'
import { photoAdvice } from '../../lib/imageFraming'
import type { ImageLayer } from '../../types/scene'
import { PhotoFramer } from './PhotoFramer'
import type { MakeState } from './useMake'

interface PhotoSlotProps {
  make: MakeState
  slot: ImageLayer
}

/**
 * One replaceable photo: upload, recent team photos, the full library, and (once a photo is in)
 * framing with plain-words warnings about size and shape.
 */
export function PhotoSlot({ make, slot }: PhotoSlotProps) {
  const { swaps, framing, setFraming, swapImage, uploadPhoto, pickLibraryPhoto, recentImages, libraryImages, scene } = make
  const fileInput = useRef<HTMLInputElement>(null)
  const src = swaps[slot.id]
  const frame = framing[slot.id]
  // The slot as this layout draws it (layouts change a photo's shape).
  const shown = scene?.layers.find((layer): layer is ImageLayer => layer.id === slot.id && layer.kind === 'image') ?? slot
  const round = Boolean(shown.radius && shown.radius >= Math.min(shown.width, shown.height) / 2 - 1)
  const advice = frame ? photoAdvice(frame, shown.width, shown.height) : []
  const others = libraryImages.filter((entry) => !recentImages.includes(entry))

  return (
    <div className="photo-slot">
      {src && frame ? (
        <>
          <PhotoFramer
            src={src}
            framing={frame}
            slotWidth={shown.width}
            slotHeight={shown.height}
            round={round}
            label={slot.name}
            onChange={(patch) => setFraming(slot.id, patch)}
          />
          <p className="photo-slot__hint">Drag to choose what stays in the shot. The frame shows this layout&apos;s crop.</p>
        </>
      ) : (
        <img className="make-image__thumb" src={src ?? slot.src} alt="" />
      )}

      {advice.map((item) => (
        <p key={item.kind} className="photo-slot__warning">
          <AlertTriangle size={13} aria-hidden="true" />
          {item.message}
        </p>
      ))}

      <div className="make-image__actions">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void uploadPhoto(slot.id, file)
          }}
        />
        <button type="button" className="btn btn--small" onClick={() => fileInput.current?.click()}>
          <ImageUp size={14} />
          Upload photo
        </button>
        {others.length > 0 ? (
          <select
            className="make-image__library"
            aria-label={`Choose ${slot.name} from the team library`}
            value=""
            onChange={(event) => {
              const entry = libraryImages.find((image) => image.id === event.target.value)
              if (entry) void pickLibraryPhoto(slot.id, entry)
            }}
          >
            <option value="">All library images…</option>
            {libraryImages.map((image) => (
              <option key={image.id} value={image.id}>
                {image.name}
              </option>
            ))}
          </select>
        ) : null}
        {src ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => swapImage(slot.id, null)}>
            <RotateCcw size={14} />
            Use original
          </button>
        ) : null}
      </div>

      {recentImages.length > 0 ? (
        <div className="photo-shelf" role="group" aria-label="Recent team photos">
          <span className="photo-shelf__label">Recent</span>
          <div className="photo-shelf__row">
            {recentImages.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`photo-shelf__item ${entry.dataUrl === src ? 'photo-shelf__item--active' : ''}`.trim()}
                aria-pressed={entry.dataUrl === src}
                title={entry.name}
                onClick={() => void pickLibraryPhoto(slot.id, entry)}
              >
                <img src={entry.dataUrl} alt={entry.name} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
