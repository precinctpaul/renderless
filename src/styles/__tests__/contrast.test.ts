/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Text contrast guard (WCAG AA, 4.5:1 for normal text). The token pairs are checked by math;
 * the stylesheets are scanned so colors known to fail can't come back as text colors.
 */

// Read from disk: Vitest blanks imported CSS, even with ?raw. Tests run from the project root.
const stylesDir = join(process.cwd(), 'src', 'styles')
const sheets = Object.fromEntries(
  readdirSync(stylesDir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => [name, readFileSync(join(stylesDir, name), 'utf8')]),
)
const brandCss = sheets['brand.css']

function token(name: string): string {
  const match = brandCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Token --${name} missing from brand.css`)
  return match[1]
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

const UI_BACKGROUNDS = ['bg-main', 'bg-sidebar', 'bg-panel', 'bg-list', 'bg-field', 'bg-button']
const TEXT_TOKENS = ['milk', 'muted', 'red-text', 'amber', 'acid']

/** Selectors allowed to color text acid: canvas guide readouts match the acid guide lines. */
const ACID_TEXT_ALLOWED = ['.user-guide__readout', '.sheet-match__summary--ok svg', '.sheet-chip--matched .sheet-chip__icon']

/** Text colors that fail on the dark UI (or on blue) and must not be used as `color:`. */
const FAILING_TEXT_COLORS = [
  /#777777\b/i,
  /#999999\b/i,
  /#555555\b/i,
  /#3c77bb\b/i,
  /#ed2426\b/i,
  /var\(--(zinc-300|zinc-400|zinc-500|muted-dim|red|red-600|blue|blue-500|blue-600)\)/,
]

function colorDeclarations() {
  const found: Array<{ file: string; selector: string; value: string }> = []
  for (const [file, css] of Object.entries(sheets)) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const rule of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().replace(/\s+/g, ' ')
      for (const declaration of rule[2].matchAll(/(?:^|;)\s*color\s*:\s*([^;]+)/g)) {
        found.push({ file, selector, value: declaration[1].trim() })
      }
    }
  }
  return found
}

describe('UI text contrast', () => {
  it('reads the real stylesheets', () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(8)
    expect(colorDeclarations().length).toBeGreaterThan(100)
  })

  it('every text token reaches 4.5:1 on every UI background', () => {
    const failures = TEXT_TOKENS.flatMap((text) =>
      UI_BACKGROUNDS.map((background) => ({ text, background, ratio: contrast(token(text), token(background)) })),
    ).filter((pair) => pair.ratio < 4.5)
    expect(failures).toEqual([])
  })

  it('text on brand blue and on acid buttons reaches 4.5:1', () => {
    expect(contrast(token('text-on-blue'), token('blue'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('ink'), token('acid'))).toBeGreaterThanOrEqual(4.5)
  })

  it('no stylesheet uses a failing color for text', () => {
    const offenders = colorDeclarations()
      .filter((entry) => FAILING_TEXT_COLORS.some((pattern) => pattern.test(entry.value)))
      .map((entry) => `${entry.file} ${entry.selector} { color: ${entry.value} }`)
    expect(offenders).toEqual([])
  })

  it('acid text is kept for primary buttons (no small acid labels)', () => {
    const offenders = colorDeclarations()
      .filter((entry) => /var\(--(acid|green-500|amber-500)\)|#e7eb94/i.test(entry.value))
      .filter((entry) => !ACID_TEXT_ALLOWED.some((selector) => entry.selector === selector))
      .map((entry) => `${entry.file} ${entry.selector} { color: ${entry.value} }`)
    expect(offenders).toEqual([])
  })
})
