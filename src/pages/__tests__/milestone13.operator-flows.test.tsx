import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../../App'
import { usePlayoutStore } from '../../store/playoutStore'

function renderRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Milestone 13 operator click-path regressions', () => {
  beforeEach(() => {
    usePlayoutStore.getState().resetDemo()
  })

  test('dashboard mode/filter/dev/load interactions are all live', async () => {
    const user = userEvent.setup()
    renderRoute('/dashboard')

    expect(screen.getByText('Explorer')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Branded Assets' }))
    expect(screen.getByRole('button', { name: 'New Folder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Template Designs' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Fonts' }))
    expect(screen.getByRole('button', { name: 'Imported' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    expect(screen.getByRole('button', { name: 'Built-In' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'DEV TOOLS' }))
    expect(screen.getByRole('button', { name: 'Export persisted state' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset dashboard uploads' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByText('No templates match the current query/filter.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Built-In' }))
    expect(screen.getByText('H_A_Score_001')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'All Templates' }))
    const lowerThirdRow = screen.getByText('Lower_Third_001').closest('tr')
    expect(lowerThirdRow).toBeTruthy()
    fireEvent.click(lowerThirdRow!)
    expect(screen.getByText('Preview cued: Lower_Third_001')).toBeTruthy()

    const loadButton = within(lowerThirdRow!).getByRole('button', { name: 'Load' })
    await user.click(loadButton)
    expect(await screen.findByText('STAGE PRO')).toBeTruthy()
  })

  test('data engine quick-start controls drive simulation + transport state', async () => {
    const user = userEvent.setup()
    renderRoute('/data-engine')

    expect(screen.getByRole('heading', { name: 'Data Engine' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'NFL' }))
    expect(usePlayoutStore.getState().simulationLeague).toBe('NFL')

    await user.click(screen.getByRole('button', { name: 'FAST' }))
    expect(usePlayoutStore.getState().simulationSpeed).toBe('FAST')

    const seedInput = screen.getByLabelText('Seed (deterministic)') as HTMLInputElement
    fireEvent.change(seedInput, { target: { value: '12345' } })
    fireEvent.blur(seedInput)
    expect(usePlayoutStore.getState().simulationSeed).toBe(12345)

    await user.click(screen.getByRole('button', { name: 'Start' }))
    expect(usePlayoutStore.getState().simulationStatus).toBe('running')

    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(usePlayoutStore.getState().simulationStatus).toBe('paused')

    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(usePlayoutStore.getState().simulationStatus).toBe('running')

    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(usePlayoutStore.getState().simulationStatus).toBe('idle')

    await user.click(screen.getByRole('button', { name: 'WebSocket' }))
    expect(usePlayoutStore.getState().transportMode).toBe('ws')
    await user.click(screen.getByRole('button', { name: 'Local' }))
    expect(usePlayoutStore.getState().transportMode).toBe('local')
  })

  test('design authoring + control room playout actions execute end-to-end', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWrite },
      configurable: true,
      writable: true,
    })

    const user = userEvent.setup()
    const { container } = renderRoute('/design')

    const baselineLayers = usePlayoutStore.getState().previewScene.layers.length
    await user.click(screen.getByRole('button', { name: 'TEXT' }))
    expect(usePlayoutStore.getState().previewScene.layers.length).toBe(baselineLayers + 1)

    const createdLayer = usePlayoutStore.getState().previewScene.layers.at(-1)
    expect(createdLayer?.kind).toBe('text')

    await user.click(screen.getByRole('button', { name: 'PAN' }))
    expect(container.querySelector('.scene-renderer--mode-pan')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'SELECT' }))
    expect(container.querySelector('.scene-renderer--mode-select')).toBeTruthy()

    const renameTrigger = container.querySelector('.inspector-rename-trigger') as HTMLButtonElement | null
    expect(renameTrigger).toBeTruthy()
    if (renameTrigger) {
      await user.click(renameTrigger)
    }
    const renameInput = container.querySelector('.inspector-layer-name input') as HTMLInputElement | null
    expect(renameInput).toBeTruthy()
    if (renameInput) {
      fireEvent.change(renameInput, { target: { value: 'QA Layer 13' } })
      fireEvent.keyDown(renameInput, { key: 'Enter' })
    }
    expect(
      usePlayoutStore
        .getState()
        .previewScene.layers.find((layer) => layer.id === createdLayer?.id)
        ?.name,
    ).toBe('QA Layer 13')

    const xInput = screen.getByLabelText('X') as HTMLInputElement
    fireEvent.change(xInput, { target: { value: '123' } })
    expect(
      usePlayoutStore
        .getState()
        .previewScene.layers.find((layer) => layer.id === createdLayer?.id)
        ?.x,
    ).toBe(120)

    await user.click(screen.getByRole('button', { name: /Left/i }))
    expect(
      usePlayoutStore
        .getState()
        .previewScene.layers.find((layer) => layer.id === createdLayer?.id)
        ?.x,
    ).toBe(0)

    await user.click(screen.getByRole('link', { name: 'Control Room' }))
    expect(await screen.findByRole('heading', { name: 'Control Room' })).toBeTruthy()

    const rundownList = container.querySelector('.rundown-list')
    expect(rundownList).toBeTruthy()
    const cueButton = within(rundownList as HTMLElement).getByRole('button', { name: 'Lower_Third_001' })
    await user.click(cueButton)
    const monitorsPanel = container.querySelector('.monitors-panel')
    expect(monitorsPanel).toBeTruthy()
    await user.click(within(monitorsPanel as HTMLElement).getByRole('button', { name: 'TAKE' }))
    expect(usePlayoutStore.getState().onAir).toBe(true)
    expect(usePlayoutStore.getState().programScene.name).toBe('Lower_Third_001')

    await user.click(screen.getByRole('button', { name: 'Copy Program URL' }))
    expect(screen.getByText(/PROGRAM URL copied|Clipboard unavailable/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'WebSocket' }))
    expect(usePlayoutStore.getState().transportMode).toBe('ws')
    await user.click(screen.getByRole('button', { name: 'Local' }))
    expect(usePlayoutStore.getState().transportMode).toBe('local')

    await user.click(within(monitorsPanel as HTMLElement).getByRole('button', { name: 'CLEAR' }))
    expect(usePlayoutStore.getState().onAir).toBe(false)
    expect(usePlayoutStore.getState().programScene.name).toBe('Clear')
  })

  test('canvas drag and pan interactions move selected layers and stage offset', async () => {
    const user = userEvent.setup()
    const { container } = renderRoute('/design')
    await user.click(screen.getByRole('button', { name: 'TEXT' }))

    const createdLayer = usePlayoutStore.getState().previewScene.layers.at(-1)
    expect(createdLayer).toBeTruthy()
    const layerText = createdLayer?.kind === 'text' ? createdLayer.text : null
    expect(layerText).toBeTruthy()

    const layerNode = screen.getAllByText(layerText ?? '').at(0)
    expect(layerNode).toBeTruthy()

    act(() => {
      fireEvent.mouseDown(layerNode!, { button: 0, clientX: 300, clientY: 300 })
      fireEvent.mouseMove(window, { clientX: 320, clientY: 310 })
      fireEvent.mouseUp(window)
    })

    const movedLayer = usePlayoutStore
      .getState()
      .previewScene.layers.find((layer) => layer.id === createdLayer?.id)
    expect(movedLayer?.x).not.toBe(createdLayer?.x)
    expect(movedLayer?.y).not.toBe(createdLayer?.y)

    await user.click(screen.getByRole('button', { name: 'PAN' }))
    const stageBefore = container.querySelector('.scene-renderer__stage') as HTMLElement | null
    const leftBefore = stageBefore?.style.left
    const topBefore = stageBefore?.style.top

    act(() => {
      fireEvent.mouseDown(stageBefore ?? container, { button: 0, clientX: 500, clientY: 400 })
      fireEvent.mouseMove(window, { clientX: 560, clientY: 440 })
      fireEvent.mouseUp(window)
    })

    const stageAfter = container.querySelector('.scene-renderer__stage') as HTMLElement | null
    expect(stageAfter?.style.left).not.toBe(leftBefore)
    expect(stageAfter?.style.top).not.toBe(topBefore)
  })
})
