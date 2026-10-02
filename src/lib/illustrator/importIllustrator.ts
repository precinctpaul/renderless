/**
 * Illustrator (.ai) / PDF importer. Requires the file to be saved with "Create PDF Compatible
 * File" (Illustrator's default). Each Illustrator layer becomes its own image layer (rendered
 * with PDF.js), and every text block becomes a live, editable text layer; a filled rectangle
 * behind a text block becomes that layer's self-sizing text box.
 *
 * Runs in the browser only (PDF.js rendering needs a canvas). Loaded on demand so PDF.js and
 * pdf-lib stay out of the main bundle.
 */
import type { PDFDict as PdfLibDict, PDFRef as PdfLibRef } from 'pdf-lib'
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist'
import { describeOffBrandColor } from '../brandPalette'
import { LAYER_BLEND_MODES, type ImageLayer, type LayerBlendMode, type SceneDefinition, type SceneLayer, type TextLayer } from '../../types/scene'
import { stripTextAndBoxes, type LocalRect } from './pdfContent'
import {
  findBoxForBlock,
  groupRunsIntoBlocks,
  matchFontFamily,
  parsePdfFontName,
  suggestFontFamily,
  weightFromStyle,
  type FilledRect,
  type PdfTextRun,
  type TextBlock,
} from './textLayout'

export interface IllustratorImportResult {
  scene: SceneDefinition
  warnings: string[]
}

export interface IllustratorImportOptions {
  /** Font families available in the font library (uploaded in Dashboard > Typography). */
  fontFamilies: string[]
  /** Target canvas width; the artboard is scaled to fit (default 1920). */
  sceneWidth?: number
}

const NO_PDF_CONTENT_MESSAGE =
  'This Illustrator file was saved without PDF content, so its artwork cannot be read. In Illustrator choose File > Save As, keep the .ai format, and tick "Create PDF Compatible File" in the Illustrator Options dialog, then import it again.'

type PdfjsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfjsModule> | null = null

async function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })()
  return pdfjsPromise
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

type Matrix = [number, number, number, number, number, number]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

interface SectionInfo {
  ocgId: string | null
  name: string
  visible: boolean
  blendMode: LayerBlendMode | undefined
  textOps: number[]
  textColors: string[]
}

interface PageAnalysis {
  sections: SectionInfo[]
  rects: FilledRect[]
}

function canvasBlendToLayerBlend(value: unknown): LayerBlendMode | undefined {
  if (typeof value !== 'string' || value === 'source-over' || value === 'normal') {
    return undefined
  }
  return (LAYER_BLEND_MODES as readonly string[]).includes(value) ? (value as LayerBlendMode) : undefined
}

