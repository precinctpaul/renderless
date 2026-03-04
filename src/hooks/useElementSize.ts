import { useLayoutEffect, useRef, useState } from 'react'

interface ElementSize {
  width: number
  height: number
}

const DEFAULT_SIZE: ElementSize = {
  width: 1,
  height: 1,
}

export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, ElementSize] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ElementSize>(DEFAULT_SIZE)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const { width, height } = entry.contentRect
      setSize({
        width: Math.max(width, 1),
        height: Math.max(height, 1),
      })
    })

    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return [ref, size]
}
