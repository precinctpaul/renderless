/** Template catalog: built-in + custom templates, ids, storage, versions and private drafts. */

import { CLEAR_SCENE, TEMPLATE_LIBRARY, cloneScene } from '../data/templates'
import type { DataBindingKey, SceneDefinition, TemplateDefinition, TemplateVersion } from '../types/scene'
import type { PlayoutStore } from './playoutStore'
import type { TemplatePackageSigningConfig } from '../lib/templatePackages'
import { buildTemplatePackage, migrateTemplatePackage, templateFromPackage } from '../lib/templatePackages'
import { extractBindingKeys, isDataBindingKey } from '../lib/bindings'
import { scenesEqual } from './sceneEdits'

export const TEMPLATE_STORAGE_KEY = 'renderless.templates.v1'

export const CLEAR_TEMPLATE_ID = '__clear__'

export function cloneTemplate(template: TemplateDefinition): TemplateDefinition {
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

export function createTemplateId(): string {
  return `template-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createSceneId(): string {
  return `scene-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createLayerId(kind: 'text' | 'shape' | 'image'): string {
  return `layer-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function createUniqueTemplateId(templates: TemplateDefinition[], preferredId: string): string {
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

export function createUniqueSceneId(templates: TemplateDefinition[], preferredId: string): string {
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

export const MAX_TEMPLATE_VERSIONS = 30
export function clampVersionHistory(versions: TemplateVersion[]): TemplateVersion[] {
  if (versions.length <= MAX_TEMPLATE_VERSIONS) {
    return versions
  }

  return versions.slice(versions.length - MAX_TEMPLATE_VERSIONS)
}

/** The template's current content as a history entry (before it gets replaced). */
export function versionSnapshotOf(template: TemplateDefinition, now: number): TemplateVersion {
  return {
    version: template.version ?? 1,
    scene: cloneScene(template.scene),
    label: template.label,
    bindings: template.bindings ?? extractBindingKeys(template.scene),
    updatedAt: template.updatedAt ?? now,
    ...(template.updatedBy ? { updatedBy: template.updatedBy } : {}),
    reason: template.versionReason ?? 'save',
  }
}

/**
 * A private, unpublished edit of a custom template. Design autosaves here (this browser only);
 * the team template changes only when the draft is published.
 */
export interface TemplateDraft {
  scene: SceneDefinition
  /** The published version the draft started from (to spot a teammate publishing meanwhile). */
  baseVersion: number
  updatedAt: number
}

export type TemplateDrafts = Record<string, TemplateDraft>

export const DRAFT_STORAGE_KEY = 'renderless.drafts.v1'

export function readDrafts(): TemplateDrafts {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}') as Record<string, unknown>
    const drafts: TemplateDrafts = {}
    Object.entries(parsed ?? {}).forEach(([templateId, raw]) => {
      const record = raw as Record<string, unknown> | null
      const scene = sceneFromUnknown(record?.scene)
      if (!scene) return
      drafts[templateId] = {
        scene,
        baseVersion: Number(record?.baseVersion) || 1,
        updatedAt: Number(record?.updatedAt) || Date.now(),
      }
    })
    return drafts
  } catch {
    return {}
  }
}

export function persistDrafts(drafts: TemplateDrafts) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // Drafts then live only in memory until the next successful write.
  }
}

export function withoutDrafts(drafts: TemplateDrafts, templateIds: string[]): TemplateDrafts {
  if (!templateIds.some((templateId) => templateId in drafts)) {
    return drafts
  }
  const next = { ...drafts }
  templateIds.forEach((templateId) => delete next[templateId])
  return next
}

/** Same design, ignoring the scene id and name (those follow the template). */
export function sameDesign(a: SceneDefinition, b: SceneDefinition): boolean {
  return scenesEqual(cloneScene({ ...a, id: '', name: '' }), cloneScene({ ...b, id: '', name: '' }))
}

/** Drafts after saving `scene` as the template's draft (a design equal to the published one drops the draft). */
export function draftsWithScene(drafts: TemplateDrafts, template: TemplateDefinition, scene: SceneDefinition, now: number): TemplateDrafts {
  if (sameDesign(scene, template.scene)) {
    return withoutDrafts(drafts, [template.id])
  }
  return {
    ...drafts,
    [template.id]: {
      scene: cloneScene({ ...scene, id: template.scene.id, name: template.label }),
      baseVersion: drafts[template.id]?.baseVersion ?? template.version ?? 1,
      updatedAt: now,
    },
  }
}

let unpublishedMemo: { preview: SceneDefinition; published: SceneDefinition; result: boolean } | null = null

/**
 * Preview shows a custom template with edits that aren't published (a draft). Built-ins can't
 * be published, so their Preview edits never count. Memoized: TAKE controls ask on every update.
 */
export function previewHasUnpublishedEdits(state: Pick<PlayoutStore, 'templates' | 'previewTemplateId' | 'previewScene'>): boolean {
  const template = findTemplateById(state.templates, state.previewTemplateId)
  if (!template || template.builtIn) {
    return false
  }
  if (unpublishedMemo && unpublishedMemo.preview === state.previewScene && unpublishedMemo.published === template.scene) {
    return unpublishedMemo.result
  }
  const result = !sameDesign(state.previewScene, template.scene)
  unpublishedMemo = { preview: state.previewScene, published: template.scene, result }
  return result
}

export function sceneFromUnknown(value: unknown): SceneDefinition | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  try {
    return cloneScene(value as SceneDefinition)
  } catch {
    return null
  }
}

export function normalizeTemplateFromStorage(rawTemplate: unknown): TemplateDefinition | null {
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

export function readPersistedTemplates(): TemplateDefinition[] {
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

export function buildTemplateCatalog(): TemplateDefinition[] {
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

export function persistCustomTemplates(templates: TemplateDefinition[], signingConfig?: TemplatePackageSigningConfig | null) {
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

export function findTemplateById(templates: TemplateDefinition[], templateId: string): TemplateDefinition | undefined {
  return templates.find((template) => template.id === templateId)
}

export function resolveSceneForTemplate(templates: TemplateDefinition[], templateId: string): SceneDefinition {
  const template = findTemplateById(templates, templateId)
  return template ? cloneScene(template.scene) : cloneScene(CLEAR_SCENE)
}