/** Walks the operator list once: layer sections, blend modes, text colors and filled rectangles. */
async function analyzePage(pdfjs: PdfjsModule, page: PDFPageProxy, viewportTransform: Matrix, groupNames: Map<string, { name: string; visible: boolean }>): Promise<PageAnalysis> {
  const { OPS } = pdfjs
  const operatorList = await page.getOperatorList()
  const sections: SectionInfo[] = []
  const rects: FilledRect[] = []
  const sectionStack: number[] = []
  const matrixStack: Matrix[] = []
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  let fill = '#000000'
  let pendingRect: { local: LocalRect; ctm: Matrix } | null = null
  const showTextOps = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke])
  const currentSection = () => (sectionStack.length > 0 ? sectionStack[0] : -1)

  const ensureLooseSection = () => {
    if (sections.length === 0) {
      sections.push({ ocgId: null, name: 'Artwork', visible: true, blendMode: undefined, textOps: [], textColors: [] })
    }
    return 0
  }

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index]
    const args = operatorList.argsArray[index] as unknown[]

    if (fn === OPS.beginMarkedContentProps || fn === OPS.beginMarkedContent) {
      const props = args?.[1] as { type?: string; id?: string } | undefined
      if (sectionStack.length === 0 && args?.[0] === 'OC' && props?.id) {
        const group = groupNames.get(props.id)
        sections.push({ ocgId: props.id, name: group?.name ?? `Layer ${sections.length + 1}`, visible: group?.visible ?? true, blendMode: undefined, textOps: [], textColors: [] })
        sectionStack.push(sections.length - 1)
      } else {
        sectionStack.push(currentSection())
      }
      continue
    }

    if (fn === OPS.endMarkedContent) {
      sectionStack.pop()
      continue
    }

    if (fn === OPS.save) {
      matrixStack.push(ctm)
      continue
    }
    if (fn === OPS.restore) {
      ctm = matrixStack.pop() ?? ctm
      continue
    }
    if (fn === OPS.transform) {
      ctm = multiply(ctm, args as unknown as Matrix)
      continue
    }
    if (fn === OPS.paintFormXObjectBegin) {
      matrixStack.push(ctm)
      const formMatrix = args?.[0] as Matrix | null
      if (formMatrix) ctm = multiply(ctm, formMatrix)
      continue
    }
    if (fn === OPS.paintFormXObjectEnd) {
      ctm = matrixStack.pop() ?? ctm
      continue
    }

    if (fn === OPS.setFillRGBColor) {
      const [r, g, b] = Array.from(args as unknown as ArrayLike<number>)
      fill = toHex(r, g, b)
      continue
    }

    if (fn === OPS.setGState) {
      const entries = (args?.[0] as Array<[string, unknown]>) ?? []
      const blend = entries.find(([key]) => key === 'BM')?.[1]
      const mode = canvasBlendToLayerBlend(blend)
      const section = currentSection()
      if (mode && section >= 0 && !sections[section].blendMode) {
        sections[section].blendMode = mode
      }
      continue
    }

    if (fn === OPS.constructPath) {
      const [pathOps, , minMax] = args as [number[], number[], number[]]
      pendingRect =
        pathOps.length === 1 && pathOps[0] === OPS.rectangle && minMax
          ? { local: { x: minMax[0], y: minMax[1], width: minMax[2] - minMax[0], height: minMax[3] - minMax[1] }, ctm }
          : null
      continue
    }

    if (fillOps.has(fn) && pendingRect) {
      const total = multiply(viewportTransform, pendingRect.ctm)
      const corners = [
        apply(total, pendingRect.local.x, pendingRect.local.y),
        apply(total, pendingRect.local.x + pendingRect.local.width, pendingRect.local.y + pendingRect.local.height),
      ]
      const xs = corners.map(([x]) => x)
      const ys = corners.map(([, y]) => y)
      rects.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.abs(xs[1] - xs[0]),
        height: Math.abs(ys[1] - ys[0]),
        fill,
        section: currentSection() >= 0 ? currentSection() : ensureLooseSection(),
        order: index,
        local: pendingRect.local,
      })
      pendingRect = null
      continue
    }

    if (fn === OPS.endPath || fn === OPS.clip || fn === OPS.eoClip) {
      pendingRect = null
      continue
    }

    if (showTextOps.has(fn)) {
      const section = currentSection() >= 0 ? currentSection() : ensureLooseSection()
      sections[section].textOps.push(index)
      sections[section].textColors.push(fill)
    }
  }

  if (sections.length === 0) {
    ensureLooseSection()
  }

  return { sections, rects }
}

