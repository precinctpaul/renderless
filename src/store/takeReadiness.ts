import type { PlayoutStore } from './playoutStore'
import { previewHasUnpublishedEdits } from './templateCatalog'

type TakeState = Pick<PlayoutStore, 'transitionInProgress' | 'previewTemplateId' | 'previewScene' | 'templates'>

/**
 * Why TAKE can't run right now, or null when Preview holds a graphic ready to go on air.
 * Shared by every TAKE control (header, Control Room, Space key) so they always agree.
 */
export function takeBlocker(state: TakeState): string | null {
  if (state.transitionInProgress) return 'A take is already in progress'
  if (!state.templates.some((template) => template.id === state.previewTemplateId)) return 'Cue a graphic to Preview first'
  if (!state.previewScene.layers.some((layer) => layer.visible)) return 'Preview is empty: cue a graphic first'
  if (previewHasUnpublishedEdits(state)) return 'Preview shows unpublished edits: publish them in Design, or use the published version'
  return null
}
