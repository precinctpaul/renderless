/**
 * Pure layout helpers for the Illustrator importer: font-name matching, grouping PDF text
 * runs into editable blocks, and pairing each block with the filled rectangle behind it.
 * All coordinates here are scene pixels with y pointing down.
 */

export interface PdfTextRun {
  text: string
  /** Left edge of the run. */
  x: number
  baseline: number
  width: number
  fontSize: number
  fontName: string
  color: string
  section: number
  order: number
}

export interface TextBlockLine {
  text: string
  left: number
  width: number
  baseline: number
}

export interface TextBlock {
  lines: TextBlockLine[]
  fontName: string
  fontSize: number
  color: string
  section: number
  order: number
  align: 'left' | 'center' | 'right'
  /** Distance between consecutive baselines, or null for a single line. */
  lineGap: number | null
}

export interface FilledRect {
  x: number
  y: number
  width: number
  height: number
  fill: string
  section: number
  order: number
  /** The rectangle in the content stream's own coordinates, for stripping it from the artwork. */
  local: { x: number; y: number; width: number; height: number }
}

interface ParsedFontName {
  family: string
  style: string | null
  trial: boolean
}

/** "BCWBYW+DrukTextWideTrial-Bold" -> { family: "DrukTextWide", style: "Bold", trial: true } */
export function parsePdfFontName(raw: string): ParsedFontName {
  const withoutSubset = raw.replace(/^[A-Z]{6}\+/, '')
  const [familyPart, ...styleParts] = withoutSubset.split('-')
  const trial = /trial/i.test(withoutSubset)
  const family = familyPart.replace(/trial/i, '').trim() || familyPart
  const style = styleParts.join(' ').replace(/trial/i, '').trim() || null
  return { family, style, trial }
}

function fontKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/trial/g, '')
    .replace(/regular|roman|book/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** The family name the font library would give the matching uploaded file. */
export function suggestFontFamily(rawPdfFontName: string): string {
  const { family, style, trial } = parsePdfFontName(rawPdfFontName)
  return [family, style, trial ? 'Trial' : null].filter(Boolean).join(' ')
}

/** Finds an uploaded font family for a PDF font name, ignoring separators, case and "Trial". */
export function matchFontFamily(rawPdfFontName: string, availableFamilies: string[]): string | null {
  const { family, style } = parsePdfFontName(rawPdfFontName)
  const wanted = fontKey(`${family}${style ?? ''}`)
  return availableFamilies.find((candidate) => fontKey(candidate) === wanted) ?? null
}

/** Approximate CSS weight from a style name, used only when the exact font file is missing. */
export function weightFromStyle(rawPdfFontName: string): number {
  const style = (parsePdfFontName(rawPdfFontName).style ?? '').toLowerCase()
  if (/thin|hairline/.test(style)) return 100
  if (/extralight|ultralight/.test(style)) return 200
  if (/light/.test(style)) return 300
  if (/medium/.test(style)) return 500
  if (/semibold|demibold/.test(style)) return 600
  if (/extrabold|ultrabold|heavy/.test(style)) return 800
  if (/black|super/.test(style)) return 900
  if (/bold/.test(style)) return 700
  return 400
}

function sameStyle(a: PdfTextRun, b: { fontName: string; fontSize: number; color: string; section: number }): boolean {
  return (
    a.fontName === b.fontName &&
    a.color === b.color &&
    a.section === b.section &&
    Math.abs(a.fontSize - b.fontSize) <= Math.max(0.5, b.fontSize * 0.01)
  )
}

function detectAlign(lines: TextBlockLine[], fontSize: number): 'left' | 'center' | 'right' {
  if (lines.length < 2) {
    return 'left'
  }

  const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
  const lefts = spread(lines.map((line) => line.left))
  const centers = spread(lines.map((line) => line.left + line.width / 2))
  const rights = spread(lines.map((line) => line.left + line.width))
  const tolerance = fontSize * 0.3
  const best = Math.min(lefts, centers, rights)
  if (best > tolerance * 3) {
    return 'left'
  }
  if (best === centers && centers <= tolerance) return 'center'
  if (best === lefts) return 'left'
  if (best === rights) return 'right'
  return 'center'
}

/**
 * Groups runs into blocks: runs on the same baseline join into one line, and consecutive
 * lines with the same font, size and color, a regular baseline spacing and overlapping
 * horizontal extent become one multi-line text layer.
 */
export function groupRunsIntoBlocks(runs: PdfTextRun[]): TextBlock[] {
  const ordered = [...runs].filter((run) => run.text.trim().length > 0).sort((a, b) => a.order - b.order)
  const lines: Array<TextBlockLine & { fontName: string; fontSize: number; color: string; section: number; order: number }> = []

  for (const run of ordered) {
    const previous = lines[lines.length - 1]
    if (previous && sameStyle(run, previous) && Math.abs(run.baseline - previous.baseline) <= run.fontSize * 0.2) {
      const gap = run.x - (previous.left + previous.width)
      const joiner = gap > run.fontSize * 0.2 && !previous.text.endsWith(' ') && !run.text.startsWith(' ') ? ' ' : ''
      previous.text = `${previous.text}${joiner}${run.text}`
      previous.width = Math.max(previous.left + previous.width, run.x + run.width) - previous.left
      continue
    }

    lines.push({
      text: run.text,
      left: run.x,
      width: run.width,
      baseline: run.baseline,
      fontName: run.fontName,
      fontSize: run.fontSize,
      color: run.color,
      section: run.section,
      order: run.order,
    })
  }

  const blocks: TextBlock[] = []
  for (const line of lines) {
    const block = blocks[blocks.length - 1]
    const last = block?.lines[block.lines.length - 1]
    const gap = last ? line.baseline - last.baseline : 0
    const overlaps = last ? line.left < last.left + last.width && line.left + line.width > last.left : false
    const regularGap = block && (block.lineGap === null ? true : Math.abs(gap - block.lineGap) <= line.fontSize * 0.15)

    if (block && last && sameStyle({ ...line, x: line.left } as PdfTextRun, block) && overlaps && regularGap && gap > line.fontSize * 0.6 && gap < line.fontSize * 2.2) {
      block.lines.push({ text: line.text, left: line.left, width: line.width, baseline: line.baseline })
      block.lineGap = block.lineGap ?? gap
      continue
    }

    blocks.push({
      lines: [{ text: line.text, left: line.left, width: line.width, baseline: line.baseline }],
      fontName: line.fontName,
      fontSize: line.fontSize,
      color: line.color,
      section: line.section,
      order: line.order,
      align: 'left',
      lineGap: null,
    })
  }

  return blocks.map((block) => ({ ...block, lines: block.lines.map((line) => ({ ...line, text: line.text.trimEnd() })), align: detectAlign(block.lines, block.fontSize) }))
}

/** Approximate ink bounds of a block from its baselines and font size. */
export function blockBounds(block: TextBlock): { left: number; top: number; right: number; bottom: number } {
  const first = block.lines[0]
  const last = block.lines[block.lines.length - 1]
  return {
    left: Math.min(...block.lines.map((line) => line.left)),
    right: Math.max(...block.lines.map((line) => line.left + line.width)),
    top: first.baseline - block.fontSize * 0.75,
    bottom: last.baseline + block.fontSize * 0.15,
  }
}

/**
 * The box behind a block: the smallest filled rectangle in the same layer, painted before the
 * text, that contains the text's bounds. Page-sized rectangles (backgrounds) are ignored.
 */
export function findBoxForBlock(block: TextBlock, rects: FilledRect[], sceneArea: number): FilledRect | null {
  const bounds = blockBounds(block)
  const tolerance = 2
  const candidates = rects.filter(
    (rect) =>
      rect.section === block.section &&
      rect.order < block.order &&
      rect.width * rect.height < sceneArea * 0.6 &&
      rect.x <= bounds.left + tolerance &&
      rect.y <= bounds.top + tolerance &&
      rect.x + rect.width >= bounds.right - tolerance &&
      rect.y + rect.height >= bounds.bottom - tolerance,
  )
  candidates.sort((a, b) => a.width * a.height - b.width * b.height)
  return candidates[0] ?? null
}
