import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import type { SceneDefinition, SceneLayer, StoryState, TextLayer } from '../types/scene'
import { resolveBindingValue } from '../lib/bindings'

interface SceneRendererProps {
  scene: SceneDefinition
  story: StoryState
  checkerboard?: boolean
  selectedLayerId?: string
  selectedLayerIds?: string[]
  showSelection?: boolean
  showSafeZone?: boolean
  className?: string
  interactionMode?: 'select' | 'pan'
  snapToGrid?: boolean
  stageOffsetPx?: { x: number; y: number }
  onSelectLayer?: (
    layerId: string,
    modifiers?: {
      shiftKey: boolean
      ctrlKey: boolean
      metaKey: boolean
    },
  ) => void
  onMoveLayers?: (layerIds: string[], delta: { x: number; y: number }, snapToGrid?: boolean) => void
  onPanBy?: (delta: { x: number; y: number }) => void
}

interface DragState {
  mode: 'pan' | 'layers'
  layerIds: string[]
  lastClientX: number
  lastClientY: number
}

function resolveText(layer: TextLayer, story: StoryState): string {
  if (!layer.binding) {
    return layer.text
  }
  return resolveBindingValue(layer.binding, story) || layer.text
}

function layerStyle(layer: SceneLayer): CSSProperties {
  const anchorX = Number.isFinite(layer.anchorX) ? (layer.anchorX ?? 0) : 0
  const anchorY = Number.isFinite(layer.anchorY) ? (layer.anchorY ?? 0) : 0
  const scaleX = Number.isFinite(layer.scaleX) ? (layer.scaleX ?? 100) / 100 : 1
  const scaleY = Number.isFinite(layer.scaleY) ? (layer.scaleY ?? 100) / 100 : 1
  const rotation = Number.isFinite(layer.rotation) ? (layer.rotation ?? 0) : 0

  const baseStyle: CSSProperties = {
    position: 'absolute',
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity,
    display: layer.visible ? 'block' : 'none',
    transformOrigin: `${anchorX}px ${anchorY}px`,
    transform: `rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
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
  interactionMode = 'select',
  snapToGrid = false,
  stageOffsetPx,
  onSelectLayer,
  onMoveLayers,
  onPanBy,
}: SceneRendererProps) {
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>()
  const dragStateRef = useRef<DragState | null>(null)
  const scaleRef = useRef(1)

  const scale = useMemo(() => {
    const widthScale = containerSize.width / scene.width
    const heightScale = containerSize.height / scene.height
    return Math.min(widthScale, heightScale)
  }, [containerSize.height, containerSize.width, scene.height, scene.width])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  const selectedIdSet = useMemo(() => {
    const ids = selectedLayerIds?.length ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : []
    return new Set(ids)
  }, [selectedLayerId, selectedLayerIds])

  const selectedLayers = showSelection
    ? scene.layers.filter((layer) => selectedIdSet.has(layer.id) && layer.visible)
    : []

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) {
        return
      }

      const deltaClientX = event.clientX - dragState.lastClientX
      const deltaClientY = event.clientY - dragState.lastClientY
      dragState.lastClientX = event.clientX
      dragState.lastClientY = event.clientY

      if (deltaClientX === 0 && deltaClientY === 0) {
        return
      }

      if (dragState.mode === 'pan') {
        onPanBy?.({ x: deltaClientX, y: deltaClientY })
        return
      }

      const sceneScale = scaleRef.current || 1
      onMoveLayers?.(
        dragState.layerIds,
        {
          x: deltaClientX / sceneScale,
          y: deltaClientY / sceneScale,
        },
        snapToGrid,
      )
    }

    const handleUp = () => {
      dragStateRef.current = null
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [onMoveLayers, onPanBy, snapToGrid])

  return (
    <div
      ref={containerRef}
      className={`scene-renderer ${checkerboard ? 'scene-renderer--checkerboard' : ''} ${className ?? ''}`.trim()}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return
        }

        if (interactionMode === 'pan') {
          dragStateRef.current = {
            mode: 'pan',
            layerIds: [],
            lastClientX: event.clientX,
            lastClientY: event.clientY,
          }
          return
        }

        onSelectLayer?.('', {
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
        })
      }}
    >
      <div
        className="scene-renderer__stage"
        style={{
          width: scene.width,
          height: scene.height,
          left: `calc(50% + ${(stageOffsetPx?.x ?? 0).toFixed(1)}px)`,
          top: `calc(50% + ${(stageOffsetPx?.y ?? 0).toFixed(1)}px)`,
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
              if (event.button !== 0) {
                return
              }

              if (interactionMode === 'pan') {
                dragStateRef.current = {
                  mode: 'pan',
                  layerIds: [],
                  lastClientX: event.clientX,
                  lastClientY: event.clientY,
                }
                return
              }

              onSelectLayer?.(layer.id, {
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
              })

              const dragLayerIds = selectedIdSet.has(layer.id) ? [...selectedIdSet] : [layer.id]
              dragStateRef.current = {
                mode: 'layers',
                layerIds: dragLayerIds,
                lastClientX: event.clientX,
                lastClientY: event.clientY,
              }
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
