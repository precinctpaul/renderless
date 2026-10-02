/** Types shared by the playout store and its helper modules. */

import type { SceneDefinition, StoryState, TextBoxStyle } from '../types/scene'
import type { StoryFieldDef } from '../data/storySchema'

export type TransitionType = 'cut' | 'fade' | 'lumaWipe'

export interface ProgramTransitionState {
  type: TransitionType
  fromScene: SceneDefinition
  toScene: SceneDefinition
  startedAt: number
  durationMs: number
}

export type ProgramTemplateId = string

export type ShapeStylePatch = Partial<Pick<Extract<SceneDefinition['layers'][number], { kind: 'shape' }>, 'fill' | 'opacity'>>

export type TextStylePatch = Partial<
  Pick<
    Extract<SceneDefinition['layers'][number], { kind: 'text' }>,
    'text' | 'fontSize' | 'color' | 'opacity' | 'fontFamily' | 'lineHeight' | 'align' | 'verticalAlign'
  >
> & {
  /** A box style to set, or null to remove the text box. */
  box?: TextBoxStyle | null
}

export type TransportMode = 'local' | 'ws'

export type TransportConnectionStatus = 'offline' | 'connecting' | 'online' | 'error'

export type BindingFieldOption = StoryFieldDef

export interface TransportConfigState {
  mode: TransportMode
  wsUrl: string
}

export interface PackageSigningState {
  enabled: boolean
  keyId: string
  secret: string
}

export interface PersistedPlayoutSnapshot {
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

export interface TransportSyncPayload {
  type: 'renderless-playout-sync'
  source: string
  snapshot: PersistedPlayoutSnapshot
}

/** Sent by a controller leaving a room (New Room): the relay drops its replay state and viewers go blank. */
export interface RoomRetirePayload {
  type: 'renderless-room-retire'
  source: string
}
