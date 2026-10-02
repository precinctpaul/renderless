import type { SceneLayer } from '../types/scene'

/**
 * Anchor point model (After Effects style): a layer's anchor is a point in its own box
 * (`anchorX`/`anchorY`, px from its top-left). Rotation and scale happen around it, and the
 * position shown in the editor is where the anchor sits on the canvas. Moving the anchor
 * never moves the artwork; only the reported position changes.
 */

export const ANCHOR_PRESETS = [
  { id: 'tl', label: 'Top left', fx: 0, fy: 0 },
  { id: 'tc', label: 'Top center', fx: 0.5, fy: 0 },
  { id: 'tr', label: 'Top right', fx: 1, fy: 0 },
  { id: 'cl', label: 'Center left', fx: 0, fy: 0.5 },
  { id: 'cc', label: 'Center', fx: 0.5, fy: 0.5 },
  { id: 'cr', label: 'Center right', fx: 1, fy: 0.5 },
  { id: 'bl', label: 'Bottom left', fx: 0, fy: 1 },
  { id: 'bc', label: 'Bottom center', fx: 0.5, fy: 1 },
  { id: 'br', label: 'Bottom right', fx: 1, fy: 1 },
] as const

export type AnchorPresetId = (typeof ANCHOR_PRESETS)[number]['id']

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * The layer's anchor in its own box. When none is set, text anchors at the center of its box
 * (so it aligns by its middle); shapes and images anchor at the top-left.
 */
export function resolveAnchor(layer: SceneLayer): { x: number; y: number } {
  const centered = layer.kind === 'text'
  return {
    x: Number.isFinite(layer.anchorX) ? (layer.anchorX ?? 0) : centered ? layer.width / 2 : 0,
    y: Number.isFinite(layer.anchorY) ? (layer.anchorY ?? 0) : centered ? layer.height / 2 : 0,
  }
}

const anchorOf = resolveAnchor

/** Where the anchor point sits on the canvas: the position the editor displays. */
export function anchorPosition(layer: SceneLayer): { x: number; y: number } {
  const anchor = anchorOf(layer)
  return { x: round2(layer.x + anchor.x), y: round2(layer.y + anchor.y) }
}

/** Box top-left that puts the anchor at the given canvas position. */
export function boxPositionForAnchorPosition(layer: SceneLayer, position: { x?: number; y?: number }): { x: number; y: number } {
  const anchor = anchorOf(layer)
  return {
    x: position.x === undefined ? layer.x : round2(position.x - anchor.x),
    y: position.y === undefined ? layer.y : round2(position.y - anchor.y),
  }
}

/**
 * Moves the anchor to a new point in the layer's box without moving the artwork.
 * With rotation or scale the box origin shifts to compensate, so pixels stay put.
 */
export function withAnchor(layer: SceneLayer, nextAnchor: { x: number; y: number }): SceneLayer {
  const current = anchorOf(layer)
  const dx = nextAnchor.x - current.x
  const dy = nextAnchor.y - current.y
  const radians = ((layer.rotation ?? 0) * Math.PI) / 180
  const sx = (layer.scaleX ?? 100) / 100
  const sy = (layer.scaleY ?? 100) / 100
  // Transform is rotate(r) scale(sx, sy) about the anchor: M = R * S. Keep pixels fixed with
  // box' = box + (M - I) * (anchor' - anchor).
  const mx = Math.cos(radians) * sx * dx - Math.sin(radians) * sy * dy
  const my = Math.sin(radians) * sx * dx + Math.cos(radians) * sy * dy
  return {
    ...layer,
    anchorX: round2(nextAnchor.x),
    anchorY: round2(nextAnchor.y),
    x: round2(layer.x + mx - dx),
    y: round2(layer.y + my - dy),
  }
}

export function anchorForPreset(layer: SceneLayer, presetId: AnchorPresetId): { x: number; y: number } {
  const preset = ANCHOR_PRESETS.find((entry) => entry.id === presetId) ?? ANCHOR_PRESETS[0]
  return { x: layer.width * preset.fx, y: layer.height * preset.fy }
}

/** The preset matching the layer's anchor, or null for a custom point. */
export function anchorPresetOf(layer: SceneLayer): AnchorPresetId | null {
  const anchor = anchorOf(layer)
  const match = ANCHOR_PRESETS.find(
    (preset) => Math.abs(layer.width * preset.fx - anchor.x) < 0.51 && Math.abs(layer.height * preset.fy - anchor.y) < 0.51,
  )
  return match?.id ?? null
}

export type AnchorAlignMode = 'left' | 'hCenter' | 'right' | 'top' | 'vMiddle' | 'bottom'

/**
 * Align by anchor point (After Effects style). One layer aligns its anchor to the canvas
 * edge/center; several layers align their anchors to each other's extremes.
 * Returns the new box positions by layer id.
 */
export function alignByAnchor(
  layers: SceneLayer[],
  mode: AnchorAlignMode,
  canvas: { width: number; height: number },
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (layers.length === 0) return result
  const anchors = layers.map((layer) => anchorPosition(layer))
  const single = layers.length === 1
  const minX = single ? 0 : Math.min(...anchors.map((a) => a.x))
  const maxX = single ? canvas.width : Math.max(...anchors.map((a) => a.x))
  const minY = single ? 0 : Math.min(...anchors.map((a) => a.y))
  const maxY = single ? canvas.height : Math.max(...anchors.map((a) => a.y))
  const target: { x?: number; y?: number } =
    mode === 'left' ? { x: minX }
    : mode === 'hCenter' ? { x: (minX + maxX) / 2 }
    : mode === 'right' ? { x: maxX }
    : mode === 'top' ? { y: minY }
    : mode === 'vMiddle' ? { y: (minY + maxY) / 2 }
    : { y: maxY }
  layers.forEach((layer) => result.set(layer.id, boxPositionForAnchorPosition(layer, target)))
  return result
}

/** Spaces anchor points evenly between the first and last along an axis. */
export function distributeByAnchor(layers: SceneLayer[], axis: 'horizontal' | 'vertical'): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()
  if (layers.length < 3) return result
  const key = axis === 'horizontal' ? 'x' : 'y'
  const sorted = [...layers].sort((a, b) => anchorPosition(a)[key] - anchorPosition(b)[key])
  const start = anchorPosition(sorted[0])[key]
  const end = anchorPosition(sorted[sorted.length - 1])[key]
  const step = (end - start) / (sorted.length - 1)
  sorted.forEach((layer, index) => result.set(layer.id, boxPositionForAnchorPosition(layer, { [key]: start + step * index })))
  return result
}
