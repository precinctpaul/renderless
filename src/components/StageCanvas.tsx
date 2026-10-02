import { useEffect, useRef, useState } from 'react'
import { SceneRenderer } from './SceneRenderer'
import type { StageGeometry } from './SceneRenderer'
import { UserGuides } from './StageGuides'
import { useStoredGuides } from '../hooks/useStoredGuides'
import type { StageGuide } from '../hooks/useStoredGuides'
import type { SceneDefinition, StoryState } from '../types/scene'

interface StageCanvasProps {
  scene: SceneDefinition
  story: StoryState
  selectedLayerId?: string
  selectedLayerIds?: string[]
  showGrid?: boolean
  showSafeZone?: boolean
  showRulers?: boolean
  showGuides?: boolean
  snapToGrid?: boolean
  interactionMode?: 'select' | 'pan'
  onSelectLayer?: (
    layerId: string,
    modifiers?: {
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
    },
  ) => void
  onMoveLayers?: (layerIds: string[], delta: { x: number; y: number }, snapToGrid?: boolean) => void
  onAssetDrop?: (entryId: string, position: { x: number; y: number }) => void
  /** Key under which this template's user guides are remembered. */
  guideStorageKey?: string
  /** Called when a guide is pulled from a ruler while guides are hidden. */
  onShowGuides?: () => void
}

interface RulerTick {
  value: number
  offsetPx: number
  major: boolean
}

const RULER_SIZE_PX = 18
/** Pasteboard around the artboard so its edges (and bounds line) are never clipped. */
const STAGE_MARGIN_PX = 16
const STAGE_INSET = { top: STAGE_MARGIN_PX, left: STAGE_MARGIN_PX, right: STAGE_MARGIN_PX, bottom: STAGE_MARGIN_PX }
const RULER_INSET = { ...STAGE_INSET, top: RULER_SIZE_PX + STAGE_MARGIN_PX, left: RULER_SIZE_PX + STAGE_MARGIN_PX }
const RULER_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
const GRID_STEPS = [10, 20, 50, 100, 200, 500, 1000]
const RULER_LABEL_MIN_PX = 60
const GRID_MIN_PX = 14

function pickStep(steps: number[], scale: number, minPx: number): number {
  return steps.find((step) => step * scale >= minPx) ?? steps[steps.length - 1]
}

/**
 * Ticks in screen pixels for one ruler: `origin` is where scene 0 sits on screen, and the ruler
 * covers `lengthPx` of screen, so labels always read real scene coordinates at any pan or zoom.
 */
function buildRulerTicks(origin: number, scale: number, lengthPx: number): RulerTick[] {
  if (!(scale > 0) || lengthPx <= 0) return []
  const major = pickStep(RULER_STEPS, scale, RULER_LABEL_MIN_PX)
  const minor = major / 5
  const first = Math.floor(-origin / scale / minor) * minor
  const last = (lengthPx - origin) / scale
  const ticks: RulerTick[] = []
  for (let index = 0; first + index * minor <= last && index < 2000; index += 1) {
    const value = Math.round((first + index * minor) * 1000) / 1000
    ticks.push({ value, offsetPx: origin + value * scale, major: Math.abs(value / major - Math.round(value / major)) < 1e-6 })
  }
  return ticks
}

