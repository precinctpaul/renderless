import { describe, expect, test } from 'vitest'
import { lexContentStream, stripTextAndBoxes } from '../illustrator/pdfContent'
import {
  findBoxForBlock,
  groupRunsIntoBlocks,
  matchFontFamily,
  parsePdfFontName,
  suggestFontFamily,
  type FilledRect,
  type PdfTextRun,
} from '../illustrator/textLayout'
import { describeOffBrandColor, nearestBrandColor } from '../brandPalette'

describe('PDF content stream editing', () => {
  test('lexer finds operators and skips strings that contain operator-like text', () => {
    const ops = lexContentStream('q 1 0 0 1 10 20 cm BT /F1 12 Tf (ET re BT) Tj ET Q')
    expect(ops.map((op) => op.op)).toEqual(['q', 'cm', 'BT', 'Tf', 'Tj', 'ET', 'Q'])
    expect(ops.find((op) => op.op === 'Tj')?.operands).toEqual(['(ET re BT)'])
  })

  test('removes text objects and only the matching box rectangle, keeping layer markers', () => {
    const source = [
      '/OC /MC0 BDC 0 0 1920 1080 re W n /Im0 Do EMC',
      '/OC /MC3 BDC 0.067 0.067 0.067 rg 1835.666 93.457 -1756.437 286.682 re f',
      'BT /T1_0 1 Tf 90 0 0 90 104 258.2 Tm [(WE DESER)10 (VE)]TJ ET EMC',
    ].join('\n')
    const { content, removedText, removedBoxes } = stripTextAndBoxes(source, [{ x: 79.229, y: 93.457, width: 1756.437, height: 286.682 }])

    expect(removedText).toBe(1)
    expect(removedBoxes).toBe(1)
    expect(content).not.toContain('BT')
    expect(content).toContain('0 0 0 0 re f')
    expect(content).toContain('0 0 1920 1080 re W n /Im0 Do EMC')
    expect(content).toContain('/OC /MC3 BDC')
  })
})

describe('font matching', () => {
  test('parses subset prefixes, styles and trial names', () => {
    expect(parsePdfFontName('BCWBYW+DrukTextWideTrial-Bold')).toEqual({ family: 'DrukTextWide', style: 'Bold', trial: true })
    expect(suggestFontFamily('BCWBYW+DrukTextWideTrial-Bold')).toBe('DrukTextWide Bold Trial')
  })

  test('matches uploaded families regardless of separators, case and the Trial suffix', () => {
    const library = ['Recoleta Regular', 'DrukTextWide Bold Trial', 'DrukWide Super Trial']
    expect(matchFontFamily('BCWBYW+DrukTextWideTrial-Bold', library)).toBe('DrukTextWide Bold Trial')
    expect(matchFontFamily('ABCDEF+Recoleta-Regular', library)).toBe('Recoleta Regular')
    expect(matchFontFamily('ABCDEF+DrukWide-Medium', library)).toBeNull()
  })
})

const run = (overrides: Partial<PdfTextRun>): PdfTextRun => ({
  text: 'TEXT',
  x: 0,
  baseline: 0,
  width: 100,
  fontSize: 90,
  fontName: 'g_d0_f1',
  color: '#E2E785',
  section: 3,
  order: 0,
  ...overrides,
})

describe('text blocks and boxes', () => {
  test('groups center-aligned lines into one block with their line spacing', () => {
    const blocks = groupRunsIntoBlocks([
      run({ text: 'WE DESERVE THE CHANCE ', x: 104, baseline: 821.8, width: 1685.5, order: 136 }),
      run({ text: 'TO PURSUE HAPPINESS', x: 202.5, baseline: 929.8, width: 1515.1, order: 138 }),
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0].lines.map((line) => line.text)).toEqual(['WE DESERVE THE CHANCE', 'TO PURSUE HAPPINESS'])
    expect(blocks[0].align).toBe('center')
    expect(blocks[0].lineGap).toBeCloseTo(108, 0)
  })

  test('keeps differently styled or distant text in separate blocks', () => {
    const blocks = groupRunsIntoBlocks([
      run({ text: 'HEADLINE', baseline: 100, order: 1 }),
      run({ text: 'caption', baseline: 190, fontSize: 30, order: 2 }),
      run({ text: 'FAR AWAY', baseline: 900, order: 3 }),
    ])
    expect(blocks).toHaveLength(3)
  })

  test('pairs a block with the smallest filled rectangle behind it in the same layer', () => {
    const [block] = groupRunsIntoBlocks([
      run({ text: 'WE DESERVE THE CHANCE', x: 104, baseline: 821.8, width: 1685.5, order: 136 }),
      run({ text: 'TO PURSUE HAPPINESS', x: 202.5, baseline: 929.8, width: 1515.1, order: 138 }),
    ])
    const rect = (overrides: Partial<FilledRect>): FilledRect => ({
      x: 79.2,
      y: 699.9,
      width: 1756.4,
      height: 286.7,
      fill: '#111111',
      section: 3,
      order: 130,
      local: { x: 0, y: 0, width: 0, height: 0 },
      ...overrides,
    })

    const box = rect({})
    const background = rect({ x: 0, y: 0, width: 1920, height: 1080, order: 10 })
    const otherLayer = rect({ section: 1 })
    const paintedAfter = rect({ order: 200 })
    expect(findBoxForBlock(block, [background, otherLayer, paintedAfter, box], 1920 * 1080)).toBe(box)
    expect(findBoxForBlock(block, [background, otherLayer], 1920 * 1080)).toBeNull()
  })
})

describe('brand colors', () => {
  test('flags near-miss colors without touching exact or unrelated ones', () => {
    expect(nearestBrandColor('#E7EB94')?.distance).toBe(0)
    expect(describeOffBrandColor('#E2E785', 'Text color')).toContain('Acid Green #E7EB94')
    expect(describeOffBrandColor('#111111', 'Box')).toBeNull()
    expect(describeOffBrandColor('#7A3FD2', 'Accent')).toBeNull()
  })
})
