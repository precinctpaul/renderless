import { describe, expect, it } from 'vitest'
import { layoutScene } from '../sceneLayout'
import type { SceneDefinition, SceneLayer, TextLayer } from '../../types/scene'

// Every glyph is half the font size wide: easy to reason about line breaks.
const measure = (text: string, font: string) => text.length * Number(/(\d+)px/.exec(font)![1]) * 0.5

const text = (id: string, extra: Partial<TextLayer> = {}): TextLayer => ({
  id, name: id, kind: 'text', x: 0, y: 0, width: 400, height: 100, text: id, color: '#fff', fontSize: 40, fontFamily: 'x', fontWeight: 700,
  opacity: 1, visible: true, ...extra,
})
const block = (id: string, height: number, extra: Partial<SceneLayer> = {}) =>
  ({ id, name: id, kind: 'shape', x: 0, y: 0, width: 100, height, fill: '#000', opacity: 1, visible: true, ...extra }) as SceneLayer
const scene = (layers: SceneLayer[], flows: SceneDefinition['flows'] = undefined): SceneDefinition => ({
  id: 's', name: 's', width: 1000, height: 1000, background: '#000', layers, ...(flows ? { flows } : {}),
})
const get = (s: SceneDefinition, id: string) => s.layers.find((layer) => layer.id === id)!
const story = (bindings: Record<string, string>) => ({ bindings })

describe('shrink to fit', () => {
  it('keeps the size when the words fit, and shrinks to stay within the line limit', () => {
    const layer = text('t', { binding: 'headline', fit: { maxLines: 2, minFontSize: 10 } })
    // 20 chars at 40px = 400px: one line.
    expect((get(layoutScene(scene([layer]), story({ headline: 'aaaaaaaaa aaaaaaaaaa' }), measure), 't') as TextLayer).fontSize).toBe(40)
    // Three 19-char words: one per line at 40px (3 lines), two per line needs <= 20px.
    const long = layoutScene(scene([layer]), story({ headline: 'aaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbb ccccccccccccccccccc' }), measure)
    expect((get(long, 't') as TextLayer).fontSize).toBe(20)
  })

  it('never goes below the minimum (the overflow warning takes over)', () => {
    const layer = text('t', { binding: 'q', fit: { maxLines: 1, minFontSize: 30 } })
    expect((get(layoutScene(scene([layer]), story({ q: 'x'.repeat(200) }), measure), 't') as TextLayer).fontSize).toBe(30)
  })

  it('leaves scenes without fit or flows untouched', () => {
    const plain = scene([text('t')])
    expect(layoutScene(plain, story({}), measure)).toBe(plain)
  })
})

describe('flows', () => {
  const flow = (justify: 'start' | 'center' | 'end') => [
    {
      id: 'f', axis: 'y' as const, start: 100, end: 900, justify,
      items: [
        { layerId: 'photo', gap: 0, with: ['ring'] },
        { layerId: 'quote', gap: 20 },
        { layerId: 'name', gap: 10 },
      ],
    },
  ]
  const layers = () => [block('ring', 220, { y: 90 }), block('photo', 200, { y: 100 }), text('quote', { binding: 'quote', lineHeight: 1 }), text('name')]

  it('stacks items at their real height and centers the stack', () => {
    // quote: one 40px line; name: one 40px line. Total 200 + 20 + 40 + 10 + 40 = 310, centered in 100..900.
    const out = layoutScene(scene(layers(), flow('center')), story({ quote: 'short' }), measure)
    expect(get(out, 'photo').y).toBe(345)
    expect(get(out, 'ring').y).toBe(335)
    expect(get(out, 'quote')).toMatchObject({ y: 565, height: 40 })
    expect(get(out, 'name').y).toBe(615)
  })

  it('grows with the words: a two-line quote pushes the name down', () => {
    const out = layoutScene(scene(layers(), flow('start')), story({ quote: 'aaaaaaaaaaaaaaa bbbbbbbbbbbbbbb' }), measure)
    expect(get(out, 'quote').height).toBe(80)
    expect(get(out, 'name').y).toBe(100 + 200 + 20 + 80 + 10)
  })

  it('a hidden item takes no room and hides what moves with it', () => {
    const hidden = layers().map((layer) => (layer.id === 'photo' ? { ...layer, visible: false } : layer))
    const out = layoutScene(scene(hidden, flow('start')), story({ quote: 'short' }), measure)
    expect(get(out, 'ring').visible).toBe(false)
    expect(get(out, 'quote').y).toBe(100)
    expect(get(out, 'name').y).toBe(150)
  })

  it('end-justified stacks sit on the end line', () => {
    const out = layoutScene(scene(layers(), flow('end')), story({ quote: 'short' }), measure)
    expect(get(out, 'name').y + get(out, 'name').height).toBe(900)
  })
})
