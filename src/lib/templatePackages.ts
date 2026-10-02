import {
  LAYER_BLEND_MODES,
  type DataBindingKey,
  type LayerBlendMode,
  type SceneDefinition,
  type SceneLayer,
  type TemplateBindingHint,
  type TemplateDefinition,
  type TemplateVersion,
  type TextBoxStyle,
} from '../types/scene'
import { extractBindingKeys, isDataBindingKey } from './bindings'

export const TEMPLATE_PACKAGE_KIND = 'renderless.template-package'
export const TEMPLATE_PACKAGE_VERSION = 2
export const TEMPLATE_PACKAGE_CHECKSUM_ALGORITHM = 'fnv1a-32'
export const TEMPLATE_PACKAGE_SIGNATURE_ALGORITHM = 'fnv1a-32-hmac-lite'

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

interface TemplatePackageIntegrity {
  checksum: {
    algorithm: typeof TEMPLATE_PACKAGE_CHECKSUM_ALGORITHM
    value: string
  }
  signature?: {
    algorithm: typeof TEMPLATE_PACKAGE_SIGNATURE_ALGORITHM
    keyId: string
    value: string
  }
}

export interface TemplatePackageV1 {
  kind: typeof TEMPLATE_PACKAGE_KIND
  contractVersion: 1
  exportedAt: number
  metadata: TemplatePackageMetadata
  bindings: DataBindingKey[]
  scenegraph: SceneDefinition
  history: TemplatePackageVersionEntry[]
}

export interface TemplatePackageV2 {
  kind: typeof TEMPLATE_PACKAGE_KIND
  contractVersion: typeof TEMPLATE_PACKAGE_VERSION
  exportedAt: number
  metadata: TemplatePackageMetadata
  bindings: DataBindingKey[]
  scenegraph: SceneDefinition
  history: TemplatePackageVersionEntry[]
  bindingHints?: TemplateBindingHint[]
  integrity: TemplatePackageIntegrity
}

export type TemplatePackage = TemplatePackageV2

export interface TemplatePackageSigningConfig {
  keyId: string
  secret: string
}

interface TemplatePackageParseOptions {
  signingSecret?: string
  verifySignature?: boolean
}

interface TemplatePackageMigrateResult {
  ok: true
  value: TemplatePackageV2
  migrated: boolean
  migrationTrail: string[]
}

type TemplatePackageParseResult =
  | TemplatePackageMigrateResult
  | { ok: false; error: string }

type UnsignedTemplatePackage = Omit<TemplatePackageV2, 'integrity'>

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value)) as T
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableValue(entry))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = stableValue(record[key])
        return accumulator
      }, {})
  }

  return value
}

function canonicalizeUnsignedPackage(value: UnsignedTemplatePackage): string {
  return JSON.stringify(stableValue(value))
}

function hashFnv1a32(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
    hash >>>= 0
  }

  return hash.toString(16).padStart(8, '0')
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

function parseTemplateBindingHints(rawHints: unknown): TemplateBindingHint[] {
  if (!Array.isArray(rawHints)) {
    return []
  }

  return rawHints
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) {
        return null
      }

      const layerId = asNonEmptyString(record.layerId)
      const layerName = asNonEmptyString(record.layerName)
      const sampleText = typeof record.sampleText === 'string' ? record.sampleText : ''
      const sourceToken = asNonEmptyString(record.sourceToken) ?? undefined
      const suggestedBinding = isDataBindingKey(record.suggestedBinding) ? record.suggestedBinding : undefined
      const confidenceRaw = asFiniteNumber(record.confidence)
      const confidence =
        confidenceRaw === null ? undefined : Math.min(Math.max(Number(confidenceRaw), 0), 1)

      if (!layerId || !layerName) {
        return null
      }

      return {
        layerId,
        layerName,
        sampleText,
        ...(sourceToken ? { sourceToken } : {}),
        ...(suggestedBinding ? { suggestedBinding } : {}),
        ...(typeof confidence === 'number' ? { confidence } : {}),
      } satisfies TemplateBindingHint
    })
    .filter((entry): entry is TemplateBindingHint => entry !== null)
}