/** Text runs in scene coordinates, assigned to layer sections in drawing order. */
async function extractTextRuns(page: PDFPageProxy, viewport: PageViewport, scale: number, sections: SectionInfo[]): Promise<PdfTextRun[]> {
  const content = await page.getTextContent({ includeMarkedContent: true })
  const runs: PdfTextRun[] = []
  const stack: number[] = []
  let sectionCursor = -1
  const perSectionCount = new Map<number, number>()
  const hasLayers = sections.some((section) => section.ocgId)

  for (const item of content.items) {
    if ('type' in item) {
      if (item.type === 'beginMarkedContentProps' || item.type === 'beginMarkedContent') {
        if (stack.length === 0 && hasLayers && (item as { tag?: string }).tag === 'OC') {
          sectionCursor += 1
          stack.push(sectionCursor)
        } else {
          stack.push(stack.length > 0 ? stack[0] : -1)
        }
      } else if (item.type === 'endMarkedContent') {
        stack.pop()
      }
      continue
    }

    if (!item.str.trim()) {
      continue
    }

    const section = hasLayers ? (stack.length > 0 ? stack[0] : -1) : 0
    if (section < 0 || !sections[section]) {
      continue
    }

    const count = perSectionCount.get(section) ?? 0
    perSectionCount.set(section, count + 1)
    const info = sections[section]
    const [a, b, , , e, f] = item.transform as number[]
    const [x, baseline] = viewport.convertToViewportPoint(e, f)
    runs.push({
      text: item.str,
      x,
      baseline,
      width: item.width * scale,
      fontSize: Math.hypot(a, b) * scale,
      fontName: item.fontName,
      color: info.textColors[count] ?? info.textColors[info.textColors.length - 1] ?? '#000000',
      section,
      order: info.textOps[count] ?? info.textOps[info.textOps.length - 1] ?? Number.MAX_SAFE_INTEGER,
    })
  }

  return runs
}

async function resolveFontName(page: PDFPageProxy, loadedName: string): Promise<{ name: string; ascent: number; descent: number }> {
  const font = await new Promise<{ name?: string; ascent?: number; descent?: number } | null>((resolve) => {
    try {
      page.commonObjs.get(loadedName, (value: unknown) => resolve(value as { name?: string }))
    } catch {
      resolve(null)
    }
  })
  return { name: font?.name ?? loadedName, ascent: font?.ascent ?? 0.8, descent: Math.abs(font?.descent ?? 0.2) }
}

/** Removes text and text boxes from every content stream so the artwork rasters carry neither. */
async function buildArtworkPdf(bytes: Uint8Array, boxes: LocalRect[]): Promise<Uint8Array | null> {
  try {
    const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRawStream, PDFRef, decodePDFRawStream } = await import('pdf-lib')
    const { zlibSync } = await import('fflate')
    const document = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    const context = document.context
    const visited = new Set<string>()

    const toLatin1 = (data: Uint8Array) => {
      let result = ''
      for (let offset = 0; offset < data.length; offset += 0x8000) {
        result += String.fromCharCode(...data.subarray(offset, offset + 0x8000))
      }
      return result
    }
    const fromLatin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)

    const rewrite = (ref: PdfLibRef) => {
      const key = ref.toString()
      if (visited.has(key)) return
      visited.add(key)
      const stream = context.lookup(ref)
      if (!(stream instanceof PDFRawStream)) return
      const original = toLatin1(decodePDFRawStream(stream).decode())
      const { content } = stripTextAndBoxes(original, boxes)
      const dict = stream.dict.clone(context)
      dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
      dict.delete(PDFName.of('DecodeParms'))
      context.assign(ref, PDFRawStream.of(dict, zlibSync(fromLatin1(content))))
      const resources = dict.lookup(PDFName.of('Resources'))
      if (resources instanceof PDFDict) rewriteForms(resources)
    }

    const rewriteForms = (resources: PdfLibDict) => {
      const xobjects = resources.lookup(PDFName.of('XObject'))
      if (!(xobjects instanceof PDFDict)) return
      for (const [, value] of xobjects.entries()) {
        if (!(value instanceof PDFRef)) continue
        const target = context.lookup(value)
        if (target instanceof PDFRawStream && target.dict.get(PDFName.of('Subtype'))?.toString() === '/Form') rewrite(value)
      }
    }

    const page = document.getPage(0)
    const contents = page.node.get(PDFName.of('Contents'))
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    for (const ref of refs) {
      if (ref instanceof PDFRef) rewrite(ref)
    }
    const resources = page.node.Resources()
    if (resources) rewriteForms(resources)

    return await document.save({ useObjectStreams: false })
  } catch {
    return null
  }
}

