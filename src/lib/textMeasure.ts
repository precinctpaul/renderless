/**
 * Measures text the way SceneRenderer draws it (CSS `pre-wrap` in a fixed-width frame), so the
 * layout engine can fit and stack text before it is drawn. Uses a canvas; where there is none
 * (tests) it falls back to an average glyph width.
 */

export interface TextMetricsInput {
  text: string
  fontFamily: string
  fontWeight: number
  fontSize: number
  lineHeight: number
}

export type MeasureWidth = (text: string, font: string) => number

let context: CanvasRenderingContext2D | null | undefined
const cache = new Map<string, number>()

function canvasWidth(text: string, font: string): number | null {
  if (context === undefined) {
    const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
    context = typeof document === 'undefined' || isJsdom ? null : document.createElement('canvas').getContext('2d')
  }
  if (!context) return null
  const key = `${font}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  context.font = font
  const width = context.measureText(text).width
  // A canvas never loads a web font by itself: ask for it, and don't keep fallback-font widths.
  // When it arrives, 'loadingdone' makes SceneRenderer measure again.
  if (!fontReady(font)) return width
  if (cache.size > 5000) cache.clear()
  cache.set(key, width)
  return width
}

const requested = new Set<string>()

function fontReady(font: string): boolean {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts?.check) return true
  try {
    if (fonts.check(font)) return true
  } catch {
    return true
  }
  if (!requested.has(font)) {
    requested.add(font)
    void fonts.load(font).catch(() => undefined)
  }
  return false
}

/** Loads every font a scene's text uses (PNG export waits for this before drawing). */
export async function loadSceneFonts(layers: Array<{ kind: string } & Partial<TextMetricsInput>>): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts?.load) return
  const wanted = new Set(
    layers
      .filter((layer) => layer.kind === 'text' && layer.fontFamily)
      .map((layer) => fontOf({ fontFamily: layer.fontFamily!, fontWeight: layer.fontWeight ?? 400, fontSize: 40 })),
  )
  await Promise.all([...wanted].map((font) => fonts.load(font).catch(() => undefined)))
  clearMeasureCache()
}

/** Width of one line of text in px. */
export const measureWidth: MeasureWidth = (text, font) => {
  const width = canvasWidth(text, font)
  if (width !== null) return width
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
  return text.length * size * 0.56
}

/** Forget cached widths (fonts finished loading, so earlier fallback-font widths are wrong). */
export function clearMeasureCache() {
  cache.clear()
}

export const fontOf = (input: Pick<TextMetricsInput, 'fontFamily' | 'fontWeight' | 'fontSize'>) =>
  `${input.fontWeight} ${input.fontSize}px ${input.fontFamily}`

/**
 * The lines the text breaks into in a frame `maxWidth` wide (null: never wraps, like boxed text),
 * plus the widest line. Words longer than the frame stay whole, as in CSS.
 */
export function wrapText(input: TextMetricsInput, maxWidth: number | null, measure: MeasureWidth = measureWidth) {
  const font = fontOf(input)
  const lines: string[] = []
  let widest = 0
  for (const paragraph of input.text.split('\n')) {
    if (maxWidth === null) {
      lines.push(paragraph)
      widest = Math.max(widest, measure(paragraph, font))
      continue
    }
    const words = paragraph.split(/ +/)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate, font) > maxWidth) {
        lines.push(line)
        widest = Math.max(widest, measure(line, font))
        line = word
      } else {
        line = candidate
      }
    }
    lines.push(line)
    widest = Math.max(widest, measure(line, font))
  }
  return { lines, widest, height: lines.length * input.fontSize * input.lineHeight }
}
