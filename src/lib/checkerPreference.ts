import { useSyncExternalStore } from 'react'

/**
 * Whether monitors and previews show transparent areas as a visible checkerboard (judging lower
 * thirds against "nothing" instead of black). One setting for every monitor, remembered.
 */

const KEY = 'renderless.checker.v1'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let current = typeof window === 'undefined' ? false : read()

export function setChecker(on: boolean) {
  current = on
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Remembered for this visit only.
  }
  listeners.forEach((listener) => listener())
}

export function useChecker(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => false,
  )
}
