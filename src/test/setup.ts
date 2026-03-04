import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup?.()
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup = undefined
  ;(window as { __renderlessOutputStatus?: unknown }).__renderlessOutputStatus = undefined
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

afterEach(() => {
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup?.()
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup = undefined
})
