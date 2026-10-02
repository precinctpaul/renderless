import { describe, expect, test } from 'vitest'
import { anchorForPreset, anchorPosition, anchorPresetOf, boxPositionForAnchorPosition, withAnchor } from '../layerAnchor'
import type { SceneLayer } from '../../types/scene'

const layer: SceneLayer = {
  id: 'shape',
  kind: 'shape',
  name: 'Box',
  x: 100,
  y: 50,
  width: 200,
  height: 80,
  fill: '#111111',
  radius: 0,
  opacity: 1,
  visible: true,
}

/** Where a point of the layer's box lands on screen (rotate then scale about the anchor). */
function screenPoint(target: SceneLayer, px: number, py: number) {
  const ax = target.anchorX ?? 0
  const ay = target.anchorY ?? 0
  const r = ((target.rotation ?? 0) * Math.PI) / 180
  const sx = (target.scaleX ?? 100) / 100
  const sy = (target.scaleY ?? 100) / 100
  const dx = (px - ax) * sx
  const dy = (py - ay) * sy
  return { x: target.x + ax + Math.cos(r) * dx - Math.sin(r) * dy, y: target.y + ay + Math.sin(r) * dx + Math.cos(r) * dy }
}

describe('anchor point', () => {
  test('moving the anchor to center keeps the layer in place and reports the new position', () => {
    const centered = withAnchor(layer, anchorForPreset(layer, 'cc'))
    expect(centered).toMatchObject({ x: 100, y: 50, anchorX: 100, anchorY: 40 })
    expect(anchorPosition(centered)).toEqual({ x: 200, y: 90 })
    expect(anchorPresetOf(centered)).toBe('cc')
  })

  test('rotated and scaled artwork does not move when the anchor changes', () => {
    const transformed: SceneLayer = { ...layer, rotation: 30, scaleX: 150, scaleY: 80 }
    const moved = withAnchor(transformed, anchorForPreset(transformed, 'br'))
    for (const [px, py] of [[0, 0], [200, 80], [50, 20]]) {
      const before = screenPoint(transformed, px, py)
      const after = screenPoint(moved, px, py)
      expect(after.x).toBeCloseTo(before.x, 1)
      expect(after.y).toBeCloseTo(before.y, 1)
    }
  })

  test('typing a position places the anchor there', () => {
    const centered = withAnchor(layer, anchorForPreset(layer, 'cc'))
    expect(boxPositionForAnchorPosition(centered, { x: 960 })).toEqual({ x: 860, y: 50 })
  })

  test('a custom anchor point is not reported as a preset', () => {
    expect(anchorPresetOf({ ...layer, anchorX: 37, anchorY: 12 })).toBeNull()
    expect(anchorPresetOf(layer)).toBe('tl')
  })
})
