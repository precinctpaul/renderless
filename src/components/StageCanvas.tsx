import { SceneRenderer } from './SceneRenderer'
import type { SceneDefinition, StoryState } from '../types/scene'

interface StageCanvasProps {
  scene: SceneDefinition
  story: StoryState
  selectedLayerId?: string
  selectedLayerIds?: string[]
  showGrid?: boolean
  showSafeZone?: boolean
  onSelectLayer?: (
    layerId: string,
    modifiers?: {
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
    },
  ) => void
}

export function StageCanvas({
  scene,
  story,
  selectedLayerId,
  selectedLayerIds,
  showGrid = true,
  showSafeZone = true,
  onSelectLayer,
}: StageCanvasProps) {
  return (
    <div className="stage-canvas">
      <SceneRenderer
        scene={scene}
        story={story}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        onSelectLayer={onSelectLayer}
        showSelection
        showSafeZone={showSafeZone}
        className={showGrid ? 'scene-renderer--grid' : ''}
      />
    </div>
  )
}
