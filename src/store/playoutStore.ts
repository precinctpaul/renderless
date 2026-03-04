import { create } from 'zustand'
import { CLEAR_SCENE, DEFAULT_STORY_STATE, TEMPLATE_LIBRARY, cloneScene } from '../data/templates'
import type { SceneDefinition, StoryState, TemplateDefinition } from '../types/scene'

const STORAGE_KEY = 'renderless.playout.snapshot.v1'
const CHANNEL_KEY = 'renderless.playout.sync.v1'
const INSTANCE_ID = `renderless-${Math.random().toString(36).slice(2)}`
const CLEAR_TEMPLATE_ID = '__clear__'

const DEFAULT_PREVIEW_TEMPLATE_ID = TEMPLATE_LIBRARY[0]?.id ?? ''
const DEFAULT_PROGRAM_TEMPLATE_ID = TEMPLATE_LIBRARY[0]?.id ?? ''

export type TransitionType = 'cut' | 'fade' | 'lumaWipe'

type ProgramTemplateId = string

interface PersistedPlayoutSnapshot {
  previewTemplateId: string
  programTemplateId: ProgramTemplateId
  transitionType: TransitionType
  transitionDurationMs: number
  story: StoryState
  onAir: boolean
  updatedAt: number
}

interface PlayoutStore {
  templates: TemplateDefinition[]
  previewTemplateId: string
  programTemplateId: ProgramTemplateId
  previewScene: SceneDefinition
  programScene: SceneDefinition
  transitionType: TransitionType
  transitionDurationMs: number
  story: StoryState
  onAir: boolean
  updatedAt: number
  cuePreview: (templateId: string) => void
  take: () => void
  clearProgram: () => void
  setTransition: (transitionType: TransitionType) => void
  setTransitionDuration: (durationMs: number) => void
  adjustScore: (team: 'home' | 'away', delta: number) => void
  setClock: (clock: string) => void
  resetClock: () => void
  togglePossession: () => void
  resetDemo: () => void
}

function cloneStory(story: StoryState): StoryState {
  return {
    homeScore: story.homeScore,
    awayScore: story.awayScore,
    clock: story.clock,
    possession: story.possession,
  }
}

function getTemplateById(templateId: string): TemplateDefinition | undefined {
  return TEMPLATE_LIBRARY.find((template) => template.id === templateId)
}

function resolveSceneForTemplate(templateId: string): SceneDefinition {
  const template = getTemplateById(templateId)
  return template ? cloneScene(template.scene) : cloneScene(CLEAR_SCENE)
}

function normalizeSnapshot(rawSnapshot: Partial<PersistedPlayoutSnapshot> | null): PersistedPlayoutSnapshot {
  const previewTemplateId = getTemplateById(rawSnapshot?.previewTemplateId ?? '')
    ? (rawSnapshot?.previewTemplateId ?? DEFAULT_PREVIEW_TEMPLATE_ID)
    : DEFAULT_PREVIEW_TEMPLATE_ID

  const incomingProgramTemplateId = rawSnapshot?.programTemplateId ?? DEFAULT_PROGRAM_TEMPLATE_ID
  const programTemplateId =
    incomingProgramTemplateId === CLEAR_TEMPLATE_ID || getTemplateById(incomingProgramTemplateId)
      ? incomingProgramTemplateId
      : DEFAULT_PROGRAM_TEMPLATE_ID

  const transitionType =
    rawSnapshot?.transitionType === 'fade' || rawSnapshot?.transitionType === 'lumaWipe'
      ? rawSnapshot.transitionType
      : 'cut'

  const durationRaw = Number(rawSnapshot?.transitionDurationMs ?? 300)
  const transitionDurationMs = Number.isFinite(durationRaw)
    ? Math.min(Math.max(Math.round(durationRaw), 0), 1500)
    : 300

  const storyRaw = rawSnapshot?.story
  const story: StoryState = {
    homeScore: Number.isFinite(Number(storyRaw?.homeScore)) ? Number(storyRaw?.homeScore) : DEFAULT_STORY_STATE.homeScore,
    awayScore: Number.isFinite(Number(storyRaw?.awayScore)) ? Number(storyRaw?.awayScore) : DEFAULT_STORY_STATE.awayScore,
    clock: typeof storyRaw?.clock === 'string' && storyRaw.clock.length > 0 ? storyRaw.clock : DEFAULT_STORY_STATE.clock,
    possession: storyRaw?.possession === 'away' ? 'away' : 'home',
  }

  const updatedAtRaw = Number(rawSnapshot?.updatedAt)
  const updatedAt = Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : Date.now()

  return {
    previewTemplateId,
    programTemplateId,
    transitionType,
    transitionDurationMs,
    story,
    onAir: Boolean(rawSnapshot?.onAir),
    updatedAt,
  }
}

function toSnapshot(state: PlayoutStore): PersistedPlayoutSnapshot {
  return {
    previewTemplateId: state.previewTemplateId,
    programTemplateId: state.programTemplateId,
    transitionType: state.transitionType,
    transitionDurationMs: state.transitionDurationMs,
    story: cloneStory(state.story),
    onAir: state.onAir,
    updatedAt: state.updatedAt,
  }
}

function readStoredSnapshot(): PersistedPlayoutSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<PersistedPlayoutSnapshot>
    return normalizeSnapshot(parsed)
  } catch {
    return null
  }
}

