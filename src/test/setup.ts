import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, vi } from 'vitest'

class MockResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 1920,
            height: 1080,
            x: 0,
            y: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
            left: 0,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    )
  }

  unobserve() {
    return
  }

  disconnect() {
    return
  }
}

class MockFontFace {
  family: string
  source: string

  constructor(family: string, source: string) {
    this.family = family
    this.source = source
  }

  async load(): Promise<MockFontFace> {
    return this
  }
}

beforeAll(() => {
  if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
    ;(window as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
  }

  if (typeof window !== 'undefined' && typeof (window as unknown as { FontFace?: unknown }).FontFace === 'undefined') {
    ;(window as unknown as { FontFace: typeof FontFace }).FontFace = MockFontFace as unknown as typeof FontFace
  }

  if (!('fonts' in document)) {
    ;(document as unknown as { fonts: { add: (face: unknown) => void } }).fonts = {
      add: () => undefined,
    }
  } else if (typeof (document as unknown as { fonts: { add?: unknown } }).fonts.add !== 'function') {
    ;(document as unknown as { fonts: { add: (face: unknown) => void } }).fonts.add = () => undefined
  }
})

beforeEach(() => {
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup?.()
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup = undefined
  ;(window as { __renderlessOutputStatus?: unknown }).__renderlessOutputStatus = undefined
  window.localStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

afterEach(() => {
  cleanup()
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup?.()
  ;(window as { __renderlessSyncCleanup?: () => void }).__renderlessSyncCleanup = undefined
})
