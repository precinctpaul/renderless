import { describe, expect, test, vi } from 'vitest'

const SNAPSHOT_KEY = 'renderless.playout.snapshot.v1'
const TEMPLATE_STORAGE_KEY = 'renderless.templates.v1'

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

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().updatePreviewLayerTransform('shape-lt-bg', { x: 420 })
    usePlayoutStore.getState().take()

    const liveState = usePlayoutStore.getState()
    expect(liveState.programTemplateId).toBe('template-lower-third')
    expect(getLayerPosition(liveState.programScene, 'shape-lt-bg').x).toBe(420)

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    const serializedSnapshot = window.localStorage.getItem(SNAPSHOT_KEY)
    expect(serializedSnapshot).toBeTruthy()
    const parsedSnapshot = JSON.parse(serializedSnapshot ?? '{}') as {
      programScene?: { layers?: Array<{ id: string; x: number }> }
      updatedAt?: number
    }
    const persistedProgramLayer = parsedSnapshot.programScene?.layers?.find((layer) => layer.id === 'shape-lt-bg')
    expect(persistedProgramLayer?.x).toBe(420)
    expect(typeof parsedSnapshot.updatedAt).toBe('number')

    const { usePlayoutStore: refreshedStore } = await loadStoreModule()
    const refreshedState = refreshedStore.getState()

    expect(refreshedState.programTemplateId).toBe('template-lower-third')
    expect(getLayerPosition(refreshedState.programScene, 'shape-lt-bg').x).toBe(420)
  })

  test('cold start without a snapshot keeps program clear and off air', async () => {
    const { usePlayoutStore } = await loadStoreModule()
    const state = usePlayoutStore.getState()

    expect(state.onAir).toBe(false)
    expect(state.programTemplateId).toBe('__clear__')
    expect(state.programScene.layers).toHaveLength(0)
  })

  test('off-air snapshots never hydrate a program scene', async () => {
    const { usePlayoutStore } = await loadStoreModule()
    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().take()
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const snapshot = JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) ?? '{}') as Record<string, unknown>
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...snapshot, onAir: false }))

    const { usePlayoutStore: refreshedStore } = await loadStoreModule()
    expect(refreshedStore.getState().programTemplateId).toBe('__clear__')
    expect(refreshedStore.getState().programScene.layers).toHaveLength(0)
  })

  test('reset demo and deleting the on-air template both clear program', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().take()
    usePlayoutStore.getState().resetDemo()
    expect(usePlayoutStore.getState().onAir).toBe(false)
    expect(usePlayoutStore.getState().programTemplateId).toBe('__clear__')
    expect(usePlayoutStore.getState().programScene.layers).toHaveLength(0)

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().savePreviewTemplate('On Air Custom')
    const customTemplateId = usePlayoutStore.getState().previewTemplateId
    usePlayoutStore.getState().take()
    expect(usePlayoutStore.getState().programTemplateId).toBe(customTemplateId)

    usePlayoutStore.getState().deleteTemplate(customTemplateId)
    expect(usePlayoutStore.getState().onAir).toBe(false)
    expect(usePlayoutStore.getState().programTemplateId).toBe('__clear__')
    expect(usePlayoutStore.getState().programScene.layers).toHaveLength(0)
  })

  test('non-cut transitions defer program switch and expose in-progress state', async () => {
    vi.useFakeTimers()
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().clearProgram()
    usePlayoutStore.getState().setTransition('fade')
    usePlayoutStore.getState().setTransitionDuration(300)
    usePlayoutStore.getState().updatePreviewLayerTransform('shape-lt-bg', { x: 512 })

    usePlayoutStore.getState().take()

    expect(usePlayoutStore.getState().transitionInProgress).toBe(true)
    expect(usePlayoutStore.getState().onAir).toBe(false)

    vi.advanceTimersByTime(299)
    expect(usePlayoutStore.getState().programTemplateId).not.toBe('template-lower-third')
    expect(usePlayoutStore.getState().transitionInProgress).toBe(true)

    vi.advanceTimersByTime(1)
    expect(usePlayoutStore.getState().programTemplateId).toBe('template-lower-third')
    expect(getLayerPosition(usePlayoutStore.getState().programScene, 'shape-lt-bg').x).toBe(512)
    expect(usePlayoutStore.getState().transitionInProgress).toBe(false)
    expect(usePlayoutStore.getState().onAir).toBe(true)
  })

  test('stale in-progress transition snapshots recover on cold start', async () => {
    const staleSnapshot = {
      previewTemplateId: 'template-lower-third',
      programTemplateId: 'template-lower-third',
      transitionType: 'fade',
      transitionDurationMs: 300,
      transitionInProgress: true,
      onAir: true,
      updatedAt: Date.now() - 10_000,
    }
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(staleSnapshot))

    const { usePlayoutStore } = await loadStoreModule()
    const state = usePlayoutStore.getState()

    expect(state.transitionInProgress).toBe(false)
    expect(state.transitionDurationMs).toBe(300)
    expect(state.transitionType).toBe('fade')
  })

  test('undo and redo revert and reapply scene edits deterministically', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    const originalX = getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg').x
    expect(originalX).toBe(120)

    usePlayoutStore.getState().updatePreviewLayerTransform('shape-lt-bg', { x: 300 })
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg').x).toBe(300)
    expect(usePlayoutStore.getState().canUndo).toBe(true)

    usePlayoutStore.getState().undoPreviewScene()
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg').x).toBe(120)
    expect(usePlayoutStore.getState().canRedo).toBe(true)

    usePlayoutStore.getState().redoPreviewScene()
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg').x).toBe(300)
  })

  test('create layer actions append text and shape layers to preview scene', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    const baselineCount = usePlayoutStore.getState().previewScene.layers.length

    const textLayerId = usePlayoutStore.getState().createPreviewLayer('text')
    const shapeLayerId = usePlayoutStore.getState().createPreviewLayer('shape')

    expect(textLayerId).toBeTruthy()
    expect(shapeLayerId).toBeTruthy()

    const scene = usePlayoutStore.getState().previewScene
    expect(scene.layers.length).toBe(baselineCount + 2)
    expect(scene.layers.some((layer) => layer.id === textLayerId && layer.kind === 'text')).toBe(true)
    expect(scene.layers.some((layer) => layer.id === shapeLayerId && layer.kind === 'shape')).toBe(true)
  })

  test('layer move delta supports precise and snap-to-grid movement', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')

    usePlayoutStore.getState().movePreviewLayersByDelta(['shape-lt-bg'], { x: 3, y: 7 }, false)
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg')).toEqual({ x: 123, y: 827 })

    usePlayoutStore.getState().movePreviewLayersByDelta(['shape-lt-bg'], { x: 2, y: 2 }, true)
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg')).toEqual({ x: 130, y: 830 })
  })

  test('align works from anchor points, exactly', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().updatePreviewLayerTransform('shape-lt-bg', { x: 163, y: 117 })
    usePlayoutStore.getState().updatePreviewLayerTransform('text-lt-name', { x: 247, y: 311 })
    usePlayoutStore.getState().updatePreviewLayerTransform('shape-lt-accent', { x: 509, y: 523 })
    // A top-left anchor on one layer: its corner lines up with the others' centers.
    usePlayoutStore.getState().setPreviewLayersAnchor(['shape-lt-accent'], { preset: 'tl' })

    const selection = ['shape-lt-bg', 'text-lt-name', 'shape-lt-accent']
    const anchorX = (id: string) => {
      const layer = usePlayoutStore.getState().previewScene.layers.find((entry) => entry.id === id)
      return layer ? layer.x + (layer.anchorX ?? layer.width / 2) : NaN
    }
    const leftMost = Math.min(...selection.map(anchorX))
    usePlayoutStore.getState().alignPreviewLayers(selection, 'left')
    selection.forEach((id) => expect(anchorX(id)).toBeCloseTo(leftMost, 5))
    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-accent').x).toBeCloseTo(leftMost, 5)

    // One layer aligns its anchor to the canvas: a centered anchor lands on the right edge.
    usePlayoutStore.getState().alignPreviewLayers(['shape-lt-bg'], 'right')
    expect(anchorX('shape-lt-bg')).toBe(1920)
  })

  test('layer movement clamps to stage bounds', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().movePreviewLayersByDelta(['shape-lt-bg'], { x: 5000, y: 5000 }, false)
    const clampedPosition = getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg')
    // The 1080x160 bar stops at the canvas's bottom-right corner.
    expect(clampedPosition).toEqual({ x: 840, y: 920 })
  })

  test('distribute spaces anchor points evenly', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    const selection = ['shape-lt-bg', 'text-lt-name', 'shape-lt-accent']
    usePlayoutStore.getState().distributePreviewLayers(selection, 'vertical')
    const scene = usePlayoutStore.getState().previewScene
    const anchorY = (id: string) => {
      const layer = scene.layers.find((entry) => entry.id === id)
      if (!layer) return NaN
      return layer.y + (layer.anchorY ?? layer.height / 2)
    }
    const ys = selection.map(anchorY).sort((a, b) => a - b)
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1], 5)
  })

  test('template version restore rehydrates prior scene and increments current version', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    const customTemplateId = usePlayoutStore.getState().savePreviewTemplate('QA Version Template')
    expect(customTemplateId).toBeTruthy()

    usePlayoutStore.getState().updatePreviewLayerTransform('shape-lt-bg', { x: 500 })
    usePlayoutStore.getState().savePreviewTemplate('QA Version Template')

    const templateAfterOverwrite = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(templateAfterOverwrite?.version).toBe(2)
    expect(templateAfterOverwrite?.versions?.some((entry) => entry.version === 1)).toBe(true)

    const restored = usePlayoutStore.getState().restoreTemplateVersion(customTemplateId ?? '', 1)
    expect(restored).toBe(true)

    const templateAfterRestore = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(templateAfterRestore?.version).toBe(3)
    expect(templateAfterRestore?.versions?.some((entry) => entry.version === 2)).toBe(true)

    expect(getLayerPosition(usePlayoutStore.getState().previewScene, 'shape-lt-bg').x).toBe(120)
  })

  test('binding metadata is persisted on template save and in version history', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().updatePreviewTextBinding('text-lt-title', 'headline')
    const customTemplateId = usePlayoutStore.getState().savePreviewTemplate('Binding QA Template')
    expect(customTemplateId).toBeTruthy()

    const savedTemplate = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(savedTemplate?.bindings?.includes('headline')).toBe(true)
    expect(savedTemplate?.bindings?.includes('name')).toBe(true)

    usePlayoutStore.getState().updatePreviewTextBinding('text-lt-title', 'subhead')
    usePlayoutStore.getState().savePreviewTemplate('Binding QA Template')

    const overwrittenTemplate = usePlayoutStore.getState().templates.find((template) => template.id === customTemplateId)
    expect(overwrittenTemplate?.version).toBe(2)
    expect(overwrittenTemplate?.bindings?.includes('subhead')).toBe(true)
    expect(overwrittenTemplate?.versions?.some((entry) => entry.bindings.includes('headline'))).toBe(true)
  })

  test('field values can be set, added and removed', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().setFieldValue('name', 'Alex Rivera')
    usePlayoutStore.getState().setFieldValues({ title: 'Mayor', event_date: 'May 5' })
    expect(usePlayoutStore.getState().story.bindings).toMatchObject({ name: 'Alex Rivera', title: 'Mayor', event_date: 'May 5' })
    // New keys show up in the field catalog for the Design picker.
    expect(usePlayoutStore.getState().bindingFields.some((field) => field.key === 'event_date')).toBe(true)

    usePlayoutStore.getState().removeField('event_date')
    expect(usePlayoutStore.getState().story.bindings.event_date).toBeUndefined()
  })

  test('picking a spreadsheet row fills the fields', async () => {
    const { usePlayoutStore } = await loadStoreModule()
    const { parseDataSheet } = await import('../../lib/dataSheet')

    const sheet = parseDataSheet(['Name,Title', 'Jane Doe,Senator', 'John Roe,Mayor'].join('\n'), 'people.csv')
    expect(sheet).toBeTruthy()
    usePlayoutStore.getState().loadDataSheet(sheet!)
    usePlayoutStore.getState().selectDataRow(1)

    const state = usePlayoutStore.getState()
    expect(state.dataRowIndex).toBe(1)
    expect(state.story.bindings).toMatchObject({ name: 'John Roe', title: 'Mayor' })
  })

  test('text style updates can switch font family for immediate font ingest usage', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().updatePreviewTextStyle('text-lt-title', {
      fontFamily: 'Anton Custom, sans-serif',
    })

    const layer = usePlayoutStore
      .getState()
      .previewScene.layers.find((entry) => entry.id === 'text-lt-title' && entry.kind === 'text')
    expect(layer && layer.kind === 'text' ? layer.fontFamily : '').toBe('Anton Custom, sans-serif')
  })

  test('custom templates are persisted in template package contract v2 with integrity metadata', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().savePreviewTemplate('Package QA Template')

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    const serializedTemplates = window.localStorage.getItem(TEMPLATE_STORAGE_KEY)
    expect(serializedTemplates).toBeTruthy()

    const parsedTemplates = JSON.parse(serializedTemplates ?? '[]') as Array<{
      kind?: string
      contractVersion?: number
      integrity?: { checksum?: { algorithm?: string; value?: string } }
      metadata?: { label?: string; size?: { width?: number; height?: number } }
      scenegraph?: { width?: number; height?: number }
      bindings?: string[]
    }>

    expect(Array.isArray(parsedTemplates)).toBe(true)
    expect(parsedTemplates.length).toBeGreaterThan(0)
    expect(parsedTemplates[0]?.kind).toBe('renderless.template-package')
    expect(parsedTemplates[0]?.contractVersion).toBe(2)
    expect(parsedTemplates[0]?.integrity?.checksum?.algorithm).toBe('fnv1a-32')
    expect(parsedTemplates[0]?.integrity?.checksum?.value).toMatch(/^[a-f0-9]{8}$/)
    expect(parsedTemplates[0]?.metadata?.label).toBe('Package QA Template')
    expect(parsedTemplates[0]?.metadata?.size?.width).toBe(1920)
    expect(parsedTemplates[0]?.scenegraph?.height).toBe(1080)
    expect(parsedTemplates[0]?.bindings?.includes('name')).toBe(true)
  })

  test('v1 package payload migrates into v2 contract on import', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    const v2Package = usePlayoutStore.getState().exportPreviewTemplatePackage()
    const v1Package = {
      ...v2Package,
      contractVersion: 1 as const,
    }
    delete (v1Package as { integrity?: unknown }).integrity

    const importResult = usePlayoutStore.getState().importTemplatePackage(v1Package)
    expect(importResult.ok).toBe(true)
    expect(importResult.migrationTrail?.includes('package-v1 -> package-v2')).toBe(true)
  })

  test('signed package export/import enforces shared-secret verification when enabled', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().setPackageSigningConfig({
      enabled: true,
      keyId: 'truck-a',
      secret: 'top-secret',
    })

    usePlayoutStore.getState().cuePreview('template-lower-third')
    const signedPackage = usePlayoutStore.getState().exportPreviewTemplatePackage()
    expect(signedPackage.integrity.signature?.keyId).toBe('truck-a')

    const validImport = usePlayoutStore.getState().importTemplatePackage(signedPackage)
    expect(validImport.ok).toBe(true)

    usePlayoutStore.getState().setPackageSigningConfig({
      secret: 'wrong-secret',
    })

    const invalidImport = usePlayoutStore.getState().importTemplatePackage(signedPackage)
    expect(invalidImport.ok).toBe(false)
    expect(invalidImport.error).toContain('signature')
  })

  test('template package import round-trips scenegraph and binding metadata', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().updatePreviewTextBinding('text-lt-title', 'headline')
    const exportedPackage = usePlayoutStore.getState().exportPreviewTemplatePackage()
    const importResult = usePlayoutStore.getState().importTemplatePackage(exportedPackage)

    expect(importResult.ok).toBe(true)
    expect(importResult.templateId).toBeTruthy()

    const importedTemplate = usePlayoutStore.getState().templates.find((template) => template.id === importResult.templateId)
    expect(importedTemplate).toBeTruthy()
    expect(importedTemplate?.scene.width).toBe(1920)
    expect(importedTemplate?.scene.height).toBe(1080)
    expect(importedTemplate?.bindings?.includes('headline')).toBe(true)
  })

  test('transport settings switch between local and websocket modes', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    usePlayoutStore.getState().setTransportMode('ws')
    usePlayoutStore.getState().setTransportWsUrl('ws://127.0.0.1:8787')

    expect(usePlayoutStore.getState().transportMode).toBe('ws')
    expect(usePlayoutStore.getState().transportWsUrl).toBe('ws://127.0.0.1:8787')

    usePlayoutStore.getState().setTransportMode('local')
    expect(usePlayoutStore.getState().transportMode).toBe('local')
  })

  test('invalid template package payload is rejected during import', async () => {
    const { usePlayoutStore } = await loadStoreModule()

    const importResult = usePlayoutStore.getState().importTemplatePackage({
      kind: 'renderless.template-package',
      contractVersion: 999,
    })

    expect(importResult.ok).toBe(false)
    expect(importResult.error).toContain('Unsupported package contract')
  })

  test('New Template creates an empty 1920x1080 custom template and loads it into preview', async () => {
    const { usePlayoutStore } = await loadStoreModule()
    const before = usePlayoutStore.getState().templates.length

    expect(usePlayoutStore.getState().createBlankTemplate('   ')).toBeNull()
    const templateId = usePlayoutStore.getState().createBlankTemplate('Thumbnail Left')

    const state = usePlayoutStore.getState()
    const created = state.templates.find((template) => template.id === templateId)
    expect(state.templates).toHaveLength(before + 1)
    expect(created?.builtIn).toBe(false)
    expect(created?.label).toBe('Thumbnail Left')
    expect(state.previewTemplateId).toBe(templateId)
    expect(state.previewScene.layers).toHaveLength(0)
    expect([state.previewScene.width, state.previewScene.height]).toEqual([1920, 1080])
    expect(window.localStorage.getItem(TEMPLATE_STORAGE_KEY)).toContain('Thumbnail Left')
  })

  test('Save As New forks a custom template instead of overwriting it', async () => {
    const { usePlayoutStore } = await loadStoreModule()
    const originalId = usePlayoutStore.getState().createBlankTemplate('Original')!
    usePlayoutStore.getState().createPreviewLayer('text')
    usePlayoutStore.getState().savePreviewTemplate('Original')
    expect(usePlayoutStore.getState().previewTemplateId).toBe(originalId)

    usePlayoutStore.getState().createPreviewLayer('shape')
    const copyId = usePlayoutStore.getState().savePreviewTemplate('Original copy', { asNew: true })

    const state = usePlayoutStore.getState()
    expect(copyId).not.toBe(originalId)
    expect(state.previewTemplateId).toBe(copyId)
    expect(state.templates.find((template) => template.id === originalId)?.scene.layers).toHaveLength(1)
    expect(state.templates.find((template) => template.id === copyId)?.scene.layers).toHaveLength(2)
  })
})
