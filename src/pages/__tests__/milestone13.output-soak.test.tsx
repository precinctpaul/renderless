import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../../App'
import { usePlayoutStore } from '../../store/playoutStore'

const PROGRAM_HEARTBEAT_KEY = 'renderless.output.heartbeat.v1.program'

function renderRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Milestone 13 output-feed soak and OBS refresh stability', () => {
  beforeEach(() => {
    usePlayoutStore.getState().resetDemo()
    usePlayoutStore.getState().setTransition('cut')
  })

  test('program output survives repeated take/clear cycles with refresh remounts', () => {
    vi.useFakeTimers()
    const store = usePlayoutStore.getState()
    store.cuePreview('template-quote-card')
    store.take()

    let view = renderRoute('/output-feed?follow=program&embed=1&debug=1')

    for (let cycle = 0; cycle < 30; cycle += 1) {
      const templateId = cycle % 2 === 0 ? 'template-quote-card' : 'template-lower-third'
      usePlayoutStore.getState().cuePreview(templateId)
      usePlayoutStore.getState().take()

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      const onAirStatus = window.__renderlessOutputStatus
      expect(onAirStatus?.follow).toBe('program')
      expect(onAirStatus?.stale).toBe(false)
      expect(onAirStatus?.sceneName).toBe(usePlayoutStore.getState().programScene.name)

      const heartbeatPayload = window.localStorage.getItem(PROGRAM_HEARTBEAT_KEY)
      expect(heartbeatPayload).toBeTruthy()

      view.unmount()
      view = renderRoute('/output-feed?follow=program&embed=1&debug=1')

      act(() => {
        vi.advanceTimersByTime(1)
      })

      const refreshedStatus = window.__renderlessOutputStatus
      expect(refreshedStatus?.follow).toBe('program')
      expect(refreshedStatus?.stale).toBe(false)
      expect(refreshedStatus?.sceneName).toBe(usePlayoutStore.getState().programScene.name)

      usePlayoutStore.getState().clearProgram()
      act(() => {
        vi.advanceTimersByTime(1000)
      })

      const clearedStatus = window.__renderlessOutputStatus
      expect(clearedStatus?.follow).toBe('program')
      expect(clearedStatus?.stale).toBe(false)
      expect(clearedStatus?.sceneName).toBe('Clear')
      expect(usePlayoutStore.getState().onAir).toBe(false)
    }

    view.unmount()
  })

  test('stale watchdog flips after inactivity and clears on next playout update', () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    usePlayoutStore.getState().cuePreview('template-quote-card')
    usePlayoutStore.getState().take()
    const view = renderRoute('/output-feed?follow=program&embed=1&debug=1')

    act(() => {
      vi.advanceTimersByTime(16_000)
    })

    expect(window.__renderlessOutputStatus?.stale).toBe(true)
    expect(warnSpy).toHaveBeenCalled()

    usePlayoutStore.getState().cuePreview('template-lower-third')
    usePlayoutStore.getState().take()
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(window.__renderlessOutputStatus?.stale).toBe(false)
    expect(window.__renderlessOutputStatus?.sceneName).toBe('Lower Third')

    view.unmount()
  })
})
