import { describe, expect, it } from 'vitest'
import { canvasShapeOf, fieldToggleKey, isToggleOn, makeFieldsOf, makeFileName, swappableImagesOf, withImageSwaps, withVisibility } from '../makeFields'
import { layoutScene } from '../sceneLayout'
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
    expect(fields[1]).toMatchObject({ label: 'Speaker', multiline: false, optional: false })
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

describe('turning pieces off in Make', () => {
  const template = (id: string) => TEMPLATE_LIBRARY.find((entry) => entry.id === id)!.scene
  const find = (scene: SceneDefinition, suffix: string) => scene.layers.find((entry) => entry.id.endsWith(suffix))!
  const story = { bindings: {} }

  it('quote card: no headshot hides it and its ring, and the stack re-centers', () => {
    const scene = template('template-quote-card')
    const before = layoutScene(scene, story)
    const after = layoutScene(withVisibility(scene, { [find(scene, '-headshot').id]: false }), story)
    expect(find(after, '-headshot').visible).toBe(false)
    expect(find(after, '-headshot-ring').visible).toBe(false)
    // The headshot (240) and its 56px gap leave; the centered stack moves up by half of that.
    expect(find(before, '-quote').y - find(after, '-quote').y).toBe(148)
    expect(find(before, '-author').y - find(after, '-author').y).toBe(148)
  })

  it('optional text gets an On/Off switch and closes up when off', () => {
    const scene = template('template-youtube-thumbnail')
    const fields = makeFieldsOf(scene)
    expect(fields.map((field) => [field.key, field.optional])).toEqual([
      ['headline', false],
      ['subhead', true],
    ])
    const off = withVisibility(scene, { [fieldToggleKey('subhead')]: false, [fieldToggleKey('headline')]: false })
    expect(find(off, 'text-yt-subhead').visible).toBe(false)
    // Required fields can't be turned off.
    expect(find(off, 'text-yt-headline').visible).toBe(true)
  })

  it('lower third headshot ships off; turning it on slides the bar right', () => {
    const scene = template('template-lower-third')
    expect(isToggleOn(scene, {}, 'image-lt-photo')).toBe(false)
    const on = layoutScene(withVisibility(scene, { 'image-lt-photo': true }), story)
    expect(find(on, 'image-lt-photo')).toMatchObject({ visible: true, x: 120 })
    expect(find(on, 'shape-lt-bg').x).toBe(280)
    expect(find(on, 'text-lt-name').x).toBe(176 + 160)
  })

  it('templates without auto layout: text stacked around a hidden photo closes the gap from both sides', () => {
    const layer = (id: string, y: number, height: number) =>
      ({ id, kind: 'text', name: id, x: 0, y, width: 400, height, text: id, color: '#fff', fontSize: 40, fontFamily: 'x', opacity: 1, visible: true }) as SceneLayer
    const scene = {
      id: 's', name: 's', width: 400, height: 1000, background: '#000',
      layers: [
        layer('top', 100, 100),
        { id: 'photo', kind: 'image', name: 'Photo', x: 50, y: 240, width: 300, height: 300, src: 'x', fit: 'cover', swappable: true, opacity: 1, visible: true },
        layer('bottom', 580, 100),
      ],
    } as SceneDefinition
    const out = withVisibility(scene, { photo: false })
    const top = out.layers.find((entry) => entry.id === 'top')!
    const bottom = out.layers.find((entry) => entry.id === 'bottom')!
    // 40px gaps on each side and a 300px photo: one 40px gap stays, each side moves 170.
    expect(top.y).toBe(270)
    expect(bottom.y).toBe(410)
  })

  it('ignores ids that are not swappable images or optional text', () => {
    const scene = template('template-quote-card')
    expect(withVisibility(scene, { [find(scene, '-quote').id]: false })).toBe(scene)
  })
})

describe('auto layout survives a template package', () => {
  it('keeps flows, shrink-to-fit, optional text and duotone', () => {
    const scene = TEMPLATE_LIBRARY.find((entry) => entry.id === 'template-quote-card')!.scene
    const parsed = parseTemplatePackage(JSON.parse(JSON.stringify(buildTemplatePackage({ id: 't', label: 'Q', scene }))))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const back = templateFromPackage(parsed.value).scene
    expect(back.flows).toEqual(scene.flows)
    expect(back.layers.find((layer) => layer.id.endsWith('-title'))).toMatchObject({ optional: true, fit: { maxLines: 2, minFontSize: 24 } })
  })
})