function cropToContent(canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } | null {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const { width, height } = canvas
  const data = context.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] > 2) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

function canvasToImage(source: HTMLCanvasElement, crop: { x: number; y: number; width: number; height: number }): string {
  const target = document.createElement('canvas')
  target.width = crop.width
  target.height = crop.height
  target.getContext('2d')?.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  const webp = target.toDataURL('image/webp', 0.86)
  return webp.startsWith('data:image/webp') ? webp : target.toDataURL('image/png')
}

interface MeasuredFont {
  family: string
  matched: boolean
  ascent: number
  descent: number
  measure: (text: string) => number | null
}

async function prepareFont(pdfFontName: string, fontSize: number, metrics: { ascent: number; descent: number }, families: string[]): Promise<MeasuredFont> {
  const matched = matchFontFamily(pdfFontName, families)
  const family = matched ?? suggestFontFamily(pdfFontName)
  if (!matched) {
    return { family, matched: false, ascent: metrics.ascent * fontSize, descent: metrics.descent * fontSize, measure: () => null }
  }

  const cssFont = `${fontSize}px "${family}"`
  try {
    await document.fonts.load(cssFont)
  } catch {
    // Measurement falls back to PDF metrics below.
  }
  const context = document.createElement('canvas').getContext('2d')
  if (!context || !document.fonts.check(cssFont)) {
    return { family, matched: true, ascent: metrics.ascent * fontSize, descent: metrics.descent * fontSize, measure: () => null }
  }
  context.font = cssFont
  const sample = context.measureText('Hg')
  return {
    family,
    matched: true,
    ascent: sample.fontBoundingBoxAscent || metrics.ascent * fontSize,
    descent: sample.fontBoundingBoxDescent || metrics.descent * fontSize,
    measure: (text) => context.measureText(text).width,
  }
}

function layerNameForText(text: string): string {
  const firstLine = text.split('\n')[0].trim()
  return firstLine.length > 28 ? `${firstLine.slice(0, 27)}…` : firstLine || 'Text'
}

