/** Playout snapshot: what is persisted/synced (preview, program, fields) and how it is restored. */

import { CLEAR_SCENE, DEFAULT_STORY_STATE, cloneScene } from '../data/templates'
import { CLEAR_TEMPLATE_ID, findTemplateById, resolveSceneForTemplate, sceneFromUnknown } from './templateCatalog'
import type { PersistedPlayoutSnapshot, ProgramTransitionState, TransitionType } from './types'
import type { PlayoutStore } from './playoutStore'
import type { StoryState, TemplateDefinition } from '../types/scene'
import { cloneStory, normalizeBindingMap, withoutLegacyFields } from './persistence'

export const STORAGE_KEY = 'renderless.playout.snapshot.v1'

export function normalizeSnapshot(
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

  const storyRaw = rawSnapshot?.story as { bindings?: unknown } | undefined
  const story: StoryState = storyRaw
    ? { bindings: withoutLegacyFields(normalizeBindingMap(storyRaw.bindings)) }
    : cloneStory(DEFAULT_STORY_STATE)

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

export function toSnapshot(state: PlayoutStore): PersistedPlayoutSnapshot {
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

export function readStoredSnapshot(): Partial<PersistedPlayoutSnapshot> | null {
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
