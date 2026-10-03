import type { ImageLayer, SceneDefinition, SceneFlow, SceneLayer, StoryState, TemplateDefinition, TextLayer } from '../types/scene'
import { STORY_DEFAULTS } from './storySchema'
import { BRAND, brandStyle, DEFAULT_STYLE_ID, type BrandStyle, type StyleId } from './brandStyles'

export const DEFAULT_STORY_STATE: StoryState = STORY_DEFAULTS

const DRUK_WIDE = '"Druk Wide", "Archivo Expanded", "Arial Black", sans-serif'
const DRUK = '"Druk", Oswald, "Arial Narrow", sans-serif'
const RECOLETA = '"Recoleta", Georgia, serif'

/** How a built-in template is drawn: a brand style, a layout, and layers the staffer turned off. */
export interface TemplateLook {
  style: StyleId
  layout?: string
  /** Layer ids left out (Make), so a layout can use the room (e.g. a wider headline without a photo). */
  off?: ReadonlySet<string>
  /** Layer ids turned on that ship off (e.g. the lower third headshot), so a layout can make room. */
  on?: ReadonlySet<string>
}

export interface TemplateLayoutOption {
  id: string
  label: string
}

/** A built-in template: a builder that draws it in any style and layout. */
export interface SmartTemplate {
  id: string
  label: string
  favorite?: boolean
  layouts?: TemplateLayoutOption[]
  build: (look: TemplateLook) => SceneDefinition
}

const rect = (id: string, name: string, x: number, y: number, width: number, height: number, fill: string, extra: Partial<SceneLayer> = {}): SceneLayer =>
  ({ id, kind: 'shape', name, x, y, width, height, fill, opacity: 1, visible: true, ...extra }) as SceneLayer

const text = (layer: Omit<TextLayer, 'kind' | 'opacity' | 'visible'> & Partial<Pick<TextLayer, 'visible'>>): TextLayer => ({
  kind: 'text',
  opacity: 1,
  visible: true,
  ...layer,
})

