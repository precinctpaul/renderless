import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useElementSize } from '../hooks/useElementSize'
import type { ImageLayer, SceneDefinition, SceneLayer, StoryState, TextLayer } from '../types/scene'
import { layoutScene, resolvedText } from '../lib/sceneLayout'
import { clearMeasureCache } from '../lib/textMeasure'
import { framingImageStyle } from '../lib/imageFraming'
import { resolveAnchor } from '../lib/layerAnchor'
import { collectSnapTargets, computeSmartSnap, type SnapTargets } from '../lib/smartSnap'

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
  /** Screen space kept clear around the stage (margins, rulers); the stage fits in what remains. */
  fitInsetPx?: { top: number; left: number; right?: number; bottom?: number }
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
  /** Editor overlays (rulers, grid, guides) drawn in screen pixels, aligned to the stage. */
  renderOverlay?: (geometry: StageGeometry) => ReactNode
  /** Snap dragged layers to the canvas, other layers and these guide lines (Alt drags freely). */
  smartSnap?: boolean
  snapGuides?: SnapTargets
  /** The lines currently snapped to while dragging (null when not dragging/snapping). */
  onSnapLinesChange?: (lines: { x: number | null; y: number | null } | null) => void
}

/** Where the scene's stage sits inside the renderer, in screen pixels. */
export interface StageGeometry {
  scale: number
  stageLeftPx: number
  stageTopPx: number
  stageWidthPx: number
  stageHeightPx: number
  containerWidth: number
  containerHeight: number
}

interface DragState {
  mode: 'pan' | 'layers'
  layerIds: string[]
  lastClientX: number
  lastClientY: number
  /** Total pointer movement since the drag started, in scene units. */
  pendingX: number
  pendingY: number
  /** Movement already applied to the layers, in scene units. */
  appliedX: number
  appliedY: number
  /** Dragged layers as they were when the drag started (for snapping). */
  startLayers: SceneLayer[]
  /** What the selection can snap to, gathered when the drag started. */
  snapTargets: SnapTargets | null
}

const DRAG_SNAP_STEP = 10
/** How close (screen px) an edge/center must come to a target before it snaps. */
const SMART_SNAP_THRESHOLD_PX = 6

/** Bumps when web fonts finish loading, so auto layout re-measures with the real fonts. */
function useFontsVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (!fonts?.addEventListener) return
    const bump = () => {
      clearMeasureCache()
      setVersion((current) => current + 1)
    }
    fonts.addEventListener('loadingdone', bump)
    void fonts.ready?.then(bump)
    return () => fonts.removeEventListener('loadingdone', bump)
  }, [])
  return version
}

function layerStyle(layer: SceneLayer): CSSProperties {
  const { x: anchorX, y: anchorY } = resolveAnchor(layer)
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
    mixBlendMode: layer.blendMode && layer.blendMode !== 'normal' ? layer.blendMode : undefined,
  }

  if (layer.kind === 'shape') {
    return {
      ...baseStyle,
      borderRadius: layer.radius,
      background: layer.fill,
    }
  }

  if (layer.kind === 'image') {
    // A zoomed (framed) photo is clipped to its slot like a rounded one.
    const clipped =
      layer.radius || layer.framing ? { ...baseStyle, borderRadius: layer.radius, overflow: 'hidden' as const } : baseStyle
    return clipped
  }

  const textStyle: CSSProperties = {
    ...baseStyle,
    color: layer.color,
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    textAlign: textAlignOf(layer),
    lineHeight: layer.lineHeight ?? 1,
    whiteSpace: 'pre-wrap',
  }

  // Text sits in the middle of its box unless told otherwise.
  const vertical = layer.verticalAlign ?? 'middle'
  const verticalFlex = vertical === 'top' ? 'flex-start' : vertical === 'bottom' ? 'flex-end' : 'center'
  const horizontalFlex = textHorizontalFlex(layer)

  if (!layer.box) {
    // Column flex frame: the text block is placed top/middle/bottom and left/center/right.
    // Flex placement also centers text that is wider than its box (spills evenly both ways).
    return {
      ...textStyle,
      display: layer.visible ? 'flex' : 'none',
      flexDirection: 'column',
      justifyContent: verticalFlex,
      alignItems: horizontalFlex,
    }
  }

  // Boxed text: the frame only anchors; the box hugs the text and may extend past the frame.
  return {
    ...textStyle,
    display: layer.visible ? 'flex' : 'none',
    alignItems: verticalFlex,
    justifyContent: horizontalFlex,
    overflow: 'visible',
  }
}

function textAlignOf(layer: TextLayer): 'left' | 'center' | 'right' {
  return layer.align ?? 'center'
}

function textHorizontalFlex(layer: TextLayer): 'flex-start' | 'center' | 'flex-end' {
  const align = textAlignOf(layer)
  return align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'
}

