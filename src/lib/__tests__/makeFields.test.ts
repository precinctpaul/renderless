import { describe, expect, it } from 'vitest'
import { canvasShapeOf, makeFieldsOf, makeFileName, swappableImagesOf, withImageSwaps } from '../makeFields'
import { buildTemplatePackage, parseTemplatePackage, templateFromPackage } from '../templatePackages'
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
