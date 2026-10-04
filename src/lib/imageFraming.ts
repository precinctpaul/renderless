import type { ImageFraming } from '../types/scene'

/**
 * Cover-fit photo framing. A framing names the subject (x, y as 0-1 of the photo) and a zoom.
 * For any slot shape, the visible window is as large as cover-fit allows (divided by the zoom),
 * centered on the subject but never past the photo's edge, so one framing suits every layout.
 */

export interface FramingWindow {
  /** The visible part of the photo, in photo pixels. */
  left: number
  top: number
  width: number
  height: number
  /** Photo pixels to slot pixels (above 1 means the photo is being enlarged). */
  scale: number
  /** Where the window sits within the photo's slack, 0-1 (as CSS object-position). */
  alignX: number
  alignY: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function framingWindow(framing: ImageFraming, slotWidth: number, slotHeight: number): FramingWindow {
  const { imageWidth, imageHeight } = framing
  const zoom = Math.max(1, framing.zoom)
  const scale = Math.max(slotWidth / imageWidth, slotHeight / imageHeight) * zoom
  const width = slotWidth / scale
  const height = slotHeight / scale
  const slackX = imageWidth - width
  const slackY = imageHeight - height
  const left = slackX > 0.5 ? clamp(framing.x * imageWidth - width / 2, 0, slackX) : Math.max(0, slackX) / 2
  const top = slackY > 0.5 ? clamp(framing.y * imageHeight - height / 2, 0, slackY) : Math.max(0, slackY) / 2
  return {
    left,
    top,
    width,
    height,
    scale,
    alignX: slackX > 0.5 ? left / slackX : 0.5,
    alignY: slackY > 0.5 ? top / slackY : 0.5,
  }
}

/**
 * CSS for an <img> with object-fit: cover in a slot: object-position places the window, and a
 * scale about the same point zooms in without uncovering an edge.
 */
export function framingImageStyle(framing: ImageFraming, slotWidth: number, slotHeight: number) {
  const window = framingWindow(framing, slotWidth, slotHeight)
  const position = `${(window.alignX * 100).toFixed(3)}% ${(window.alignY * 100).toFixed(3)}%`
  return {
    objectPosition: position,
    ...(framing.zoom > 1 ? { transform: `scale(${framing.zoom})`, transformOrigin: position } : {}),
  }
}

export interface PhotoAdvice {
  kind: 'soft' | 'shape'
  message: string
}

/** Plain-words warnings: a photo that will look soft, or one far from the slot's shape. */
export function photoAdvice(framing: ImageFraming, slotWidth: number, slotHeight: number): PhotoAdvice[] {
  const advice: PhotoAdvice[] = []
  const { scale } = framingWindow(framing, slotWidth, slotHeight)
  if (scale > 1.5) {
    advice.push({
      kind: 'soft',
      message: `This photo is small for this spot and will look soft. Try one at least ${Math.round(slotWidth * framing.zoom)}×${Math.round(slotHeight * framing.zoom)} px.`,
    })
  }
  const shape = framing.imageWidth / framing.imageHeight / (slotWidth / slotHeight)
  if (shape > 2 || shape < 0.5) {
    advice.push({
      kind: 'shape',
      message: `This photo is much ${shape > 1 ? 'wider' : 'taller'} than its spot, so a lot of it is cropped. Check the framing.`,
    })
  }
  return advice
}