const hydratedSnapshot = normalizeSnapshot(readStoredSnapshot())
const initialProgramScene =
  hydratedSnapshot.programTemplateId === CLEAR_TEMPLATE_ID
    ? cloneScene(CLEAR_SCENE)
    : resolveSceneForTemplate(hydratedSnapshot.programTemplateId)

export const usePlayoutStore = create<PlayoutStore>((set) => ({
  templates: TEMPLATE_LIBRARY,
  previewTemplateId: hydratedSnapshot.previewTemplateId,
  programTemplateId: hydratedSnapshot.programTemplateId,
  previewScene: resolveSceneForTemplate(hydratedSnapshot.previewTemplateId),
  programScene: initialProgramScene,
  transitionType: hydratedSnapshot.transitionType,
  transitionDurationMs: hydratedSnapshot.transitionDurationMs,
  story: cloneStory(hydratedSnapshot.story),
  onAir: hydratedSnapshot.onAir,
  updatedAt: hydratedSnapshot.updatedAt,
  cuePreview: (templateId) => {
    if (!getTemplateById(templateId)) {
      return
    }

    set(() => ({
      previewTemplateId: templateId,
      previewScene: resolveSceneForTemplate(templateId),
      updatedAt: Date.now(),
    }))
  },
  take: () => {
    set((state) => ({
      programTemplateId: state.previewTemplateId,
      programScene: resolveSceneForTemplate(state.previewTemplateId),
      onAir: true,
      updatedAt: Date.now(),
    }))
  },
  clearProgram: () => {
    set(() => ({
      programTemplateId: CLEAR_TEMPLATE_ID,
      programScene: cloneScene(CLEAR_SCENE),
      onAir: false,
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
  adjustScore: (team, delta) => {
    set((state) => {
      const key = team === 'home' ? 'homeScore' : 'awayScore'
      const nextValue = Math.max(0, state.story[key] + delta)

      return {
        story: {
          ...state.story,
          [key]: nextValue,
        },
        updatedAt: Date.now(),
      }
    })
  },
  setClock: (clock) => {
    set((state) => ({
      story: {
        ...state.story,
        clock,
      },
      updatedAt: Date.now(),
    }))
  },
  resetClock: () => {
    set((state) => ({
      story: {
        ...state.story,
        clock: DEFAULT_STORY_STATE.clock,
      },
      updatedAt: Date.now(),
    }))
  },
  togglePossession: () => {
    set((state) => ({
      story: {
        ...state.story,
        possession: state.story.possession === 'home' ? 'away' : 'home',
      },
      updatedAt: Date.now(),
    }))
  },
  resetDemo: () => {
    set(() => ({
      previewTemplateId: DEFAULT_PREVIEW_TEMPLATE_ID,
      programTemplateId: DEFAULT_PROGRAM_TEMPLATE_ID,
      previewScene: resolveSceneForTemplate(DEFAULT_PREVIEW_TEMPLATE_ID),
      programScene: resolveSceneForTemplate(DEFAULT_PROGRAM_TEMPLATE_ID),
      transitionType: 'cut',
      transitionDurationMs: 300,
      story: cloneStory(DEFAULT_STORY_STATE),
      onAir: false,
      updatedAt: Date.now(),
    }))
  },
}))

if (typeof window !== 'undefined') {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_KEY) : null
  let isApplyingExternalSnapshot = false

  const applyExternalSnapshot = (incomingSnapshot: PersistedPlayoutSnapshot) => {
    const normalized = normalizeSnapshot(incomingSnapshot)
    if (normalized.updatedAt <= usePlayoutStore.getState().updatedAt) {
      return
    }

    isApplyingExternalSnapshot = true
    usePlayoutStore.setState({
      previewTemplateId: normalized.previewTemplateId,
      programTemplateId: normalized.programTemplateId,
      previewScene: resolveSceneForTemplate(normalized.previewTemplateId),
      programScene:
        normalized.programTemplateId === CLEAR_TEMPLATE_ID
          ? cloneScene(CLEAR_SCENE)
          : resolveSceneForTemplate(normalized.programTemplateId),
      transitionType: normalized.transitionType,
      transitionDurationMs: normalized.transitionDurationMs,
      story: cloneStory(normalized.story),
      onAir: normalized.onAir,
      updatedAt: normalized.updatedAt,
    })
    isApplyingExternalSnapshot = false
  }

  let lastPublishedUpdatedAt = usePlayoutStore.getState().updatedAt

  usePlayoutStore.subscribe((state) => {
    if (isApplyingExternalSnapshot || state.updatedAt === lastPublishedUpdatedAt) {
      return
    }

    lastPublishedUpdatedAt = state.updatedAt
    const snapshot = toSnapshot(state)

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // Ignore storage failures and continue with in-memory state.
    }

    channel?.postMessage({
      type: 'renderless-playout-sync',
      source: INSTANCE_ID,
      snapshot,
    })
  })

  channel?.addEventListener('message', (event) => {
    const payload = event.data as
      | {
          type?: string
          source?: string
          snapshot?: PersistedPlayoutSnapshot
        }
      | undefined

    if (!payload || payload.type !== 'renderless-playout-sync') {
      return
    }

    if (payload.source === INSTANCE_ID || !payload.snapshot) {
      return
    }

    applyExternalSnapshot(payload.snapshot)
  })

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return
    }

    try {
      const snapshot = JSON.parse(event.newValue) as PersistedPlayoutSnapshot
      applyExternalSnapshot(snapshot)
    } catch {
      // Ignore malformed cross-tab payloads.
    }
  })
}
