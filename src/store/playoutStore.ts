import type { AnchorPresetId } from '../lib/layerAnchor'
import type {
  BindingFieldOption,
  PackageSigningState,
  ProgramTemplateId,
  ProgramTransitionState,
  ShapeStylePatch,
  ImageStylePatch,
  TextStylePatch,
  TransitionType,
  TransportConnectionStatus,
  TransportMode,
} from './types'
import { CLEAR_SCENE, DEFAULT_STORY_STATE, cloneScene } from '../data/templates'
import {
  CLEAR_TEMPLATE_ID,
  autosavedTemplates,
  buildTemplateCatalog,
  clampVersionHistory,
  createLayerId,
  createSceneId,
  createTemplateId,
  createUniqueSceneId,
  createUniqueTemplateId,
  findTemplateById,
  persistCustomTemplates,
  resolveSceneForTemplate,
  versionSnapshotOf,
} from './templateCatalog'
import type {
  DataBindingKey,
  LayerBlendMode,
  SceneDefinition,
  SceneLayer,
  StoryState,
  TemplateDefinition,
  TemplateVersion,
} from '../types/scene'
import type { DataSheet } from '../lib/dataSheet'
import type { LayerAlignMode, LayerDistributeAxis, SceneTransformPatch } from './sceneEdits'
import type { TemplatePackage } from '../lib/templatePackages'
import {
  alignLayersByMode,
  applyTransformPatchToLayer,
  distributeLayers,
  moveLayerByDelta,
  moveLayerToIndex,
  moveLayersByDelta,
  pushHistoryFrame,
  scenesEqual,
} from './sceneEdits'
import { anchorForPreset, boxPositionForAnchorPosition, resolveAnchor, withAnchor } from '../lib/layerAnchor'
import {
  buildFieldCatalog,
  cloneStory,
  getSigningConfigFromState,
  persistDataSheet,
  persistPackageSigningState,
  persistTransportConfig,
  readDataSheet,
  readPackageSigningState,
  readTransportConfig,
} from './persistence'
import { buildTemplatePackage, parseTemplatePackage, templateFromPackage } from '../lib/templatePackages'
import { create } from 'zustand'
import { extractBindingKeys } from '../lib/bindings'
import { getLibraryAuthor } from '../lib/sharedLibrary'
import { getRoomId, rotateRoomId } from '../lib/outputUrls'
import { makeFieldsOf } from '../lib/makeFields'
import { matchSheet, readManualMapping, rowValues, withManualChoice, writeManualMapping } from '../lib/sheetMatching'
import { installTransportSync, transportHooks } from './transportSync'
import { takeBlocker } from './takeReadiness'
import { normalizeSnapshot, readStoredSnapshot } from './snapshot'

// Types other modules use alongside the store.
export type { ProgramTransitionState, TransitionType, TransportConnectionStatus, TransportMode } from './types'

declare global {
  interface Window {
    __renderlessSyncCleanup?: () => void
  }
}

