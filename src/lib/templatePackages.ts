import type {
  DataBindingKey,
  SceneDefinition,
  SceneLayer,
  TemplateDefinition,
  TemplateVersion,
} from '../types/scene'
import { extractBindingKeys, isDataBindingKey } from './bindings'

export const TEMPLATE_PACKAGE_KIND = 'renderless.template-package'
export const TEMPLATE_PACKAGE_VERSION = 1

interface TemplatePackageMetadata {
  templateId: string
  label: string
  sceneId: string
  sceneName: string
  size: {
    width: number
    height: number
  }
  templateVersion: number
  updatedAt: number
}

interface TemplatePackageVersionEntry {
  version: number
  label: string
  updatedAt: number
  bindings: DataBindingKey[]
  scenegraph: SceneDefinition
}

export interface TemplatePackageV1 {
  kind: typeof TEMPLATE_PACKAGE_KIND
  contractVersion: typeof TEMPLATE_PACKAGE_VERSION
  exportedAt: number
  metadata: TemplatePackageMetadata
  bindings: DataBindingKey[]
  scenegraph: SceneDefinition
  history: TemplatePackageVersionEntry[]
}

type TemplatePackageParseResult =
  | { ok: true; value: TemplatePackageV1 }
  | { ok: false; error: string }

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asFiniteNumber(value: unknown): number | null {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function asPositiveInteger(value: unknown, fallback: number): number {
  const numericValue = asFiniteNumber(value)
  if (numericValue === null || numericValue <= 0) {
    return fallback
  }

  return Math.floor(numericValue)
}

function normalizeBindings(rawBindings: unknown, fallbackScene: SceneDefinition): DataBindingKey[] {
  const fallbackBindings = extractBindingKeys(fallbackScene)
  if (!Array.isArray(rawBindings)) {
    return fallbackBindings
  }

  const unique = new Set<DataBindingKey>()
  rawBindings.forEach((binding) => {
    if (isDataBindingKey(binding)) {
      unique.add(binding)
    }
  })

  const normalized = [...unique].sort()
  return normalized.length > 0 ? normalized : fallbackBindings
}

function parseLayer(rawLayer: unknown): SceneLayer | null {
  const record = asRecord(rawLayer)
  if (!record) {
    return null
  }

  const id = asNonEmptyString(record.id)
  const name = asNonEmptyString(record.name)
  const kind = asNonEmptyString(record.kind)
  const x = asFiniteNumber(record.x)
  const y = asFiniteNumber(record.y)
  const width = asFiniteNumber(record.width)
  const height = asFiniteNumber(record.height)
  const opacity = asFiniteNumber(record.opacity)
  const visible = typeof record.visible === 'boolean' ? record.visible : null

  if (!id || !name || !kind || x === null || y === null || width === null || height === null || opacity === null || visible === null) {
    return null
  }

  const baseLayer = {
    id,
    name,
    x: Math.round(Math.max(0, x)),
    y: Math.round(Math.max(0, y)),
    width: Math.round(Math.max(1, width)),
    height: Math.round(Math.max(1, height)),
    opacity: Math.min(Math.max(opacity, 0), 1),
    visible,
    rotation: asFiniteNumber(record.rotation) ?? undefined,
  }

  if (kind === 'shape') {
    const fill = asNonEmptyString(record.fill)
    if (!fill) {
      return null
    }

    return {
      ...baseLayer,
      kind: 'shape',
      fill,
      radius: asFiniteNumber(record.radius) ?? undefined,
    }
  }

  if (kind === 'text') {
    const text = typeof record.text === 'string' ? record.text : null
    const color = asNonEmptyString(record.color)
    const fontSize = asFiniteNumber(record.fontSize)
    const fontFamily = asNonEmptyString(record.fontFamily)
    const fontWeight = asFiniteNumber(record.fontWeight)
    const alignRaw = asNonEmptyString(record.align)
    const align =
      alignRaw === 'left' || alignRaw === 'center' || alignRaw === 'right'
        ? alignRaw
        : undefined
    const binding = isDataBindingKey(record.binding) ? record.binding : undefined

    if (text === null || !color || fontSize === null || !fontFamily || fontWeight === null) {
      return null
    }

    return {
      ...baseLayer,
      kind: 'text',
      text,
      color,
      fontSize: Math.round(Math.max(8, fontSize)),
      fontFamily,
      fontWeight: Math.round(Math.max(100, fontWeight)),
      align,
      binding,
    }
  }

  return null
}

function parseScene(rawScene: unknown): SceneDefinition | null {
  const record = asRecord(rawScene)
  if (!record) {
    return null
  }

  const id = asNonEmptyString(record.id)
  const name = asNonEmptyString(record.name)
  const background = typeof record.background === 'string' ? record.background : null
  const width = asFiniteNumber(record.width)
  const height = asFiniteNumber(record.height)
  const rawLayers = Array.isArray(record.layers) ? record.layers : null

  if (!id || !name || !background || width === null || height === null || !rawLayers) {
    return null
  }

  const layers: SceneLayer[] = []

  for (const rawLayer of rawLayers) {
    const parsedLayer = parseLayer(rawLayer)
    if (!parsedLayer) {
      return null
    }

    layers.push(parsedLayer)
  }

  return {
    id,
    name,
    width: Math.round(Math.max(1, width)),
    height: Math.round(Math.max(1, height)),
    background,
    layers,
  }
}

function parseVersionEntry(rawVersion: unknown): TemplatePackageVersionEntry | null {
  const record = asRecord(rawVersion)
  if (!record) {
    return null
  }

  const scenegraph = parseScene(record.scenegraph)
  const label = asNonEmptyString(record.label)
  if (!scenegraph || !label) {
    return null
  }

  return {
    version: asPositiveInteger(record.version, 1),
    label,
    updatedAt: asPositiveInteger(record.updatedAt, Date.now()),
    bindings: normalizeBindings(record.bindings, scenegraph),
    scenegraph,
  }
}

function createPackageFromTemplateRecord(record: Record<string, unknown>): TemplatePackageV1 | null {
  const id = asNonEmptyString(record.id)
  const label = asNonEmptyString(record.label)
  const scenegraph = parseScene(record.scene)

  if (!id || !label || !scenegraph) {
    return null
  }

  const history = Array.isArray(record.versions)
    ? record.versions
        .map((entry) => {
          const versionRecord = asRecord(entry)
          if (!versionRecord) {
            return null
          }

          return parseVersionEntry({
            version: versionRecord.version,
            label: versionRecord.label,
            updatedAt: versionRecord.updatedAt,
            bindings: versionRecord.bindings,
            scenegraph: versionRecord.scene,
          })
        })
        .filter((entry): entry is TemplatePackageVersionEntry => entry !== null)
    : []

  const templateVersion = asPositiveInteger(record.version, 1)
  const updatedAt = asPositiveInteger(record.updatedAt, Date.now())
  const bindings = normalizeBindings(record.bindings, scenegraph)

  return {
    kind: TEMPLATE_PACKAGE_KIND,
    contractVersion: TEMPLATE_PACKAGE_VERSION,
    exportedAt: Date.now(),
    metadata: {
      templateId: id,
      label,
      sceneId: scenegraph.id,
      sceneName: scenegraph.name,
      size: {
        width: scenegraph.width,
        height: scenegraph.height,
      },
      templateVersion,
      updatedAt,
    },
    bindings,
    scenegraph,
    history,
  }
}

export function buildTemplatePackage(template: TemplateDefinition): TemplatePackageV1 {
  const scenegraph = cloneValue(template.scene)
  const history = (template.versions ?? []).map((entry) => ({
    version: asPositiveInteger(entry.version, 1),
    label: entry.label || template.label,
    updatedAt: asPositiveInteger(entry.updatedAt, Date.now()),
    bindings: normalizeBindings(entry.bindings, entry.scene),
    scenegraph: cloneValue(entry.scene),
  }))
  const templateVersion = asPositiveInteger(template.version, 1)
  const updatedAt = asPositiveInteger(template.updatedAt, Date.now())

  return {
    kind: TEMPLATE_PACKAGE_KIND,
    contractVersion: TEMPLATE_PACKAGE_VERSION,
    exportedAt: Date.now(),
    metadata: {
      templateId: template.id,
      label: template.label,
      sceneId: scenegraph.id,
      sceneName: scenegraph.name,
      size: {
        width: scenegraph.width,
        height: scenegraph.height,
      },
      templateVersion,
      updatedAt,
    },
    bindings: normalizeBindings(template.bindings, scenegraph),
    scenegraph,
    history,
  }
}

export function parseTemplatePackage(rawPackage: unknown): TemplatePackageParseResult {
  const record = asRecord(rawPackage)
  if (!record) {
    return { ok: false, error: 'Package must be a JSON object.' }
  }

  const maybeLegacyTemplate = createPackageFromTemplateRecord(record)
  if (maybeLegacyTemplate) {
    return { ok: true, value: maybeLegacyTemplate }
  }

  if (record.kind !== TEMPLATE_PACKAGE_KIND) {
    return { ok: false, error: `Unsupported package kind. Expected "${TEMPLATE_PACKAGE_KIND}".` }
  }

  if (asPositiveInteger(record.contractVersion, 0) !== TEMPLATE_PACKAGE_VERSION) {
    return { ok: false, error: `Unsupported contract version. Expected v${TEMPLATE_PACKAGE_VERSION}.` }
  }

  const metadataRecord = asRecord(record.metadata)
  if (!metadataRecord) {
    return { ok: false, error: 'Package metadata is missing.' }
  }

  const scenegraph = parseScene(record.scenegraph)
  if (!scenegraph) {
    return { ok: false, error: 'Scenegraph payload is invalid.' }
  }

  const templateId = asNonEmptyString(metadataRecord.templateId)
  const label = asNonEmptyString(metadataRecord.label)
  const sceneId = asNonEmptyString(metadataRecord.sceneId)
  const sceneName = asNonEmptyString(metadataRecord.sceneName)
  const sizeRecord = asRecord(metadataRecord.size)
  const sizeWidth = asFiniteNumber(sizeRecord?.width)
  const sizeHeight = asFiniteNumber(sizeRecord?.height)

  if (!templateId || !label || !sceneId || !sceneName || sizeWidth === null || sizeHeight === null) {
    return { ok: false, error: 'Package metadata fields are invalid.' }
  }

  const templateVersion = asPositiveInteger(metadataRecord.templateVersion, 1)
  const updatedAt = asPositiveInteger(metadataRecord.updatedAt, Date.now())
  const exportedAt = asPositiveInteger(record.exportedAt, Date.now())
  const bindings = normalizeBindings(record.bindings, scenegraph)
  const history = Array.isArray(record.history)
    ? record.history
        .map((entry) => parseVersionEntry(entry))
        .filter((entry): entry is TemplatePackageVersionEntry => entry !== null)
    : []

  return {
    ok: true,
    value: {
      kind: TEMPLATE_PACKAGE_KIND,
      contractVersion: TEMPLATE_PACKAGE_VERSION,
      exportedAt,
      metadata: {
        templateId,
        label,
        sceneId,
        sceneName,
        size: {
          width: scenegraph.width,
          height: scenegraph.height,
        },
        templateVersion,
        updatedAt,
      },
      bindings,
      scenegraph: cloneValue(scenegraph),
      history,
    },
  }
}

export function templateFromPackage(templatePackage: TemplatePackageV1): TemplateDefinition {
  const versions: TemplateVersion[] = templatePackage.history.map((entry) => ({
    version: entry.version,
    label: entry.label,
    updatedAt: entry.updatedAt,
    bindings: [...entry.bindings],
    scene: cloneValue(entry.scenegraph),
  }))

  return {
    id: templatePackage.metadata.templateId,
    label: templatePackage.metadata.label,
    scene: cloneValue({
      ...templatePackage.scenegraph,
      id: templatePackage.metadata.sceneId,
      name: templatePackage.metadata.sceneName,
    }),
    bindings: [...templatePackage.bindings],
    builtIn: false,
    favorite: false,
    version: templatePackage.metadata.templateVersion,
    versions,
    updatedAt: templatePackage.metadata.updatedAt,
  }
}
