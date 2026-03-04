import { describe, expect, test, vi } from 'vitest'

const SNAPSHOT_KEY = 'renderless.playout.snapshot.v1'

function getLayerPosition(scene: { layers: Array<{ id: string; x: number; y: number }> }, layerId: string) {
  const layer = scene.layers.find((entry) => entry.id === layerId)
  if (!layer) {
    throw new Error(`Layer ${layerId} not found in scene payload`)
  }

  return {
    x: layer.x,
    y: layer.y,
  }
}

async function loadStoreModule() {
  vi.resetModules()
  return import('../playoutStore')
}

describe('Playout reliability and QA regression suite', () => {
  test('cue -> take -> refresh restores the exact program snapshot', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-scorebug')
    usePlayoutStore.getState().updatePreviewLayerTransform('shape-home-block', { x: 420 })
    usePlayoutStore.getState().take()

    const liveState = usePlayoutStore.getState()
    expect(liveState.programTemplateId).toBe('template-scorebug')
    expect(getLayerPosition(liveState.programScene, 'shape-home-block').x).toBe(420)

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    const serializedSnapshot = window.localStorage.getItem(SNAPSHOT_KEY)
    expect(serializedSnapshot).toBeTruthy()
    const parsedSnapshot = JSON.parse(serializedSnapshot ?? '{}') as {
      programScene?: { layers?: Array<{ id: string; x: number }> }
      updatedAt?: number
    }
    const persistedProgramLayer = parsedSnapshot.programScene?.layers?.find((layer) => layer.id === 'shape-home-block')
    expect(persistedProgramLayer?.x).toBe(420)
    expect(typeof parsedSnapshot.updatedAt).toBe('number')

    const { usePlayoutStore: refreshedStore } = await loadStoreModule()
    const refreshedState = refreshedStore.getState()

    expect(refreshedState.programTemplateId).toBe('template-scorebug')
    expect(getLayerPosition(refreshedState.programScene, 'shape-home-block').x).toBe(420)
  })

  test('undo and redo revert and reapply scene edits deterministically', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-scorebug')
    const originalX = getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-home-block').x
    expect(originalX).toBe(160)

    usePlayoutStore.getState().updatePreviewLayerTransform('shape-home-block', { x: 300 })
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-home-block').x).toBe(300)
    expect(usePlayoutStore.getState().canUndo).toBe(true)

    usePlayoutStore.getState().undoPreviewScene()
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-home-block').x).toBe(160)
    expect(usePlayoutStore.getState().canRedo).toBe(true)

    usePlayoutStore.getState().redoPreviewScene()
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-home-block').x).toBe(300)
  })

  test('multi-layer align and distribute actions produce expected geometry', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-scorebug')
    const selection = ['shape-home-block', 'text-home-mark', 'shape-away-block']

    usePlayoutStore.getState().alignPreviewLayers(selection, 'left')
    const leftAligned = usePlayoutStore.getState().previewScene
    expect(getLayerPosition(leftAligned, 'shape-home-block').x).toBe(160)
    expect(getLayerPosition(leftAligned, 'text-home-mark').x).toBe(160)
    expect(getLayerPosition(leftAligned, 'shape-away-block').x).toBe(160)

    usePlayoutStore.getState().distributePreviewLayers(selection, 'vertical')
    const distributed = usePlayoutStore.getState().previewScene
    expect(getLayerPosition(distributed, 'shape-home-block').y).toBe(110)
    expect(getLayerPosition(distributed, 'text-home-mark').y).toBe(315)
    expect(getLayerPosition(distributed, 'shape-away-block').y).toBe(520)
  })

  test('template version restore rehydrates prior scene and increments current version', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-scorebug')
    const customTemplateId = usePlayoutStore.getState().savePreviewTemplate('QA Version Template')
    expect(customTemplateId).toBeTruthy()

    usePlayoutStore.getState().updatePreviewLayerTransform('shape-home-block', { x: 500 })
    usePlayoutStore.getState().savePreviewTemplate('QA Version Template')

    const templateAfterOverwrite = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(templateAfterOverwrite?.version).toBe(2)
    expect(templateAfterOverwrite?.versions?.some((entry) => entry.version === 1)).toBe(true)

    const restored = usePlayoutStore.getState().restoreTemplateVersion(customTemplateId ?? '', 1)
    expect(restored).toBe(true)

    const templateAfterRestore = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(templateAfterRestore?.version).toBe(3)
    expect(templateAfterRestore?.versions?.some((entry) => entry.version === 2)).toBe(true)

    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-home-block').x).toBe(160)
  })

  test('binding metadata is persisted on template save and in version history', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-scorebug')
    usePlayoutStore.getState().updatePreviewTextBinding('text-home-score', 'period')
    const customTemplateId = usePlayoutStore.getState().savePreviewTemplate('Binding QA Template')
    expect(customTemplateId).toBeTruthy()

    const savedTemplate = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(savedTemplate?.bindings?.includes('period')).toBe(true)
    expect(savedTemplate?.bindings?.includes('awayScore')).toBe(true)

    usePlayoutStore.getState().updatePreviewTextBinding('text-home-score', 'homeFouls')
    usePlayoutStore.getState().savePreviewTemplate('Binding QA Template')

    const overwrittenTemplate = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(overwrittenTemplate?.version).toBe(2)
    expect(overwrittenTemplate?.bindings?.includes('homeFouls')).toBe(true)
    expect(overwrittenTemplate?.versions?.some((entry) => entry.bindings.includes('period'))).toBe(true)
  })

  test('typed story overrides update non-score schema fields', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().setStoryValue('period', 2)
    usePlayoutStore.getState().setStoryValue('shotClock', 18)
    usePlayoutStore.getState().setStoryValue('headline', 'Fast break points')

    const { story } = usePlayoutStore.getState()
    expect(story.period).toBe(2)
    expect(story.shotClock).toBe(18)
    expect(story.headline).toBe('Fast break points')
  })
})