export interface PlayoutStore {
  templates: TemplateDefinition[]
  previewTemplateId: string
  programTemplateId: ProgramTemplateId
  previewScene: SceneDefinition
  /** Preview has edits since it was loaded/saved; only then may autosave write it back. */
  previewDirty: boolean
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
  /** Spreadsheet loaded on the Data page; picking a row fills the fields. */
  dataSheet: DataSheet | null
  dataRowIndex: number | null
  /** Bumped when a sheet column is matched by hand, so views re-read the remembered choices. */
  dataMappingRevision: number
  cuePreview: (templateId: string) => void
  take: () => void
  clearProgram: () => void
  setTransition: (transitionType: TransitionType) => void
  setTransitionDuration: (durationMs: number) => void
  /** Sets one data field (what bound text layers show). */
  setFieldValue: (key: DataBindingKey, value: string | number | boolean | null) => void
  setFieldValues: (values: Record<string, string | number | boolean | null>) => void
  removeField: (key: DataBindingKey) => void
  loadDataSheet: (sheet: DataSheet) => void
  selectDataRow: (index: number | null) => void
  clearDataSheet: () => void
  /** Match a sheet column to a field of the Preview template by hand (null: back to automatic). */
  chooseDataColumn: (columnKey: string, choice: string | null) => void
  reorderPreviewLayer: (layerId: string, direction: 'forward' | 'backward') => void
  reorderPreviewLayerToIndex: (layerId: string, targetIndex: number) => void
  updatePreviewLayersTransform: (layerIds: string[], patch: SceneTransformPatch) => void
  /** Sets where each layer's anchor point sits on the canvas (the position the editor shows). */
  setPreviewLayersPosition: (layerIds: string[], position: { x?: number; y?: number }) => void
  /** Moves each layer's anchor point without moving its artwork. */
  setPreviewLayersAnchor: (layerIds: string[], anchor: { preset: AnchorPresetId } | { x?: number; y?: number }) => void
  movePreviewLayersByDelta: (layerIds: string[], delta: { x: number; y: number }, snapToGrid?: boolean) => void
  alignPreviewLayers: (layerIds: string[], mode: LayerAlignMode, snapToGrid?: boolean) => void
  distributePreviewLayers: (layerIds: string[], axis: LayerDistributeAxis, snapToGrid?: boolean) => void
  updatePreviewLayerTransform: (layerId: string, patch: SceneTransformPatch) => void
  updatePreviewShapeStyle: (layerId: string, patch: ShapeStylePatch) => void
  updatePreviewImageStyle: (layerId: string, patch: ImageStylePatch) => void
  updatePreviewTextStyle: (layerId: string, patch: TextStylePatch) => void
  updatePreviewLayerBlendMode: (layerId: string, blendMode: LayerBlendMode) => void
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
  /** Saves Preview edits into the current custom template in place (autosave). Returns whether it saved. */
  autosavePreviewTemplate: () => boolean
  createBlankTemplate: (name: string, size?: { width: number; height: number }) => string | null
  /** Resizes the design canvas; layers keep their positions. Undoable. */
  setPreviewCanvasSize: (size: { width: number; height: number }) => void
  exportTemplatePackage: (templateId: string) => TemplatePackage | null
  exportPreviewTemplatePackage: () => TemplatePackage
  importTemplatePackage: (rawPackage: unknown) => { ok: boolean; templateId?: string; error?: string; migrationTrail?: string[] }
  importTemplateDefinition: (template: TemplateDefinition) => { ok: boolean; templateId?: string; error?: string }
  setTransportMode: (mode: TransportMode) => void
  setTransportWsUrl: (url: string) => void
  setTransportStatus: (status: TransportConnectionStatus, error?: string | null) => void
  rotateTransportRoom: () => string
  setPackageSigningConfig: (patch: Partial<PackageSigningState>) => void
  restoreTemplateVersion: (templateId: string, version: number) => boolean
  deleteTemplate: (templateId: string) => void
  /** Applies teammates' template changes from the shared library (never touches built-ins). */
  mergeLibraryTemplates: (upserts: TemplateDefinition[], removedIds: string[]) => void
  resetDemo: () => void
}

const initialTransportConfig = readTransportConfig()
const initialPackageSigningState = readPackageSigningState()
const initialDataSheet = readDataSheet()
const initialTemplates = buildTemplateCatalog()
const defaultTemplateId = initialTemplates[0]?.id ?? ''
const hydratedSnapshot = normalizeSnapshot(readStoredSnapshot(), initialTemplates, defaultTemplateId)
const initialProgramScene =
  hydratedSnapshot.programTemplateId === CLEAR_TEMPLATE_ID
    ? cloneScene(CLEAR_SCENE)
    : cloneScene(hydratedSnapshot.programScene)

