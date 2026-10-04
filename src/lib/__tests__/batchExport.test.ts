import { describe, expect, it } from 'vitest'
import { planBatch, renderBatchZip } from '../batchExport'
import { makeFieldsOf } from '../makeFields'
import { TEMPLATE_LIBRARY } from '../../data/templates'
import { unzipSync } from 'fflate'

const template = TEMPLATE_LIBRARY.find((entry) => entry.id === 'template-youtube-thumbnail')!
const fields = makeFieldsOf(template.scene)
const sheet = {
  sourceName: 'test',
  columns: [
    { key: 'headline', label: 'Headline' },
    { key: 'subhead', label: 'Subhead' },
  ],
  rows: [
    { headline: 'Smith Wins', subhead: 'Turnout up' },
    { headline: 'Jones Wins', subhead: '' },
    { headline: 'Smith Wins', subhead: 'Again' },
    { headline: '', subhead: 'No headline here' },
  ],
}
const mapping = { headline: 'headline', subhead: 'subhead' }

describe('batch export plan', () => {
  const items = planBatch({ template, scene: template.scene, fields, values: {}, sheet, mapping })

  it('makes one graphic per row, named from the row, with repeats numbered', () => {
    expect(items.map((item) => item.fileName)).toEqual([
      'youtube-thumbnail_smith-wins.png',
      'youtube-thumbnail_jones-wins.png',
      'youtube-thumbnail_smith-wins-2.png',
      'youtube-thumbnail_no-headline-here.png',
    ])
    expect(items[0].story.bindings).toMatchObject({ headline: 'Smith Wins', subhead: 'Turnout up' })
  })

  it('turns an optional field off when its cell is empty, instead of showing sample text', () => {
    const subhead = items[1].scene.layers.find((layer) => layer.id === 'text-yt-subhead')!
    expect(subhead.visible).toBe(false)
    expect(items[0].scene.layers.find((layer) => layer.id === 'text-yt-subhead')!.visible).toBe(true)
  })

  it('names rows missing a required field', () => {
    expect(items[3].problems).toEqual(['missing Headline'])
    expect(items[0].problems).toEqual([])
  })

  it('falls back to what was typed for empty cells', () => {
    const typed = planBatch({ template, scene: template.scene, fields, values: { headline: 'Typed' }, sheet, mapping })
    expect(typed[3].story.bindings.headline).toBe('Typed')
    expect(typed[3].problems).toEqual([])
  })
})

describe('batch zip', () => {
  it('packs every rendered PNG under its name, and stops when cancelled', async () => {
    const items = planBatch({ template, scene: template.scene, fields, values: {}, sheet, mapping })
    const png = 'data:image/png;base64,' + btoa('PNGDATA')
    const progress: number[] = []
    const zip = await renderBatchZip(items, async () => png, (count) => progress.push(count), () => false)
    const files = unzipSync(new Uint8Array(await zip!.arrayBuffer()))
    expect(Object.keys(files)).toEqual(items.map((item) => item.fileName))
    expect(new TextDecoder().decode(files[items[0].fileName])).toBe('PNGDATA')
    expect(progress).toEqual([1, 2, 3, 4])
    let calls = 0
    expect(await renderBatchZip(items, async () => png, () => calls++, () => calls >= 2)).toBeNull()
  })
})
