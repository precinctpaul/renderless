/**
 * The Majority Democrats looks every built-in template can switch between. Colors come from
 * brand/guidelines; every text pairing below is at least 4.5:1, except white on red (4.3:1),
 * which is only used for large display type (3:1 is the minimum there). Red never sits on blue.
 */

export type StyleId = 'acid' | 'signal' | 'retro'

export interface BrandStyle {
  id: StyleId
  name: string
  /** One line for the picker's tooltip. */
  blurb: string
  /** Colors shown in the picker swatch, background first. */
  swatches: string[]
  /** Canvas background (lower thirds: the name bar). */
  bg: string
  /** Body text on bg (quotes, titles). */
  text: string
  /** Display text on bg (headlines, names). */
  display: string
  /** Decorative bars and rules (never text). */
  rule: string
  /** Name/subhead tag: a box with its own text color, or null for plain text. */
  tag: { fill: string; text: string; radius: number } | null
  /** Secondary tag (YouTube subhead). */
  subTag: { fill: string; text: string; radius: number }
  /** Big decorative quote marks. */
  mark: string
  /** Ring around round headshots. */
  ring: string
  /** Placeholder photo colors. */
  photo: { bg: string; figure: string }
  /** Duotone for photos (retro), or none. */
  tone?: { dark: string; light: string }
  /** Retro sportswear stripes, drawn in this order. */
  stripes?: string[]
}

export const BRAND = {
  ink: '#111111',
  acid: '#E7EB94',
  blue: '#3C77BB',
  red: '#ED2426',
  white: '#FFFFFF',
  milk: '#F9FBED',
  green: '#345F54',
  orange: '#F06238',
  yellow: '#F9CA23',
  pepper: '#F57E21',
} as const

export const BRAND_STYLES: BrandStyle[] = [
  {
    id: 'acid',
    name: 'Acid',
    blurb: 'Black, acid green and white: the house look.',
    swatches: [BRAND.ink, BRAND.acid, BRAND.milk],
    bg: BRAND.ink,
    text: BRAND.milk,
    display: BRAND.acid,
    rule: BRAND.acid,
    tag: null,
    subTag: { fill: BRAND.milk, text: BRAND.ink, radius: 0 },
    mark: BRAND.acid,
    ring: BRAND.acid,
    photo: { bg: '#2A2A2A', figure: '#444444' },
  },
  {
    id: 'signal',
    name: 'Signal',
    blurb: 'Blue field, white type, red tags: breaking-news energy.',
    swatches: [BRAND.blue, BRAND.white, BRAND.red],
    bg: BRAND.blue,
    text: BRAND.white,
    display: BRAND.white,
    rule: BRAND.ink,
    tag: { fill: BRAND.red, text: BRAND.white, radius: 0 },
    subTag: { fill: BRAND.ink, text: BRAND.white, radius: 0 },
    mark: BRAND.ink,
    ring: BRAND.white,
    photo: { bg: '#2D5A8E', figure: '#5B8FCB' },
  },
  {
    id: 'retro',
    name: 'Retro',
    blurb: 'Secondary palette: vintage sportswear stripes, pill tags, duotone photos.',
    swatches: [BRAND.milk, BRAND.green, BRAND.orange, BRAND.yellow],
    bg: BRAND.milk,
    text: BRAND.green,
    display: BRAND.green,
    rule: BRAND.orange,
    tag: { fill: BRAND.green, text: BRAND.yellow, radius: 999 },
    subTag: { fill: BRAND.orange, text: BRAND.ink, radius: 999 },
    mark: BRAND.orange,
    ring: BRAND.orange,
    photo: { bg: '#D9DDCB', figure: '#9DAA97' },
    tone: { dark: BRAND.green, light: BRAND.milk },
    stripes: [BRAND.yellow, BRAND.orange, BRAND.pepper],
  },
]

export const DEFAULT_STYLE_ID: StyleId = 'acid'

export function brandStyle(id: string | undefined): BrandStyle {
  return BRAND_STYLES.find((style) => style.id === id) ?? BRAND_STYLES[0]
}

export function isStyleId(value: unknown): value is StyleId {
  return BRAND_STYLES.some((style) => style.id === value)
}