/** A neutral head-and-shoulders placeholder; staffers replace it with a real photo in Make. */
function photoPlaceholder(background: string, figure: string, width: number, height: number): string {
  const size = Math.min(width, height)
  const cx = width / 2
  const head = size * 0.2
  const headY = height * 0.4
  const shoulderY = headY + head * 1.25
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    `<circle cx="${cx}" cy="${headY}" r="${head}" fill="${figure}"/>` +
    `<path d="M${cx - size * 0.42} ${height}C${cx - size * 0.42} ${shoulderY + head * 0.2} ${cx - size * 0.2} ${shoulderY} ${cx} ${shoulderY}` +
    `S${cx + size * 0.42} ${shoulderY + head * 0.2} ${cx + size * 0.42} ${height}Z" fill="${figure}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function photo(id: string, name: string, style: BrandStyle, x: number, y: number, width: number, height: number, extra: Partial<ImageLayer> = {}): ImageLayer {
  return {
    id,
    kind: 'image',
    name,
    x,
    y,
    width,
    height,
    src: photoPlaceholder(style.photo.bg, style.photo.figure, width, height),
    fit: 'cover',
    swappable: true,
    opacity: 1,
    visible: true,
    ...(style.tone ? { tone: style.tone } : {}),
    ...extra,
  }
}

const rgba = (hex: string, alpha: number) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Retro sportswear stripes: full-width bands (horizontal) or a short stack (vertical). */
function stripes(prefix: string, colors: string[], x: number, y: number, length: number, thickness: number, gap: number, axis: 'x' | 'y'): SceneLayer[] {
  return colors.map((color, index) => {
    const offset = index * (thickness + gap)
    return axis === 'x'
      ? rect(`${prefix}-${index + 1}`, `Stripe ${index + 1}`, x, y + offset, length, thickness, color)
      : rect(`${prefix}-${index + 1}`, `Stripe ${index + 1}`, x + offset, y, thickness, length, color)
  })
}

// ---------- Quote cards (feed 4:5 and story 9:16; three layouts) ----------

const QUOTE_LAYOUTS: TemplateLayoutOption[] = [
  { id: 'centered', label: 'Centered' },
  { id: 'byline', label: 'Byline' },
  { id: 'photo-top', label: 'Big photo' },
]

type Align = 'left' | 'center'

const quoteMark = (id: string, style: BrandStyle, x: number, y: number, size: number) =>
  text({
    id: `${id}-mark-open`,
    name: 'Quote Mark',
    x,
    y,
    width: 220,
    height: 220,
    text: '“',
    color: style.mark,
    fontSize: size,
    fontFamily: RECOLETA,
    fontWeight: 700,
    align: 'left',
    verticalAlign: 'top',
  })

const quoteBody = (id: string, style: BrandStyle, x: number, y: number, width: number, size: number, maxLines: number, align: Align) =>
  text({
    id: `${id}-quote`,
    name: 'Quote',
    x,
    y,
    width,
    height: 400,
    text: 'Your quote goes here.',
    binding: 'quote',
    color: style.text,
    fontSize: size,
    fontFamily: RECOLETA,
    fontWeight: 700,
    lineHeight: 1.12,
    align,
    fit: { maxLines, minFontSize: 36 },
  })

const quoteAuthor = (id: string, style: BrandStyle, x: number, y: number, width: number, size: number, align: Align) =>
  text({
    id: `${id}-author`,
    name: 'Speaker',
    x,
    y,
    width,
    height: size + (style.tag ? 24 : 0),
    text: 'Speaker Name',
    binding: 'quote_author',
    color: style.tag ? style.tag.text : style.display,
    fontSize: size,
    fontFamily: DRUK,
    fontWeight: 700,
    align,
    fit: { maxLines: 1, minFontSize: 40 },
    // Druk's letters sit low in their line: a taller line and more padding below keep them inside the tag.
    ...(style.tag
      ? {
          lineHeight: 1.12,
          box: { fill: style.tag.fill, paddingTop: 12, paddingRight: 34, paddingBottom: 14, paddingLeft: 34, radius: style.tag.radius },
        }
      : {}),
  })

const quoteTitle = (id: string, style: BrandStyle, x: number, y: number, width: number, size: number, align: Align) =>
  text({
    id: `${id}-title`,
    name: 'Speaker Title',
    x,
    y,
    width,
    height: 90,
    text: 'Title, Organization',
    binding: 'title',
    color: style.text,
    fontSize: size,
    fontFamily: RECOLETA,
    fontWeight: 500,
    lineHeight: 1.2,
    align,
    fit: { maxLines: 2, minFontSize: 24 },
    optional: true,
  })

function roundHeadshot(id: string, style: BrandStyle, x: number, y: number, size: number, ring = 12): SceneLayer[] {
  return [
    rect(`${id}-headshot-ring`, 'Headshot Ring', x - ring, y - ring, size + ring * 2, size + ring * 2, style.ring, {
      radius: size / 2 + ring,
    } as Partial<SceneLayer>),
    photo(`${id}-headshot`, 'Headshot', style, x, y, size, size, { radius: size / 2 }),
  ]
}

function retroStripes(id: string, style: BrandStyle, width: number, height: number): SceneLayer[] {
  return [
    ...stripes(`${id}-stripe-top`, style.stripes ?? [], 0, 56, width, 14, 8, 'x'),
    ...stripes(`${id}-stripe-bottom`, [...(style.stripes ?? [])].reverse(), 0, height - 56 - 3 * 14 - 2 * 8, width, 14, 8, 'x'),
  ]
}

function quoteScene(id: string, name: string, height: number, look: TemplateLook): SceneDefinition {
  const layout = QUOTE_LAYOUTS.some((option) => option.id === look.layout) ? look.layout! : 'centered'
  if (layout === 'byline') return quoteBylineScene(id, name, height, look)
  if (layout === 'photo-top') return quotePhotoTopScene(id, name, height, look)
  return quoteCenteredScene(id, name, height, look)
}

/** Centered: headshot, quote, rule, name and title in one centered stack. */
function quoteCenteredScene(id: string, name: string, height: number, look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const width = 1080
  const tall = height > 1600
  const headshot = tall ? 300 : 240
  const top = Math.round(height * (tall ? 0.16 : 0.13))
  const bottom = Math.round(height * (tall ? 0.86 : 0.88))
  // Short quotes run big; longer ones shrink until they fit the line limit.
  const quoteSize = tall ? 96 : 84
  const authorSize = tall ? 92 : 80
  // Signal: a broadcast split. Blue holds the headshot and quote; the name tag sits on the seam
  // with the title in the ink footer below.
  const signal = style.id === 'signal'
  const tagHeight = Math.round(authorSize * 1.12 + 26)
  const seam = Math.round(height * (tall ? 0.84 : 0.82))

  const decorations: SceneLayer[] =
    style.id === 'retro' ? retroStripes(id, style, width, height) : signal ? [rect(`${id}-panel`, 'Lower Panel', 0, seam, width, height - seam, BRAND.ink)] : []

  const layers: SceneLayer[] = [
    ...decorations,
    quoteMark(id, style, 70, top + headshot + 40 - 170, tall ? 340 : 300),
    ...roundHeadshot(id, style, (width - headshot) / 2, top, headshot),
    quoteBody(id, style, 100, top + headshot + 40, 880, quoteSize, tall ? 7 : 5, 'center'),
    // Signal's tag on the seam does the rule's job.
    rect(`${id}-rule`, 'Rule', (width - 96) / 2, top + headshot + 470, 96, 8, style.rule, { visible: !signal }),
    quoteAuthor(id, style, 90, top + headshot + 520, 900, authorSize, 'center'),
    quoteTitle(id, style, 140, top + headshot + 640, 800, tall ? 40 : 34, 'center'),
  ]

  const flows: SceneFlow[] = signal
    ? [
        {
          id: `${id}-stack`,
          axis: 'y',
          start: Math.round(height * 0.07),
          end: seam - tagHeight / 2 - 48,
          justify: 'center',
          items: [
            { layerId: `${id}-headshot`, gap: 0, with: [`${id}-headshot-ring`] },
            { layerId: `${id}-quote`, gap: 56, with: [`${id}-mark-open`] },
          ],
        },
        {
          id: `${id}-byline`,
          axis: 'y',
          start: seam - Math.round(tagHeight / 2),
          end: height - 40,
          justify: 'start',
          items: [
            { layerId: `${id}-author`, gap: 0 },
            { layerId: `${id}-title`, gap: 24 },
          ],
        },
      ]
    : [
        {
          id: `${id}-stack`,
          axis: 'y',
          start: top,
          end: bottom,
          justify: 'center',
          items: [
            { layerId: `${id}-headshot`, gap: 0, with: [`${id}-headshot-ring`] },
            { layerId: `${id}-quote`, gap: 56, with: [`${id}-mark-open`] },
            { layerId: `${id}-rule`, gap: 44 },
            { layerId: `${id}-author`, gap: 28 },
            { layerId: `${id}-title`, gap: 14 },
          ],
        },
      ]

  return { id, name, width, height, background: style.bg, layers, flows }
}

/** Byline: an editorial, left-aligned quote with a small headshot beside the name at the foot. */
function quoteBylineScene(id: string, name: string, height: number, look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const width = 1080
  const tall = height > 1600
  const margin = 90
  const signal = style.id === 'signal'
  const headshot = tall ? 200 : 170
  // The byline sits above the foot (and above Retro's bottom stripes).
  const bylineMiddle = height - (tall ? 300 : 236)
  const bylineTop = bylineMiddle - headshot / 2
  // Signal: the byline lives in an ink footer; Acid and Retro get a full-width rule above it.
  const seam = bylineTop - 56
  const authorX = margin + headshot + 40
  const quoteTop = Math.round(height * 0.12) + 130

  const decorations: SceneLayer[] =
    style.id === 'retro' ? retroStripes(id, style, width, height) : signal ? [rect(`${id}-panel`, 'Lower Panel', 0, seam, width, height - seam, BRAND.ink)] : []

  const layers: SceneLayer[] = [
    ...decorations,
    quoteMark(id, style, margin - 20, quoteTop - 170, tall ? 340 : 300),
    quoteBody(id, style, margin, quoteTop, width - margin * 2, tall ? 100 : 88, tall ? 8 : 6, 'left'),
    rect(`${id}-rule`, 'Rule', margin, seam, width - margin * 2, 6, style.rule, { visible: !signal }),
    ...roundHeadshot(id, style, margin, bylineTop, headshot, 8),
    quoteAuthor(id, style, authorX, bylineMiddle - 50, width - authorX - margin, tall ? 84 : 72, 'left'),
    quoteTitle(id, style, authorX, bylineMiddle + 40, width - authorX - margin, tall ? 38 : 32, 'left'),
  ]

  const flows: SceneFlow[] = [
    {
      id: `${id}-stack`,
      axis: 'y',
      start: quoteTop,
      end: seam - 64,
      justify: 'center',
      items: [{ layerId: `${id}-quote`, gap: 0, with: [`${id}-mark-open`] }],
    },
    {
      id: `${id}-byline`,
      axis: 'y',
      start: bylineTop - 20,
      end: bylineTop + headshot + 20,
      justify: 'center',
      items: [
        { layerId: `${id}-author`, gap: 0 },
        { layerId: `${id}-title`, gap: 10 },
      ],
    },
    {
      // No headshot: the name moves over to the margin.
      id: `${id}-byline-row`,
      axis: 'x',
      start: margin,
      end: width - margin,
      justify: 'start',
      items: [
        { layerId: `${id}-headshot`, gap: 0, with: [`${id}-headshot-ring`] },
        { layerId: `${id}-author`, gap: 40, with: [`${id}-title`] },
      ],
    },
  ]

  return { id, name, width, height, background: style.bg, layers, flows }
}

/** Big photo: a full-width photo across the top, the quote and name below it. */
function quotePhotoTopScene(id: string, name: string, height: number, look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const width = 1080
  const tall = height > 1600
  const photoOff = look.off?.has(`${id}-headshot`) ?? false
  const photoHeight = Math.round(height * (tall ? 0.38 : 0.36))
  const bandHeight = style.stripes ? 3 * 14 + 2 * 8 : 14
  const textTop = photoOff ? Math.round(height * 0.14) : photoHeight + bandHeight + 96
  const bottom = Math.round(height * (tall ? 0.9 : 0.92)) - (style.stripes ? 60 : 0)

  // A band along the photo's bottom edge in the style's accent (Retro: its stripes).
  const band: SceneLayer[] = style.stripes
    ? stripes(`${id}-band`, style.stripes, 0, photoHeight, width, 14, 8, 'x').map((layer) => ({ ...layer, visible: !photoOff }))
    : [rect(`${id}-band`, 'Photo Band', 0, photoHeight, width, bandHeight, style.id === 'signal' ? BRAND.red : style.rule, { visible: !photoOff })]
  const bottomStripes = style.stripes
    ? stripes(`${id}-stripe-bottom`, [...style.stripes].reverse(), 0, height - 56 - 3 * 14 - 2 * 8, width, 14, 8, 'x')
    : []

  const layers: SceneLayer[] = [
    photo(`${id}-headshot`, 'Headshot', style, 0, 0, width, photoHeight),
    ...band,
    ...bottomStripes,
    // The mark straddles the photo's edge; with no photo it rides above the quote.
    quoteMark(id, style, 70, photoOff ? textTop - 170 : photoHeight - 120, tall ? 320 : 280),
    quoteBody(id, style, 100, textTop, 880, tall ? 88 : 76, tall ? 7 : 5, 'center'),
    rect(`${id}-rule`, 'Rule', (width - 96) / 2, textTop + 380, 96, 8, style.rule, { visible: style.id !== 'signal' }),
    quoteAuthor(id, style, 90, textTop + 420, 900, tall ? 84 : 70, 'center'),
    quoteTitle(id, style, 140, textTop + 520, 800, tall ? 38 : 32, 'center'),
  ]

  const flows: SceneFlow[] = [
    {
      id: `${id}-stack`,
      axis: 'y',
      start: textTop,
      end: bottom,
      justify: 'center',
      items: [
        { layerId: `${id}-quote`, gap: 0, ...(photoOff ? { with: [`${id}-mark-open`] } : {}) },
        { layerId: `${id}-rule`, gap: 40 },
        { layerId: `${id}-author`, gap: style.id === 'signal' ? 40 : 26 },
        { layerId: `${id}-title`, gap: 14 },
      ],
    },
  ]

  return { id, name, width, height, background: style.bg, layers, flows }
}

// ---------- Lower third (broadcast, transparent; three layouts) ----------

const LOWER_THIRD_LAYOUTS: TemplateLayoutOption[] = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Centered' },
  { id: 'two-up', label: 'Two people' },
]

const LT_TOP = 820
const LT_HEIGHT = 160
const LT_PHOTO = 160

interface LowerThirdPerson {
  suffix: string
  label: string
  bindings: { name: string; title: string }
  /** Where this person's row may sit, and how wide the bar is with no headshot. */
  start: number
  end: number
  slot: number
  justify: 'start' | 'center'
  nameSize: number
  titleSize: number
}

/** One person's row: optional headshot tile, the bar, an accent, name and title. */
function lowerThirdPerson(style: BrandStyle, look: TemplateLook, person: LowerThirdPerson): { layers: SceneLayer[]; flows: SceneFlow[] } {
  const id = (base: string) => `${base}${person.suffix}`
  const photoId = id('image-lt-photo')
  const photoOn = look.on?.has(photoId) ?? false
  // Two people share the width, so a headshot takes its room from the bar.
  const barWidth = person.slot - (photoOn && person.slot < 1080 ? LT_PHOTO : 0)
  const x = person.start
  const accents: SceneLayer[] = style.stripes
    ? stripes(id('shape-lt-stripe'), style.stripes, x, LT_TOP, LT_HEIGHT, 8, 0, 'y')
    : [rect(id('shape-lt-accent'), `${person.label}Accent`, x, LT_TOP, 16, LT_HEIGHT, style.id === 'signal' ? BRAND.red : style.rule)]
  const textX = x + 56
  const textWidth = barWidth - 56 - 34

  const layers: SceneLayer[] = [
    photo(photoId, `${person.label}Headshot`, style, x, LT_TOP, LT_PHOTO, LT_HEIGHT, { visible: photoOn }),
    rect(id('shape-lt-bg'), `${person.label}Bar`, x, LT_TOP, barWidth, LT_HEIGHT, style.bg),
    ...accents,
    text({
      id: id('text-lt-name'),
      name: `${person.label}Name`,
      x: textX,
      y: 842,
      width: textWidth,
      height: 70,
      text: person.suffix ? 'Second Name' : 'Name',
      binding: person.bindings.name,
      color: style.id === 'acid' ? BRAND.milk : style.display,
      fontSize: person.nameSize,
      fontFamily: DRUK_WIDE,
      fontWeight: 700,
      align: 'left',
      fit: { maxLines: 1, minFontSize: 26 },
    }),
    text({
      id: id('text-lt-title'),
      name: `${person.label}Title`,
      x: textX,
      y: 920,
      width: textWidth,
      height: 42,
      text: person.suffix ? 'Second Title' : 'Title',
      binding: person.bindings.title,
      color: style.id === 'acid' ? BRAND.acid : style.text,
      fontSize: person.titleSize,
      fontFamily: RECOLETA,
      fontWeight: 500,
      align: 'left',
      fit: { maxLines: 1, minFontSize: 20 },
      optional: true,
    }),
  ]

  const flows: SceneFlow[] = [
    {
      id: id('lt-text'),
      axis: 'y',
      start: LT_TOP,
      end: LT_TOP + LT_HEIGHT,
      justify: 'center',
      items: [
        { layerId: id('text-lt-name'), gap: 0 },
        { layerId: id('text-lt-title'), gap: 6 },
      ],
    },
    {
      // With the headshot on, the bar and its text slide over to make room.
      id: id('lt-row'),
      axis: 'x',
      start: person.start,
      end: person.end,
      justify: person.justify,
      items: [
        { layerId: photoId, gap: 0 },
        { layerId: id('shape-lt-bg'), gap: 0, with: [...accents.map((layer) => layer.id), id('text-lt-name'), id('text-lt-title')] },
      ],
    },
  ]
  return { layers, flows }
}

function lowerThirdScene(look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const layout = LOWER_THIRD_LAYOUTS.some((option) => option.id === look.layout) ? look.layout! : 'left'
  const first = { suffix: '', label: '', bindings: { name: 'name', title: 'title' } }
  const people: LowerThirdPerson[] =
    layout === 'two-up'
      ? [
          { ...first, start: 120, end: 940, slot: 820, justify: 'start', nameSize: 44, titleSize: 30 },
          {
            suffix: '-2',
            label: 'Second ',
            bindings: { name: 'name_2', title: 'title_2' },
            start: 980,
            end: 1800,
            slot: 820,
            justify: 'start',
            nameSize: 44,
            titleSize: 30,
          },
        ]
      : layout === 'center'
        ? // The row (headshot + bar) centers on the frame.
          [{ ...first, start: 420, end: 1500, slot: 1080, justify: 'center', nameSize: 54, titleSize: 34 }]
        : [{ ...first, start: 120, end: 1800, slot: 1080, justify: 'start', nameSize: 54, titleSize: 34 }]

  const rows = people.map((person) => lowerThirdPerson(style, look, person))
  const flows = rows
    .flatMap((row) => row.flows)
    .map((flow) => (layout === 'center' && flow.axis === 'x' ? { ...flow, start: 120, end: 1800 } : flow))
  return {
    id: 'scene-lower-third',
    name: 'Lower Third',
    width: 1920,
    height: 1080,
    background: 'transparent',
    layers: rows.flatMap((row) => row.layers),
    flows,
  }
}

// ---------- YouTube thumbnail (three layouts) ----------

const YOUTUBE_LAYOUTS: TemplateLayoutOption[] = [
  { id: 'text-left', label: 'Text left' },
  { id: 'text-right', label: 'Text right' },
  { id: 'wide-photo', label: 'Wide photo' },
]

function youtubeScene(look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const layout = YOUTUBE_LAYOUTS.some((option) => option.id === look.layout) ? look.layout! : 'text-left'
  const photoOff = look.off?.has('image-yt-photo') ?? false
  const width = 1280
  const height = 720
  const wide = layout === 'wide-photo'
  const photoLayer =
    wide
      ? photo('image-yt-photo', 'Photo', style, 0, 0, width, height)
      : photo('image-yt-photo', 'Photo', style, layout === 'text-right' ? 0 : 640, 0, 640, height)
  // Text column: beside the photo, across the whole frame when the photo is off, or along the bottom.
  const column = wide || photoOff ? { x: 60, width: 1160 } : layout === 'text-right' ? { x: 700, width: 520 } : { x: 60, width: 540 }
  const align = wide ? 'center' : 'left'
  // Wide photo: the bar spans the title-safe area (80% of the width) so it frames the headline.
  const accentWidth = wide ? Math.round(width * 0.8) : 120
  const accentX = align === 'center' ? (width - accentWidth) / 2 : column.x

  const accents: SceneLayer[] = style.stripes
    ? stripes('shape-yt-stripe', style.stripes, accentX, 92, accentWidth, 8, 4, 'x')
    : [rect('shape-yt-accent', 'Accent Bar', accentX, 92, accentWidth, 14, style.id === 'signal' ? BRAND.white : style.rule)]

  const scrim = wide
    ? [
        rect('shape-yt-scrim', 'Scrim', 0, 0, width, height, `linear-gradient(180deg, ${rgba(style.bg, 0)} 30%, ${rgba(style.bg, 0.94)} 80%)`, {
          visible: !photoOff,
        }),
      ]
    : []

  const layers: SceneLayer[] = [
    photoLayer,
    ...scrim,
    ...accents,
    text({
      id: 'text-yt-headline',
      name: 'Headline',
      x: column.x,
      y: 130,
      width: column.width,
      height: 380,
      text: 'Headline',
      binding: 'headline',
      color: style.display,
      fontSize: wide || photoOff ? 96 : 86,
      fontFamily: DRUK_WIDE,
      fontWeight: 700,
      lineHeight: 1.02,
      align,
      // Druk Wide is very wide: half-width columns stack up to four big lines before the type shrinks.
      fit: { maxLines: wide || photoOff ? 2 : 4, minFontSize: 44 },
    }),
    text({
      id: 'text-yt-subhead',
      name: 'Subhead',
      x: column.x,
      y: 560,
      width: column.width,
      height: 80,
      text: 'Subhead',
      binding: 'subhead',
      color: style.subTag.text,
      fontSize: 38,
      fontFamily: RECOLETA,
      fontWeight: 700,
      align,
      box: { fill: style.subTag.fill, paddingTop: 12, paddingRight: 26, paddingBottom: 14, paddingLeft: 26, radius: style.subTag.radius },
      fit: { maxLines: 1, minFontSize: 22 },
      optional: true,
    }),
  ]

  const accentIds = accents.map((layer) => layer.id)
  const [firstAccent, ...otherAccents] = accentIds
  const flows: SceneFlow[] = [
    wide
      ? {
          id: 'yt-stack',
          axis: 'y',
          start: 60,
          end: photoOff ? height - 60 : height - 56,
          justify: photoOff ? 'center' : 'end',
          items: [
            { layerId: firstAccent, gap: 0, with: otherAccents },
            { layerId: 'text-yt-subhead', gap: 26 + (style.stripes ? 24 : 0) },
            { layerId: 'text-yt-headline', gap: 18 },
          ],
        }
      : {
          id: 'yt-stack',
          axis: 'y',
          start: 60,
          end: height - 60,
          justify: 'center',
          items: [
            { layerId: firstAccent, gap: 0, with: otherAccents },
            { layerId: 'text-yt-headline', gap: 28 + (style.stripes ? 24 : 0) },
            { layerId: 'text-yt-subhead', gap: 30 },
          ],
        },
  ]

  return { id: 'scene-youtube-thumbnail', name: 'YouTube Thumbnail', width, height, background: style.bg, layers, flows }
}

// ---------- Catalog ----------

export const SMART_TEMPLATES: SmartTemplate[] = [
  {
    id: 'template-quote-card',
    label: 'Quote Card 4x5',
    favorite: true,
    layouts: QUOTE_LAYOUTS,
    build: (look) => quoteScene('scene-quote-card', 'Quote Card 4x5', 1350, look),
  },
  { id: 'template-lower-third', label: 'Lower Third', favorite: true, layouts: LOWER_THIRD_LAYOUTS, build: lowerThirdScene },
  { id: 'template-youtube-thumbnail', label: 'YouTube Thumbnail', favorite: true, layouts: YOUTUBE_LAYOUTS, build: youtubeScene },
  {
    id: 'template-quote-story',
    label: 'Quote Story 9x16',
    layouts: QUOTE_LAYOUTS,
    build: (look) => quoteScene('scene-quote-story', 'Quote Story 9x16', 1920, look),
  },
]

export const DEFAULT_LOOK: TemplateLook = { style: DEFAULT_STYLE_ID }

export function smartTemplate(templateId: string): SmartTemplate | undefined {
  return SMART_TEMPLATES.find((template) => template.id === templateId)
}

/** A built-in template drawn in a style and layout (null for templates people made). */
export function buildSmartScene(templateId: string, look: TemplateLook): SceneDefinition | null {
  return smartTemplate(templateId)?.build(look) ?? null
}

export const TEMPLATE_LIBRARY: TemplateDefinition[] = SMART_TEMPLATES.map((template) => ({
  id: template.id,
  label: template.label,
  scene: template.build(DEFAULT_LOOK),
  ...(template.favorite ? { favorite: true } : {}),
  builtIn: true,
  version: 1,
  versions: [],
}))

export const CLEAR_SCENE: SceneDefinition = {
  id: 'scene-clear',
  name: 'Clear',
  width: 1920,
  height: 1080,
  background: 'transparent',
  layers: [],
}

export function cloneScene(scene: SceneDefinition): SceneDefinition {
  if (typeof structuredClone === 'function') {
    return structuredClone(scene)
  }

  return JSON.parse(JSON.stringify(scene)) as SceneDefinition
}
