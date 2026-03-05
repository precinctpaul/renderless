import { useEffect, useMemo, useState } from 'react'
import type { SceneDefinition, StoryState } from '../types/scene'
import type { ProgramTransitionState } from '../store/playoutStore'
import { SceneRenderer } from './SceneRenderer'

interface ProgramTransitionSurfaceProps {
  scene: SceneDefinition
  story: StoryState
  transition: ProgramTransitionState | null
  checkerboard?: boolean
  className?: string
  showActionSafe?: boolean
  showTitleSafe?: boolean
  showCanvasBounds?: boolean
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(Math.max(value, 0), 1)
}

export function ProgramTransitionSurface({
  scene,
  story,
  transition,
  checkerboard = false,
  className,
  showActionSafe = false,
  showTitleSafe = false,
  showCanvasBounds = false,
}: ProgramTransitionSurfaceProps) {
  const [now, setNow] = useState(() => Date.now())
  const transitionDurationMs = transition?.durationMs ?? 0
  const hasVisualTransition =
    transition !== null &&
    transitionDurationMs > 0 &&
    (transition.type === 'fade' || transition.type === 'lumaWipe')

  useEffect(() => {
    if (!hasVisualTransition || !transition) {
      return
    }

    let animationHandle = 0
    const animate = () => {
      const current = Date.now()
      setNow(current)

      if (current < transition.startedAt + transition.durationMs + 32) {
        animationHandle = window.requestAnimationFrame(animate)
      }
    }

    animationHandle = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationHandle)
  }, [hasVisualTransition, transition])

  const progress = useMemo(() => {
    if (!hasVisualTransition || !transition) {
      return 1
    }

    const elapsed = now - transition.startedAt
    return clampProgress(elapsed / transition.durationMs)
  }, [hasVisualTransition, now, transition])

  if (!hasVisualTransition || !transition) {
    return (
      <SceneRenderer
        scene={scene}
        story={story}
        checkerboard={checkerboard}
        className={className}
        showActionSafe={showActionSafe}
        showTitleSafe={showTitleSafe}
        showCanvasBounds={showCanvasBounds}
      />
    )
  }

  const fromOpacity = transition.type === 'fade' ? Math.max(0, 1 - progress) : 1
  const toOpacity = transition.type === 'fade' ? progress : 1
  const lumaClipRight = transition.type === 'lumaWipe' ? Math.max(0, (1 - progress) * 100) : 0

  return (
    <div className={`transition-surface ${className ?? ''}`.trim()}>
      <div className="transition-surface__layer" style={{ opacity: fromOpacity }}>
        <SceneRenderer
          scene={transition.fromScene}
          story={story}
          checkerboard={checkerboard}
          showActionSafe={showActionSafe}
          showTitleSafe={showTitleSafe}
          showCanvasBounds={showCanvasBounds}
        />
      </div>
      <div
        className="transition-surface__layer"
        style={{
          opacity: toOpacity,
          clipPath: transition.type === 'lumaWipe' ? `inset(0 ${lumaClipRight}% 0 0)` : undefined,
        }}
      >
        <SceneRenderer
          scene={transition.toScene}
          story={story}
          checkerboard={checkerboard}
          showActionSafe={showActionSafe}
          showTitleSafe={showTitleSafe}
          showCanvasBounds={showCanvasBounds}
        />
      </div>
    </div>
  )
}
