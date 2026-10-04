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

  test('Make is the landing page: fill a field, no editor or switcher controls, layout untouched', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    const templatesBefore = JSON.stringify(usePlayoutStore.getState().templates)
    const programBefore = JSON.stringify(usePlayoutStore.getState().story)

    expect(await screen.findByRole('button', { name: /Export PNG/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'TAKE' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reset Demo/ })).toBeNull()
    expect(document.querySelector('.layer-list, .ruler, .scene-renderer__selection')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Quote Card/ }))
    const quote = screen.getByLabelText('Quote') as HTMLTextAreaElement
    expect(quote.tagName).toBe('TEXTAREA')
    await user.type(quote, 'We will win.')
    expect(document.querySelector('.make-preview')?.textContent).toContain('We will win.')

    // Make never writes to templates or to what Program shows.
    expect(JSON.stringify(usePlayoutStore.getState().templates)).toBe(templatesBefore)
    expect(JSON.stringify(usePlayoutStore.getState().story)).toBe(programBefore)

    // Studio pages sit behind the Studio menu.
    expect(screen.queryByRole('link', { name: 'Design' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Studio/ }))
    await user.click(screen.getByRole('link', { name: 'Design' }))
    // No live trigger while designing or editing data: the header TAKE is only in the Control Room.
    expect(screen.queryByRole('button', { name: /TAKE/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Studio/ }))
    await user.click(screen.getByRole('link', { name: 'Data' }))
    expect(screen.queryByRole('button', { name: /TAKE/ })).toBeNull()
  })

  test('dashboard mode/filter/load interactions are all live', async () => {
    const user = userEvent.setup()
    renderRoute('/dashboard')

    expect(screen.getByText('Asset Library')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Media' }))
    expect(screen.getByRole('button', { name: 'New Folder' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Template Designs' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Typography' }))
    expect(screen.getByRole('button', { name: 'Imported' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Templates' }))
    expect(screen.getByRole('button', { name: 'Built-In' })).toBeTruthy()

    // Old developer tools and package signing are gone from the Library.
    expect(screen.queryByRole('button', { name: 'DEV TOOLS' })).toBeNull()
    expect(screen.queryByText('Package Signing')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByText('No templates match the current query/filter.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Built-In' }))
    expect(screen.getAllByText('Quote Card 4x5').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'All Templates' }))
    const lowerThirdCard = screen.getAllByText('Lower Third')[0]?.closest('.library-card')
    expect(lowerThirdCard).toBeTruthy()
    fireEvent.click(lowerThirdCard!)
    expect(screen.getByText('Preview cued: Lower Third')).toBeTruthy()

    const loadButton = within(lowerThirdCard as HTMLElement).getByRole('button', { name: 'Load' })
    await user.click(loadButton)
    expect(await screen.findByText('Template editor')).toBeTruthy()
  })

  test('data page edits fields and fills them from pasted spreadsheet rows', async () => {
    const user = userEvent.setup()
    renderRoute('/data')

    expect(screen.getByText('Fields')).toBeTruthy()
    const nameField = screen.getByText('Name').closest('label')?.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(nameField, { target: { value: 'Alex Rivera' } })
    expect(usePlayoutStore.getState().story.bindings.name).toBe('Alex Rivera')

    const paste = screen.getByPlaceholderText(/Paste cells from Google Sheets/) as HTMLTextAreaElement
    // Pasting loads the rows at once: there is no "use" button.
    expect(screen.queryByRole('button', { name: /Use pasted rows/ })).toBeNull()
    const rows = ['name\ttitle\tnotes', 'Jane Doe\tSenator\tx', 'John Roe\tMayor\ty'].join('\n')
    fireEvent.paste(paste, { clipboardData: { getData: () => rows } })
    expect(usePlayoutStore.getState().dataSheet?.rows).toHaveLength(2)
    // The report says what matched the Preview template and flags the rest.
    expect(screen.getByText(/matched · 2 rows/)).toBeTruthy()
    expect(screen.getByText('No field called “notes”')).toBeTruthy()

    await user.click(screen.getByText('John Roe'))
    expect(usePlayoutStore.getState().story.bindings).toMatchObject({ name: 'John Roe', title: 'Mayor' })

    await user.click(screen.getByRole('button', { name: /Prev/ }))
    expect(usePlayoutStore.getState().story.bindings.name).toBe('Jane Doe')
    usePlayoutStore.getState().clearDataSheet()
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
    // Typed values apply exactly (snapping is for dragging only). X is where the anchor sits,
    // and text anchors at the middle of its box.
    const anchorX = () => {
      const layer = usePlayoutStore.getState().previewScene.layers.find((entry) => entry.id === createdLayer?.id)
      return layer ? layer.x + (layer.anchorX ?? layer.width / 2) : null
    }
    expect(anchorX()).toBe(123)

    // Align left puts a single layer's anchor on the canvas's left edge.
    await user.click(screen.getByRole('button', { name: /^Left$/ }))
    expect(anchorX()).toBe(0)

    await user.click(screen.getByRole('button', { name: /^Studio/ }))
    await user.click(screen.getByRole('link', { name: 'Control Room' }))
    expect(await screen.findByRole('heading', { name: 'Control Room' })).toBeTruthy()

    const rundownList = container.querySelector('.rundown-list')
    expect(rundownList).toBeTruthy()
    const cueButton = within(rundownList as HTMLElement).getByRole('button', { name: 'Lower Third' })
    await user.click(cueButton)
    const monitorsPanel = container.querySelector('.monitors-panel')
    expect(monitorsPanel).toBeTruthy()
    await user.click(within(monitorsPanel as HTMLElement).getByRole('button', { name: 'TAKE' }))
    expect(usePlayoutStore.getState().onAir).toBe(true)
    expect(usePlayoutStore.getState().programScene.name).toBe('Lower Third')

    await user.click(screen.getByRole('button', { name: 'Copy Program URL' }))
    expect(screen.getByText(/PROGRAM URL copied|Clipboard unavailable/)).toBeTruthy()

    // Output settings sit in a collapsible panel under Program.
    await user.click(screen.getByRole('button', { name: 'Outputs' }))
    await user.click(screen.getByRole('button', { name: 'WebSocket' }))
    expect(usePlayoutStore.getState().transportMode).toBe('ws')
    await user.click(screen.getByRole('button', { name: 'Local' }))
    expect(usePlayoutStore.getState().transportMode).toBe('local')

    // Plain-words status; TAKE and CLEAR both live in the center console, in separate groups.
    expect(screen.getAllByText('LIVE · ON AIR').length).toBeGreaterThan(0)
    expect(container.querySelector('.take-group')?.textContent).not.toContain('CLEAR')
    expect(container.querySelector('.transition-console .clear-group .clear-button')).toBeTruthy()
    expect(container.querySelector('.monitor-tile--program .clear-button')).toBeNull()

    // A tap of C only explains; holding it clears.
    fireEvent.keyDown(window, { key: 'c' })
    fireEvent.keyUp(window, { key: 'c' })
    expect(usePlayoutStore.getState().onAir).toBe(true)
    expect(screen.getByText('Hold C to clear Program')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'c' })
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)))
    expect(usePlayoutStore.getState().onAir).toBe(false)
    expect(screen.getAllByText('OFF AIR').length).toBeGreaterThan(0)
    fireEvent.keyUp(window, { key: 'c' })

    // The CLEAR button needs a short hold too: a click only explains.
    await user.click(within(monitorsPanel as HTMLElement).getByRole('button', { name: 'TAKE' }))
    const clearButton = within(monitorsPanel as HTMLElement).getByRole('button', { name: 'CLEAR' })
    await user.click(clearButton)
    expect(usePlayoutStore.getState().onAir).toBe(true)
    expect(screen.getByText('Hold to clear Program')).toBeTruthy()
    fireEvent.pointerDown(clearButton, { button: 0 })
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)))
    fireEvent.pointerUp(clearButton)
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