function textBoxStyle(layer: TextLayer): CSSProperties | undefined {
  if (!layer.box) {
    return undefined
  }

  return {
    flex: 'none',
    display: 'inline-block',
    whiteSpace: 'pre',
    background: layer.box.fill,
    padding: `${layer.box.paddingTop}px ${layer.box.paddingRight}px ${layer.box.paddingBottom}px ${layer.box.paddingLeft}px`,
    borderRadius: layer.box.radius,
  }
}

const channel = (hex: string, index: number) => (parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255).toFixed(3)

function renderImageContent(layer: ImageLayer) {
  const tone = layer.tone
  // Duotone: map the photo's brightness from the dark color (shadows) to the light one (highlights).
  // The filter sits inside the layer so it travels with it into PNG export.
  const filterId = tone ? `rl-duotone-${tone.dark.slice(1)}-${tone.light.slice(1)}` : ''
  return (
    <>
      {tone ? (
        <svg className="scene-renderer__filter" aria-hidden="true" focusable="false">
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues={`${channel(tone.dark, 0)} ${channel(tone.light, 0)}`} />
              <feFuncG type="table" tableValues={`${channel(tone.dark, 1)} ${channel(tone.light, 1)}`} />
              <feFuncB type="table" tableValues={`${channel(tone.dark, 2)} ${channel(tone.light, 2)}`} />
            </feComponentTransfer>
          </filter>
        </svg>
      ) : null}
      <img
        src={layer.src}
        alt={layer.name}
        draggable={false}
        className={`scene-renderer__image scene-renderer__image--${layer.fit ?? 'contain'}`.trim()}
        style={{
          ...(tone ? { filter: `url(#${filterId})` } : {}),
          ...(layer.framing && (layer.fit ?? 'contain') === 'cover' ? framingImageStyle(layer.framing, layer.width, layer.height) : {}),
        }}
      />
    </>
  )
}

