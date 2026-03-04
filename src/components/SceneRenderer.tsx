import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import type { SceneDefinition, SceneLayer, StoryState, TextLayer } from '../types/scene'

interface SceneRendererProps {
  scene: SceneDefinition
  story: StoryState
  checkerboard?: boolean
  selectedLayerId?: string
  selectedLayerIds?: string[]
  showSelection?: boolean
  showSafeZone?: boolean
  className?: string
  onSelectLayer?: (
    layerId: string,
    modifiers?: {
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
    },
  ) => void
}

function resolveText(layer: TextLayer, story: StoryState): string {
  if (!layer.binding) {
    return layer.text
  }

  switch (layer.binding) {
    case 'homeScore':
      return String(story.homeScore)
    case 'awayScore':
      return String(story.awayScore)
    case 'clock':
      return story.clock
    case 'possession':
      return story.possession === 'home' ? 'HOME' : 'AWAY'
    default:
      return layer.text
  }
}

function layerStyle(layer: SceneLayer): CSSProperties {
  const baseStyle: CSSProperties = {
    position: 'absolute',
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    display: layer.visible ? 'block' : 'none',
  }

  if (layer.kind === 'shape') {
    return {
      ...baseStyle,
      borderRadius: layer.radius,
      background: layer.fill,
    }
  }

  return {
    ...baseStyle,
    color: layer.color,
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    textAlign: layer.align,
    lineHeight: 1,
    whiteSpace: 'pre-wrap',
  }
}

export function SceneRenderer({
  scene,
  story,
  checkerboard = false,
  selectedLayerId,
  selectedLayerIds,
  showSelection = false,
  showSafeZone = false,
  className,
  onSelectLayer,
}: SceneRendererProps) {
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>()

  const scale = useMemo(() => {
    const widthScale = containerSize.width / scene.width
    const heightScale = containerSize.height / scene.height
    return Math.min(widthScale, heightScale)
  }, [containerSize.height, containerSize.width, scene.height, scene.width])

  const selectedIdSet = useMemo(() => {
    const ids = selectedLayerIds?.length ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : []
    return new Set(ids)
  }, [selectedLayerId, selectedLayerIds])

  const selectedLayers = showSelection
    ? scene.layers.filter((layer) => selectedIdSet.has(layer.id) && layer.visible)
    : []

  return (
    <div
      ref={containerRef}
      className={`scene-renderer ${checkerboard ? 'scene-renderer--checkerboard' : ''} ${className ?? ''}`.trim()}
      onMouseDown={() =>
        onSelectLayer?.('', {
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        })
      }
    >
      <div
        className="scene-renderer__stage"
        style={{
          width: scene.width,
          height: scene.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          background: scene.background,
        }}
      >
        {scene.layers.map((layer) => (
          <div
            key={layer.id}
            className="scene-renderer__layer"
            style={layerStyle(layer)}
            onMouseDown={(event) => {
              event.stopPropagation()
              onSelectLayer?.(layer.id, {
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
              })
            }}
          >
            {layer.kind === 'text' ? resolveText(layer, story) : null}
          </div>
        ))}

        {showSafeZone ? (
          <div
            className="scene-renderer__safe-zone"
            style={{
              left: scene.width * 0.05,
              top: scene.height * 0.05,
              width: scene.width * 0.9,
              height: scene.height * 0.9,
            }}
          />
        ) : null}

        {selectedLayers.map((selectedLayer) => (
          <div
            key={selectedLayer.id}
            className="scene-renderer__selection"
            style={{
              left: selectedLayer.x,
              top: selectedLayer.y,
              width: selectedLayer.width,
              height: selectedLayer.height,
            }}
          />
        ))}
      </div>
    </div>
  )
}
