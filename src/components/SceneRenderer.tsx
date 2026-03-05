import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  showActionSafe?: boolean
  showTitleSafe?: boolean
  showCanvasBounds?: boolean
  className?: string
  interactionMode?: 'select' | 'pan'
  snapToGrid?: boolean
  stageOffsetPx?: { x: number; y: number }
  stageZoomMultiplier?: number
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
  onAssetDrop?: (entryId: string, position: { x: number; y: number }) => void
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

  if (layer.kind === 'image') {
    return {
      ...baseStyle,
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
  showActionSafe,
  showTitleSafe,
  showCanvasBounds = false,
  className,
  interactionMode = 'select',
  snapToGrid = false,
  stageOffsetPx,
  stageZoomMultiplier = 1,
  onSelectLayer,
  onMoveLayers,
  onPanBy,
  onAssetDrop,
}: SceneRendererProps) {
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>()
  const dragStateRef = useRef<DragState | null>(null)
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'layers'>('none')
  const scaleRef = useRef(1)

  const stageGeometry = useMemo(() => {
    const sceneWidth = Math.max(1, scene.width)
    const sceneHeight = Math.max(1, scene.height)
    const widthScale = containerSize.width / sceneWidth
    const heightScale = containerSize.height / sceneHeight
    const fitScale = Math.min(widthScale, heightScale)
    const zoom = Number.isFinite(stageZoomMultiplier) ? Math.max(stageZoomMultiplier, 0.05) : 1
    const baseScale = !Number.isFinite(fitScale) || fitScale <= 0 ? 1 : fitScale
    const scale = baseScale * zoom
    const stageWidthPx = sceneWidth * scale
    const stageHeightPx = sceneHeight * scale
    const stageLeftPx = (containerSize.width - stageWidthPx) / 2 + (stageOffsetPx?.x ?? 0)
    const stageTopPx = (containerSize.height - stageHeightPx) / 2 + (stageOffsetPx?.y ?? 0)

    return {
      scale,
      stageLeftPx,
      stageTopPx,
      stageWidthPx,
      stageHeightPx,
    }
  }, [containerSize.height, containerSize.width, scene.height, scene.width, stageOffsetPx?.x, stageOffsetPx?.y, stageZoomMultiplier])

  const scale = stageGeometry.scale
  const actionSafeVisible = showActionSafe ?? showSafeZone
  const titleSafeVisible = showTitleSafe ?? showSafeZone

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
      setDragMode('none')
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
      className={`scene-renderer ${checkerboard ? 'scene-renderer--checkerboard' : ''} ${className ?? ''} ${interactionMode === 'pan' ? 'scene-renderer--mode-pan' : 'scene-renderer--mode-select'} ${dragMode === 'pan' ? 'scene-renderer--drag-pan' : ''} ${dragMode === 'layers' ? 'scene-renderer--drag-layers' : ''}`.trim()}
      onDragOver={(event) => {
        if (!onAssetDrop) {
          return
        }

        if (event.dataTransfer.types.includes('application/x-renderless-asset-entry')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(event) => {
        if (!onAssetDrop) {
          return
        }

        const payload = event.dataTransfer.getData('application/x-renderless-asset-entry')
        if (!payload) {
          return
        }

        event.preventDefault()

        const containerBounds = containerRef.current?.getBoundingClientRect()
        if (!containerBounds) {
          return
        }

        const localX = (event.clientX - containerBounds.left - stageGeometry.stageLeftPx) / stageGeometry.scale
        const localY = (event.clientY - containerBounds.top - stageGeometry.stageTopPx) / stageGeometry.scale

        const x = Math.round(Math.min(Math.max(0, localX), scene.width))
        const y = Math.round(Math.min(Math.max(0, localY), scene.height))
        onAssetDrop(payload, { x, y })
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return
        }

        if (interactionMode === 'pan') {
          event.preventDefault()
          dragStateRef.current = {
            mode: 'pan',
            layerIds: [],
            lastClientX: event.clientX,
            lastClientY: event.clientY,
          }
          setDragMode('pan')
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
        className={`scene-renderer__stage ${showCanvasBounds ? 'scene-renderer__stage--bounds' : ''}`.trim()}
        style={{
          width: scene.width,
          height: scene.height,
          left: `${stageGeometry.stageLeftPx.toFixed(2)}px`,
          top: `${stageGeometry.stageTopPx.toFixed(2)}px`,
          transform: `scale(${stageGeometry.scale})`,
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
                event.preventDefault()
                dragStateRef.current = {
                  mode: 'pan',
                  layerIds: [],
                  lastClientX: event.clientX,
                  lastClientY: event.clientY,
                }
                setDragMode('pan')
                return
              }

              onSelectLayer?.(layer.id, {
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
              })

              if (layer.locked) {
                return
              }

              const dragLayerIds = selectedIdSet.has(layer.id) ? [...selectedIdSet] : [layer.id]
              event.preventDefault()
              dragStateRef.current = {
                mode: 'layers',
                layerIds: dragLayerIds,
                lastClientX: event.clientX,
                lastClientY: event.clientY,
              }
              setDragMode('layers')
            }}
          >
            {layer.kind === 'text' ? resolveText(layer, story) : null}
            {layer.kind === 'image' ? (
              <img
                src={layer.src}
                alt={layer.name}
                draggable={false}
                className={`scene-renderer__image scene-renderer__image--${layer.fit ?? 'contain'}`.trim()}
              />
            ) : null}
          </div>
        ))}

        {actionSafeVisible ? (
          <div
            className="scene-renderer__safe-zone scene-renderer__safe-zone--action"
            style={{
              left: scene.width * 0.05,
              top: scene.height * 0.05,
              width: scene.width * 0.9,
              height: scene.height * 0.9,
            }}
          />
        ) : null}

        {titleSafeVisible ? (
          <div
            className="scene-renderer__safe-zone scene-renderer__safe-zone--title"
            style={{
              left: scene.width * 0.1,
              top: scene.height * 0.1,
              width: scene.width * 0.8,
              height: scene.height * 0.8,
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