export const usePlayoutStore = create<PlayoutStore>((set, get) => {
  let pendingTakeHandle: ReturnType<typeof setTimeout> | null = null
  const commitPreviewScene = (producer: (scene: SceneDefinition) => SceneDefinition) => {
    set((state) => {
      const nextScene = producer(state.previewScene)
      if (scenesEqual(nextScene, state.previewScene)) {
        return {}
      }

      const undoStack = pushHistoryFrame(state.undoStack, state.previewScene)

      return {
        previewScene: cloneScene(nextScene),
        previewDirty: true,
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
    previewDirty: false,
    programScene: initialProgramScene,
    transitionType: hydratedSnapshot.transitionType,
    transitionDurationMs: hydratedSnapshot.transitionDurationMs,
    transitionInProgress: hydratedSnapshot.transitionInProgress,
    programTransition: hydratedSnapshot.programTransition,
    story: cloneStory(hydratedSnapshot.story),
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
    bindingFields: buildFieldCatalog(hydratedSnapshot.story.bindings, initialDataSheet),
    dataSheet: initialDataSheet,
    dataRowIndex: null,
    dataMappingRevision: 0,
    cuePreview: (templateId) => {
      // Switching templates never drops edits: the outgoing custom template is saved first.
      get().autosavePreviewTemplate()
      set((state) => {
        if (!findTemplateById(state.templates, templateId)) {
          return {}
        }

        return {
          previewTemplateId: templateId,
          previewScene: resolveSceneForTemplate(state.templates, templateId),
          previewDirty: false,
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
      if (takeBlocker(state)) {
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
    setFieldValue: (key, value) => {
      set((state) => {
        const bindings = { ...state.story.bindings, [key]: value }
        return { story: { bindings }, bindingFields: buildFieldCatalog(bindings, state.dataSheet), updatedAt: Date.now() }
      })
    },
    setFieldValues: (values) => {
      set((state) => {
        const bindings = { ...state.story.bindings, ...values }
        return { story: { bindings }, bindingFields: buildFieldCatalog(bindings, state.dataSheet), updatedAt: Date.now() }
      })
    },
    removeField: (key) => {
      set((state) => {
        const bindings = { ...state.story.bindings }
        delete bindings[key]
        return { story: { bindings }, bindingFields: buildFieldCatalog(bindings, state.dataSheet), updatedAt: Date.now() }
      })
    },
    loadDataSheet: (sheet) => {
      persistDataSheet(sheet)
      set((state) => ({ dataSheet: sheet, dataRowIndex: null, bindingFields: buildFieldCatalog(state.story.bindings, sheet) }))
    },
    selectDataRow: (index) => {
      set((state) => {
        const row = index === null ? null : state.dataSheet?.rows[index]
        if (index !== null && !row) {
          return {}
        }
        if (!row) {
          return { dataRowIndex: null }
        }
        // Every column fills the field named after it; columns matched to the Preview template's
        // fields (by alias or by hand) fill those too.
        const mapping = matchSheet(state.dataSheet as DataSheet, makeFieldsOf(state.previewScene), readManualMapping(state.previewTemplateId)).mapping
        const bindings = { ...state.story.bindings, ...row, ...rowValues(row, mapping) }
        return {
          dataRowIndex: index,
          story: { bindings },
          bindingFields: buildFieldCatalog(bindings, state.dataSheet),
          updatedAt: Date.now(),
        }
      })
    },
    chooseDataColumn: (columnKey, choice) => {
      const { previewTemplateId, dataRowIndex, selectDataRow } = get()
      writeManualMapping(previewTemplateId, withManualChoice(readManualMapping(previewTemplateId), columnKey, choice))
      set((state) => ({ dataMappingRevision: state.dataMappingRevision + 1 }))
      if (dataRowIndex !== null) selectDataRow(dataRowIndex)
    },
    clearDataSheet: () => {
      persistDataSheet(null)
      set((state) => ({ dataSheet: null, dataRowIndex: null, bindingFields: buildFieldCatalog(state.story.bindings, null) }))
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
    setPreviewLayersPosition: (layerIds, position) => {
      if (layerIds.length === 0) {
        return
      }

      const selectedIdSet = new Set(layerIds)
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) =>
          selectedIdSet.has(layer.id) && !layer.locked ? { ...layer, ...boxPositionForAnchorPosition(layer, position) } : layer,
        ),
      }))
    },
    setPreviewLayersAnchor: (layerIds, anchor) => {
      if (layerIds.length === 0) {
        return
      }

      const selectedIdSet = new Set(layerIds)
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => {
          if (!selectedIdSet.has(layer.id) || layer.locked) {
            return layer
          }
          const next =
            'preset' in anchor
              ? anchorForPreset(layer, anchor.preset)
              : { x: anchor.x ?? resolveAnchor(layer).x, y: anchor.y ?? resolveAnchor(layer).y }
          return withAnchor(layer, next)
        }),
      }))
    },
    movePreviewLayersByDelta: (layerIds, delta, snapToGrid = false) => {
      if (layerIds.length === 0) {
        return
      }

      commitPreviewScene((scene) => moveLayersByDelta(scene, layerIds, delta, snapToGrid))
    },
    alignPreviewLayers: (layerIds, mode) => {
      if (layerIds.length === 0) {
        return
      }

      commitPreviewScene((scene) => alignLayersByMode(scene, layerIds, mode))
    },
    distributePreviewLayers: (layerIds, axis) => {
      if (layerIds.length < 3) {
        return
      }

      commitPreviewScene((scene) => distributeLayers(scene, layerIds, axis))
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
    updatePreviewImageStyle: (layerId, patch) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => {
          if (layer.id !== layerId || layer.kind !== 'image' || layer.locked) {
            return layer
          }
          const next = { ...layer, ...patch }
          if (!next.swappable) delete next.swappable
          if (next.radius !== undefined) next.radius = Math.max(0, Number.isFinite(next.radius) ? next.radius : 0)
          if (!next.radius) delete next.radius
          return next
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
            lineHeight: Number.isFinite(patch.lineHeight)
              ? Math.min(Math.max(patch.lineHeight ?? 1, 0.5), 4)
              : layer.lineHeight,
            align: patch.align === 'left' || patch.align === 'center' || patch.align === 'right' ? patch.align : layer.align,
            verticalAlign:
              patch.verticalAlign === 'top' || patch.verticalAlign === 'middle' || patch.verticalAlign === 'bottom'
                ? patch.verticalAlign
                : layer.verticalAlign,
            box:
              patch.box === null
                ? undefined
                : patch.box
                  ? {
                      ...patch.box,
                      paddingTop: Math.max(0, patch.box.paddingTop),
                      paddingRight: Math.max(0, patch.box.paddingRight),
                      paddingBottom: Math.max(0, patch.box.paddingBottom),
                      paddingLeft: Math.max(0, patch.box.paddingLeft),
                    }
                  : layer.box,
          }
        }),
      }))
    },
    updatePreviewLayerBlendMode: (layerId, blendMode) => {
      commitPreviewScene((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) =>
          layer.id === layerId && !layer.locked
            ? { ...layer, blendMode: blendMode === 'normal' ? undefined : blendMode }
            : layer,
        ),
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
              color: '#F9FBED',
              fontSize: 64,
              fontFamily: '"Recoleta", Georgia, serif',
              fontWeight: 600,
              // New text is centered in its box and anchored at its middle.
              align: 'center',
              verticalAlign: 'middle',
              opacity: 1,
              visible: true,
              locked: false,
              rotation: 0,
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
              fill: '#3C77BB',
              opacity: 1,
              visible: true,
              locked: false,
              radius: 0,
              rotation: 0,
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
          previewDirty: true,
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
          previewDirty: true,
          undoStack: nextUndoStack,
          redoStack: nextRedoStack,
          canUndo: nextUndoStack.length > 0,
          canRedo: nextRedoStack.length > 0,
          updatedAt: Date.now(),
        }
      })
    },
    setPreviewCanvasSize: (size) => {
      const width = Math.round(Math.min(Math.max(size.width, 16), 8192))
      const height = Math.round(Math.min(Math.max(size.height, 16), 8192))
      commitPreviewScene((scene) => ({ ...scene, width, height }))
    },
    createBlankTemplate: (name, size) => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        return null
      }

      const now = Date.now()
      const blankScene: SceneDefinition = {
        id: createSceneId(),
        name: trimmedName,
        width: Math.round(size?.width ?? 1920),
        height: Math.round(size?.height ?? 1080),
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
        previewDirty: false,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
        updatedAt: now,
      }))

      persistCustomTemplates(get().templates, getSigningConfigFromState(get()))
      return template.id
    },
    autosavePreviewTemplate: () => {
      if (!get().previewDirty) {
        return false
      }

      const templates = autosavedTemplates(get(), getLibraryAuthor(), Date.now())
      if (!templates) {
        return false
      }

      set({ templates, previewDirty: false })
      persistCustomTemplates(get().templates, getSigningConfigFromState(get()))
      return true
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
      // Autosave may already hold these exact edits; then Save just marks them as a checkpoint.
      const alreadyCurrent =
        shouldOverwrite && activeTemplate
          ? scenesEqual(cloneScene({ ...state.previewScene, id: activeTemplate.scene.id, name: trimmedName }), activeTemplate.scene)
          : false
      const nextVersion = shouldOverwrite ? (activeTemplate?.version ?? 1) + (alreadyCurrent ? 0 : 1) : 1
      const previousVersions = shouldOverwrite ? (activeTemplate?.versions ?? []) : []
      const snapshotOfPriorVersion: TemplateVersion | null =
        shouldOverwrite && activeTemplate && !alreadyCurrent ? versionSnapshotOf(activeTemplate, now) : null

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
        ...(getLibraryAuthor() ? { updatedBy: getLibraryAuthor() } : {}),
        versionReason: 'save',
        checkpointAt: now,
      }

      set((currentState) => {
        const nextTemplates = [...currentState.templates.filter((template) => template.id !== templateId), savedTemplate]

        return {
          templates: nextTemplates,
          previewTemplateId: templateId,
          previewScene: cloneScene(savedScene),
          previewDirty: false,
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
      transportHooks.retireActiveRelayRoom?.()
      const nextRoomId = rotateRoomId()
      set(() => ({
        transportRoomId: nextRoomId,
        transportError: null,
      }))
      transportHooks.reconcileTransportNow?.()
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

      const snapshotOfCurrentVersion: TemplateVersion = { ...versionSnapshotOf(template, now), scene: fallbackVersionScene }

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
        ...(getLibraryAuthor() ? { updatedBy: getLibraryAuthor() } : {}),
        versionReason: 'restore',
        checkpointAt: now,
      }

      set((currentState) => {
        const nextTemplates = currentState.templates.map((entry) =>
          entry.id === restoredTemplate.id ? restoredTemplate : entry,
        )

        return {
          templates: nextTemplates,
          previewDirty: currentState.previewTemplateId === restoredTemplate.id ? false : currentState.previewDirty,
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
          previewDirty: false,
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
    mergeLibraryTemplates: (upserts, removedIds) => {
      if (upserts.length === 0 && removedIds.length === 0) {
        return
      }

      const removed = new Set(removedIds)
      // Removing the template that's in Preview or on air goes through deleteTemplate's fallbacks.
      const { previewTemplateId, programTemplateId } = get()
      removedIds
        .filter((id) => id === previewTemplateId || id === programTemplateId)
        .forEach((id) => get().deleteTemplate(id))

      set((state) => {
        const byId = new Map(upserts.filter((template) => !template.builtIn).map((template) => [template.id, template]))
        const kept = state.templates
          .filter((template) => template.builtIn || !removed.has(template.id))
          .map((template) => (!template.builtIn && byId.has(template.id) ? byId.get(template.id)! : template))
        const known = new Set(kept.map((template) => template.id))
        const added = [...byId.values()].filter((template) => !known.has(template.id))
        // A teammate changed the template that's open here: show it, unless there are local edits.
        const openUpdate = byId.get(state.previewTemplateId)
        const refreshPreview = openUpdate && !state.previewDirty
        return {
          templates: [...kept, ...added],
          ...(refreshPreview
            ? { previewScene: cloneScene(openUpdate.scene), undoStack: [], redoStack: [], canUndo: false, canRedo: false }
            : {}),
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

        return {
          previewTemplateId: primaryTemplateId,
          programTemplateId: CLEAR_TEMPLATE_ID,
          previewScene: primaryTemplateId ? resolveSceneForTemplate(state.templates, primaryTemplateId) : cloneScene(CLEAR_SCENE),
          previewDirty: false,
          programScene: cloneScene(CLEAR_SCENE),
          transitionType: 'cut',
          transitionDurationMs: 300,
          transitionInProgress: false,
          programTransition: null,
          story: cloneStory(DEFAULT_STORY_STATE),
          bindingFields: buildFieldCatalog(DEFAULT_STORY_STATE.bindings, state.dataSheet),
          dataRowIndex: null,
          onAir: false,
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
          updatedAt: Date.now(),
        }
      })
    },
  }
})

installTransportSync()
