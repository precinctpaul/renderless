import { create } from 'zustand'
import { CLEAR_SCENE, DEFAULT_STORY_STATE, TEMPLATE_LIBRARY, cloneScene } from '../data/templates'
import type { DataBindingKey, SceneDefinition, SceneLayer, StoryState, TemplateDefinition, TemplateVersion } from '../types/scene'
import { extractBindingKeys, isDataBindingKey } from '../lib/bindings'
import { STORY_FIELD_DEFS, type StoryFieldDef } from '../data/storySchema'
import {
  buildTemplatePackage,
  migrateTemplatePackage,
  parseTemplatePackage,
  templateFromPackage,
  type TemplatePackage,
  type TemplatePackageSigningConfig,
} from '../lib/templatePackages'
import {
  buildSimulationBindingValues,
  createSimulationTimeline,
  simulationDelayForEvent,
  type SimulationBindingField,
  type SimulationBuildConfig,
  type SimulationEvent,
  type SimulationFrame,
  type SimulationSnapshot,
  type SimulationSpeed,
  type SimulationTimeline,
  type SupportedLeague,
} from '../lib/simulationEngine'
import {
  buildDefaultTransportWsUrl,
  buildHostRelayUrl,
  buildRelayRoomUrl,
  getRoomId,
  hasConfiguredRelay,
  isOutputViewerLocation,
  isViewingOtherRoom,
  ROOM_STORAGE_KEY,
  rotateRoomId,
} from '../lib/outputUrls'

const STORAGE_KEY = 'renderless.playout.snapshot.v1'
const TEMPLATE_STORAGE_KEY = 'renderless.templates.v1'
const CHANNEL_KEY = 'renderless.playout.sync.v1'
const TRANSPORT_STORAGE_KEY = 'renderless.playout.transport.v1'
const PACKAGE_SIGNING_STORAGE_KEY = 'renderless.templates.signing.v1'
const INSTANCE_ID = `renderless-${Math.random().toString(36).slice(2)}`
const CLEAR_TEMPLATE_ID = '__clear__'
const MAX_UNDO_DEPTH = 80
const SIMULATION_CONFIG_STORAGE_KEY = 'renderless.simulation.config.v1'
const DEFAULT_SIMULATION_CONFIG: SimulationBuildConfig = {
  league: 'NBA',
  speed: 'NORMAL',
  seed: 20260304,
}

export type TransitionType = 'cut' | 'fade' | 'lumaWipe'

export interface ProgramTransitionState {
  type: TransitionType
  fromScene: SceneDefinition
  toScene: SceneDefinition
  startedAt: number
  durationMs: number
}

type ProgramTemplateId = string

type SceneTransformPatch = Partial<
  Pick<
    SceneDefinition['layers'][number],
    'x' | 'y' | 'width' | 'height' | 'rotation' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY' | 'opacity'
  >
>
type ShapeStylePatch = Partial<Pick<Extract<SceneDefinition['layers'][number], { kind: 'shape' }>, 'fill' | 'opacity'>>
type TextStylePatch = Partial<
  Pick<Extract<SceneDefinition['layers'][number], { kind: 'text' }>, 'text' | 'fontSize' | 'color' | 'opacity' | 'fontFamily'>
>
type LayerAlignMode = 'left' | 'hCenter' | 'right' | 'top' | 'vMiddle' | 'bottom'
type LayerDistributeAxis = 'horizontal' | 'vertical'
export type TransportMode = 'local' | 'ws'
export type TransportConnectionStatus = 'offline' | 'connecting' | 'online' | 'error'
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'complete'

type BindingFieldOption = StoryFieldDef

interface TransportConfigState {
  mode: TransportMode
  wsUrl: string
}

interface PackageSigningState {
  enabled: boolean
  keyId: string
  secret: string
}

interface PersistedPlayoutSnapshot {
  previewTemplateId: string
  programTemplateId: ProgramTemplateId
  previewScene: SceneDefinition
  programScene: SceneDefinition
  transitionType: TransitionType
  transitionDurationMs: number
  transitionInProgress: boolean
  programTransition: ProgramTransitionState | null
  story: StoryState
  onAir: boolean
  updatedAt: number
}

interface TransportSyncPayload {
  type: 'renderless-playout-sync'
  source: string
  snapshot: PersistedPlayoutSnapshot
}

/** Sent by a controller leaving a room (New Room): the relay drops its replay state and viewers go blank. */
interface RoomRetirePayload {
  type: 'renderless-room-retire'
  source: string
}

declare global {
  interface Window {
    __renderlessSyncCleanup?: () => void
  }
}

interface PlayoutStore {
  templates: TemplateDefinition[]
  previewTemplateId: string
  programTemplateId: ProgramTemplateId
  previewScene: SceneDefinition
  programScene: SceneDefinition
  transitionType: TransitionType
  transitionDurationMs: number
  transitionInProgress: boolean
  programTransition: ProgramTransitionState | null
  story: StoryState
  onAir: boolean
  updatedAt: number
  undoStack: SceneDefinition[]
  redoStack: SceneDefinition[]
  canUndo: boolean
  canRedo: boolean
  transportMode: TransportMode
  transportWsUrl: string
  transportStatus: TransportConnectionStatus
  transportError: string | null
  transportRoomId: string
  packageSigningEnabled: boolean
  packageSigningKeyId: string
  packageSigningSecret: string
  bindingFields: BindingFieldOption[]
  simulationLeague: SupportedLeague
  simulationSpeed: SimulationSpeed
  simulationSeed: number
  simulationStatus: SimulationStatus
  simulationCursor: number
  simulationTotalEvents: number
  simulationSnapshot: SimulationSnapshot | null
  simulationRecentEvents: SimulationEvent[]
  simulationLastEvent: SimulationEvent | null
  cuePreview: (templateId: string) => void
  take: () => void
  clearProgram: () => void
  setTransition: (transitionType: TransitionType) => void
  setTransitionDuration: (durationMs: number) => void
  setStoryValue: (key: DataBindingKey, value: StoryState[keyof StoryState] | string | number) => void
  setStoryValues: (patch: Partial<StoryState>) => void
  adjustScore: (team: 'home' | 'away', delta: number) => void
  setClock: (clock: string) => void
  resetClock: () => void
  togglePossession: () => void
  nudgeClock: (deltaSeconds: number) => void
  reorderPreviewLayer: (layerId: string, direction: 'forward' | 'backward') => void
  reorderPreviewLayerToIndex: (layerId: string, targetIndex: number) => void
  updatePreviewLayersTransform: (layerIds: string[], patch: SceneTransformPatch) => void
  movePreviewLayersByDelta: (layerIds: string[], delta: { x: number; y: number }, snapToGrid?: boolean) => void
  alignPreviewLayers: (layerIds: string[], mode: LayerAlignMode, snapToGrid?: boolean) => void
  distributePreviewLayers: (layerIds: string[], axis: LayerDistributeAxis, snapToGrid?: boolean) => void
  updatePreviewLayerTransform: (layerId: string, patch: SceneTransformPatch) => void
  updatePreviewShapeStyle: (layerId: string, patch: ShapeStylePatch) => void
  updatePreviewTextStyle: (layerId: string, patch: TextStylePatch) => void
  updatePreviewTextBinding: (layerId: string, binding: DataBindingKey | null) => void
  addPreviewImageLayerFromAsset: (asset: { name: string; dataUrl: string; x: number; y: number }) => string | null
  duplicatePreviewLayer: (layerId: string) => string | null
  deletePreviewLayer: (layerId: string) => void
  togglePreviewLayerVisibility: (layerId: string) => void
  togglePreviewLayerLock: (layerId: string) => void
  renamePreviewLayer: (layerId: string, name: string) => void
  createPreviewLayer: (kind: 'text' | 'shape') => string | null
  undoPreviewScene: () => void
  redoPreviewScene: () => void
  savePreviewTemplate: (name: string, options?: { asNew?: boolean }) => string | null
  createBlankTemplate: (name: string) => string | null
  exportTemplatePackage: (templateId: string) => TemplatePackage | null
  exportPreviewTemplatePackage: () => TemplatePackage
  importTemplatePackage: (rawPackage: unknown) => { ok: boolean; templateId?: string; error?: string; migrationTrail?: string[] }
  importTemplateDefinition: (template: TemplateDefinition) => { ok: boolean; templateId?: string; error?: string }
  setTransportMode: (mode: TransportMode) => void
  setTransportWsUrl: (url: string) => void
  setTransportStatus: (status: TransportConnectionStatus, error?: string | null) => void
  rotateTransportRoom: () => string
  setPackageSigningConfig: (patch: Partial<PackageSigningState>) => void
  setSimulationLeague: (league: SupportedLeague) => void
  setSimulationSpeed: (speed: SimulationSpeed) => void
  setSimulationSeed: (seed: number) => void
  startSimulation: () => void
  pauseSimulation: () => void
  resumeSimulation: () => void
  stopSimulation: () => void
  restoreTemplateVersion: (templateId: string, version: number) => boolean
  deleteTemplate: (templateId: string) => void
  resetDemo: () => void
}

function cloneStory(story: StoryState): StoryState {
  const merged = {
    ...DEFAULT_STORY_STATE,
    ...story,
  }
  return withCoreBindingMap(merged)
}

function readTransportConfig(): TransportConfigState {
  const defaultWsUrl = buildDefaultTransportWsUrl()
  // With a hosted relay configured, cross-device sync is the default; otherwise stay browser-local.
  const defaultMode: TransportMode = hasConfiguredRelay() ? 'ws' : 'local'

  if (typeof window === 'undefined') {
    return {
      mode: defaultMode,
      wsUrl: defaultWsUrl,
    }
  }

  try {
    const raw = window.localStorage.getItem(TRANSPORT_STORAGE_KEY)
    if (!raw) {
      return {
        mode: defaultMode,
        wsUrl: defaultWsUrl,
      }
    }

    const parsed = JSON.parse(raw) as Partial<TransportConfigState>
    const mode = parsed.mode === 'ws' ? 'ws' : 'local'
    const storedWsUrl = typeof parsed.wsUrl === 'string' ? parsed.wsUrl.trim() : ''
    // Older builds persisted <host>:8787, which never exists on a hosted origin; upgrade it to the relay.
    const wsUrl =
      storedWsUrl.length === 0 || (hasConfiguredRelay() && storedWsUrl === buildHostRelayUrl())
        ? defaultWsUrl
        : storedWsUrl

    return {
      mode,
      wsUrl,
    }
  } catch {
    return {
      mode: defaultMode,
      wsUrl: defaultWsUrl,
    }
  }
}

function persistTransportConfig(config: TransportConfigState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(TRANSPORT_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage failures and continue with in-memory config.
  }
}

function readPackageSigningState(): PackageSigningState {
  if (typeof window === 'undefined') {
    return {
      enabled: false,
      keyId: 'renderless-local',
      secret: '',
    }
  }

  try {
    const raw = window.localStorage.getItem(PACKAGE_SIGNING_STORAGE_KEY)
    if (!raw) {
      return {
        enabled: false,
        keyId: 'renderless-local',
        secret: '',
      }
    }

    const parsed = JSON.parse(raw) as Partial<PackageSigningState>
    const keyId = typeof parsed.keyId === 'string' && parsed.keyId.trim().length > 0 ? parsed.keyId.trim() : 'renderless-local'
    const secret = typeof parsed.secret === 'string' ? parsed.secret : ''
    return {
      enabled: Boolean(parsed.enabled),
      keyId,
      secret,
    }
  } catch {
    return {
      enabled: false,
      keyId: 'renderless-local',
      secret: '',
    }
  }
}

