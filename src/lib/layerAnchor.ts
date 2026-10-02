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

function anchorOf(layer: SceneLayer) {
  return { x: Number.isFinite(layer.anchorX) ? (layer.anchorX ?? 0) : 0, y: Number.isFinite(layer.anchorY) ? (layer.anchorY ?? 0) : 0 }
}

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
