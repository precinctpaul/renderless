import { describe, expect, it } from 'vitest'
import { framingImageStyle, framingWindow, photoAdvice } from '../imageFraming'
import { buildTemplatePackage, parseTemplatePackage, templateFromPackage } from '../templatePackages'
import type { ImageFraming, SceneDefinition } from '../../types/scene'

// A 1920x1080 editorial photo whose subject sits right of center.
const photo = (patch: Partial<ImageFraming> = {}): ImageFraming => ({ x: 0.7, y: 0.4, zoom: 1, imageWidth: 1920, imageHeight: 1080, ...patch })

describe('framing a cover photo', () => {
  it('centers the subject in a narrow slot', () => {
    // Half-width YouTube slot (640x720): the window is 960x1080 of the photo.
    const crop = framingWindow(photo(), 640, 720)
    expect(crop.width).toBeCloseTo(960)
    expect(crop.height).toBeCloseTo(1080)
    expect(crop.left + crop.width / 2).toBeCloseTo(0.7 * 1920)
  })

  it('never shows past the photo edge, however far out the subject is', () => {
    const crop = framingWindow(photo({ x: 0.98 }), 640, 720)
    expect(crop.left + crop.width).toBeCloseTo(1920)
    expect(framingWindow(photo({ x: 0 }), 640, 720).left).toBe(0)
  })

  it('zoom tightens the window around the subject', () => {
    const crop = framingWindow(photo({ zoom: 2 }), 640, 720)
    expect(crop.width).toBeCloseTo(480)
    expect(crop.left + crop.width / 2).toBeCloseTo(0.7 * 1920)
    expect(crop.top + crop.height / 2).toBeCloseTo(0.4 * 1080)
  })

  it('one framing works in every slot shape (same subject, different crops)', () => {
    for (const [w, h] of [[640, 720], [1280, 720], [240, 240], [1080, 486]]) {
      const crop = framingWindow(photo({ zoom: 1.3 }), w, h)
      expect(crop.left).toBeGreaterThanOrEqual(0)
      expect(crop.top).toBeGreaterThanOrEqual(0)
      expect(crop.left + crop.width).toBeLessThanOrEqual(1920.001)
      expect(crop.top + crop.height).toBeLessThanOrEqual(1080.001)
    }
  })

  it('turns into CSS: object-position for the window, scale for the zoom', () => {
    expect(framingImageStyle(photo(), 640, 720)).toEqual({ objectPosition: '90.000% 50.000%' })
    const zoomed = framingImageStyle(photo({ zoom: 2 }), 640, 720)
    expect(zoomed.transform).toBe('scale(2)')
    expect(zoomed.transformOrigin).toBe(zoomed.objectPosition)
  })
})

describe('photo advice', () => {
  it('warns when a photo will be enlarged a lot, and when its shape is far from the slot', () => {
    expect(photoAdvice(photo(), 640, 720)).toEqual([])
    expect(photoAdvice(photo({ imageWidth: 400, imageHeight: 300 }), 1280, 720).map((item) => item.kind)).toEqual(['soft'])
    expect(photoAdvice(photo(), 240, 240).map((item) => item.kind)).toEqual([])
    expect(photoAdvice(photo({ imageWidth: 3000, imageHeight: 800 }), 640, 720).map((item) => item.kind)).toEqual(['shape'])
  })
})

describe('framing survives a template package', () => {
  it('keeps the subject, zoom and photo size', () => {
    const scene: SceneDefinition = {
      id: 's', name: 's', width: 1280, height: 720, background: '#000',
      layers: [{ id: 'p', name: 'Photo', kind: 'image', x: 0, y: 0, width: 640, height: 720, src: 'x.png', fit: 'cover', swappable: true, opacity: 1, visible: true, framing: photo({ zoom: 1.5 }) }],
    }
    const parsed = parseTemplatePackage(JSON.parse(JSON.stringify(buildTemplatePackage({ id: 't', label: 'T', scene }))))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(templateFromPackage(parsed.value).scene.layers[0]).toMatchObject({ framing: photo({ zoom: 1.5 }) })
  })
})