function persistPackageSigningState(state: PackageSigningState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(PACKAGE_SIGNING_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures and continue with in-memory config.
  }
}

function readSimulationConfig(): SimulationBuildConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_SIMULATION_CONFIG
  }

  try {
    const raw = window.localStorage.getItem(SIMULATION_CONFIG_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_SIMULATION_CONFIG
    }

    const parsed = JSON.parse(raw) as Partial<SimulationBuildConfig>
    const league: SupportedLeague =
      parsed.league === 'MLB' || parsed.league === 'NBA' || parsed.league === 'NFL' || parsed.league === 'NHL' || parsed.league === 'MLS'
        ? parsed.league
        : DEFAULT_SIMULATION_CONFIG.league
    const speed: SimulationSpeed =
      parsed.speed === 'SLOW' || parsed.speed === 'NORMAL' || parsed.speed === 'FAST'
        ? parsed.speed
        : DEFAULT_SIMULATION_CONFIG.speed
    const seed = Number.isFinite(Number(parsed.seed)) ? Math.max(1, Math.floor(Number(parsed.seed))) : DEFAULT_SIMULATION_CONFIG.seed

    return {
      league,
      speed,
      seed,
    }
  } catch {
    return DEFAULT_SIMULATION_CONFIG
  }
}

function persistSimulationConfig(config: SimulationBuildConfig) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(SIMULATION_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage failures and keep in-memory config.
  }
}

function primitiveFromUnknown(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  return null
}

function normalizeBindingMap(rawBindingMap: unknown): Record<string, string | number | boolean | null> {
  if (!rawBindingMap || typeof rawBindingMap !== 'object') {
    return {}
  }

  return Object.entries(rawBindingMap as Record<string, unknown>).reduce<Record<string, string | number | boolean | null>>(
    (accumulator, [key, value]) => {
      if (typeof key !== 'string' || key.trim().length === 0) {
        return accumulator
      }

      accumulator[key] = primitiveFromUnknown(value)
      return accumulator
    },
    {},
  )
}

function withCoreBindingMap(story: StoryState, extras?: Record<string, string | number | boolean | null>): StoryState {
  const nextBindings = {
    ...(story.bindings ?? {}),
    ...(extras ?? {}),
    homeScore: story.homeScore,
    awayScore: story.awayScore,
    clock: story.clock,
    possession: story.possession === 'home' ? 'HOME' : 'AWAY',
    period: `Q${story.period}`,
    shotClock: story.shotClock,
    homeFouls: story.homeFouls,
    awayFouls: story.awayFouls,
    headline: story.headline,
  }

  return {
    ...story,
    bindings: nextBindings,
  }
}