function normalizeTemplateBindingHints(rawHints: unknown): TemplateBindingHint[] {
  const parsed = parseTemplateBindingHints(rawHints)
  if (parsed.length === 0) {
    return []
  }

  const unique = new Map<string, TemplateBindingHint>()
  parsed.forEach((hint) => {
    unique.set(hint.layerId, hint)
  })
  return [...unique.values()]
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
  const locked = typeof record.locked === 'boolean' ? record.locked : undefined

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
    locked,
    rotation: asFiniteNumber(record.rotation) ?? undefined,
    anchorX: asFiniteNumber(record.anchorX) ?? undefined,
    anchorY: asFiniteNumber(record.anchorY) ?? undefined,
    scaleX: asFiniteNumber(record.scaleX) ?? undefined,
    scaleY: asFiniteNumber(record.scaleY) ?? undefined,
    blendMode: parseBlendMode(record.blendMode),
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
    const verticalAlign =
      record.verticalAlign === 'top' || record.verticalAlign === 'middle' || record.verticalAlign === 'bottom'
        ? record.verticalAlign
        : undefined
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
      verticalAlign,
      lineHeight: parseLineHeight(record.lineHeight),
      box: parseTextBox(record.box),
      binding,
    }
  }

  if (kind === 'image') {
    const src = asNonEmptyString(record.src)
    const fitRaw = asNonEmptyString(record.fit)
    const fit =
      fitRaw === 'contain' || fitRaw === 'cover' || fitRaw === 'stretch'
        ? fitRaw
        : 'contain'

    if (!src) {
      return null
    }

    return {
      ...baseLayer,
      kind: 'image',
      src,
      fit,
    }
  }

  return null
}

function parseBlendMode(raw: unknown): LayerBlendMode | undefined {
  return typeof raw === 'string' && (LAYER_BLEND_MODES as readonly string[]).includes(raw) && raw !== 'normal'
    ? (raw as LayerBlendMode)
    : undefined
}

function parseLineHeight(raw: unknown): number | undefined {
  const value = asFiniteNumber(raw)
  return value === null ? undefined : Math.min(Math.max(value, 0.5), 4)
}

