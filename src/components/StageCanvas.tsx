import { useMemo, useState } from 'react'
import { SceneRenderer } from './SceneRenderer'
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
}

interface RulerTick {
  value: number
  percent: number
  major: boolean
}

function buildRulerTicks(limit: number): RulerTick[] {
  const ticks: RulerTick[] = []
  for (let value = 0; value <= limit; value += 50) {
    ticks.push({
      value,
      percent: value / limit,
      major: value % 100 === 0,
    })
  }

  return ticks
}

export function StageCanvas({
  scene,
  story,
  selectedLayerId,
  selectedLayerIds,
  showGrid = true,
  showSafeZone = true,
  showRulers = false,
  showGuides = false,
  snapToGrid = false,
  interactionMode = 'select',
  onSelectLayer,
  onMoveLayers,
}: StageCanvasProps) {
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 })

  const horizontalTicks = useMemo(() => buildRulerTicks(scene.width), [scene.width])
  const verticalTicks = useMemo(() => buildRulerTicks(scene.height), [scene.height])

  return (
    <div className="stage-canvas">
      {showRulers ? (
        <>
          <div className="stage-ruler stage-ruler--top mono">
            {horizontalTicks.map((tick) => (
              <div
                key={`h-${tick.value}`}
                className={`stage-ruler__tick ${tick.major ? 'stage-ruler__tick--major' : ''}`.trim()}
                style={{ left: `${tick.percent * 100}%` }}
              >
                {tick.major ? <span>{tick.value}</span> : null}
              </div>
            ))}
          </div>
          <div className="stage-ruler stage-ruler--left mono">
            {verticalTicks.map((tick) => (
              <div
                key={`v-${tick.value}`}
                className={`stage-ruler__tick stage-ruler__tick--vertical ${tick.major ? 'stage-ruler__tick--major' : ''}`.trim()}
                style={{ top: `${tick.percent * 100}%` }}
              >
                {tick.major ? <span>{tick.value}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {showGuides ? (
        <div className="stage-guides">
          <div className="stage-guide stage-guide--h stage-guide--center" style={{ top: '50%' }} />
          <div className="stage-guide stage-guide--v stage-guide--center" style={{ left: '50%' }} />
          <div className="stage-guide stage-guide--h" style={{ top: '33.333%' }} />
          <div className="stage-guide stage-guide--h" style={{ top: '66.666%' }} />
          <div className="stage-guide stage-guide--v" style={{ left: '33.333%' }} />
          <div className="stage-guide stage-guide--v" style={{ left: '66.666%' }} />
        </div>
      ) : null}

      <SceneRenderer
        scene={scene}
        story={story}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        onSelectLayer={onSelectLayer}
        onMoveLayers={onMoveLayers}
        onPanBy={(delta) => setStageOffset((previous) => ({ x: previous.x + delta.x, y: previous.y + delta.y }))}
        showSelection
        showSafeZone={showSafeZone}
        snapToGrid={snapToGrid}
        interactionMode={interactionMode}
        stageOffsetPx={stageOffset}
        className={showGrid ? 'scene-renderer--grid' : ''}
      />
    </div>
  )
}
