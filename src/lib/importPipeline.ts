import { readPsd } from 'ag-psd'
import { strFromU8, unzipSync } from 'fflate'
import type { DataBindingKey, SceneDefinition, SceneLayer, TemplateBindingHint, TemplateDefinition, TextLayer } from '../types/scene'
import { isDataBindingKey } from './bindings'

export type DesignImportSourceType = 'psd' | 'lottie' | 'illustrator'

export interface DesignImportDraft {
  id: string
  sourceType: DesignImportSourceType
  sourceName: string
  templateLabel: string
  scene: SceneDefinition
  bindingHints: TemplateBindingHint[]
  warnings: string[]
}

interface PsdLikeLayer {
  name?: string
  hidden?: boolean
  opacity?: number
  left?: number
  top?: number
  right?: number
  bottom?: number
  children?: PsdLikeLayer[]
  text?: Record<string, unknown> & {
    text?: string
    style?: {
      font?: { name?: string }
      fontName?: string
      fontSize?: number
      fillColor?: { r?: number; g?: number; b?: number }
      justification?: string
    }
    styleRuns?: Array<{
      style?: {
        font?: { name?: string }
        fontName?: string
        fontSize?: number
        fillColor?: { r?: number; g?: number; b?: number }
        justification?: string
      }
    }>
  }
  canvas?: {
    width?: number
    height?: number
    toDataURL?: (type?: string) => string
  }
}

interface LottieDoc {
  w?: number
  h?: number
  fr?: number
  layers?: Array<Record<string, unknown>>
  assets?: Array<Record<string, unknown>>
  fonts?: {
    list?: Array<Record<string, unknown>>
  }
}

const BINDING_TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g
const LAYER_BINDING_REGEX = /\[(?:bind|binding)\s*:\s*([^\]]+)\]/i

const BINDING_ALIAS_MAP: Record<string, DataBindingKey> = {
  home: 'homeScore',
  home_score: 'homeScore',
  homescore: 'homeScore',
  away: 'awayScore',
  away_score: 'awayScore',
  awayscore: 'awayScore',
  clock: 'clock',
  game_clock: 'clock',
  period: 'period',
  quarter: 'period',
  qtr: 'period',
  shot_clock: 'shotClock',
  shotclock: 'shotClock',
  home_fouls: 'homeFouls',
  away_fouls: 'awayFouls',
  headline: 'headline',
  title: 'headline',
}

function createImportId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function asFiniteNumber(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function getFileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || 'Imported Template'
}

function asHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${asHex(red)}${asHex(green)}${asHex(blue)}`
}

function lottieColorToHex(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length < 3) {
    return '#f1f5f9'
  }

  const [r, g, b] = raw
  const red = Number(r)
  const green = Number(g)
  const blue = Number(b)

  if (![red, green, blue].every((value) => Number.isFinite(value))) {
    return '#f1f5f9'
  }

  return rgbToHex(red * 255, green * 255, blue * 255)
}

function psdColorToHex(raw: unknown): string {
  if (!raw || typeof raw !== 'object') {
    return '#f1f5f9'
  }

  const record = raw as Record<string, unknown>
  const red = asFiniteNumber(record.r) ?? 241
  const green = asFiniteNumber(record.g) ?? 245
  const blue = asFiniteNumber(record.b) ?? 249
  return rgbToHex(red, green, blue)
}

function sanitizePsdText(raw: string): string {
  return raw.split(String.fromCharCode(0)).join('').replace(/\r/g, '\n').trim()
}

function extractPsdText(rawText: unknown): string {
  if (typeof rawText === 'string') {
    return sanitizePsdText(rawText)
  }
  if (Array.isArray(rawText)) {
    const stringValue = rawText
      .map((entry) => (typeof entry === 'string' ? entry : typeof entry === 'number' ? String.fromCharCode(entry) : ''))
      .join('')
    return sanitizePsdText(stringValue)
  }
  return ''
}

function extractPsdTextValue(layer: PsdLikeLayer): string {
  const textRecord = layer.text
  if (!textRecord || typeof textRecord !== 'object') {
    return ''
  }

  const candidates = [
    textRecord.text,
    textRecord['Txt '],
    textRecord.Txt,
    textRecord.txt,
    textRecord.Text,
    textRecord.textValue,
    textRecord.value,
  ]

  for (const candidate of candidates) {
    const parsed = extractPsdText(candidate)
    if (parsed.length > 0) {
      return parsed
    }
  }

  return ''
}

function layerOpacityToUnit(rawOpacity: unknown): number {
  const value = asFiniteNumber(rawOpacity)
  if (value === null) {
    return 1
  }
  if (value <= 1) {
    return clamp(value, 0, 1)
  }
  return clamp(value / 255, 0, 1)
}

function detectBindingHintFromText(layerId: string, layerName: string, sourceText: string): TemplateBindingHint | null {
  const explicitLayerBinding = layerName.match(LAYER_BINDING_REGEX)?.[1]?.trim()
  if (explicitLayerBinding && explicitLayerBinding.length > 0) {
    return {
      layerId,
      layerName,
      sampleText: sourceText,
      sourceToken: explicitLayerBinding,
      suggestedBinding: explicitLayerBinding,
      confidence: 0.98,
    }
  }

  const tokenMatch = BINDING_TOKEN_REGEX.exec(sourceText)
  BINDING_TOKEN_REGEX.lastIndex = 0
  if (tokenMatch?.[1]) {
    const token = tokenMatch[1].trim()
    return {
      layerId,
      layerName,
      sampleText: sourceText,
      sourceToken: token,
      suggestedBinding: token,
      confidence: 0.92,
    }
  }

  const normalizedLayerName = layerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const aliasBinding = BINDING_ALIAS_MAP[normalizedLayerName]
  if (aliasBinding) {
    return {
      layerId,
      layerName,
      sampleText: sourceText,
      sourceToken: normalizedLayerName,
      suggestedBinding: aliasBinding,
      confidence: 0.68,
    }
  }

  return null
}

function sanitizeTextForBinding(text: string, bindingKey: string, fallbackLabel: string): string {
  const stripped = text.replace(BINDING_TOKEN_REGEX, '').trim()
  if (stripped.length > 0) {
    return stripped
  }

  const normalized = bindingKey.toLowerCase()
  if (normalized.includes('clock')) {
    return '12:00'
  }
  if (normalized.includes('headline') || normalized.includes('story')) {
    return fallbackLabel || 'Headline'
  }
  if (normalized.includes('name')) {
    return fallbackLabel || 'Player'
  }
  return '0'
}

function normalizeBindingHint(hint: TemplateBindingHint): TemplateBindingHint {
  return {
    layerId: hint.layerId,
    layerName: hint.layerName,
    sampleText: hint.sampleText,
    sourceToken: hint.sourceToken,
    suggestedBinding: hint.suggestedBinding && isDataBindingKey(hint.suggestedBinding) ? hint.suggestedBinding : undefined,
    confidence: typeof hint.confidence === 'number' ? clamp(hint.confidence, 0, 1) : undefined,
  }
}

function normalizeLayerName(name: string, fallbackPrefix: string, index: number): string {
  const trimmed = name.trim()
  if (trimmed.length > 0) {
    return trimmed
  }

  return `${fallbackPrefix} ${index + 1}`
}

function normalizeSceneSize(width: number, height: number): { width: number; height: number } {
  const normalizedWidth = Math.max(1, Math.round(width))
  const normalizedHeight = Math.max(1, Math.round(height))
  return {
    width: normalizedWidth,
    height: normalizedHeight,
  }
}

function canvasToDataUrl(canvas: PsdLikeLayer['canvas']): string {
  if (!canvas || typeof canvas.toDataURL !== 'function') {
    return ''
  }

  try {
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

function mapPsdAlign(raw: unknown): 'left' | 'center' | 'right' {
  if (typeof raw !== 'string') {
    return 'left'
  }
  const normalized = raw.toLowerCase()
  if (normalized.includes('center')) {
    return 'center'
  }
  if (normalized.includes('right')) {
    return 'right'
  }
  return 'left'
}

function collectPsdLeafLayers(rootLayers: PsdLikeLayer[] | undefined): PsdLikeLayer[] {
  if (!Array.isArray(rootLayers)) {
    return []
  }

  const flattened: PsdLikeLayer[] = []
  const walk = (layers: PsdLikeLayer[]) => {
    layers.forEach((layer) => {
      if (Array.isArray(layer.children) && layer.children.length > 0) {
        walk(layer.children)
        return
      }
      flattened.push(layer)
    })
  }

  walk(rootLayers)
  return flattened
}

function createImageLayerFromPsdLayer(
  layer: PsdLikeLayer,
  index: number,
  sceneWidth: number,
  sceneHeight: number,
  warnings: string[],
): SceneLayer | null {
  const src = canvasToDataUrl(layer.canvas)
  if (!src) {
    warnings.push(`Skipped PSD layer "${layer.name ?? `Layer ${index + 1}`}" (missing raster canvas).`)
    return null
  }

  const left = Math.round(asFiniteNumber(layer.left) ?? 0)
  const top = Math.round(asFiniteNumber(layer.top) ?? 0)
  const right = Math.round(asFiniteNumber(layer.right) ?? left + Math.round(asFiniteNumber(layer.canvas?.width) ?? 1))
  const bottom = Math.round(asFiniteNumber(layer.bottom) ?? top + Math.round(asFiniteNumber(layer.canvas?.height) ?? 1))
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)

  return {
    id: createImportId('layer-image'),
    kind: 'image',
    name: normalizeLayerName(layer.name ?? '', 'PSD Image', index),
    x: clamp(left, 0, Math.max(0, sceneWidth - 1)),
    y: clamp(top, 0, Math.max(0, sceneHeight - 1)),
    width: clamp(width, 1, sceneWidth),
    height: clamp(height, 1, sceneHeight),
    opacity: layerOpacityToUnit(layer.opacity),
    visible: layer.hidden !== true,
    src,
    fit: 'cover',
  }
}

function createTextLayerFromPsdLayer(
  layer: PsdLikeLayer,
  index: number,
  sceneWidth: number,
  sceneHeight: number,
): { layer: TextLayer; hint: TemplateBindingHint | null } | null {
  const rawText = extractPsdTextValue(layer)
  if (!rawText.trim()) {
    return null
  }

  const style = layer.text?.styleRuns?.[0]?.style ?? layer.text?.style ?? {}
  const left = Math.round(asFiniteNumber(layer.left) ?? 0)
  const top = Math.round(asFiniteNumber(layer.top) ?? 0)
  const right = Math.round(asFiniteNumber(layer.right) ?? left + 320)
  const bottom = Math.round(asFiniteNumber(layer.bottom) ?? top + 120)
  const fontSize = Math.max(8, Math.round(asFiniteNumber(style.fontSize) ?? 86))
  const width = Math.max(80, right - left)
  const height = Math.max(24, bottom - top)
  const fontFamily =
    style.font?.name?.trim() ||
    style.fontName?.trim() ||
    'Inter, sans-serif'

  const layerId = createImportId('layer-text')
  const layerName = normalizeLayerName(layer.name ?? '', 'PSD Text', index)
  const hint = detectBindingHintFromText(layerId, layerName, rawText)
  const binding = hint?.suggestedBinding && isDataBindingKey(hint.suggestedBinding) ? hint.suggestedBinding : undefined

  const layerValue: TextLayer = {
    id: layerId,
    kind: 'text',
    name: layerName,
    x: clamp(left, 0, Math.max(0, sceneWidth - 1)),
    y: clamp(top, 0, Math.max(0, sceneHeight - 1)),
    width: clamp(width, 1, sceneWidth),
    height: clamp(height, 1, sceneHeight),
    opacity: layerOpacityToUnit(layer.opacity),
    visible: layer.hidden !== true,
    text: binding ? sanitizeTextForBinding(rawText, binding, layerName) : rawText,
    color: psdColorToHex(style.fillColor),
    fontSize,
    fontFamily,
    fontWeight: 700,
    align: mapPsdAlign(style.justification),
    binding,
  }

  return {
    layer: layerValue,
    hint,
  }
}

async function createDraftFromPsd(file: File): Promise<DesignImportDraft> {
  const arrayBuffer = await file.arrayBuffer()
  const psd = readPsd(arrayBuffer, {
    skipLayerImageData: false,
    skipCompositeImageData: false,
    throwForMissingFeatures: false,
    logMissingFeatures: false,
  }) as unknown as {
    width?: number
    height?: number
    children?: PsdLikeLayer[]
  }

  const { width, height } = normalizeSceneSize(asFiniteNumber(psd.width) ?? 1920, asFiniteNumber(psd.height) ?? 1080)
  const leafLayers = collectPsdLeafLayers(psd.children)
  const sceneLayers: SceneLayer[] = []
  const bindingHints: TemplateBindingHint[] = []
  const warnings: string[] = []

  leafLayers.forEach((layer, index) => {
    const textLayer = createTextLayerFromPsdLayer(layer, index, width, height)
    if (textLayer) {
      sceneLayers.push(textLayer.layer)
      if (textLayer.hint) {
        bindingHints.push(normalizeBindingHint(textLayer.hint))
      }
      return
    }

    const imageLayer = createImageLayerFromPsdLayer(layer, index, width, height, warnings)
    if (imageLayer) {
      sceneLayers.push(imageLayer)
    }
  })

  if (sceneLayers.length === 0) {
    sceneLayers.push({
      id: createImportId('layer-shape'),
      kind: 'shape',
      name: 'PSD Base',
      x: 0,
      y: 0,
      width,
      height,
      opacity: 1,
      visible: true,
      fill: '#0b1a30',
      radius: 0,
    })
    warnings.push('PSD had no directly importable layers. Added fallback background shape.')
  }

  const scene: SceneDefinition = {
    id: createImportId('scene-psd'),
    name: getFileNameWithoutExtension(file.name),
    width,
    height,
    background: '#00142a',
    layers: sceneLayers,
  }

  return {
    id: createImportId('draft-psd'),
    sourceType: 'psd',
    sourceName: file.name,
    templateLabel: getFileNameWithoutExtension(file.name),
    scene,
    bindingHints,
    warnings,
  }
}

function lottiePositionValue(raw: unknown): [number, number] {
  if (Array.isArray(raw) && raw.length >= 2) {
    return [Number(raw[0]) || 0, Number(raw[1]) || 0]
  }

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    if (Array.isArray(record.k) && record.k.length >= 2) {
      return [Number(record.k[0]) || 0, Number(record.k[1]) || 0]
    }
    if (Array.isArray(record.k) && record.k.length > 0 && record.k[0] && typeof record.k[0] === 'object') {
      const firstKeyframe = record.k[0] as Record<string, unknown>
      if (Array.isArray(firstKeyframe.s) && firstKeyframe.s.length >= 2) {
        return [Number(firstKeyframe.s[0]) || 0, Number(firstKeyframe.s[1]) || 0]
      }
    }
  }

  return [0, 0]
}

function extractLottieDocument(lottieLayer: Record<string, unknown>): Record<string, unknown> | null {
  const textRecord = lottieLayer.t
  if (!textRecord || typeof textRecord !== 'object') {
    return null
  }
  const docRecord = (textRecord as Record<string, unknown>).d
  if (!docRecord || typeof docRecord !== 'object') {
    return null
  }
  const keyframes = (docRecord as Record<string, unknown>).k
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    return null
  }
  const first = keyframes[0]
  if (!first || typeof first !== 'object') {
    return null
  }
  const shape = (first as Record<string, unknown>).s
  if (!shape || typeof shape !== 'object') {
    return null
  }
  return shape as Record<string, unknown>
}

function findLottieJsonPayload(file: File, warnings: string[]): Promise<LottieDoc> {
  return (async () => {
    const lowerName = file.name.toLowerCase()

    if (lowerName.endsWith('.json')) {
      const parsed = JSON.parse(await file.text()) as unknown
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('JSON payload is not an object.')
      }
      return parsed as LottieDoc
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const archive = unzipSync(bytes)
    const paths = Object.keys(archive)
    const manifestPath = paths.find((path) => path.toLowerCase() === 'manifest.json')
    let animationPath = paths.find(
      (path) =>
        path.toLowerCase().startsWith('animations/') &&
        path.toLowerCase().endsWith('.json'),
    )

    if (manifestPath) {
      try {
        const manifest = JSON.parse(strFromU8(archive[manifestPath])) as {
          animations?: Array<{ id?: string }>
        }
        const animationId = manifest.animations?.[0]?.id
        if (animationId) {
          const pathByManifest = paths.find((path) => path.toLowerCase() === `animations/${animationId}.json`.toLowerCase())
          if (pathByManifest) {
            animationPath = pathByManifest
          }
        }
      } catch {
        warnings.push('Could not parse .lottie manifest. Using first animation JSON file.')
      }
    }

    if (!animationPath) {
      animationPath = paths.find(
        (path) => path.toLowerCase().endsWith('.json') && path.toLowerCase() !== 'manifest.json',
      )
    }

    if (!animationPath) {
      throw new Error('No animation JSON found in .lottie package.')
    }

    return JSON.parse(strFromU8(archive[animationPath])) as LottieDoc
  })()
}

async function createDraftFromLottie(file: File): Promise<DesignImportDraft> {
  const warnings: string[] = []
  const lottie = await findLottieJsonPayload(file, warnings)
  const { width, height } = normalizeSceneSize(asFiniteNumber(lottie.w) ?? 1920, asFiniteNumber(lottie.h) ?? 1080)
  const fonts = new Map<string, string>()
  ;(lottie.fonts?.list ?? []).forEach((fontRecord) => {
    const key = typeof fontRecord.fName === 'string' ? fontRecord.fName : ''
    const family = typeof fontRecord.fFamily === 'string' ? fontRecord.fFamily : ''
    if (key && family) {
      fonts.set(key, family)
    }
  })

  const sceneLayers: SceneLayer[] = []
  const bindingHints: TemplateBindingHint[] = []

  ;(lottie.layers ?? []).forEach((layerRecord, index) => {
    const layerType = Number(layerRecord.ty)
    if (layerType !== 5) {
      return
    }

    const doc = extractLottieDocument(layerRecord)
    if (!doc) {
      return
    }

    const rawText = typeof doc.t === 'string' ? doc.t : ''
    if (!rawText.trim()) {
      return
    }

    const fontSize = Math.max(8, Math.round(asFiniteNumber(doc.s) ?? 64))
    const [positionX, positionY] = lottiePositionValue((layerRecord.ks as Record<string, unknown> | undefined)?.p)
    const estimatedWidth = Math.max(120, Math.round(rawText.replace(BINDING_TOKEN_REGEX, '0').length * Math.max(fontSize * 0.56, 24)))
    const estimatedHeight = Math.max(24, Math.round(fontSize * 1.25))
    const layerId = createImportId('layer-text')
    const layerName = normalizeLayerName(typeof layerRecord.nm === 'string' ? layerRecord.nm : '', 'Lottie Text', index)
    const hint = detectBindingHintFromText(layerId, layerName, rawText)
    const binding = hint?.suggestedBinding && isDataBindingKey(hint.suggestedBinding) ? hint.suggestedBinding : undefined
    const fontRef = typeof doc.f === 'string' ? doc.f : ''
    const fontFamily = fonts.get(fontRef) ?? 'Inter, sans-serif'
    const alignRaw = Number(doc.j)
    const align = alignRaw === 2 ? 'center' : alignRaw === 1 ? 'right' : 'left'
    const opacityRaw = asFiniteNumber(((layerRecord.ks as Record<string, unknown> | undefined)?.o as Record<string, unknown> | undefined)?.k)

    const textLayer: TextLayer = {
      id: layerId,
      kind: 'text',
      name: layerName,
      x: clamp(Math.round(positionX - estimatedWidth / 2), 0, Math.max(0, width - estimatedWidth)),
      y: clamp(Math.round(positionY - estimatedHeight / 2), 0, Math.max(0, height - estimatedHeight)),
      width: clamp(estimatedWidth, 1, width),
      height: clamp(estimatedHeight, 1, height),
      visible: true,
      opacity: opacityRaw === null ? 1 : clamp(opacityRaw / 100, 0, 1),
      text: binding ? sanitizeTextForBinding(rawText, binding, layerName) : rawText,
      color: lottieColorToHex(doc.fc),
      fontSize,
      fontFamily,
      fontWeight: 700,
      align,
      binding,
    }

    sceneLayers.push(textLayer)
    if (hint) {
      bindingHints.push(normalizeBindingHint(hint))
    }
  })

  if (sceneLayers.length === 0) {
    sceneLayers.push({
      id: createImportId('layer-shape'),
      kind: 'shape',
      name: 'Lottie Base',
      x: 0,
      y: 0,
      width,
      height,
      opacity: 1,
      visible: true,
      fill: '#0b1a30',
      radius: 0,
    })
    warnings.push('No text layers were detected in this Lottie file. Added fallback background shape.')
  }

  const scene: SceneDefinition = {
    id: createImportId('scene-lottie'),
    name: getFileNameWithoutExtension(file.name),
    width,
    height,
    background: '#00142a',
    layers: sceneLayers.reverse(),
  }

  return {
    id: createImportId('draft-lottie'),
    sourceType: 'lottie',
    sourceName: file.name,
    templateLabel: getFileNameWithoutExtension(file.name),
    scene,
    bindingHints,
    warnings,
  }
}

export function isTemplatePackageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.rltpl') || lower.endsWith('.rltpl.json')
}

export function isIllustratorImportFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.ai') || lower.endsWith('.pdf')
}

export function isDesignImportFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    isIllustratorImportFile(lower) ||
    lower.endsWith('.psd') ||
    lower.endsWith('.lottie') ||
    lower.endsWith('.lottie.zip') ||
    lower.endsWith('.zip')
  )
}

async function createDraftFromIllustrator(file: File, fontFamilies: string[]): Promise<DesignImportDraft> {
  // Loaded on demand: keeps PDF.js and pdf-lib out of the main bundle.
  const { importIllustratorFile } = await import('./illustrator/importIllustrator')
  const { scene, warnings } = await importIllustratorFile(file, { fontFamilies })
  return {
    id: createImportId('import-ai'),
    sourceType: 'illustrator',
    sourceName: file.name,
    templateLabel: getFileNameWithoutExtension(file.name),
    scene,
    bindingHints: [],
    warnings,
  }
}

export function isLikelyLottieJsonPayload(rawValue: unknown): boolean {
  if (!rawValue || typeof rawValue !== 'object') {
    return false
  }

  const record = rawValue as Record<string, unknown>
  return Array.isArray(record.layers) && Number.isFinite(Number(record.w)) && Number.isFinite(Number(record.h))
}

export async function createDesignImportDraft(file: File, options: { fontFamilies?: string[] } = {}): Promise<DesignImportDraft> {
  const lower = file.name.toLowerCase()
  if (isIllustratorImportFile(lower)) {
    return createDraftFromIllustrator(file, options.fontFamilies ?? [])
  }

  if (lower.endsWith('.psd')) {
    return createDraftFromPsd(file)
  }

  return createDraftFromLottie(file)
}

export function materializeTemplateFromDraft(
  draft: DesignImportDraft,
  config: {
    label: string
    layerBindingMap: Record<string, string>
  },
): TemplateDefinition {
  const templateLabel = config.label.trim() || draft.templateLabel
  const nextScene: SceneDefinition = {
    ...draft.scene,
    id: createImportId('scene-import'),
    name: templateLabel,
    layers: draft.scene.layers.map((layer) => {
      if (layer.kind !== 'text') {
        return {
          ...layer,
        }
      }

      const mappedBinding = config.layerBindingMap[layer.id]?.trim()
      const fallbackHint = draft.bindingHints.find((hint) => hint.layerId === layer.id)?.suggestedBinding
      const nextBinding = mappedBinding || fallbackHint

      if (!nextBinding) {
        return {
          ...layer,
          binding: undefined,
        }
      }

      return {
        ...layer,
        text: sanitizeTextForBinding(layer.text, nextBinding, layer.name),
        binding: nextBinding,
      }
    }),
  }

  const nextHints = draft.bindingHints.map((hint) => ({
    ...hint,
    suggestedBinding: config.layerBindingMap[hint.layerId]?.trim() || hint.suggestedBinding,
  }))

  return {
    id: createImportId('template-import'),
    label: templateLabel,
    scene: nextScene,
    bindings: nextScene.layers
      .filter((layer): layer is TextLayer => layer.kind === 'text' && typeof layer.binding === 'string')
      .map((layer) => layer.binding as DataBindingKey),
    bindingHints: nextHints,
    builtIn: false,
    favorite: false,
    version: 1,
    versions: [],
    updatedAt: Date.now(),
  }
}
