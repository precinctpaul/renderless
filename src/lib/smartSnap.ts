import type { SceneLayer } from '../types/scene'
import { resolveAnchor } from './layerAnchor'

/** Scene-space lines a dragged selection can snap to. */
export interface SnapTargets {
  x: number[]
  y: number[]
}

export interface SmartSnapResult {
  /** Total drag delta after snapping (scene units). */
  delta: { x: number; y: number }
  /** The line snapped to on each axis, for drawing; null when that axis didn't snap. */
  lineX: number | null
  lineY: number | null
}

interface Extents {
  x: number[]
  y: number[]
}

/** Left/center/right and top/middle/bottom of a box, plus its anchor point. */
function layerExtents(layer: SceneLayer): Extents {
  const anchor = resolveAnchor(layer)
  return {
    x: [layer.x, layer.x + layer.width / 2, layer.x + layer.width, layer.x + anchor.x],
    y: [layer.y, layer.y + layer.height / 2, layer.y + layer.height, layer.y + anchor.y],
  }
}

/** Edges and centers of the whole moving selection, plus each moving layer's anchor. */
function selectionExtents(layers: SceneLayer[]): Extents {
  const left = Math.min(...layers.map((layer) => layer.x))
  const right = Math.max(...layers.map((layer) => layer.x + layer.width))
  const top = Math.min(...layers.map((layer) => layer.y))
  const bottom = Math.max(...layers.map((layer) => layer.y + layer.height))
  const anchors = layers.map((layer) => resolveAnchor(layer))
  return {
    x: [left, (left + right) / 2, right, ...layers.map((layer, index) => layer.x + anchors[index].x)],
    y: [top, (top + bottom) / 2, bottom, ...layers.map((layer, index) => layer.y + anchors[index].y)],
  }
}

/** Everything a drag can snap to: canvas edges and center, guides, other visible layers. */
export function collectSnapTargets(
  canvas: { width: number; height: number },
  others: SceneLayer[],
  guides: SnapTargets,
): SnapTargets {
  const x = [0, canvas.width / 2, canvas.width, ...guides.x]
  const y = [0, canvas.height / 2, canvas.height, ...guides.y]
  others
    .filter((layer) => layer.visible)
    .forEach((layer) => {
      const extents = layerExtents(layer)
      x.push(...extents.x)
      y.push(...extents.y)
    })
  return { x, y }
}

function snapAxis(candidates: number[], targets: number[], delta: number, threshold: number) {
  let best: { distance: number; adjust: number; line: number } | null = null
  for (const candidate of candidates) {
    const moved = candidate + delta
    for (const target of targets) {
      const distance = Math.abs(target - moved)
      if (distance <= threshold && (!best || distance < best.distance)) best = { distance, adjust: target - moved, line: target }
    }
  }
  return best
}

/**
 * Snaps a drag. `moving` are the dragged layers at their positions when the drag started and
 * `delta` the total pointer movement since then; axes in `lockedAxes` (Shift lock) don't move.
 */
export function computeSmartSnap(
  moving: SceneLayer[],
  delta: { x: number; y: number },
  targets: SnapTargets,
  threshold: number,
  lockedAxes: { x: boolean; y: boolean } = { x: false, y: false },
): SmartSnapResult {
  if (moving.length === 0) return { delta, lineX: null, lineY: null }
  const extents = selectionExtents(moving)
  const snapX = lockedAxes.x ? null : snapAxis(extents.x, targets.x, delta.x, threshold)
  const snapY = lockedAxes.y ? null : snapAxis(extents.y, targets.y, delta.y, threshold)
  return {
    delta: { x: delta.x + (snapX?.adjust ?? 0), y: delta.y + (snapY?.adjust ?? 0) },
    lineX: snapX?.line ?? null,
    lineY: snapY?.line ?? null,
  }
}