function renderTextContent(layer: TextLayer, story: StoryState) {
  const text = resolvedText(layer, story)
  return layer.box ? (
    <span className="scene-renderer__text-box scene-renderer__text" style={textBoxStyle(layer)}>{text}</span>
  ) : (
    <span className="scene-renderer__text">{text}</span>
  )
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
  fitInsetPx,
  onSelectLayer,
  onMoveLayers,
  onPanBy,
  onAssetDrop,
  renderOverlay,
  smartSnap = false,
  snapGuides,
  onSnapLinesChange,
}: SceneRendererProps) {
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>()
  const fontsVersion = useFontsVersion()
  // What is drawn: the scene after auto layout (fitted text, flows) for the current words.
  const laidOut = useMemo(
    () => layoutScene(scene, story),
    // fontsVersion: re-measure once the real fonts have loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, story, fontsVersion],
  )
  const dragStateRef = useRef<DragState | null>(null)
  const [dragMode, setDragMode] = useState<'none' | 'pan' | 'layers'>('none')
  const scaleRef = useRef(1)

  const stageGeometry = useMemo((): StageGeometry => {
    const sceneWidth = Math.max(1, scene.width)
    const sceneHeight = Math.max(1, scene.height)
    const insetLeft = fitInsetPx?.left ?? 0
    const insetTop = fitInsetPx?.top ?? 0
    const availableWidth = Math.max(1, containerSize.width - insetLeft - (fitInsetPx?.right ?? 0))
    const availableHeight = Math.max(1, containerSize.height - insetTop - (fitInsetPx?.bottom ?? 0))
    const widthScale = availableWidth / sceneWidth
    const heightScale = availableHeight / sceneHeight
    const fitScale = Math.min(widthScale, heightScale)
    const zoom = Number.isFinite(stageZoomMultiplier) ? Math.max(stageZoomMultiplier, 0.05) : 1
    const baseScale = !Number.isFinite(fitScale) || fitScale <= 0 ? 1 : fitScale
    const scale = baseScale * zoom
    const stageWidthPx = sceneWidth * scale
    const stageHeightPx = sceneHeight * scale
    const stageLeftPx = insetLeft + (availableWidth - stageWidthPx) / 2 + (stageOffsetPx?.x ?? 0)
    const stageTopPx = insetTop + (availableHeight - stageHeightPx) / 2 + (stageOffsetPx?.y ?? 0)

    return {
      scale,
      stageLeftPx,
      stageTopPx,
      stageWidthPx,
      stageHeightPx,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
    }
  }, [containerSize.height, containerSize.width, fitInsetPx?.bottom, fitInsetPx?.left, fitInsetPx?.right, fitInsetPx?.top, scene.height, scene.width, stageOffsetPx?.x, stageOffsetPx?.y, stageZoomMultiplier])

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
    ? laidOut.layers.filter((layer) => selectedIdSet.has(layer.id) && layer.visible)
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
      dragState.pendingX += deltaClientX / sceneScale
      dragState.pendingY += deltaClientY / sceneScale
      // Holding Shift locks the move to whichever axis has moved further; release for free move.
      const lockToX = event.shiftKey && Math.abs(dragState.pendingX) >= Math.abs(dragState.pendingY)
      const lockToY = event.shiftKey && !lockToX
      const targetX = lockToY ? 0 : dragState.pendingX
      const targetY = lockToX ? 0 : dragState.pendingY

      // Alt drags freely. Otherwise snap to guides/layers/canvas first, then to the grid.
      const free = event.altKey
      const smart =
        !free && dragState.snapTargets
          ? computeSmartSnap(
              dragState.startLayers,
              { x: targetX, y: targetY },
              dragState.snapTargets,
              SMART_SNAP_THRESHOLD_PX / sceneScale,
              { x: lockToY, y: lockToX },
            )
          : null
      const gridSnap = (axisTarget: number, start: number) =>
        Math.round((start + axisTarget) / DRAG_SNAP_STEP) * DRAG_SNAP_STEP - start
      const startLeft = Math.min(...dragState.startLayers.map((layer) => layer.x))
      const startTop = Math.min(...dragState.startLayers.map((layer) => layer.y))
      const finalX = Math.round(
        smart?.lineX != null ? smart.delta.x : snapToGrid && !free && !lockToY && dragState.startLayers.length ? gridSnap(targetX, startLeft) : targetX,
      )
      const finalY = Math.round(
        smart?.lineY != null ? smart.delta.y : snapToGrid && !free && !lockToX && dragState.startLayers.length ? gridSnap(targetY, startTop) : targetY,
      )
      onSnapLinesChange?.(smart && (smart.lineX != null || smart.lineY != null) ? { x: smart.lineX, y: smart.lineY } : null)

      const stepX = finalX - dragState.appliedX
      const stepY = finalY - dragState.appliedY
      if (stepX === 0 && stepY === 0) {
        return
      }
      dragState.appliedX += stepX
      dragState.appliedY += stepY
      onMoveLayers?.(dragState.layerIds, { x: stepX, y: stepY }, false)
    }

    const handleUp = () => {
      if (dragStateRef.current?.mode === 'layers') onSnapLinesChange?.(null)
      dragStateRef.current = null
      setDragMode('none')
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [onMoveLayers, onPanBy, onSnapLinesChange, snapToGrid])

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
            pendingX: 0,
            pendingY: 0,
            appliedX: 0,
            appliedY: 0,
            startLayers: [],
            snapTargets: null,
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
          // Lets editor lines inside the scaled stage stay 1 screen pixel thick at any zoom.
          ['--stage-px' as string]: `${1 / (stageGeometry.scale || 1)}px`,
        }}
      >
        {laidOut.layers.map((layer) => (
          <div
            key={layer.id}
            data-layer-id={layer.id}
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
                  pendingX: 0,
                  pendingY: 0,
                  appliedX: 0,
                  appliedY: 0,
                  startLayers: [],
                  snapTargets: null,
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
              const movingIds = new Set(dragLayerIds)
              const startLayers = scene.layers.filter((entry) => movingIds.has(entry.id) && !entry.locked)
              event.preventDefault()
              dragStateRef.current = {
                mode: 'layers',
                layerIds: dragLayerIds,
                lastClientX: event.clientX,
                lastClientY: event.clientY,
                pendingX: 0,
                pendingY: 0,
                appliedX: 0,
                appliedY: 0,
                startLayers,
                snapTargets: smartSnap
                  ? collectSnapTargets(
                      scene,
                      scene.layers.filter((entry) => !movingIds.has(entry.id)),
                      snapGuides ?? { x: [], y: [] },
                    )
                  : null,
              }
              setDragMode('layers')
            }}
          >
            {layer.kind === 'text' ? renderTextContent(layer, story) : null}
            {layer.kind === 'image' ? renderImageContent(layer) : null}
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

        {selectedLayers.map((selectedLayer) => {
          const { transformOrigin, transform } = layerStyle(selectedLayer)
          return (
            <div
              key={selectedLayer.id}
              className="scene-renderer__selection"
              style={{
                left: selectedLayer.x,
                top: selectedLayer.y,
                width: selectedLayer.width,
                height: selectedLayer.height,
                transformOrigin,
                transform,
              }}
            >
              <div
                className="scene-renderer__anchor"
                style={{ left: resolveAnchor(selectedLayer).x, top: resolveAnchor(selectedLayer).y }}
              />
            </div>
          )
        })}
      </div>
      {renderOverlay ? <div className="scene-renderer__overlay">{renderOverlay(stageGeometry)}</div> : null}
    </div>
  )
}