let importCounter = 0
function importId(prefix: string): string {
  importCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${importCounter.toString(36)}`
}

function buildTextLayer(block: TextBlock, box: FilledRect | null, font: MeasuredFont, rawFontName: string, layerVisible: boolean): TextLayer {
  const fontSize = Math.round(block.fontSize * 10) / 10
  const lineGap = block.lineGap ?? fontSize * 1.2
  const lineHeight = Math.round((lineGap / fontSize) * 1000) / 1000
  // Illustrator counts trailing spaces when centering/right-aligning a line, but PDF text
  // extraction drops them. Restore one when the PDF line is a space-width wider than its
  // visible text, so the line lands where Illustrator put it (box text renders white-space: pre).
  // A trailing space shows up as that line's visible text sitting half a space left of
  // (centered) or a full space left of (right-aligned) the block's shared alignment edge.
  const spaceWidth = font.measure(' ')
  const anchorOf = (line: TextBlock['lines'][number]) => (block.align === 'right' ? line.left + line.width : line.left + line.width / 2)
  const sharedAnchor = Math.max(...block.lines.map(anchorOf))
  const lineTexts = block.lines.map((line) => {
    if (block.align === 'left' || spaceWidth === null || block.lines.length < 2) return line.text
    const perSpace = block.align === 'center' ? spaceWidth / 2 : spaceWidth
    const spaces = Math.round((sharedAnchor - anchorOf(line)) / perSpace)
    return spaces >= 1 && spaces <= 3 ? `${line.text}${' '.repeat(spaces)}` : line.text
  })
  const widths = lineTexts.map((text, index) => font.measure(text) ?? block.lines[index].width)
  const contentWidth = Math.max(...widths)
  const contentHeight = block.lines.length * lineGap
  // CSS centers the font's ascent+descent inside each line box; put the first baseline where the PDF has it.
  const baselineOffset = (lineGap - (font.ascent + font.descent)) / 2 + font.ascent
  const top = block.lines[0].baseline - baselineOffset
  // Illustrator's alignment point: the shared center (or right edge) of lines without trailing spaces.
  const centerX = block.align === 'center' ? sharedAnchor : 0
  const left = Math.min(...block.lines.map((line) => line.left))
  const right = Math.max(...block.lines.map((line) => line.left + line.width))
  const contentLeft = block.align === 'center' ? centerX - contentWidth / 2 : block.align === 'right' ? right - contentWidth : left
  const text = lineTexts.join('\n')

  const base = {
    id: importId('text-import'),
    kind: 'text' as const,
    name: layerNameForText(text),
    text,
    color: block.color,
    fontSize,
    fontFamily: font.family,
    fontWeight: font.matched ? 400 : weightFromStyle(rawFontName),
    align: block.align,
    lineHeight,
    opacity: 1,
    visible: layerVisible,
    locked: false,
    rotation: 0,
    scaleX: 100,
    scaleY: 100,
  }

  if (box) {
    const round = (value: number) => Math.max(0, Math.round(value * 10) / 10)
    return {
      ...base,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
      box: {
        fill: box.fill,
        paddingTop: round(top - box.y),
        paddingBottom: round(box.y + box.height - (top + contentHeight)),
        paddingLeft: round(contentLeft - box.x),
        paddingRight: round(box.x + box.width - (contentLeft + contentWidth)),
        radius: 0,
      },
    }
  }

  // Unboxed text: frame the measured text with slack so small metric differences never wrap a line.
  const slack = Math.ceil(fontSize * 0.25)
  return {
    ...base,
    x: Math.round(contentLeft - (block.align === 'left' ? 0 : slack)),
    y: Math.round(top),
    width: Math.round(contentWidth + (block.align === 'center' ? 2 * slack : slack)),
    height: Math.round(contentHeight),
  }
}

export async function importIllustratorFile(file: File, options: IllustratorImportOptions): Promise<IllustratorImportResult> {
  const warnings: string[] = []
  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  if (!header.includes('%PDF')) {
    throw new Error(NO_PDF_CONTENT_MESSAGE)
  }

  const pdfjs = await loadPdfjs()
  const source = await pdfjs.getDocument({ data: bytes.slice(), fontExtraProperties: true, isEvalSupported: false }).promise
  if (source.numPages > 1) {
    warnings.push(`This file has ${source.numPages} artboards; only the first was imported.`)
  }

  const page = await source.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const sceneWidth = Math.round(options.sceneWidth ?? 1920)
  const scale = sceneWidth / base.width
  const viewport = page.getViewport({ scale })
  const sceneHeight = Math.round(viewport.height)

  const placeholderCheck = await page.getTextContent()
  const allText = placeholderCheck.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  if (/saved without PDF Content/i.test(allText)) {
    throw new Error(NO_PDF_CONTENT_MESSAGE)
  }

  const optionalContent = await source.getOptionalContentConfig()
  const groups = new Map<string, { name: string; visible: boolean }>()
  for (const [id, group] of Object.entries(optionalContent.getGroups() ?? {})) {
    groups.set(id, { name: (group as { name?: string }).name ?? id, visible: optionalContent.isVisible(id) })
  }

  const analysis = await analyzePage(pdfjs, page, viewport.transform as Matrix, groups)
  const runs = await extractTextRuns(page, viewport, scale, analysis.sections)
  const fontNames = new Map<string, { name: string; ascent: number; descent: number }>()
  for (const run of runs) {
    if (!fontNames.has(run.fontName)) fontNames.set(run.fontName, await resolveFontName(page, run.fontName))
  }

  const blocks = groupRunsIntoBlocks(runs)
  const sceneArea = sceneWidth * sceneHeight
  const blockBoxes = blocks.map((block) => findBoxForBlock(block, analysis.rects, sceneArea))

  // Artwork without text or boxes; falls back to the original if the file cannot be edited.
  const artworkBytes = await buildArtworkPdf(bytes, blockBoxes.filter((box): box is FilledRect => Boolean(box)).map((box) => box.local))
  if (!artworkBytes && runs.length > 0) {
    warnings.push('Could not separate text from the artwork, so text also appears in the background images.')
  }
  const artwork = artworkBytes ? await pdfjs.getDocument({ data: artworkBytes, isEvalSupported: false }).promise : source
  const artworkPage = artwork === source ? page : await artwork.getPage(1)
  const artworkContent = await artwork.getOptionalContentConfig()
  const artworkGroupIds = Object.keys(artworkContent.getGroups() ?? {})
  const artworkGroupName = (id: string) => (artworkContent.getGroups()?.[id] as { name?: string } | undefined)?.name ?? id

  const layers: SceneLayer[] = []
  const usedFontWarnings = new Set<string>()

  for (let sectionIndex = 0; sectionIndex < analysis.sections.length; sectionIndex += 1) {
    const section = analysis.sections[sectionIndex]
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = sceneHeight

    if (section.ocgId) {
      for (const id of artworkGroupIds) {
        artworkContent.setVisibility(id, artworkGroupName(id) === section.name)
      }
    }

    await artworkPage.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
      background: 'rgba(0,0,0,0)',
      optionalContentConfigPromise: Promise.resolve(artworkContent),
    }).promise

    const crop = cropToContent(canvas)
    if (crop) {
      const image: ImageLayer = {
        id: importId('image-import'),
        kind: 'image',
        name: section.name,
        x: crop.x,
        y: crop.y,
        width: crop.width,
        height: crop.height,
        src: canvasToImage(canvas, crop),
        fit: 'stretch',
        opacity: 1,
        visible: section.visible,
        locked: false,
        rotation: 0,
        scaleX: 100,
        scaleY: 100,
        blendMode: section.blendMode,
      }
      layers.push(image)
    }

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex]
      if (block.section !== sectionIndex) continue
      const pdfFont = fontNames.get(block.fontName) ?? { name: block.fontName, ascent: 0.8, descent: 0.2 }
      const font = await prepareFont(pdfFont.name, block.fontSize, pdfFont, options.fontFamilies)
      const box = blockBoxes[blockIndex]
      const layer = buildTextLayer(block, box, font, pdfFont.name, section.visible)
      layers.push(layer)

      if (!font.matched && !usedFontWarnings.has(font.family)) {
        usedFontWarnings.add(font.family)
        const { family, style } = parsePdfFontName(pdfFont.name)
        warnings.push(`Font "${family}${style ? ` ${style}` : ''}" is not in the font library, so the text uses a fallback. Upload it in Dashboard > Typography (for example ${family}-${style ?? 'Regular'}.otf) and import again for exact sizing.`)
      }
      if (/recoleta/i.test(font.family) && /[A-Z]{2,}/.test(layer.text) && layer.text === layer.text.toUpperCase()) {
        warnings.push(`"${layer.name}" is Recoleta in all caps. Brand guidelines: Recoleta is lowercase or sentence case only.`)
      }
      const textColorNote = describeOffBrandColor(layer.color, `Text color in "${layer.name}"`)
      if (textColorNote) warnings.push(textColorNote)
      const boxColorNote = layer.box ? describeOffBrandColor(layer.box.fill, `Box color behind "${layer.name}"`) : null
      if (boxColorNote) warnings.push(boxColorNote)
    }
  }

  if (layers.length === 0) {
    warnings.push('Nothing visible was found on the artboard.')
  }

  await Promise.allSettled([source.destroy(), artwork === source ? Promise.resolve() : artwork.destroy()])

  return {
    scene: {
      id: importId('scene-import'),
      name: file.name.replace(/\.[^.]+$/, ''),
      width: sceneWidth,
      height: sceneHeight,
      background: 'transparent',
      layers,
    },
    warnings,
  }
}