function parseTextBox(raw: unknown): TextBoxStyle | undefined {
  const record = asRecord(raw)
  const fill = record ? asNonEmptyString(record.fill) : null
  if (!record || !fill) {
    return undefined
  }

  const padding = (value: unknown) => Math.max(0, asFiniteNumber(value) ?? 0)
  const radius = asFiniteNumber(record.radius)
  return {
    fill,
    paddingTop: padding(record.paddingTop),
    paddingRight: padding(record.paddingRight),
    paddingBottom: padding(record.paddingBottom),
    paddingLeft: padding(record.paddingLeft),
    radius: radius === null ? undefined : Math.max(0, radius),
  }
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

function asSigningConfig(config: TemplatePackageSigningConfig | null | undefined): TemplatePackageSigningConfig | null {
  const keyId = asNonEmptyString(config?.keyId)
  const secret = asNonEmptyString(config?.secret)

  if (!keyId || !secret) {
    return null
  }

  return {
    keyId,
    secret,
  }
}

function signChecksum(
  checksum: string,
  signingConfig: TemplatePackageSigningConfig,
): NonNullable<TemplatePackageIntegrity['signature']> {
  const signatureInput = `${signingConfig.keyId}:${signingConfig.secret}:${checksum}`

  return {
    algorithm: TEMPLATE_PACKAGE_SIGNATURE_ALGORITHM,
    keyId: signingConfig.keyId,
    value: hashFnv1a32(signatureInput),
  }
}

function attachIntegrity(
  unsignedPackage: UnsignedTemplatePackage,
  signingConfig?: TemplatePackageSigningConfig | null,
): TemplatePackageV2 {
  const canonicalPayload = canonicalizeUnsignedPackage(unsignedPackage)
  const checksum = hashFnv1a32(canonicalPayload)
  const normalizedSigningConfig = asSigningConfig(signingConfig)

  return {
    ...unsignedPackage,
    integrity: {
      checksum: {
        algorithm: TEMPLATE_PACKAGE_CHECKSUM_ALGORITHM,
        value: checksum,
      },
      ...(normalizedSigningConfig ? { signature: signChecksum(checksum, normalizedSigningConfig) } : {}),
    },
  }
}

function unsignedPackageFromTemplatePackageV1(templatePackage: TemplatePackageV1): UnsignedTemplatePackage {
  return {
    kind: TEMPLATE_PACKAGE_KIND,
    contractVersion: TEMPLATE_PACKAGE_VERSION,
    exportedAt: templatePackage.exportedAt,
    metadata: cloneValue(templatePackage.metadata),
    bindings: [...templatePackage.bindings],
    scenegraph: cloneValue(templatePackage.scenegraph),
    history: templatePackage.history.map((entry) => ({
      version: entry.version,
      label: entry.label,
      updatedAt: entry.updatedAt,
      bindings: [...entry.bindings],
      scenegraph: cloneValue(entry.scenegraph),
    })),
    bindingHints: [],
  }
}

function parseLegacyTemplateRecord(record: Record<string, unknown>): TemplatePackageV1 | null {
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
    contractVersion: 1,
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

function parseTemplatePackageV1(record: Record<string, unknown>): TemplatePackageV1 | null {
  if (record.kind !== TEMPLATE_PACKAGE_KIND || asPositiveInteger(record.contractVersion, 0) !== 1) {
    return null
  }

  const metadataRecord = asRecord(record.metadata)
  if (!metadataRecord) {
    return null
  }

  const scenegraph = parseScene(record.scenegraph)
  if (!scenegraph) {
    return null
  }

  const templateId = asNonEmptyString(metadataRecord.templateId)
  const label = asNonEmptyString(metadataRecord.label)
  const sceneId = asNonEmptyString(metadataRecord.sceneId)
  const sceneName = asNonEmptyString(metadataRecord.sceneName)
  const sizeRecord = asRecord(metadataRecord.size)
  const sizeWidth = asFiniteNumber(sizeRecord?.width)
  const sizeHeight = asFiniteNumber(sizeRecord?.height)

  if (!templateId || !label || !sceneId || !sceneName || sizeWidth === null || sizeHeight === null) {
    return null
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
    kind: TEMPLATE_PACKAGE_KIND,
    contractVersion: 1,
    exportedAt,
    metadata: {
      templateId,
      label,
      sceneId,
      sceneName,
      size: {
        width: Math.round(Math.max(1, sizeWidth)),
        height: Math.round(Math.max(1, sizeHeight)),
      },
      templateVersion,
      updatedAt,
    },
    bindings,
    scenegraph: cloneValue(scenegraph),
    history,
  }
}

function parseTemplatePackageV2(record: Record<string, unknown>): TemplatePackageV2 | null {
  if (record.kind !== TEMPLATE_PACKAGE_KIND || asPositiveInteger(record.contractVersion, 0) !== TEMPLATE_PACKAGE_VERSION) {
    return null
  }

  const metadataRecord = asRecord(record.metadata)
  const integrityRecord = asRecord(record.integrity)
  if (!metadataRecord || !integrityRecord) {
    return null
  }

  const scenegraph = parseScene(record.scenegraph)
  if (!scenegraph) {
    return null
  }

  const templateId = asNonEmptyString(metadataRecord.templateId)
  const label = asNonEmptyString(metadataRecord.label)
  const sceneId = asNonEmptyString(metadataRecord.sceneId)
  const sceneName = asNonEmptyString(metadataRecord.sceneName)
  const sizeRecord = asRecord(metadataRecord.size)
  const sizeWidth = asFiniteNumber(sizeRecord?.width)
  const sizeHeight = asFiniteNumber(sizeRecord?.height)
  const checksumRecord = asRecord(integrityRecord.checksum)
  const checksumAlgorithm = asNonEmptyString(checksumRecord?.algorithm)
  const checksumValue = asNonEmptyString(checksumRecord?.value)
  const signatureRecord = asRecord(integrityRecord.signature)

  if (
    !templateId ||
    !label ||
    !sceneId ||
    !sceneName ||
    sizeWidth === null ||
    sizeHeight === null ||
    checksumAlgorithm !== TEMPLATE_PACKAGE_CHECKSUM_ALGORITHM ||
    !checksumValue
  ) {
    return null
  }

  const signature: TemplatePackageIntegrity['signature'] =
    signatureRecord && asNonEmptyString(signatureRecord.algorithm) === TEMPLATE_PACKAGE_SIGNATURE_ALGORITHM
      ? {
          algorithm: TEMPLATE_PACKAGE_SIGNATURE_ALGORITHM,
          keyId: asNonEmptyString(signatureRecord.keyId) ?? '',
          value: asNonEmptyString(signatureRecord.value) ?? '',
        }
      : undefined

  const normalizedSignature = signature && signature.keyId.length > 0 && signature.value.length > 0 ? signature : undefined

  return {
    kind: TEMPLATE_PACKAGE_KIND,
    contractVersion: TEMPLATE_PACKAGE_VERSION,
    exportedAt: asPositiveInteger(record.exportedAt, Date.now()),
    metadata: {
      templateId,
      label,
      sceneId,
      sceneName,
      size: {
        width: Math.round(Math.max(1, sizeWidth)),
        height: Math.round(Math.max(1, sizeHeight)),
      },
      templateVersion: asPositiveInteger(metadataRecord.templateVersion, 1),
      updatedAt: asPositiveInteger(metadataRecord.updatedAt, Date.now()),
    },
    bindings: normalizeBindings(record.bindings, scenegraph),
    scenegraph: cloneValue(scenegraph),
    history: Array.isArray(record.history)
      ? record.history
          .map((entry) => parseVersionEntry(entry))
          .filter((entry): entry is TemplatePackageVersionEntry => entry !== null)
      : [],
    bindingHints: normalizeTemplateBindingHints(record.bindingHints),
    integrity: {
      checksum: {
        algorithm: TEMPLATE_PACKAGE_CHECKSUM_ALGORITHM,
        value: checksumValue,
      },
      ...(normalizedSignature ? { signature: normalizedSignature } : {}),
    },
  }
}

function verifyChecksum(templatePackage: TemplatePackageV2): boolean {
  const unsignedPackage: UnsignedTemplatePackage = {
    kind: templatePackage.kind,
    contractVersion: templatePackage.contractVersion,
    exportedAt: templatePackage.exportedAt,
    metadata: cloneValue(templatePackage.metadata),
    bindings: [...templatePackage.bindings],
    scenegraph: cloneValue(templatePackage.scenegraph),
    history: templatePackage.history.map((entry) => ({
      version: entry.version,
      label: entry.label,
      updatedAt: entry.updatedAt,
      bindings: [...entry.bindings],
      scenegraph: cloneValue(entry.scenegraph),
    })),
    bindingHints: normalizeTemplateBindingHints(templatePackage.bindingHints),
  }

  const expectedChecksum = hashFnv1a32(canonicalizeUnsignedPackage(unsignedPackage))
  return expectedChecksum === templatePackage.integrity.checksum.value
}

function verifySignature(templatePackage: TemplatePackageV2, signingSecret: string): boolean {
  const signature = templatePackage.integrity.signature
  if (!signature) {
    return false
  }

  const expectedSignature = signChecksum(templatePackage.integrity.checksum.value, {
    keyId: signature.keyId,
    secret: signingSecret,
  })

  return expectedSignature.value === signature.value
}

function migrateV1Package(templatePackageV1: TemplatePackageV1): TemplatePackageV2 {
  return attachIntegrity(unsignedPackageFromTemplatePackageV1(templatePackageV1))
}

export function buildTemplatePackage(
  template: TemplateDefinition,
  signingConfig?: TemplatePackageSigningConfig | null,
): TemplatePackageV2 {
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

  const unsignedPackage: UnsignedTemplatePackage = {
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
    bindingHints: normalizeTemplateBindingHints(template.bindingHints),
  }

  return attachIntegrity(unsignedPackage, signingConfig)
}

export function parseTemplatePackage(
  rawPackage: unknown,
  options?: TemplatePackageParseOptions,
): TemplatePackageParseResult {
  const record = asRecord(rawPackage)
  if (!record) {
    return { ok: false, error: 'Package must be a JSON object.' }
  }

  const legacyTemplate = parseLegacyTemplateRecord(record)
  if (legacyTemplate) {
    return {
      ok: true,
      value: migrateV1Package(legacyTemplate),
      migrated: true,
      migrationTrail: ['legacy-template -> package-v1', 'package-v1 -> package-v2'],
    }
  }

  const packageV1 = parseTemplatePackageV1(record)
  if (packageV1) {
    return {
      ok: true,
      value: migrateV1Package(packageV1),
      migrated: true,
      migrationTrail: ['package-v1 -> package-v2'],
    }
  }

  const packageV2 = parseTemplatePackageV2(record)
  if (!packageV2) {
    return {
      ok: false,
      error: `Unsupported package contract. Expected ${TEMPLATE_PACKAGE_KIND} v1/v${TEMPLATE_PACKAGE_VERSION}.`,
    }
  }

  if (!verifyChecksum(packageV2)) {
    return { ok: false, error: 'Package checksum verification failed.' }
  }

  const shouldVerifySignature = Boolean(options?.verifySignature)
  if (shouldVerifySignature) {
    const signingSecret = asNonEmptyString(options?.signingSecret)
    if (!packageV2.integrity.signature) {
      return { ok: false, error: 'Package is unsigned and cannot pass strict signature verification.' }
    }
    if (!signingSecret) {
      return { ok: false, error: 'Signature verification requires a signing secret.' }
    }
    if (!verifySignature(packageV2, signingSecret)) {
      return { ok: false, error: 'Package signature verification failed.' }
    }
  }

  return {
    ok: true,
    value: packageV2,
    migrated: false,
    migrationTrail: [],
  }
}

export function migrateTemplatePackage(
  rawPackage: unknown,
  signingConfig?: TemplatePackageSigningConfig | null,
): TemplatePackageParseResult {
  const parsedPackage = parseTemplatePackage(rawPackage)
  if (!parsedPackage.ok) {
    return parsedPackage
  }

  if (!signingConfig) {
    return parsedPackage
  }

  const unsignedPackage: UnsignedTemplatePackage = {
    kind: parsedPackage.value.kind,
    contractVersion: parsedPackage.value.contractVersion,
    exportedAt: parsedPackage.value.exportedAt,
    metadata: cloneValue(parsedPackage.value.metadata),
    bindings: [...parsedPackage.value.bindings],
    scenegraph: cloneValue(parsedPackage.value.scenegraph),
    history: parsedPackage.value.history.map((entry) => ({
      version: entry.version,
      label: entry.label,
      updatedAt: entry.updatedAt,
      bindings: [...entry.bindings],
      scenegraph: cloneValue(entry.scenegraph),
    })),
    bindingHints: normalizeTemplateBindingHints(parsedPackage.value.bindingHints),
  }

  return {
    ...parsedPackage,
    value: attachIntegrity(unsignedPackage, signingConfig),
  }
}

export function templateFromPackage(templatePackage: TemplatePackage): TemplateDefinition {
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
      width: templatePackage.metadata.size.width,
      height: templatePackage.metadata.size.height,
    }),
    bindings: [...templatePackage.bindings],
    bindingHints: normalizeTemplateBindingHints(templatePackage.bindingHints),
    builtIn: false,
    favorite: false,
    version: templatePackage.metadata.templateVersion,
    versions,
    updatedAt: templatePackage.metadata.updatedAt,
  }
}