function mergeBindingFields(baseFields: StoryFieldDef[], simulationFields: SimulationBindingField[]): StoryFieldDef[] {
  const byKey = new Map<string, StoryFieldDef>()
  baseFields.forEach((field) => {
    byKey.set(field.key, field)
  })

  simulationFields.forEach((field) => {
    if (byKey.has(field.key)) {
      return
    }

    byKey.set(field.key, {
      key: field.key,
      label: field.label,
      group: field.group,
      kind: field.kind,
      quickControl: false,
    })
  })

  return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function storyFromSimulationSnapshot(snapshot: SimulationSnapshot, existing: StoryState): StoryState {
  const nextStory: StoryState = {
    ...existing,
    homeScore: snapshot.game.score.home,
    awayScore: snapshot.game.score.away,
    clock: snapshot.game.clock.display,
    possession: snapshot.game.possession,
    period: snapshot.game.period,
    shotClock: snapshot.context.nba.shotClock,
    homeFouls: snapshot.context.nba.homeFouls,
    awayFouls: snapshot.context.nba.awayFouls,
    headline: snapshot.story.headline,
    bindings: existing.bindings,
  }

  return withCoreBindingMap(nextStory, buildSimulationBindingValues(snapshot))
}

function getSigningConfigFromState(state: Pick<PlayoutStore, 'packageSigningEnabled' | 'packageSigningKeyId' | 'packageSigningSecret'>): TemplatePackageSigningConfig | null {
  if (!state.packageSigningEnabled) {
    return null
  }

  const keyId = state.packageSigningKeyId.trim()
  const secret = state.packageSigningSecret.trim()
  if (!keyId || !secret) {
    return null
  }

  return {
    keyId,
    secret,
  }
}

function cloneTemplate(template: TemplateDefinition): TemplateDefinition {
  return {
    ...template,
    scene: cloneScene(template.scene),
    bindingHints: (template.bindingHints ?? []).map((hint) => ({ ...hint })),
    versions: (template.versions ?? []).map((versionEntry) => ({
      ...versionEntry,
      scene: cloneScene(versionEntry.scene),
    })),
  }
}

function createTemplateId(): string {
  return `template-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createSceneId(): string {
  return `scene-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createLayerId(kind: 'text' | 'shape' | 'image'): string {
  return `layer-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createUniqueTemplateId(templates: TemplateDefinition[], preferredId: string): string {
  const normalizedPreferredId = preferredId.trim()
  if (normalizedPreferredId.length === 0) {
    return createTemplateId()
  }

  const existingIds = new Set(templates.map((template) => template.id))
  if (!existingIds.has(normalizedPreferredId)) {
    return normalizedPreferredId
  }

  let suffix = 1
  let candidateId = `${normalizedPreferredId}-${suffix}`
  while (existingIds.has(candidateId)) {
    suffix += 1
    candidateId = `${normalizedPreferredId}-${suffix}`
  }

  return candidateId
}

function createUniqueSceneId(templates: TemplateDefinition[], preferredId: string): string {
  const normalizedPreferredId = preferredId.trim()
  const existingSceneIds = new Set(templates.map((template) => template.scene.id))

  if (normalizedPreferredId.length > 0 && !existingSceneIds.has(normalizedPreferredId)) {
    return normalizedPreferredId
  }

  let suffix = 1
  let candidateId = normalizedPreferredId.length > 0 ? `${normalizedPreferredId}-${suffix}` : createSceneId()
  while (existingSceneIds.has(candidateId)) {
    suffix += 1
    candidateId = normalizedPreferredId.length > 0 ? `${normalizedPreferredId}-${suffix}` : createSceneId()
  }

  return candidateId
}

function clampVersionHistory(versions: TemplateVersion[]): TemplateVersion[] {
  if (versions.length <= 50) {
    return versions
  }

  return versions.slice(versions.length - 50)
}

function sceneFromUnknown(value: unknown): SceneDefinition | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  try {
    return cloneScene(value as SceneDefinition)
  } catch {
    return null
  }
}

function normalizeTemplateFromStorage(rawTemplate: unknown): TemplateDefinition | null {
  if (!rawTemplate || typeof rawTemplate !== 'object') {
    return null
  }

  const record = rawTemplate as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : null
  const label = typeof record.label === 'string' && record.label.trim().length > 0 ? record.label.trim() : null
  const scene = sceneFromUnknown(record.scene)

  if (!id || !label || !scene) {
    return null
  }

  const updatedAtRaw = Number(record.updatedAt)
  const versionRaw = Number(record.version)
  const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.floor(versionRaw) : 1

  const versions = Array.isArray(record.versions)
    ? record.versions
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null
          }

          const versionRecord = entry as Record<string, unknown>
          const sceneEntry = sceneFromUnknown(versionRecord.scene)
          const versionNumberRaw = Number(versionRecord.version)
          const versionNumber = Number.isFinite(versionNumberRaw) && versionNumberRaw > 0 ? Math.floor(versionNumberRaw) : null
          const labelEntry = typeof versionRecord.label === 'string' && versionRecord.label.trim().length > 0
            ? versionRecord.label.trim()
            : label
          const updatedAtEntryRaw = Number(versionRecord.updatedAt)
          const updatedAtEntry =
            Number.isFinite(updatedAtEntryRaw) && updatedAtEntryRaw > 0 ? Math.floor(updatedAtEntryRaw) : Date.now()
          const bindingsEntry = Array.isArray(versionRecord.bindings)
            ? versionRecord.bindings.filter((binding): binding is DataBindingKey => isDataBindingKey(binding))
            : extractBindingKeys(sceneEntry ?? scene)

          if (!sceneEntry || versionNumber === null) {
            return null
          }

          return {
            version: versionNumber,
            scene: sceneEntry,
            label: labelEntry,
            bindings: bindingsEntry,
            updatedAt: updatedAtEntry,
          } satisfies TemplateVersion
        })
        .filter((entry): entry is TemplateVersion => entry !== null)
    : []

  return {
    id,
    label,
    scene,
    bindings: Array.isArray(record.bindings)
      ? record.bindings.filter((binding): binding is DataBindingKey => isDataBindingKey(binding))
      : extractBindingKeys(scene),
    bindingHints: Array.isArray(record.bindingHints)
      ? record.bindingHints
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return null
            }
            const hintRecord = entry as Record<string, unknown>
            const layerId = typeof hintRecord.layerId === 'string' && hintRecord.layerId.trim().length > 0
              ? hintRecord.layerId.trim()
              : null
            const layerName = typeof hintRecord.layerName === 'string' && hintRecord.layerName.trim().length > 0
              ? hintRecord.layerName.trim()
              : null
            if (!layerId || !layerName) {
              return null
            }
            return {
              layerId,
              layerName,
              sampleText: typeof hintRecord.sampleText === 'string' ? hintRecord.sampleText : '',
              ...(typeof hintRecord.sourceToken === 'string' && hintRecord.sourceToken.trim().length > 0
                ? { sourceToken: hintRecord.sourceToken.trim() }
                : {}),
              ...(isDataBindingKey(hintRecord.suggestedBinding)
                ? { suggestedBinding: hintRecord.suggestedBinding }
                : {}),
              ...(Number.isFinite(Number(hintRecord.confidence))
                ? { confidence: Math.min(Math.max(Number(hintRecord.confidence), 0), 1) }
                : {}),
            } satisfies NonNullable<TemplateDefinition['bindingHints']>[number]
          })
          .filter((entry): entry is NonNullable<TemplateDefinition['bindingHints']>[number] => entry !== null)
      : [],
    favorite: Boolean(record.favorite),
    builtIn: false,
    version,
    versions: clampVersionHistory(versions),
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : Date.now(),
  }
}

function readPersistedTemplates(): TemplateDefinition[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => {
        const parsedPackage = migrateTemplatePackage(entry)
        if (parsedPackage.ok) {
          return templateFromPackage(parsedPackage.value)
        }

        return normalizeTemplateFromStorage(entry)
      })
      .filter((entry): entry is TemplateDefinition => entry !== null)
  } catch {
    return []
  }
}

function buildTemplateCatalog(): TemplateDefinition[] {
  const builtInTemplates = TEMPLATE_LIBRARY.map((template, index) => ({
    ...cloneTemplate(template),
    bindings: template.bindings ?? extractBindingKeys(template.scene),
    builtIn: true,
    version: template.version ?? 1,
    versions: template.versions ?? [],
    updatedAt: template.updatedAt ?? Date.now() - (TEMPLATE_LIBRARY.length - index) * 1_000,
  }))

  const builtInIds = new Set(builtInTemplates.map((template) => template.id))
  const customTemplates = readPersistedTemplates().filter((template) => !builtInIds.has(template.id))

  return [...builtInTemplates, ...customTemplates]
}

function persistCustomTemplates(templates: TemplateDefinition[], signingConfig?: TemplatePackageSigningConfig | null) {
  if (typeof window === 'undefined') {
    return
  }

  const customTemplatePackages = templates
    .filter((template) => !template.builtIn)
    .map((template) => buildTemplatePackage({
      ...cloneTemplate(template),
      bindings: template.bindings ?? extractBindingKeys(template.scene),
      builtIn: false,
      updatedAt: template.updatedAt ?? Date.now(),
    }, signingConfig))

  try {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(customTemplatePackages))
  } catch {
    // Ignore storage failures and continue with in-memory templates.
  }
}

function findTemplateById(templates: TemplateDefinition[], templateId: string): TemplateDefinition | undefined {
  return templates.find((template) => template.id === templateId)
}

function resolveSceneForTemplate(templates: TemplateDefinition[], templateId: string): SceneDefinition {
  const template = findTemplateById(templates, templateId)
  return template ? cloneScene(template.scene) : cloneScene(CLEAR_SCENE)
}

function moveLayerByDelta(scene: SceneDefinition, layerId: string, delta: -1 | 1): SceneDefinition {
  const sourceIndex = scene.layers.findIndex((layer) => layer.id === layerId)
  if (sourceIndex === -1) {
    return scene
  }

  if (scene.layers[sourceIndex]?.locked) {
    return scene
  }

  const targetIndex = sourceIndex + delta
  if (targetIndex < 0 || targetIndex >= scene.layers.length) {
    return scene
  }

  return moveLayerToIndex(scene, layerId, targetIndex)
}

function moveLayerToIndex(scene: SceneDefinition, layerId: string, targetIndex: number): SceneDefinition {
  const sourceIndex = scene.layers.findIndex((layer) => layer.id === layerId)
  if (sourceIndex === -1) {
    return scene
  }

  if (scene.layers[sourceIndex]?.locked) {
    return scene
  }

  const boundedTargetIndex = Math.min(Math.max(Math.round(targetIndex), 0), scene.layers.length - 1)
  if (sourceIndex === boundedTargetIndex) {
    return scene
  }

  const nextLayers = [...scene.layers]
  const [movedLayer] = nextLayers.splice(sourceIndex, 1)
  nextLayers.splice(boundedTargetIndex, 0, movedLayer)

  return {
    ...scene,
    layers: nextLayers,
  }
}

function applyTransformPatchToLayer(layer: SceneDefinition['layers'][number], patch: SceneTransformPatch) {
  if (layer.locked) {
    return layer
  }

  const nextAnchorX = Number.isFinite(patch.anchorX) ? Math.round(Math.max(0, patch.anchorX ?? layer.anchorX ?? 0)) : layer.anchorX
  const nextAnchorY = Number.isFinite(patch.anchorY) ? Math.round(Math.max(0, patch.anchorY ?? layer.anchorY ?? 0)) : layer.anchorY
  const nextScaleX = Number.isFinite(patch.scaleX)
    ? Math.round(Math.min(Math.max(patch.scaleX ?? layer.scaleX ?? 100, 1), 1000))
    : layer.scaleX
  const nextScaleY = Number.isFinite(patch.scaleY)
    ? Math.round(Math.min(Math.max(patch.scaleY ?? layer.scaleY ?? 100, 1), 1000))
    : layer.scaleY
  const nextRotation = Number.isFinite(patch.rotation)
    ? Math.round((patch.rotation ?? layer.rotation ?? 0) * 10) / 10
    : layer.rotation
  const nextOpacity = Number.isFinite(patch.opacity)
    ? Math.min(Math.max(patch.opacity ?? layer.opacity, 0), 1)
    : layer.opacity

  return {
    ...layer,
    x: Number.isFinite(patch.x) ? Math.round(Math.max(0, patch.x ?? layer.x)) : layer.x,
    y: Number.isFinite(patch.y) ? Math.round(Math.max(0, patch.y ?? layer.y)) : layer.y,
    width: Number.isFinite(patch.width) ? Math.round(Math.max(1, patch.width ?? layer.width)) : layer.width,
    height: Number.isFinite(patch.height) ? Math.round(Math.max(1, patch.height ?? layer.height)) : layer.height,
    rotation: nextRotation,
    anchorX: nextAnchorX,
    anchorY: nextAnchorY,
    scaleX: nextScaleX,
    scaleY: nextScaleY,
    opacity: nextOpacity,
  }
}

function moveLayersByDelta(
  scene: SceneDefinition,
  layerIds: string[],
  delta: { x: number; y: number },
  snapToGrid = false,
): SceneDefinition {
  const selectedIdSet = new Set(
    scene.layers.filter((layer) => layerIds.includes(layer.id) && !layer.locked).map((layer) => layer.id),
  )
  if (selectedIdSet.size === 0) {
    return scene
  }

  const deltaX = Number.isFinite(delta.x) ? delta.x : 0
  const deltaY = Number.isFinite(delta.y) ? delta.y : 0
  if (deltaX === 0 && deltaY === 0) {
    return scene
  }

  const snap = (value: number) => (snapToGrid ? Math.round(value / 10) * 10 : value)
  const clampX = (layer: SceneDefinition['layers'][number], nextX: number) =>
    Math.min(Math.max(0, nextX), Math.max(0, scene.width - layer.width))
  const clampY = (layer: SceneDefinition['layers'][number], nextY: number) =>
    Math.min(Math.max(0, nextY), Math.max(0, scene.height - layer.height))

  return {
    ...scene,
    layers: scene.layers.map((layer) => {
      if (!selectedIdSet.has(layer.id)) {
        return layer
      }

      return {
        ...layer,
        x: Math.round(clampX(layer, snap(layer.x + deltaX))),
        y: Math.round(clampY(layer, snap(layer.y + deltaY))),
      }
    }),
  }
}

function getSelectedLayers(scene: SceneDefinition, layerIds: string[]): SceneDefinition['layers'] {
  const selectedIdSet = new Set(layerIds)
  return scene.layers.filter((layer) => selectedIdSet.has(layer.id) && !layer.locked)
}

function alignLayersByMode(
  scene: SceneDefinition,
  layerIds: string[],
  mode: LayerAlignMode,
  snapToGrid = false,
): SceneDefinition {
  const selectedLayers = getSelectedLayers(scene, layerIds)
  if (selectedLayers.length < 2) {
    return scene
  }

  const leftEdge = Math.min(...selectedLayers.map((layer) => layer.x))
  const rightEdge = Math.max(...selectedLayers.map((layer) => layer.x + layer.width))
  const topEdge = Math.min(...selectedLayers.map((layer) => layer.y))
  const bottomEdge = Math.max(...selectedLayers.map((layer) => layer.y + layer.height))
  const horizontalCenter = (leftEdge + rightEdge) / 2
  const verticalCenter = (topEdge + bottomEdge) / 2
  const selectedIdSet = new Set(layerIds)
  const snap = (value: number) => (snapToGrid ? Math.round(value / 10) * 10 : value)

  return {
    ...scene,
    layers: scene.layers.map((layer) => {
      if (!selectedIdSet.has(layer.id) || layer.locked) {
        return layer
      }

      const clampX = (nextX: number) => Math.min(Math.max(0, nextX), Math.max(0, scene.width - layer.width))
      const clampY = (nextY: number) => Math.min(Math.max(0, nextY), Math.max(0, scene.height - layer.height))
      const normalizedX = (nextX: number) => Math.round(clampX(snap(nextX)))
      const normalizedY = (nextY: number) => Math.round(clampY(snap(nextY)))

      switch (mode) {
        case 'left':
          return { ...layer, x: normalizedX(leftEdge) }
        case 'hCenter':
          return { ...layer, x: normalizedX(horizontalCenter - layer.width / 2) }
        case 'right':
          return { ...layer, x: normalizedX(rightEdge - layer.width) }
        case 'top':
          return { ...layer, y: normalizedY(topEdge) }
        case 'vMiddle':
          return { ...layer, y: normalizedY(verticalCenter - layer.height / 2) }
        case 'bottom':
          return { ...layer, y: normalizedY(bottomEdge - layer.height) }
        default:
          return layer
      }
    }),
  }
}

function distributeLayers(
  scene: SceneDefinition,
  layerIds: string[],
  axis: LayerDistributeAxis,
  snapToGrid = false,
): SceneDefinition {
  const selectedLayers = getSelectedLayers(scene, layerIds)
  if (selectedLayers.length < 3) {
    return scene
  }

  const sortedLayers = [...selectedLayers].sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y))
  const firstLayer = sortedLayers[0]
  const lastLayer = sortedLayers[sortedLayers.length - 1]

  if (!firstLayer || !lastLayer) {
    return scene
  }

  const start = axis === 'horizontal' ? firstLayer.x : firstLayer.y
  const end = axis === 'horizontal' ? lastLayer.x : lastLayer.y
  const step = (end - start) / (sortedLayers.length - 1)
  const nextById = new Map<string, { x?: number; y?: number }>()
  const snap = (value: number) => (snapToGrid ? Math.round(value / 10) * 10 : value)

  sortedLayers.forEach((layer, index) => {
    const nextValue = snap(start + step * index)
    if (axis === 'horizontal') {
      nextById.set(layer.id, { x: nextValue })
      return
    }

    nextById.set(layer.id, { y: nextValue })
  })

  return {
    ...scene,
    layers: scene.layers.map((layer) => {
      const entry = nextById.get(layer.id)
      if (!entry || layer.locked) {
        return layer
      }

      return {
        ...layer,
        x: Number.isFinite(entry.x)
          ? Math.min(Math.max(0, Math.round(entry.x ?? layer.x)), Math.max(0, scene.width - layer.width))
          : layer.x,
        y: Number.isFinite(entry.y)
          ? Math.min(Math.max(0, Math.round(entry.y ?? layer.y)), Math.max(0, scene.height - layer.height))
          : layer.y,
      }
    }),
  }
}

function parseClockToSeconds(clock: string): number {
  const [minutesRaw, secondsRaw] = clock.split(':')
  const minutes = Number(minutesRaw)
  const seconds = Number(secondsRaw)
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0
  }

  return Math.max(0, minutes * 60 + seconds)
}

function secondsToClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function scenesEqual(a: SceneDefinition, b: SceneDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function pushHistoryFrame(stack: SceneDefinition[], scene: SceneDefinition): SceneDefinition[] {
  const nextStack = [...stack, cloneScene(scene)]
  if (nextStack.length <= MAX_UNDO_DEPTH) {
    return nextStack
  }

  return nextStack.slice(nextStack.length - MAX_UNDO_DEPTH)
}

function normalizeSnapshot(
  rawSnapshot: Partial<PersistedPlayoutSnapshot> | null,
  templates: TemplateDefinition[],
  defaultTemplateId: string,
): PersistedPlayoutSnapshot {
  const previewTemplateId = findTemplateById(templates, rawSnapshot?.previewTemplateId ?? '')
    ? (rawSnapshot?.previewTemplateId ?? defaultTemplateId)
    : defaultTemplateId

  // Program is only populated while on air; a missing snapshot, an off-air snapshot, or a
  // program template that no longer exists all resolve to CLEAR rather than a fallback template.
  const incomingProgramTemplateId = rawSnapshot?.programTemplateId ?? CLEAR_TEMPLATE_ID
  const programTemplateId =
    Boolean(rawSnapshot?.onAir) && findTemplateById(templates, incomingProgramTemplateId)
      ? incomingProgramTemplateId
      : CLEAR_TEMPLATE_ID

  const previewScene = sceneFromUnknown(rawSnapshot?.previewScene) ?? resolveSceneForTemplate(templates, previewTemplateId)
  const fallbackProgramScene =
    programTemplateId === CLEAR_TEMPLATE_ID ? cloneScene(CLEAR_SCENE) : resolveSceneForTemplate(templates, programTemplateId)
  const programScene =
    programTemplateId === CLEAR_TEMPLATE_ID
      ? fallbackProgramScene
      : (sceneFromUnknown(rawSnapshot?.programScene) ?? fallbackProgramScene)

  const transitionType =
    rawSnapshot?.transitionType === 'fade' || rawSnapshot?.transitionType === 'lumaWipe'
      ? rawSnapshot.transitionType
      : 'cut'

  const durationRaw = Number(rawSnapshot?.transitionDurationMs ?? 300)
  const transitionDurationMs = Number.isFinite(durationRaw)
    ? Math.min(Math.max(Math.round(durationRaw), 0), 1500)
    : 300

  const storyRaw = rawSnapshot?.story
  const story = withCoreBindingMap({
    homeScore: Number.isFinite(Number(storyRaw?.homeScore)) ? Math.max(0, Number(storyRaw?.homeScore)) : DEFAULT_STORY_STATE.homeScore,
    awayScore: Number.isFinite(Number(storyRaw?.awayScore)) ? Math.max(0, Number(storyRaw?.awayScore)) : DEFAULT_STORY_STATE.awayScore,
    clock: typeof storyRaw?.clock === 'string' && storyRaw.clock.length > 0 ? storyRaw.clock : DEFAULT_STORY_STATE.clock,
    possession: storyRaw?.possession === 'away' ? 'away' : 'home',
    period: Number.isFinite(Number(storyRaw?.period))
      ? Math.max(1, Math.floor(Number(storyRaw?.period)))
      : DEFAULT_STORY_STATE.period,
    shotClock: Number.isFinite(Number(storyRaw?.shotClock))
      ? Math.max(0, Math.floor(Number(storyRaw?.shotClock)))
      : DEFAULT_STORY_STATE.shotClock,
    homeFouls: Number.isFinite(Number(storyRaw?.homeFouls))
      ? Math.max(0, Math.floor(Number(storyRaw?.homeFouls)))
      : DEFAULT_STORY_STATE.homeFouls,
    awayFouls: Number.isFinite(Number(storyRaw?.awayFouls))
      ? Math.max(0, Math.floor(Number(storyRaw?.awayFouls)))
      : DEFAULT_STORY_STATE.awayFouls,
    headline:
      typeof storyRaw?.headline === 'string' && storyRaw.headline.trim().length > 0
        ? storyRaw.headline
        : DEFAULT_STORY_STATE.headline,
    bindings: normalizeBindingMap((storyRaw as { bindings?: unknown })?.bindings),
  })

  const updatedAtRaw = Number(rawSnapshot?.updatedAt)
  const updatedAt = Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : Date.now()
  const transitionInProgress =
    Boolean(rawSnapshot?.transitionInProgress) && updatedAt + transitionDurationMs + 250 > Date.now()
  const rawProgramTransition = rawSnapshot?.programTransition
  const programTransition: ProgramTransitionState | null =
    transitionInProgress &&
    rawProgramTransition &&
    typeof rawProgramTransition === 'object' &&
    'fromScene' in rawProgramTransition &&
    'toScene' in rawProgramTransition
      ? {
          type: (
            rawProgramTransition.type === 'fade' || rawProgramTransition.type === 'lumaWipe'
              ? rawProgramTransition.type
              : 'cut'
          ) as TransitionType,
          fromScene: sceneFromUnknown(rawProgramTransition.fromScene) ?? cloneScene(programScene),
          toScene: sceneFromUnknown(rawProgramTransition.toScene) ?? cloneScene(previewScene),
          startedAt:
            Number.isFinite(Number(rawProgramTransition.startedAt)) && Number(rawProgramTransition.startedAt) > 0
              ? Number(rawProgramTransition.startedAt)
              : updatedAt,
          durationMs:
            Number.isFinite(Number(rawProgramTransition.durationMs)) && Number(rawProgramTransition.durationMs) >= 0
              ? Math.min(Math.max(Math.round(Number(rawProgramTransition.durationMs)), 0), 1500)
              : transitionDurationMs,
        }
      : null

  return {
    previewTemplateId,
    programTemplateId,
    previewScene,
    programScene,
    transitionType,
    transitionDurationMs,
    transitionInProgress,
    programTransition,
    story,
    onAir: programTemplateId !== CLEAR_TEMPLATE_ID,
    updatedAt,
  }
}

function toSnapshot(state: PlayoutStore): PersistedPlayoutSnapshot {
  return {
    previewTemplateId: state.previewTemplateId,
    programTemplateId: state.programTemplateId,
    previewScene: cloneScene(state.previewScene),
    programScene: cloneScene(state.programScene),
    transitionType: state.transitionType,
    transitionDurationMs: state.transitionDurationMs,
    transitionInProgress: state.transitionInProgress,
    programTransition: state.programTransition
      ? {
          ...state.programTransition,
          fromScene: cloneScene(state.programTransition.fromScene),
          toScene: cloneScene(state.programTransition.toScene),
        }
      : null,
    story: cloneStory(state.story),
    onAir: state.onAir,
    updatedAt: state.updatedAt,
  }
}

function readStoredSnapshot(): Partial<PersistedPlayoutSnapshot> | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as Partial<PersistedPlayoutSnapshot>
  } catch {
    return null
  }
}

const initialTransportConfig = readTransportConfig()
const initialPackageSigningState = readPackageSigningState()
const initialSimulationConfig = readSimulationConfig()
const initialSimulationTimeline = createSimulationTimeline(initialSimulationConfig)
const initialBindingFields = mergeBindingFields(STORY_FIELD_DEFS, initialSimulationTimeline.bindingFields)
const initialTemplates = buildTemplateCatalog()
const defaultTemplateId = initialTemplates[0]?.id ?? ''
const hydratedSnapshot = normalizeSnapshot(readStoredSnapshot(), initialTemplates, defaultTemplateId)
const initialProgramScene =
  hydratedSnapshot.programTemplateId === CLEAR_TEMPLATE_ID
    ? cloneScene(CLEAR_SCENE)
    : cloneScene(hydratedSnapshot.programScene)

// Set by the sync layer below so store actions can reach the live relay connection.
let retireActiveRelayRoom: (() => void) | null = null
let reconcileTransportNow: (() => void) | null = null

export const usePlayoutStore = create<PlayoutStore>((set, get) => {
  let pendingTakeHandle: ReturnType<typeof setTimeout> | null = null
  let simulationPlaybackHandle: ReturnType<typeof setTimeout> | null = null
  let activeSimulationTimeline: SimulationTimeline | null = initialSimulationTimeline

  const clearSimulationPlaybackHandle = () => {
    if (simulationPlaybackHandle) {
      clearTimeout(simulationPlaybackHandle)
      simulationPlaybackHandle = null
    }
  }

  const applySimulationFrame = (frame: SimulationFrame, nextCursor: number, timeline: SimulationTimeline) => {
    set((state) => ({
      story: storyFromSimulationSnapshot(frame.snapshot, state.story),
      bindingFields: mergeBindingFields(STORY_FIELD_DEFS, timeline.bindingFields),
      simulationSnapshot: frame.snapshot,
      simulationRecentEvents: frame.snapshot.recentEvents,
      simulationLastEvent: frame.event,
      simulationCursor: nextCursor,
      simulationTotalEvents: timeline.frames.length,
      updatedAt: Date.now(),
    }))
  }

  const scheduleSimulationPlayback = () => {
    const state = get()
    const timeline = activeSimulationTimeline
    if (!timeline || state.simulationStatus !== 'running') {
      return
    }

    if (state.simulationCursor >= timeline.frames.length) {
      clearSimulationPlaybackHandle()
      set(() => ({
        simulationStatus: 'complete',
      }))
      return
    }

    const currentIndex = state.simulationCursor
    const frame = timeline.frames[currentIndex]
    const previousEvent = currentIndex > 0 ? timeline.frames[currentIndex - 1]?.event : undefined
    const delay = simulationDelayForEvent(state.simulationSpeed, frame.event, previousEvent)

    clearSimulationPlaybackHandle()
    simulationPlaybackHandle = setTimeout(() => {
      applySimulationFrame(frame, currentIndex + 1, timeline)
      scheduleSimulationPlayback()
    }, delay)
  }

  const commitPreviewScene = (producer: (scene: SceneDefinition) => SceneDefinition) => {
    set((state) => {
      const nextScene = producer(state.previewScene)
      if (scenesEqual(nextScene, state.previewScene)) {
        return {}
      }

      const undoStack = pushHistoryFrame(state.undoStack, state.previewScene)

      return {
        previewScene: cloneScene(nextScene),
        undoStack,
        redoStack: [],
        canUndo: undoStack.length > 0,
        canRedo: false,
        updatedAt: Date.now(),
      }
    })
  }

  return {
    templates: initialTemplates,
    previewTemplateId: hydratedSnapshot.previewTemplateId,
    programTemplateId: hydratedSnapshot.programTemplateId,
    previewScene: cloneScene(hydratedSnapshot.previewScene),
    programScene: initialProgramScene,
    transitionType: hydratedSnapshot.transitionType,
    transitionDurationMs: hydratedSnapshot.transitionDurationMs,
    transitionInProgress: hydratedSnapshot.transitionInProgress,
    programTransition: hydratedSnapshot.programTransition,
    story: withCoreBindingMap(cloneStory(hydratedSnapshot.story), buildSimulationBindingValues(initialSimulationTimeline.initialSnapshot)),
    onAir: hydratedSnapshot.onAir,
    updatedAt: hydratedSnapshot.updatedAt,
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    transportMode: initialTransportConfig.mode,
    transportWsUrl: initialTransportConfig.wsUrl,
    transportStatus: 'offline',
    transportError: null,
    transportRoomId: getRoomId(),
    packageSigningEnabled: initialPackageSigningState.enabled,
    packageSigningKeyId: initialPackageSigningState.keyId,
    packageSigningSecret: initialPackageSigningState.secret,
    bindingFields: initialBindingFields,
    simulationLeague: initialSimulationConfig.league,
    simulationSpeed: initialSimulationConfig.speed,
    simulationSeed: initialSimulationConfig.seed,
    simulationStatus: 'idle',
    simulationCursor: 0,
    simulationTotalEvents: initialSimulationTimeline.frames.length,
    simulationSnapshot: initialSimulationTimeline.initialSnapshot,
    simulationRecentEvents: [],
    simulationLastEvent: null,
    cuePreview: (templateId) => {
      set((state) => {
        if (!findTemplateById(state.templates, templateId)) {
          return {}
        }

        return {
          previewTemplateId: templateId,
          previewScene: resolveSceneForTemplate(state.templates, templateId),
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          updatedAt: Date.now(),
        }
      })
    },
    take: () => {
      const state = get()
      if (state.transitionInProgress) {
        return
      }

      const nextProgramTemplateId = state.previewTemplateId
      const nextProgramScene = cloneScene(state.previewScene)
      const shouldDeferTake = state.transitionType !== 'cut' && state.transitionDurationMs > 0

      if (pendingTakeHandle) {
        clearTimeout(pendingTakeHandle)
        pendingTakeHandle = null
      }

      if (!shouldDeferTake) {
        set(() => ({
          programTemplateId: nextProgramTemplateId,
          programScene: nextProgramScene,
          onAir: true,
          transitionInProgress: false,
          programTransition: null,
          updatedAt: Date.now(),
        }))
        return
      }

      const startedAt = Date.now()
      set(() => ({
        transitionInProgress: true,
        programTransition: {
          type: state.transitionType,
          fromScene: cloneScene(state.programScene),
          toScene: cloneScene(nextProgramScene),
          startedAt,
          durationMs: state.transitionDurationMs,
        },
        updatedAt: startedAt,
      }))

      pendingTakeHandle = setTimeout(() => {
        pendingTakeHandle = null
        set(() => ({
          programTemplateId: nextProgramTemplateId,
          programScene: nextProgramScene,
          onAir: true,
          transitionInProgress: false,
          programTransition: null,
          updatedAt: Date.now(),
        }))
      }, state.transitionDurationMs)
    },
    clearProgram: () => {
      if (pendingTakeHandle) {
        clearTimeout(pendingTakeHandle)
        pendingTakeHandle = null
      }

      set(() => ({
        programTemplateId: CLEAR_TEMPLATE_ID,
        programScene: cloneScene(CLEAR_SCENE),
        onAir: false,
        transitionInProgress: false,
        programTransition: null,
        updatedAt: Date.now(),
      }))
    },
    setTransition: (transitionType) => {
      set(() => ({
        transitionType,
        updatedAt: Date.now(),
      }))
    },
    setTransitionDuration: (durationMs) => {
      set(() => ({
        transitionDurationMs: Math.min(Math.max(Math.round(durationMs), 0), 1500),
        updatedAt: Date.now(),
      }))
    },
    setStoryValue: (key, value) => {
      set((state) => {
        const nextStory = withCoreBindingMap({
          ...state.story,
          [key]: value,
        })

        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    setStoryValues: (patch) => {
      set((state) => {
        const nextStory = withCoreBindingMap({
          ...state.story,
          ...patch,
        })

        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    adjustScore: (team, delta) => {
      set((state) => {
        const key = team === 'home' ? 'homeScore' : 'awayScore'
        const nextValue = Math.max(0, state.story[key] + delta)
        const nextStory = withCoreBindingMap({
          ...state.story,
          [key]: nextValue,
        })

        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    setClock: (clock) => {
      set((state) => {
        const nextStory = withCoreBindingMap({
          ...state.story,
          clock,
        })

        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    resetClock: () => {
      set((state) => {
        const nextStory = withCoreBindingMap({
          ...state.story,
          clock: DEFAULT_STORY_STATE.clock,
        })

        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    togglePossession: () => {
      set((state) => {
        const nextStory = withCoreBindingMap({
          ...state.story,
          possession: state.story.possession === 'home' ? 'away' : 'home',
        })

        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    nudgeClock: (deltaSeconds) => {
      set((state) => {
        const nextSeconds = parseClockToSeconds(state.story.clock) + deltaSeconds
        const nextStory = withCoreBindingMap({
          ...state.story,
          clock: secondsToClock(nextSeconds),
        })
        return {
          story: nextStory,
          updatedAt: Date.now(),
        }
      })
    },
    reorderPreviewLayer: (layerId, direction) => {
      commitPreviewScene((scene) => moveLayerByDelta(scene, layerId, direction === 'forward' ? 1 : -1))
    },
    reorderPreviewLayerToIndex: (layerId, targetIndex) => {
      commitPreviewScene((scene) => moveLayerToIndex(scene, layerId, targetIndex))
    },
    updatePreviewLayersTransform: (layerIds, patch) => {
      if (layerIds.length === 0) {
        return
      }

      commitPreviewScene((scene) => {
        const selectedIdSet = new Set(layerIds)
        return {
          ...scene,
          layers: scene.layers.map((layer) => (selectedIdSet.has(layer.id) ? applyTransformPatchToLayer(layer, patch) : layer)),
        }
      })
    },
    movePreviewLayersByDelta: (layerIds, delta, snapToGrid = false) => {
      if (layerIds.length === 0) {
        return
      }

      commitPreviewScene((scene) => moveLayersByDelta(scene, layerIds, delta, snapToGrid))
    },
    alignPreviewLayers: (layerIds, mode, snapToGrid = false) => {
      if (layerIds.length < 2) {
        return
      }

      commitPreviewScene((scene) => alignLayersByMode(scene, layerIds, mode, snapToGrid))
    },
    distributePreviewLayers: (layerIds, axis, snapToGrid = false) => {
      if (layerIds.length < 3) {
        return
      }

      commitPreviewScene((scene) => distributeLayers(scene, layerIds, axis, snapToGrid))
    },
    updatePreviewLayerTransform: (layerId, patch) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => (layer.id === layerId ? applyTransformPatchToLayer(layer, patch) : layer)),
      }))
    },
    updatePreviewShapeStyle: (layerId, patch) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.kind !== 'shape' || layer.locked) {
            return layer
          }

          const nextOpacity = Number.isFinite(patch.opacity)
            ? Math.min(Math.max(patch.opacity ?? layer.opacity, 0), 1)
            : layer.opacity

          return {
            ...layer,
            fill: typeof patch.fill === 'string' && patch.fill.length > 0 ? patch.fill : layer.fill,
            opacity: nextOpacity,
          }
        }),
      }))
    },
    updatePreviewTextStyle: (layerId, patch) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.kind !== 'text' || layer.locked) {
            return layer
          }

          const nextFontSize = Number.isFinite(patch.fontSize)
            ? Math.round(Math.max(8, patch.fontSize ?? layer.fontSize))
            : layer.fontSize
          const nextOpacity = Number.isFinite(patch.opacity)
            ? Math.min(Math.max(patch.opacity ?? layer.opacity, 0), 1)
            : layer.opacity

          return {
            ...layer,
            text: typeof patch.text === 'string' ? patch.text : layer.text,
            color: typeof patch.color === 'string' && patch.color.length > 0 ? patch.color : layer.color,
            fontFamily: typeof patch.fontFamily === 'string' && patch.fontFamily.trim().length > 0
              ? patch.fontFamily
              : layer.fontFamily,
            fontSize: nextFontSize,
            opacity: nextOpacity,
          }
        }),
      }))
    },
    updatePreviewTextBinding: (layerId, binding) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.kind !== 'text' || layer.locked) {
            return layer
          }

          return {
            ...layer,
            binding: binding ?? undefined,
          }
        }),
      }))
    },
    addPreviewImageLayerFromAsset: (asset) => {
      const trimmedDataUrl = asset.dataUrl.trim()
      if (!trimmedDataUrl) {
        return null
      }

      const state = get()
      const nextLayerId = createLayerId('image')
      const width = 420
      const height = 236
      const x = Math.round(Math.min(Math.max(0, asset.x - width / 2), Math.max(0, state.previewScene.width - width)))
      const y = Math.round(Math.min(Math.max(0, asset.y - height / 2), Math.max(0, state.previewScene.height - height)))

      const nextLayer: SceneLayer = {
        id: nextLayerId,
        kind: 'image',
        name: `${asset.name.replace(/\.[^.]+$/, '') || 'Asset'} ${state.previewScene.layers.filter((layer) => layer.kind === 'image').length + 1}`,
        x,
        y,
        width,
        height,
        src: trimmedDataUrl,
        fit: 'contain',
        opacity: 1,
        visible: true,
        locked: false,
        rotation: 0,
        anchorX: 0,
        anchorY: 0,
        scaleX: 100,
        scaleY: 100,
      }

      commitPreviewScene((scene) => ({
        ...scene,
        layers: [...scene.layers, nextLayer],
      }))

      return nextLayerId
    },
    duplicatePreviewLayer: (layerId) => {
      const state = get()
      const sourceLayer = state.previewScene.layers.find((layer) => layer.id === layerId)
      if (!sourceLayer || sourceLayer.locked) {
        return null
      }

      const nextLayerId = createLayerId(sourceLayer.kind)
      const offset = 20
      const x = Math.round(Math.min(Math.max(0, sourceLayer.x + offset), Math.max(0, state.previewScene.width - sourceLayer.width)))
      const y = Math.round(Math.min(Math.max(0, sourceLayer.y + offset), Math.max(0, state.previewScene.height - sourceLayer.height)))
      const duplicateLayer: SceneLayer = {
        ...cloneScene({ ...state.previewScene, layers: [sourceLayer] }).layers[0],
        id: nextLayerId,
        name: `${sourceLayer.name} Copy`,
        x,
        y,
        locked: false,
      }

      commitPreviewScene((scene) => ({
        ...scene,
        layers: [...scene.layers, duplicateLayer],
      }))

      return nextLayerId
    },
    deletePreviewLayer: (layerId) => {
      commitPreviewScene((scene) => {
        const target = scene.layers.find((layer) => layer.id === layerId)
        if (!target || target.locked) {
          return scene
        }

        return {
          ...scene,
          layers: scene.layers.filter((layer) => layer.id !== layerId),
        }
      })
    },
    togglePreviewLayerVisibility: (layerId) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)),
      }))
    },
    togglePreviewLayerLock: (layerId) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => (layer.id === layerId ? { ...layer, locked: !layer.locked } : layer)),
      }))
    },
    renamePreviewLayer: (layerId, name) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return
      }

      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => (layer.id === layerId && !layer.locked ? { ...layer, name: trimmedName } : layer)),
      }))
    },
    createPreviewLayer: (kind) => {
      const state = get()
      const nextLayerId = createLayerId(kind)
      const centerX = Math.round(state.previewScene.width / 2)
      const centerY = Math.round(state.previewScene.height / 2)

      const nextLayer: SceneDefinition['layers'][number] =
        kind === 'text'
          ? {
              id: nextLayerId,
              kind: 'text',
              name: `Text ${state.previewScene.layers.filter((layer) => layer.kind === 'text').length + 1}`,
              x: Math.max(0, centerX - 220),
              y: Math.max(0, centerY - 36),
              width: 440,
              height: 80,
              text: 'New Text Layer',
              color: '#f8fafc',
              fontSize: 64,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              align: 'left',
              opacity: 1,
              visible: true,
              locked: false,
              rotation: 0,
              anchorX: 0,
              anchorY: 0,
              scaleX: 100,
              scaleY: 100,
            }
          : {
              id: nextLayerId,
              kind: 'shape',
              name: `Shape ${state.previewScene.layers.filter((layer) => layer.kind === 'shape').length + 1}`,
              x: Math.max(0, centerX - 160),
              y: Math.max(0, centerY - 60),
              width: 320,
              height: 120,
              fill: '#2563eb',
              opacity: 1,
              visible: true,
              locked: false,
              radius: 0,
              rotation: 0,
              anchorX: 0,
              anchorY: 0,
              scaleX: 100,
              scaleY: 100,
            }

      commitPreviewScene((scene) => ({
        ...scene,
        layers: [...scene.layers, nextLayer],
      }))

      return nextLayerId
    },
    undoPreviewScene: () => {
      set((state) => {
        if (state.undoStack.length === 0) {
          return {}
        }

        const previousScene = state.undoStack[state.undoStack.length - 1]
        const nextUndoStack = state.undoStack.slice(0, -1)
        const nextRedoStack = pushHistoryFrame(state.redoStack, state.previewScene)

        return {
          previewScene: cloneScene(previousScene),
          undoStack: nextUndoStack,
          redoStack: nextRedoStack,
          canUndo: nextUndoStack.length > 0,
          canRedo: nextRedoStack.length > 0,
          updatedAt: Date.now(),
        }
      })
    },
    redoPreviewScene: () => {
      set((state) => {
        if (state.redoStack.length === 0) {
          return {}
        }

        const nextScene = state.redoStack[state.redoStack.length - 1]
        const nextRedoStack = state.redoStack.slice(0, -1)
        const nextUndoStack = pushHistoryFrame(state.undoStack, state.previewScene)

        return {
          previewScene: cloneScene(nextScene),
          undoStack: nextUndoStack,
          redoStack: nextRedoStack,
          canUndo: nextUndoStack.length > 0,
          canRedo: nextRedoStack.length > 0,
          updatedAt: Date.now(),
        }
      })
    },
    createBlankTemplate: (name) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return null
      }

      const now = Date.now()
      const blankScene: SceneDefinition = {
        id: createSceneId(),
        name: trimmedName,
        width: 1920,
        height: 1080,
        background: 'transparent',
        layers: [],
      }
      const template: TemplateDefinition = {
        id: createTemplateId(),
        label: trimmedName,
        scene: blankScene,
        bindings: [],
        bindingHints: [],
        favorite: false,
        builtIn: false,
        version: 1,
        versions: [],
        updatedAt: now,
      }

      set((currentState) => ({
        templates: [...currentState.templates, template],
        previewTemplateId: template.id,
        previewScene: cloneScene(blankScene),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        updatedAt: now,
      }))

      persistCustomTemplates(get().templates, getSigningConfigFromState(get()))
      return template.id
    },
    savePreviewTemplate: (name, options) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return null
      }

      const state = get()
      const activeTemplate = findTemplateById(state.templates, state.previewTemplateId)
      // "Save As New" always forks; plain Save overwrites custom templates and forks built-ins.
      const shouldOverwrite = !options?.asNew && Boolean(activeTemplate && !activeTemplate.builtIn)
      const templateId = shouldOverwrite && activeTemplate ? activeTemplate.id : createTemplateId()
      const sceneId = shouldOverwrite && activeTemplate ? activeTemplate.scene.id : createSceneId()
      const now = Date.now()
      const nextVersion = shouldOverwrite ? (activeTemplate?.version ?? 1) + 1 : 1
      const previousVersions = shouldOverwrite ? (activeTemplate?.versions ?? []) : []
      const snapshotOfPriorVersion: TemplateVersion | null =
        shouldOverwrite && activeTemplate
          ? {
              version: activeTemplate.version ?? 1,
              scene: cloneScene(activeTemplate.scene),
              label: activeTemplate.label,
              bindings: activeTemplate.bindings ?? extractBindingKeys(activeTemplate.scene),
              updatedAt: activeTemplate.updatedAt ?? now,
            }
          : null

      const savedScene = cloneScene({
        ...state.previewScene,
        id: sceneId,
        name: trimmedName,
      })

      const savedTemplate: TemplateDefinition = {
        id: templateId,
        label: trimmedName,
        scene: savedScene,
        bindings: extractBindingKeys(savedScene),
        bindingHints: (activeTemplate?.bindingHints ?? []).map((hint) => ({ ...hint })),
        favorite: shouldOverwrite ? (activeTemplate?.favorite ?? false) : false,
        builtIn: false,
        version: nextVersion,
        versions: clampVersionHistory(snapshotOfPriorVersion ? [...previousVersions, snapshotOfPriorVersion] : previousVersions),
        updatedAt: now,
      }

      set((currentState) => {
        const nextTemplates = [...currentState.templates.filter((template) => template.id !== templateId), savedTemplate]

        return {
          templates: nextTemplates,
          previewTemplateId: templateId,
          previewScene: cloneScene(savedScene),
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          updatedAt: now,
        }
      })

      persistCustomTemplates(get().templates, getSigningConfigFromState(get()))
      return templateId
    },
    exportTemplatePackage: (templateId) => {
      const state = get()
      const template = findTemplateById(state.templates, templateId)
      if (!template) {
        return null
      }

      return buildTemplatePackage(template, getSigningConfigFromState(state))
    },
    exportPreviewTemplatePackage: () => {
      const state = get()
      const activeTemplate = findTemplateById(state.templates, state.previewTemplateId)
      const fallbackTemplate: TemplateDefinition = {
        id: activeTemplate?.id ?? createTemplateId(),
        label: activeTemplate?.label ?? state.previewScene.name,
        scene: cloneScene({
          ...state.previewScene,
          id: activeTemplate?.scene.id ?? createSceneId(),
          name: activeTemplate?.label ?? state.previewScene.name,
        }),
        bindings: extractBindingKeys(state.previewScene),
        bindingHints: (activeTemplate?.bindingHints ?? []).map((hint) => ({ ...hint })),
        favorite: activeTemplate?.favorite ?? false,
        builtIn: false,
        version: activeTemplate?.version ?? 1,
        versions: activeTemplate?.versions ?? [],
        updatedAt: Date.now(),
      }

      return buildTemplatePackage(fallbackTemplate, getSigningConfigFromState(state))
    },
    importTemplatePackage: (rawPackage) => {
      const state = get()
      const signingConfig = getSigningConfigFromState(state)
      const parsedPackage = parseTemplatePackage(rawPackage, {
        signingSecret: signingConfig?.secret,
        verifySignature: Boolean(signingConfig),
      })
      if (!parsedPackage.ok) {
        return {
          ok: false,
          error: parsedPackage.error,
        }
      }

      const importedTemplate = templateFromPackage(parsedPackage.value)
      const now = Date.now()

      const nextTemplateId = createUniqueTemplateId(state.templates, importedTemplate.id)
      const nextSceneId = createUniqueSceneId(state.templates, importedTemplate.scene.id)

      const normalizedImportedTemplate: TemplateDefinition = {
        ...importedTemplate,
        id: nextTemplateId,
        scene: cloneScene({
          ...importedTemplate.scene,
          id: nextSceneId,
        }),
        builtIn: false,
        favorite: false,
        version: importedTemplate.version ?? 1,
        bindings: importedTemplate.bindings ?? extractBindingKeys(importedTemplate.scene),
        versions: (importedTemplate.versions ?? []).map((entry) => ({
          ...entry,
          scene: cloneScene(entry.scene),
          bindings: entry.bindings ?? extractBindingKeys(entry.scene),
        })),
        updatedAt: importedTemplate.updatedAt ?? now,
      }

      set((currentState) => {
        const nextTemplates = [...currentState.templates, normalizedImportedTemplate]

        return {
          templates: nextTemplates,
          previewTemplateId: normalizedImportedTemplate.id,
          previewScene: cloneScene(normalizedImportedTemplate.scene),
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          updatedAt: now,
        }
      })

      persistCustomTemplates(get().templates, signingConfig)
      return {
        ok: true,
        templateId: normalizedImportedTemplate.id,
        migrationTrail: parsedPackage.migrationTrail,
      }
    },
    importTemplateDefinition: (template) => {
      const state = get()
      const now = Date.now()

      let scene: SceneDefinition
      try {
        scene = cloneScene(template.scene)
      } catch {
        return {
          ok: false,
          error: 'Invalid scene payload.',
        }
      }

      const nextTemplateId = createUniqueTemplateId(state.templates, template.id || createTemplateId())
      const nextSceneId = createUniqueSceneId(state.templates, scene.id || createSceneId())
      const bindingHints = (template.bindingHints ?? [])
        .filter((hint) => typeof hint.layerId === 'string' && hint.layerId.length > 0)
        .map((hint) => ({
          ...hint,
          layerId: hint.layerId.trim(),
          layerName: hint.layerName.trim(),
          sampleText: hint.sampleText ?? '',
          sourceToken: hint.sourceToken?.trim() || undefined,
          suggestedBinding: hint.suggestedBinding?.trim() || undefined,
          confidence:
            typeof hint.confidence === 'number'
              ? Math.min(Math.max(hint.confidence, 0), 1)
              : undefined,
        }))

      const normalizedImportedTemplate: TemplateDefinition = {
        ...template,
        id: nextTemplateId,
        label: template.label.trim() || 'Imported Template',
        scene: cloneScene({
          ...scene,
          id: nextSceneId,
          name: template.label.trim() || scene.name || 'Imported Scene',
        }),
        builtIn: false,
        favorite: false,
        version: Math.max(1, Math.floor(template.version ?? 1)),
        bindings: template.bindings ?? extractBindingKeys(scene),
        bindingHints,
        versions: (template.versions ?? []).map((entry) => ({
          ...entry,
          scene: cloneScene(entry.scene),
          bindings: entry.bindings ?? extractBindingKeys(entry.scene),
        })),
        updatedAt: template.updatedAt ?? now,
      }

      set((currentState) => {
        const nextTemplates = [...currentState.templates, normalizedImportedTemplate]

        return {
          templates: nextTemplates,
          previewTemplateId: normalizedImportedTemplate.id,
          previewScene: cloneScene(normalizedImportedTemplate.scene),
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          updatedAt: now,
        }
      })

      persistCustomTemplates(get().templates, getSigningConfigFromState(state))
      return {
        ok: true,
        templateId: normalizedImportedTemplate.id,
      }
    },
    setTransportMode: (mode) => {
      set((state) => {
        const nextMode: TransportMode = mode === 'ws' ? 'ws' : 'local'
        const nextState = {
          transportMode: nextMode,
          transportError: null,
        }

        persistTransportConfig({
          mode: nextMode,
          wsUrl: state.transportWsUrl,
        })

        return nextState
      })
    },
    setTransportWsUrl: (url) => {
      set((state) => {
        const nextUrl = url.trim()
        persistTransportConfig({
          mode: state.transportMode,
          wsUrl: nextUrl,
        })

        return {
          transportWsUrl: nextUrl,
          transportError: null,
        }
      })
    },
    rotateTransportRoom: () => {
      // Tell the old room it is retired before leaving it, then reconnect on the new code at once.
      retireActiveRelayRoom?.()
      const nextRoomId = rotateRoomId()
      set(() => ({
        transportRoomId: nextRoomId,
        transportError: null,
      }))
      reconcileTransportNow?.()
      return nextRoomId
    },
    setTransportStatus: (status, error = null) => {
      set((state) => {
        if (state.transportStatus === status && state.transportError === error) {
          return {}
        }

        return {
          transportStatus: status,
          transportError: error,
        }
      })
    },
    setPackageSigningConfig: (patch) => {
      set((state) => {
        const nextState: PackageSigningState = {
          enabled: patch.enabled ?? state.packageSigningEnabled,
          keyId: typeof patch.keyId === 'string' ? patch.keyId : state.packageSigningKeyId,
          secret: typeof patch.secret === 'string' ? patch.secret : state.packageSigningSecret,
        }

        persistPackageSigningState(nextState)
        persistCustomTemplates(state.templates, getSigningConfigFromState({
          ...state,
          packageSigningEnabled: nextState.enabled,
          packageSigningKeyId: nextState.keyId,
          packageSigningSecret: nextState.secret,
        }))

        return {
          packageSigningEnabled: nextState.enabled,
          packageSigningKeyId: nextState.keyId,
          packageSigningSecret: nextState.secret,
        }
      })
    },
    setSimulationLeague: (league) => {
      clearSimulationPlaybackHandle()
      set((state) => {
        const nextLeague: SupportedLeague =
          league === 'MLB' || league === 'NBA' || league === 'NFL' || league === 'NHL' || league === 'MLS'
            ? league
            : state.simulationLeague
        const nextConfig: SimulationBuildConfig = {
          league: nextLeague,
          speed: state.simulationSpeed,
          seed: state.simulationSeed,
        }
        persistSimulationConfig(nextConfig)
        const nextTimeline = createSimulationTimeline(nextConfig)
        activeSimulationTimeline = nextTimeline

        return {
          simulationLeague: nextLeague,
          story: storyFromSimulationSnapshot(nextTimeline.initialSnapshot, state.story),
          bindingFields: mergeBindingFields(STORY_FIELD_DEFS, nextTimeline.bindingFields),
          simulationStatus: 'idle',
          simulationCursor: 0,
          simulationTotalEvents: nextTimeline.frames.length,
          simulationSnapshot: nextTimeline.initialSnapshot,
          simulationRecentEvents: [],
          simulationLastEvent: null,
          updatedAt: Date.now(),
        }
      })
    },
    setSimulationSpeed: (speed) => {
      clearSimulationPlaybackHandle()
      set((state) => {
        const nextSpeed: SimulationSpeed =
          speed === 'SLOW' || speed === 'NORMAL' || speed === 'FAST' ? speed : state.simulationSpeed
        const nextConfig: SimulationBuildConfig = {
          league: state.simulationLeague,
          speed: nextSpeed,
          seed: state.simulationSeed,
        }
        persistSimulationConfig(nextConfig)
        const nextTimeline = createSimulationTimeline(nextConfig)
        activeSimulationTimeline = nextTimeline

        return {
          simulationSpeed: nextSpeed,
          story: storyFromSimulationSnapshot(nextTimeline.initialSnapshot, state.story),
          bindingFields: mergeBindingFields(STORY_FIELD_DEFS, nextTimeline.bindingFields),
          simulationStatus: 'idle',
          simulationCursor: 0,
          simulationTotalEvents: nextTimeline.frames.length,
          simulationSnapshot: nextTimeline.initialSnapshot,
          simulationRecentEvents: [],
          simulationLastEvent: null,
          updatedAt: Date.now(),
        }
      })
    },
    setSimulationSeed: (seed) => {
      clearSimulationPlaybackHandle()
      set((state) => {
        const nextSeed = Number.isFinite(seed) ? Math.max(1, Math.floor(seed)) : state.simulationSeed
        const nextConfig: SimulationBuildConfig = {
          league: state.simulationLeague,
          speed: state.simulationSpeed,
          seed: nextSeed,
        }
        persistSimulationConfig(nextConfig)
        const nextTimeline = createSimulationTimeline(nextConfig)
        activeSimulationTimeline = nextTimeline

        return {
          simulationSeed: nextSeed,
          story: storyFromSimulationSnapshot(nextTimeline.initialSnapshot, state.story),
          bindingFields: mergeBindingFields(STORY_FIELD_DEFS, nextTimeline.bindingFields),
          simulationStatus: 'idle',
          simulationCursor: 0,
          simulationTotalEvents: nextTimeline.frames.length,
          simulationSnapshot: nextTimeline.initialSnapshot,
          simulationRecentEvents: [],
          simulationLastEvent: null,
          updatedAt: Date.now(),
        }
      })
    },
    startSimulation: () => {
      const state = get()
      const nextConfig: SimulationBuildConfig = {
        league: state.simulationLeague,
        speed: state.simulationSpeed,
        seed: state.simulationSeed,
      }
      const nextTimeline = createSimulationTimeline(nextConfig)
      activeSimulationTimeline = nextTimeline
      clearSimulationPlaybackHandle()

      set((currentState) => ({
        story: storyFromSimulationSnapshot(nextTimeline.initialSnapshot, currentState.story),
        bindingFields: mergeBindingFields(STORY_FIELD_DEFS, nextTimeline.bindingFields),
        simulationStatus: 'running',
        simulationCursor: 0,
        simulationTotalEvents: nextTimeline.frames.length,
        simulationSnapshot: nextTimeline.initialSnapshot,
        simulationRecentEvents: [],
        simulationLastEvent: null,
        updatedAt: Date.now(),
      }))

      scheduleSimulationPlayback()
    },
    pauseSimulation: () => {
      clearSimulationPlaybackHandle()
      set((state) => ({
        simulationStatus: state.simulationStatus === 'running' ? 'paused' : state.simulationStatus,
      }))
    },
    resumeSimulation: () => {
      const state = get()
      if (state.simulationStatus !== 'paused') {
        return
      }

      set(() => ({
        simulationStatus: 'running',
      }))
      scheduleSimulationPlayback()
    },
    stopSimulation: () => {
      clearSimulationPlaybackHandle()
      const state = get()
      const nextConfig: SimulationBuildConfig = {
        league: state.simulationLeague,
        speed: state.simulationSpeed,
        seed: state.simulationSeed,
      }
      const nextTimeline = createSimulationTimeline(nextConfig)
      activeSimulationTimeline = nextTimeline

      set((currentState) => ({
        story: storyFromSimulationSnapshot(nextTimeline.initialSnapshot, currentState.story),
        bindingFields: mergeBindingFields(STORY_FIELD_DEFS, nextTimeline.bindingFields),
        simulationStatus: 'idle',
        simulationCursor: 0,
        simulationTotalEvents: nextTimeline.frames.length,
        simulationSnapshot: nextTimeline.initialSnapshot,
        simulationRecentEvents: [],
        simulationLastEvent: null,
        updatedAt: Date.now(),
      }))
    },
    restoreTemplateVersion: (templateId, version) => {
      const state = get()
      const template = findTemplateById(state.templates, templateId)
      if (!template || template.builtIn) {
        return false
      }

      const targetVersion = (template.versions ?? []).find((entry) => entry.version === version)
      if (!targetVersion) {
        return false
      }

      const now = Date.now()
      const currentVersion = template.version ?? 1
      const nextVersion = currentVersion + 1
      const fallbackVersionScene = cloneScene(template.scene)

      const snapshotOfCurrentVersion: TemplateVersion = {
        version: currentVersion,
        scene: fallbackVersionScene,
        label: template.label,
        bindings: template.bindings ?? extractBindingKeys(template.scene),
        updatedAt: template.updatedAt ?? now,
      }

      const restoredTemplate: TemplateDefinition = {
        ...template,
        scene: cloneScene({
          ...targetVersion.scene,
          id: template.scene.id,
        }),
        bindings: targetVersion.bindings ?? extractBindingKeys(targetVersion.scene),
        builtIn: false,
        version: nextVersion,
        versions: clampVersionHistory([...(template.versions ?? []), snapshotOfCurrentVersion]),
        updatedAt: now,
      }

      set((currentState) => {
        const nextTemplates = currentState.templates.map((entry) =>
          entry.id === restoredTemplate.id ? restoredTemplate : entry,
        )

        return {
          templates: nextTemplates,
          previewScene:
            currentState.previewTemplateId === restoredTemplate.id
              ? cloneScene(restoredTemplate.scene)
              : currentState.previewScene,
          updatedAt: now,
        }
      })

      persistCustomTemplates(get().templates, getSigningConfigFromState(get()))
      return true
    },
    deleteTemplate: (templateId) => {
      const currentTemplate = findTemplateById(get().templates, templateId)
      if (!currentTemplate || currentTemplate.builtIn) {
        return
      }

      set((state) => {
        const nextTemplates = state.templates.filter((template) => template.id !== templateId)
        const fallbackTemplateId = nextTemplates[0]?.id ?? ''

        const nextPreviewTemplateId =
          state.previewTemplateId === templateId
            ? fallbackTemplateId
            : (findTemplateById(nextTemplates, state.previewTemplateId)?.id ?? fallbackTemplateId)

        // Deleting the on-air template clears program instead of airing a different template.
        const nextProgramTemplateId =
          findTemplateById(nextTemplates, state.programTemplateId)?.id ?? CLEAR_TEMPLATE_ID

        const nextPreviewScene = nextPreviewTemplateId
          ? resolveSceneForTemplate(nextTemplates, nextPreviewTemplateId)
          : cloneScene(CLEAR_SCENE)

        const nextProgramScene =
          nextProgramTemplateId === CLEAR_TEMPLATE_ID || !nextProgramTemplateId
            ? cloneScene(CLEAR_SCENE)
            : resolveSceneForTemplate(nextTemplates, nextProgramTemplateId)

        return {
          templates: nextTemplates,
          previewTemplateId: nextPreviewTemplateId,
          programTemplateId: nextProgramTemplateId || CLEAR_TEMPLATE_ID,
          previewScene: nextPreviewScene,
          programScene: nextProgramScene,
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          onAir: nextProgramTemplateId !== CLEAR_TEMPLATE_ID && state.onAir,
          updatedAt: Date.now(),
        }
      })

      persistCustomTemplates(get().templates, getSigningConfigFromState(get()))
    },
    resetDemo: () => {
      set((state) => {
        const primaryTemplateId = state.templates[0]?.id ?? ''
        if (pendingTakeHandle) {
          clearTimeout(pendingTakeHandle)
          pendingTakeHandle = null
        }
        clearSimulationPlaybackHandle()
        const resetTimeline = createSimulationTimeline({
          league: state.simulationLeague,
          speed: state.simulationSpeed,
          seed: state.simulationSeed,
        })
        activeSimulationTimeline = resetTimeline

        return {
          previewTemplateId: primaryTemplateId,
          programTemplateId: CLEAR_TEMPLATE_ID,
          previewScene: primaryTemplateId ? resolveSceneForTemplate(state.templates, primaryTemplateId) : cloneScene(CLEAR_SCENE),
          programScene: cloneScene(CLEAR_SCENE),
          transitionType: 'cut',
          transitionDurationMs: 300,
          transitionInProgress: false,
          programTransition: null,
          story: storyFromSimulationSnapshot(resetTimeline.initialSnapshot, cloneStory(DEFAULT_STORY_STATE)),
          bindingFields: mergeBindingFields(STORY_FIELD_DEFS, resetTimeline.bindingFields),
          onAir: false,
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          simulationStatus: 'idle',
          simulationCursor: 0,
          simulationTotalEvents: resetTimeline.frames.length,
          simulationSnapshot: resetTimeline.initialSnapshot,
          simulationRecentEvents: [],
          simulationLastEvent: null,
          updatedAt: Date.now(),
        }
      })
    },
  }
})

if (typeof window !== 'undefined') {
  window.__renderlessSyncCleanup?.()

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_KEY) : null
  let isApplyingExternalSnapshot = false
  let isCleaningUp = false
  let websocket: WebSocket | null = null
  let websocketUrl = ''
  let reconnectHandle: number | null = null
  let reconnectAttempt = 0
  let lastPublishedSnapshotJson = ''

  const publishPayloadToWebSocket = (payload: TransportSyncPayload) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      websocket.send(JSON.stringify(payload))
    } catch {
      usePlayoutStore.getState().setTransportStatus('error', 'Failed to publish websocket payload.')
    }
  }

  const closeWebSocket = () => {
    if (!websocket) {
      return
    }

    try {
      websocket.close()
    } catch {
      // Ignore close failures.
    } finally {
      websocket = null
    }
  }

  const clearReconnect = () => {
    if (reconnectHandle !== null) {
      window.clearTimeout(reconnectHandle)
      reconnectHandle = null
    }
  }

  const applyExternalSnapshot = (incomingSnapshot: Partial<PersistedPlayoutSnapshot>, fromRelay = false) => {
    // Same-browser sync is not room-scoped: an Output on a retired room listens to the relay only.
    if (!fromRelay && isViewingOtherRoom()) {
      return
    }

    const state = usePlayoutStore.getState()
    const defaultId = state.templates[0]?.id ?? ''
    const normalized = normalizeSnapshot(incomingSnapshot, state.templates, defaultId)
    // Viewers always mirror the controller: a freshly opened viewer has a newer local timestamp,
    // and device clocks differ, so timestamp ordering only applies between controllers.
    if (!isOutputViewerLocation() && normalized.updatedAt <= state.updatedAt) {
      return
    }

    isApplyingExternalSnapshot = true
    usePlayoutStore.setState({
      previewTemplateId: normalized.previewTemplateId,
      programTemplateId: normalized.programTemplateId,
      previewScene: cloneScene(normalized.previewScene),
      programScene:
        normalized.programTemplateId === CLEAR_TEMPLATE_ID
          ? cloneScene(CLEAR_SCENE)
          : cloneScene(normalized.programScene),
      transitionType: normalized.transitionType,
      transitionDurationMs: normalized.transitionDurationMs,
      transitionInProgress: normalized.transitionInProgress,
      programTransition: normalized.programTransition,
      story: cloneStory(normalized.story),
      onAir: normalized.onAir,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      updatedAt: normalized.updatedAt,
    })
    isApplyingExternalSnapshot = false
  }

  // A viewer whose room was retired drops whatever it was showing.
  const blankRetiredRoomViewer = () => {
    isApplyingExternalSnapshot = true
    usePlayoutStore.setState({
      programTemplateId: CLEAR_TEMPLATE_ID,
      programScene: cloneScene(CLEAR_SCENE),
      previewScene: cloneScene(CLEAR_SCENE),
      onAir: false,
      transitionInProgress: false,
      programTransition: null,
    })
    isApplyingExternalSnapshot = false
  }

  const scheduleReconnect = () => {
    if (isCleaningUp || reconnectHandle !== null) {
      return
    }

    const state = usePlayoutStore.getState()
    if (state.transportMode !== 'ws') {
      return
    }

    const delayMs = Math.min(1000 * (2 ** reconnectAttempt), 10_000)
    reconnectAttempt += 1

    reconnectHandle = window.setTimeout(() => {
      reconnectHandle = null
      reconcileWebSocketTransport()
    }, delayMs)
  }

  const reconcileWebSocketTransport = () => {
    if (isCleaningUp) {
      return
    }

    const state = usePlayoutStore.getState()

    if (state.transportMode !== 'ws') {
      clearReconnect()
      reconnectAttempt = 0
      closeWebSocket()
      state.setTransportStatus('offline')
      return
    }

    const baseUrl = state.transportWsUrl.trim()
    if (!/^wss?:\/\//i.test(baseUrl)) {
      clearReconnect()
      closeWebSocket()
      state.setTransportStatus('error', 'WebSocket URL must start with ws:// or wss://')
      return
    }

    const nextUrl = buildRelayRoomUrl(baseUrl)
    if (websocket && websocketUrl === nextUrl && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      return
    }

    clearReconnect()
    closeWebSocket()
    websocketUrl = nextUrl
    state.setTransportStatus('connecting')

    try {
      const nextSocket = new WebSocket(nextUrl)
      websocket = nextSocket

      nextSocket.addEventListener('open', () => {
        if (websocket !== nextSocket) {
          return
        }

        reconnectAttempt = 0
        usePlayoutStore.getState().setTransportStatus('online')
        if (isOutputViewerLocation()) {
          return
        }

        const snapshot = toSnapshot(usePlayoutStore.getState())
        publishPayloadToWebSocket({
          type: 'renderless-playout-sync',
          source: INSTANCE_ID,
          snapshot,
        })
      })

      nextSocket.addEventListener('message', (event) => {
        if (websocket !== nextSocket || typeof event.data !== 'string') {
          return
        }

        try {
          const message = JSON.parse(event.data) as Partial<TransportSyncPayload> | Partial<RoomRetirePayload>
          if (message.type === 'renderless-room-retire') {
            if (message.source !== INSTANCE_ID && isOutputViewerLocation()) {
              blankRetiredRoomViewer()
            }
            return
          }

          const payload = message as Partial<TransportSyncPayload>
          if (payload.type !== 'renderless-playout-sync' || payload.source === INSTANCE_ID || !payload.snapshot) {
            return
          }

          applyExternalSnapshot(payload.snapshot, true)
        } catch {
          // Ignore malformed websocket messages.
        }
      })

      nextSocket.addEventListener('close', () => {
        if (websocket === nextSocket) {
          websocket = null
        }

        if (isCleaningUp) {
          return
        }

        const currentState = usePlayoutStore.getState()
        currentState.setTransportStatus('offline')
        if (currentState.transportMode === 'ws') {
          scheduleReconnect()
        }
      })

      nextSocket.addEventListener('error', () => {
        if (websocket !== nextSocket) {
          return
        }

        usePlayoutStore.getState().setTransportStatus('error', 'WebSocket transport error.')
      })
    } catch {
      state.setTransportStatus('error', 'WebSocket connection failed to initialize.')
      scheduleReconnect()
    }
  }

  const unsubscribe = usePlayoutStore.subscribe((state) => {
    if (isApplyingExternalSnapshot || isOutputViewerLocation()) {
      return
    }

    const snapshot = toSnapshot(state)
    const serializedSnapshot = JSON.stringify(snapshot)
    if (serializedSnapshot === lastPublishedSnapshotJson) {
      return
    }

    lastPublishedSnapshotJson = serializedSnapshot
    const payload: TransportSyncPayload = {
      type: 'renderless-playout-sync',
      source: INSTANCE_ID,
      snapshot,
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, serializedSnapshot)
    } catch {
      // Ignore storage failures and continue with in-memory state.
    }

    channel?.postMessage(payload)
    publishPayloadToWebSocket(payload)
  })

  const onChannelMessage = (event: MessageEvent) => {
    const payload = event.data as Partial<TransportSyncPayload> | undefined

    if (!payload || payload.type !== 'renderless-playout-sync') {
      return
    }

    if (payload.source === INSTANCE_ID || !payload.snapshot) {
      return
    }

    applyExternalSnapshot(payload.snapshot)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const snapshot = JSON.parse(event.newValue) as Partial<PersistedPlayoutSnapshot>
        applyExternalSnapshot(snapshot)
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    }

    if (event.key === TEMPLATE_STORAGE_KEY) {
      const nextTemplates = buildTemplateCatalog()

      usePlayoutStore.setState((state) => {
        const fallbackTemplateId = nextTemplates[0]?.id ?? ''
        const previewTemplateId =
          findTemplateById(nextTemplates, state.previewTemplateId)?.id ?? fallbackTemplateId

        const programTemplateId =
          findTemplateById(nextTemplates, state.programTemplateId)?.id ?? CLEAR_TEMPLATE_ID

        return {
          templates: nextTemplates,
          previewTemplateId,
          programTemplateId,
          previewScene:
            previewTemplateId && previewTemplateId !== state.previewTemplateId
              ? resolveSceneForTemplate(nextTemplates, previewTemplateId)
              : state.previewScene,
          programScene:
            programTemplateId === CLEAR_TEMPLATE_ID
              ? cloneScene(CLEAR_SCENE)
              : programTemplateId && programTemplateId !== state.programTemplateId
                ? resolveSceneForTemplate(nextTemplates, programTemplateId)
                : state.programScene,
          onAir: programTemplateId !== CLEAR_TEMPLATE_ID && state.onAir,
        }
      })
    }

    if (event.key === TRANSPORT_STORAGE_KEY) {
      const transportConfig = readTransportConfig()
      usePlayoutStore.setState(() => ({
        transportMode: transportConfig.mode,
        transportWsUrl: transportConfig.wsUrl,
      }))
      reconcileWebSocketTransport()
    }

    if (event.key === ROOM_STORAGE_KEY) {
      // Another tab rotated the room; follow it (the socket moves on the next reconcile).
      usePlayoutStore.setState(() => ({ transportRoomId: getRoomId() }))
      reconcileWebSocketTransport()
    }

    if (event.key === PACKAGE_SIGNING_STORAGE_KEY) {
      const signingState = readPackageSigningState()
      usePlayoutStore.setState(() => ({
        packageSigningEnabled: signingState.enabled,
        packageSigningKeyId: signingState.keyId,
        packageSigningSecret: signingState.secret,
      }))
    }

    if (event.key === SIMULATION_CONFIG_STORAGE_KEY) {
      const simulationConfig = readSimulationConfig()
      usePlayoutStore.setState(() => ({
        simulationLeague: simulationConfig.league,
        simulationSpeed: simulationConfig.speed,
        simulationSeed: simulationConfig.seed,
      }))
    }
  }

  const recoveryPollHandle = window.setInterval(() => {
    try {
      const rawSnapshot = window.localStorage.getItem(STORAGE_KEY)
      if (!rawSnapshot) {
        return
      }

      const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<PersistedPlayoutSnapshot>
      applyExternalSnapshot(parsedSnapshot)
    } catch {
      // Ignore malformed snapshots during periodic recovery checks.
    }
  }, 1000)

  const transportPollHandle = window.setInterval(() => {
    reconcileWebSocketTransport()
  }, 1000)

  retireActiveRelayRoom = () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const retire: RoomRetirePayload = { type: 'renderless-room-retire', source: INSTANCE_ID }
      websocket.send(JSON.stringify(retire))
    } catch {
      // The old room simply keeps its last state if the retire message cannot be sent.
    }
  }
  reconcileTransportNow = reconcileWebSocketTransport

  channel?.addEventListener('message', onChannelMessage)
  window.addEventListener('storage', onStorage)
  reconcileWebSocketTransport()

  window.__renderlessSyncCleanup = () => {
    isCleaningUp = true
    retireActiveRelayRoom = null
    reconcileTransportNow = null
    usePlayoutStore.getState().pauseSimulation()
    clearReconnect()
    unsubscribe()
    window.removeEventListener('storage', onStorage)
    window.clearInterval(recoveryPollHandle)
    window.clearInterval(transportPollHandle)
    closeWebSocket()
    if (channel) {
      channel.removeEventListener('message', onChannelMessage)
      channel.close()
    }
  }
}
