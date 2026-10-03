import { describe, expect, it } from 'vitest'
import { canvasShapeOf, makeFieldsOf, makeFileName, swappableImagesOf, withHiddenImages, withImageSwaps } from '../makeFields'
import { buildTemplatePackage, parseTemplatePackage, templateFromPackage } from '../templatePackages'
import { TEMPLATE_LIBRARY } from '../../data/templates'
import type { SceneDefinition, SceneLayer } from '../../types/scene'

const base = { visible: true, opacity: 1 }
const text = (id: string, binding: string | undefined, y: number, height = 60, fontSize = 40): SceneLayer => ({
  ...base, id, name: id, kind: 'text', x: 0, y, width: 400, height, text: `${id} sample`, color: '#fff', fontSize, fontFamily: 'Inter', fontWeight: 400, binding,
})
const image = (id: string, swappable: boolean, y = 0): SceneLayer => ({ ...base, id, name: id, kind: 'image', x: 0, y, width: 100, height: 100, src: 'orig.png', fit: 'contain', ...(swappable ? { swappable } : {}) })
const scene = (layers: SceneLayer[], width = 1080, height = 1350): SceneDefinition => ({ id: 's', name: 's', width, height, background: '#000', layers })

describe('makeFieldsOf', () => {
  it('lists bound fields top to bottom, once each, with labels and samples', () => {
    const fields = makeFieldsOf(scene([text('b', 'quote_author', 500), text('a', 'quote', 100, 300), text('c', 'quote', 900), text('d', undefined, 0)]))
    expect(fields.map((field) => field.key)).toEqual(['quote', 'quote_author'])
    expect(fields[0]).toMatchObject({ label: 'Quote', sample: 'a sample', multiline: true, layerIds: ['a', 'c'] })
    expect(fields[1]).toMatchObject({ label: 'Quote Author', multiline: false })
  })

  it('labels unknown keys from the key', () => {
    expect(makeFieldsOf(scene([text('a', 'event_date', 0)]))[0].label).toBe('Event Date')
  })
})

describe('image swaps', () => {
  it('only offers and replaces swappable images, leaving geometry alone', () => {
    const original = scene([image('locked', false), image('photo', true, 50)])
    expect(swappableImagesOf(original).map((layer) => layer.id)).toEqual(['photo'])
    const swapped = withImageSwaps(original, { photo: 'new.png', locked: 'hack.png' })
    expect(swapped.layers.map((layer) => (layer.kind === 'image' ? layer.src : ''))).toEqual(['orig.png', 'new.png'])
    expect(swapped.layers[1]).toMatchObject({ x: 0, y: 50, width: 100, height: 100 })
    expect(withImageSwaps(original, {})).toBe(original)
  })

  it('keeps the Swappable flag through a template package (team library, import/export)', () => {
    const template = { id: 't', label: 'Photo', scene: scene([image('photo', true), image('logo', false)]) }
    const parsed = parseTemplatePackage(JSON.parse(JSON.stringify(buildTemplatePackage(template))))
    expect(parsed.ok ? 'ok' : parsed.error).toBe('ok')
    if (!parsed.ok) return
    const layers = templateFromPackage(parsed.value).scene.layers
    expect(layers.map((layer) => (layer.kind === 'image' ? Boolean(layer.swappable) : null))).toEqual([true, false])
  })
})

describe('canvasShapeOf / makeFileName', () => {
  it('sorts canvases into feed, story and wide', () => {
    expect(canvasShapeOf({ width: 1080, height: 1350 })).toBe('feed')
    expect(canvasShapeOf({ width: 1080, height: 1080 })).toBe('feed')
    expect(canvasShapeOf({ width: 1080, height: 1920 })).toBe('story')
    expect(canvasShapeOf({ width: 1280, height: 720 })).toBe('wide')
  })

  it('names the file from the template and the first filled field', () => {
    const fields = makeFieldsOf(scene([text('a', 'name', 0), text('b', 'title', 100)]))
    expect(makeFileName({ label: 'Quote Card' }, fields, { name: '  Jané Doe! ' })).toBe('quote-card_jane-doe.png')
    expect(makeFileName({ label: 'Quote Card' }, fields, { title: 'Senator' })).toBe('quote-card_senator.png')
    expect(makeFileName({ label: '' }, fields, {})).toBe('graphic.png')
  })
})

describe('leaving a photo out', () => {
  const template = (id: string) => TEMPLATE_LIBRARY.find((entry) => entry.id === id)!.scene
  const layer = (scene: SceneDefinition, suffix: string) => scene.layers.find((entry) => entry.id.endsWith(suffix))!

  it('hides the headshot and its ring, and re-centers the quote and author', () => {
    const scene = template('template-quote-card')
    const out = withHiddenImages(scene, [layer(scene, '-headshot').id])
    expect(layer(out, '-headshot').visible).toBe(false)
    expect(layer(out, '-headshot-ring').visible).toBe(false)
    // Headshot (220) plus its 30px gap is gone; the rest of the group moves up half of that.
    expect(layer(out, '-quote').y).toBe(layer(scene, '-quote').y - 125)
    expect(layer(out, '-author').y).toBe(layer(scene, '-author').y - 125)
    // The frame, background shapes and quote marks stay put.
    for (const suffix of ['-frame-top', '-frame-bottom', '-circle-a', '-mark-open', '-mark-close']) {
      expect(layer(out, suffix)).toEqual(layer(scene, suffix))
    }
  })

  it('leaves text in other columns alone (YouTube photo on the right)', () => {
    const scene = template('template-youtube-thumbnail')
    const out = withHiddenImages(scene, ['image-yt-photo'])
    expect(layer(out, 'image-yt-photo').visible).toBe(false)
    expect(out.layers.filter((entry) => entry.id !== 'image-yt-photo')).toEqual(scene.layers.filter((entry) => entry.id !== 'image-yt-photo'))
  })

  it('closes the gap from both sides when text sits above and below', () => {
    const text = (id: string, y: number, height: number) =>
      ({ id, kind: 'text', name: id, x: 0, y, width: 400, height, text: id, color: '#fff', fontSize: 40, fontFamily: 'x', opacity: 1, visible: true }) as SceneLayer
    const scene = {
      id: 's', name: 's', width: 400, height: 1000, background: '#000',
      layers: [
        text('top', 100, 100),
        { id: 'photo', kind: 'image', name: 'Photo', x: 50, y: 240, width: 300, height: 300, src: 'x', fit: 'cover', swappable: true, opacity: 1, visible: true },
        text('bottom', 580, 100),
      ],
    } as SceneDefinition
    const out = withHiddenImages(scene, ['photo'])
    const top = out.layers.find((entry) => entry.id === 'top')!
    const bottom = out.layers.find((entry) => entry.id === 'bottom')!
    // 40px gaps on each side and a 300px photo: one 40px gap stays, each side moves 170.
    expect(top.y).toBe(270)
    expect(bottom.y).toBe(410)
    expect(bottom.y - (top.y + top.height)).toBe(40)
  })

  it('ignores ids that are not swappable images', () => {
    const scene = template('template-quote-card')
    expect(withHiddenImages(scene, [layer(scene, '-quote').id])).toBe(scene)
  })
})
