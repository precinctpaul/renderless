import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayoutStore } from '../playoutStore'
import { takeBlocker } from '../takeReadiness'

describe('takeBlocker', () => {
  beforeEach(() => usePlayoutStore.getState().resetDemo())

  it('allows TAKE when Preview holds a cued template with something visible', () => {
    const state = usePlayoutStore.getState()
    state.cuePreview(state.templates[0].id)
    expect(takeBlocker(usePlayoutStore.getState())).toBeNull()
  })

  it('blocks TAKE during a transition, with nothing cued, or with an empty Preview', () => {
    const state = usePlayoutStore.getState()
    expect(takeBlocker({ ...state, transitionInProgress: true })).toMatch(/in progress/)
    expect(takeBlocker({ ...state, previewTemplateId: 'missing' })).toMatch(/Cue a graphic/)
    const hidden = { ...state.previewScene, layers: state.previewScene.layers.map((layer) => ({ ...layer, visible: false })) }
    expect(takeBlocker({ ...state, previewScene: hidden })).toMatch(/empty/)
  })

  it('makes take() do nothing while blocked', () => {
    const state = usePlayoutStore.getState()
    usePlayoutStore.setState({ previewTemplateId: 'missing' })
    const before = usePlayoutStore.getState().programScene
    state.take()
    expect(usePlayoutStore.getState().programScene).toBe(before)
  })
})