function StageOverlay({
  geometry,
  scene,
  showRulers,
  showGuides,
  showGrid,
  guides,
  onGuidesChange,
  snapStep,
}: {
  geometry: StageGeometry
  scene: SceneDefinition
  showRulers: boolean
  showGuides: boolean
  showGrid: boolean
  guides: StageGuide[]
  onGuidesChange: (next: StageGuide[]) => void
  snapStep: number | null
}) {
  const { scale, stageLeftPx, stageTopPx, stageWidthPx, stageHeightPx, containerWidth, containerHeight } = geometry
  const stageRect = { left: stageLeftPx, top: stageTopPx, width: stageWidthPx, height: stageHeightPx }
  const gridStepPx = pickStep(GRID_STEPS, scale, GRID_MIN_PX) * scale
  const horizontalTicks = showRulers ? buildRulerTicks(stageLeftPx, scale, containerWidth) : []
  const verticalTicks = showRulers ? buildRulerTicks(stageTopPx, scale, containerHeight) : []

  return (
    <>
      {showGrid ? (
        <div
          className="stage-grid"
          style={{ ...stageRect, backgroundSize: `${gridStepPx}px ${gridStepPx}px` }}
        />
      ) : null}

      {showGuides ? (
        <div className="stage-guides" style={stageRect}>
          {[1 / 3, 2 / 3].map((fraction) => (
            <div key={`h${fraction}`} className="stage-guide stage-guide--h" style={{ top: Math.round(stageHeightPx * fraction) }} />
          ))}
          {[1 / 3, 2 / 3].map((fraction) => (
            <div key={`v${fraction}`} className="stage-guide stage-guide--v" style={{ left: Math.round(stageWidthPx * fraction) }} />
          ))}
          <div className="stage-guide stage-guide--h stage-guide--center" style={{ top: Math.round(stageHeightPx / 2) }} />
          <div className="stage-guide stage-guide--v stage-guide--center" style={{ left: Math.round(stageWidthPx / 2) }} />
        </div>
      ) : null}

      {showRulers ? (
        <>
          <div className="stage-ruler stage-ruler--top mono" aria-hidden>
            {horizontalTicks.map((tick) => (
              <div
                key={`h-${tick.value}`}
                className={`stage-ruler__tick ${tick.major ? 'stage-ruler__tick--major' : ''}`.trim()}
                style={{ left: Math.round(tick.offsetPx) }}
              >
                {tick.major ? <span>{tick.value}</span> : null}
              </div>
            ))}
            <div className="stage-ruler__extent" style={{ left: stageLeftPx, width: stageWidthPx }} />
          </div>
          <div className="stage-ruler stage-ruler--left mono" aria-hidden>
            {verticalTicks.map((tick) => (
              <div
                key={`v-${tick.value}`}
                className={`stage-ruler__tick stage-ruler__tick--vertical ${tick.major ? 'stage-ruler__tick--major' : ''}`.trim()}
                style={{ top: Math.round(tick.offsetPx) }}
              >
                {tick.major ? <span>{tick.value}</span> : null}
              </div>
            ))}
            <div className="stage-ruler__extent stage-ruler__extent--vertical" style={{ top: stageTopPx, height: stageHeightPx }} />
          </div>
          <div className="stage-ruler__corner mono" aria-hidden>
            {scene.width}×{scene.height}
          </div>
        </>
      ) : null}

      {showGuides || showRulers ? (
        <UserGuides
          geometry={geometry}
          guides={guides}
          hidden={!showGuides}
          onChange={onGuidesChange}
          rulerSizePx={RULER_SIZE_PX}
          snapStep={snapStep}
          rulersVisible={showRulers}
        />
      ) : null}
    </>
  )
}

export function StageCanvas({
  scene,
  story,
  selectedLayerId,
  selectedLayerIds,
  showGrid = false,
  showSafeZone = false,
  showRulers = false,
  showGuides = false,
  snapToGrid = false,
  interactionMode = 'select',
  onSelectLayer,
  onMoveLayers,
  onAssetDrop,
  guideStorageKey = 'default',
  onShowGuides,
}: StageCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [guides, setGuides] = useStoredGuides(guideStorageKey)
  const handleGuidesChange = (next: StageGuide[]) => {
    if (!showGuides && next.length > guides.length) onShowGuides?.()
    setGuides(next)
  }
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 })
  const [zoomMultiplier, setZoomMultiplier] = useState(1)

  useEffect(() => {
    const node = canvasRef.current
    if (!node) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return
      }

      event.preventDefault()
      const zoomStep = event.deltaY < 0 ? 0.08 : -0.08
      setZoomMultiplier((previous) => {
        const next = Math.min(Math.max(previous + zoomStep, 0.35), 3)
        return Math.round(next * 100) / 100
      })
    }

    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', handleWheel)
    }
  }, [])

  return (
    <div
      ref={canvasRef}
      className={`stage-canvas ${showRulers ? 'stage-canvas--rulers' : ''}`.trim()}
      onMouseDownCapture={() => {
        // Clicking the canvas leaves inspector fields, so arrow keys nudge the selection.
        const active = document.activeElement as HTMLElement | null
        if (active && active !== document.body && canvasRef.current && !canvasRef.current.contains(active)) active.blur()
      }}
    >
      <SceneRenderer
        scene={scene}
        story={story}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        onSelectLayer={onSelectLayer}
        onMoveLayers={onMoveLayers}
        onPanBy={(delta) => setStageOffset((previous) => ({ x: previous.x + delta.x, y: previous.y + delta.y }))}
        onAssetDrop={onAssetDrop}
        showSelection
        showActionSafe={showSafeZone}
        showTitleSafe={showSafeZone}
        showCanvasBounds
        snapToGrid={snapToGrid}
        interactionMode={interactionMode}
        stageOffsetPx={stageOffset}
        stageZoomMultiplier={zoomMultiplier}
        fitInsetPx={showRulers ? RULER_INSET : STAGE_INSET}
        renderOverlay={(geometry) => (
          <StageOverlay
            geometry={geometry}
            scene={scene}
            showRulers={showRulers}
            showGuides={showGuides}
            showGrid={showGrid}
            guides={guides}
            onGuidesChange={handleGuidesChange}
            snapStep={snapToGrid ? 10 : null}
          />
        )}
      />
    </div>
  )
}
