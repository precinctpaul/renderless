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

// ---------- Quote cards (feed 4:5 and story 9:16) ----------

function quoteScene(id: string, name: string, height: number, look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const width = 1080
  const tall = height > 1600
  const headshot = tall ? 300 : 240
  const ring = 12
  const top = Math.round(height * (tall ? 0.16 : 0.13))
  const bottom = Math.round(height * (tall ? 0.86 : 0.88))
  const headshotLeft = (width - headshot) / 2
  // Short quotes run big; longer ones shrink until they fit the line limit.
  const quoteSize = tall ? 96 : 84
  const authorSize = tall ? 92 : 80
  // Signal: a broadcast split. Blue holds the headshot and quote; the name tag sits on the seam
  // with the title in the ink footer below.
  const signal = style.id === 'signal'
  const tagHeight = Math.round(authorSize * 1.12 + 26)
  const seam = Math.round(height * (tall ? 0.84 : 0.82))

  const decorations: SceneLayer[] =
    style.id === 'retro'
      ? [
          ...stripes(`${id}-stripe-top`, style.stripes ?? [], 0, 56, width, 14, 8, 'x'),
          ...stripes(`${id}-stripe-bottom`, [...(style.stripes ?? [])].reverse(), 0, height - 56 - 3 * 14 - 2 * 8, width, 14, 8, 'x'),
        ]
      : style.id === 'signal'
        ? [rect(`${id}-panel`, 'Lower Panel', 0, seam, width, height - seam, BRAND.ink)]
        : []

  const layers: SceneLayer[] = [
    ...decorations,
    text({
      id: `${id}-mark-open`,
      name: 'Quote Mark',
      x: 70,
      y: top + headshot + 40 - 170,
      width: 220,
      height: 220,
      text: '“',
      color: style.mark,
      fontSize: tall ? 340 : 300,
      fontFamily: RECOLETA,
      fontWeight: 700,
      align: 'left',
      verticalAlign: 'top',
    }),
    rect(`${id}-headshot-ring`, 'Headshot Ring', headshotLeft - ring, top - ring, headshot + ring * 2, headshot + ring * 2, style.ring, {
      radius: headshot / 2 + ring,
    } as Partial<SceneLayer>),
    photo(`${id}-headshot`, 'Headshot', style, headshotLeft, top, headshot, headshot, { radius: headshot / 2 }),
    text({
      id: `${id}-quote`,
      name: 'Quote',
      x: 100,
      y: top + headshot + 40,
      width: 880,
      height: 400,
      text: 'Your quote goes here.',
      binding: 'quote',
      color: style.text,
      fontSize: quoteSize,
      fontFamily: RECOLETA,
      fontWeight: 700,
      lineHeight: 1.12,
      fit: { maxLines: tall ? 7 : 5, minFontSize: 36 },
    }),
    // Signal's tag on the seam does the rule's job.
    rect(`${id}-rule`, 'Rule', (width - 96) / 2, top + headshot + 470, 96, 8, style.rule, { visible: style.id !== 'signal' }),
    text({
      id: `${id}-author`,
      name: 'Speaker',
      x: 90,
      y: top + headshot + 520,
      width: 900,
      height: authorSize + (style.tag ? 24 : 0),
      text: 'Speaker Name',
      binding: 'quote_author',
      color: style.tag ? style.tag.text : style.display,
      fontSize: authorSize,
      fontFamily: DRUK,
      fontWeight: 700,
      fit: { maxLines: 1, minFontSize: 40 },
      // Druk's letters sit low in their line: a taller line and more padding below keep them inside the tag.
      ...(style.tag
        ? {
            lineHeight: 1.12,
            box: { fill: style.tag.fill, paddingTop: 12, paddingRight: 34, paddingBottom: 14, paddingLeft: 34, radius: style.tag.radius },
          }
        : {}),
    }),
    text({
      id: `${id}-title`,
      name: 'Speaker Title',
      x: 140,
      y: top + headshot + 640,
      width: 800,
      height: 90,
      text: 'Title, Organization',
      binding: 'title',
      color: style.text,
      fontSize: tall ? 40 : 34,
      fontFamily: RECOLETA,
      fontWeight: 500,
      lineHeight: 1.2,
      fit: { maxLines: 2, minFontSize: 24 },
      optional: true,
    }),
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

// ---------- Lower third (broadcast, transparent) ----------

function lowerThirdScene(look: TemplateLook): SceneDefinition {
  const style = brandStyle(look.style)
  const barTop = 820
  const barHeight = 160
  // Retro trades the single accent bar for three sportswear stripes.
  const accents: SceneLayer[] = style.stripes
    ? stripes('shape-lt-stripe', style.stripes, 120, barTop, barHeight, 8, 0, 'y')
    : [rect('shape-lt-accent', 'Accent', 120, barTop, 16, barHeight, style.id === 'signal' ? BRAND.red : style.rule)]
  const accentIds = accents.map((layer) => layer.id)

  const layers: SceneLayer[] = [
    photo('image-lt-photo', 'Headshot', style, 120, barTop, barHeight, barHeight, { visible: false }),
    rect('shape-lt-bg', 'Bar', 120, barTop, 1080, barHeight, style.bg),
    ...accents,
    text({
      id: 'text-lt-name',
      name: 'Name',
      x: 176,
      y: 842,
      width: 990,
      height: 70,
      text: 'Name',
      binding: 'name',
      color: style.id === 'acid' ? BRAND.milk : style.display,
      fontSize: 54,
      fontFamily: DRUK_WIDE,
      fontWeight: 700,
      align: 'left',
      fit: { maxLines: 1, minFontSize: 30 },
    }),
    text({
      id: 'text-lt-title',
      name: 'Title',
      x: 176,
      y: 920,
      width: 990,
      height: 42,
      text: 'Title',
      binding: 'title',
      color: style.id === 'acid' ? BRAND.acid : style.text,
      fontSize: 34,
      fontFamily: RECOLETA,
      fontWeight: 500,
      align: 'left',
      fit: { maxLines: 1, minFontSize: 22 },
      optional: true,
    }),
  ]

  const flows: SceneFlow[] = [
    {
      id: 'lt-text',
      axis: 'y',
      start: barTop,
      end: barTop + barHeight,
      justify: 'center',
      items: [
        { layerId: 'text-lt-name', gap: 0 },
        { layerId: 'text-lt-title', gap: 6 },
      ],
    },
    {
      // With the headshot on, the bar and its text slide right to make room.
      id: 'lt-row',
      axis: 'x',
      start: 120,
      end: 1800,
      justify: 'start',
      items: [
        { layerId: 'image-lt-photo', gap: 0 },
        { layerId: 'shape-lt-bg', gap: 0, with: [...accentIds, 'text-lt-name', 'text-lt-title'] },
      ],
    },
  ]

  return { id: 'scene-lower-third', name: 'Lower Third', width: 1920, height: 1080, background: 'transparent', layers, flows }
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
    build: (look) => quoteScene('scene-quote-card', 'Quote Card 4x5', 1350, look),
  },
  { id: 'template-lower-third', label: 'Lower Third', favorite: true, build: lowerThirdScene },
  { id: 'template-youtube-thumbnail', label: 'YouTube Thumbnail', favorite: true, layouts: YOUTUBE_LAYOUTS, build: youtubeScene },
  {
    id: 'template-quote-story',
    label: 'Quote Story 9x16',
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
