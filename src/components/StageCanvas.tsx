import { SceneRenderer } from './SceneRenderer'
import type { SceneDefinition, StoryState } from '../types/scene'

interface StageCanvasProps {
  scene: SceneDefinition
  story: StoryState
  selectedLayerId?: string
  showGrid?: boolean
  showSafeZone?: boolean
  onSelectLayer?: (layerId: string) => void
}

export function StageCanvas({
  scene,
  story,
  selectedLayerId,
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
        onSelectLayer={onSelectLayer}
        showSelection
        showSafeZone={showSafeZone}
        className={showGrid ? 'scene-renderer--grid' : ''}
      />
    </div>
  )
}
