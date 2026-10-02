import { describe, expect, test } from 'vitest'
import { collectSnapTargets, computeSmartSnap } from '../smartSnap'
import type { SceneLayer } from '../../types/scene'

const box = (id: string, x: number, y: number, width = 200, height = 100): SceneLayer => ({
  id,
  kind: 'shape',
  name: id,
  x,
  y,
  width,
  height,
  fill: '#111111',
  radius: 0,
  opacity: 1,
  visible: true,
})

const canvas = { width: 1920, height: 1080 }

describe('smart snapping', () => {
  test('a dragged layer snaps its center to the canvas center', () => {
    const moving = [box('a', 100, 100)]
    const targets = collectSnapTargets(canvas, [], { x: [], y: [] })
    // Center starts at 200; moving 757 puts it at 957, within 6 of 960.
    const result = computeSmartSnap(moving, { x: 757, y: 0 }, targets, 6)
    expect(result.delta.x).toBe(760)
    expect(result.lineX).toBe(960)
  })

  test('edges snap to another layer and to guides', () => {
    const moving = [box('a', 0, 500)]
    const other = box('b', 600, 0)
    const targets = collectSnapTargets(canvas, [other], { x: [], y: [300] })
    // Left edge to the other layer's right edge (800); top edge to the guide at 300.
    const result = computeSmartSnap(moving, { x: 797, y: -198 }, targets, 6)
    expect(result.delta).toEqual({ x: 800, y: -200 })
    expect(result.lineY).toBe(300)
  })

  test('nothing nearby: the drag is untouched', () => {
    const result = computeSmartSnap([box('a', 0, 0)], { x: 333, y: 400 }, collectSnapTargets(canvas, [], { x: [], y: [] }), 6)
    expect(result).toEqual({ delta: { x: 333, y: 400 }, lineX: null, lineY: null })
  })

  test('hidden layers are not snap targets, and a Shift-locked axis never snaps', () => {
    const hidden = { ...box('h', 500, 500), visible: false }
    const targets = collectSnapTargets(canvas, [hidden], { x: [], y: [] })
    expect(targets.x).not.toContain(500)
    const result = computeSmartSnap([box('a', 100, 100)], { x: 757, y: 0 }, targets, 6, { x: true, y: false })
    expect(result.delta.x).toBe(757)
  })
})
