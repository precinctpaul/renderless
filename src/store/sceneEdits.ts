/** Pure scene/layer editing helpers used by the playout store (no state, no storage). */

import type { SceneDefinition, SceneFlow, SceneLayer, StoryState } from '../types/scene'
import { layoutScene } from '../lib/sceneLayout'
import { alignByAnchor, distributeByAnchor } from '../lib/layerAnchor'
import { cloneScene } from '../data/templates'

export type SceneTransformPatch = Partial<
  Pick<
    SceneDefinition['layers'][number],
    'x' | 'y' | 'width' | 'height' | 'rotation' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY' | 'opacity'
  >
>

export type LayerAlignMode = 'left' | 'hCenter' | 'right' | 'top' | 'vMiddle' | 'bottom'

export type LayerDistributeAxis = 'horizontal' | 'vertical'

export const MAX_UNDO_DEPTH = 80

export function moveLayerByDelta(scene: SceneDefinition, layerId: string, delta: -1 | 1): SceneDefinition {
  const sourceIndex = scene.layers.findIndex((layer) => layer.id === layerId)
  if (sourceIndex === -1) {
    return scene
  }

  if (scene.layers[sourceIndex]?.locked) {
    return scene
  }

  const targetIndex = sourceIndex + delta
  if (targetIndex < 0 || targetIndex >= scene.layers.length) {
    return scene
  }

  return moveLayerToIndex(scene, layerId, targetIndex)
}

export function moveLayerToIndex(scene: SceneDefinition, layerId: string, targetIndex: number): SceneDefinition {
  const sourceIndex = scene.layers.findIndex((layer) => layer.id === layerId)
  if (sourceIndex === -1) {
    return scene
  }

  if (scene.layers[sourceIndex]?.locked) {
    return scene
  }

  const boundedTargetIndex = Math.min(Math.max(Math.round(targetIndex), 0), scene.layers.length - 1)
  if (sourceIndex === boundedTargetIndex) {
    return scene
  }

  const nextLayers = [...scene.layers]
  const [movedLayer] = nextLayers.splice(sourceIndex, 1)
  nextLayers.splice(boundedTargetIndex, 0, movedLayer)

  return {
    ...scene,
    layers: nextLayers,
  }
}

export function applyTransformPatchToLayer(layer: SceneDefinition['layers'][number], patch: SceneTransformPatch) {
  if (layer.locked) {
    return layer
  }

  const nextWidth = Number.isFinite(patch.width) ? Math.round(Math.max(1, patch.width ?? layer.width)) : layer.width
  const nextHeight = Number.isFinite(patch.height) ? Math.round(Math.max(1, patch.height ?? layer.height)) : layer.height
  // Resizing keeps the anchor at the same relative spot (a centered anchor stays centered).
  const nextAnchorX = Number.isFinite(patch.anchorX)
    ? Math.round((patch.anchorX ?? 0) * 100) / 100
    : layer.anchorX && nextWidth !== layer.width ? Math.round(((layer.anchorX * nextWidth) / layer.width) * 100) / 100 : layer.anchorX
  const nextAnchorY = Number.isFinite(patch.anchorY)
    ? Math.round((patch.anchorY ?? 0) * 100) / 100
    : layer.anchorY && nextHeight !== layer.height ? Math.round(((layer.anchorY * nextHeight) / layer.height) * 100) / 100 : layer.anchorY
  const nextScaleX = Number.isFinite(patch.scaleX)
    ? Math.round(Math.min(Math.max(patch.scaleX ?? layer.scaleX ?? 100, 1), 1000))
    : layer.scaleX
  const nextScaleY = Number.isFinite(patch.scaleY)
    ? Math.round(Math.min(Math.max(patch.scaleY ?? layer.scaleY ?? 100, 1), 1000))
    : layer.scaleY
  const nextRotation = Number.isFinite(patch.rotation)
    ? Math.round((patch.rotation ?? layer.rotation ?? 0) * 10) / 10
    : layer.rotation
  const nextOpacity = Number.isFinite(patch.opacity)
    ? Math.min(Math.max(patch.opacity ?? layer.opacity, 0), 1)
    : layer.opacity

  return {
    ...layer,
    x: Number.isFinite(patch.x) ? Math.round(patch.x ?? layer.x) : layer.x,
    y: Number.isFinite(patch.y) ? Math.round(patch.y ?? layer.y) : layer.y,
    width: nextWidth,
    height: nextHeight,
    rotation: nextRotation,
    anchorX: nextAnchorX,
    anchorY: nextAnchorY,
    scaleX: nextScaleX,
    scaleY: nextScaleY,
    opacity: nextOpacity,
  }
}

export function moveLayersByDelta(
  scene: SceneDefinition,
  layerIds: string[],
  delta: { x: number; y: number },
  snapToGrid = false,
): SceneDefinition {
  const selectedIdSet = new Set(
    scene.layers.filter((layer) => layerIds.includes(layer.id) && !layer.locked).map((layer) => layer.id),
  )
  if (selectedIdSet.size === 0) {
    return scene
  }

  const deltaX = Number.isFinite(delta.x) ? delta.x : 0
  const deltaY = Number.isFinite(delta.y) ? delta.y : 0
  if (deltaX === 0 && deltaY === 0) {
    return scene
  }

  const snap = (value: number) => (snapToGrid ? Math.round(value / 10) * 10 : value)
  // Layers may move partly or fully off the canvas (bleeds), as in Illustrator/After Effects.

  return {
    ...scene,
    layers: scene.layers.map((layer) => {
      if (!selectedIdSet.has(layer.id)) {
        return layer
      }

      return {
        ...layer,
        x: Math.round(snap(layer.x + deltaX)),
        y: Math.round(snap(layer.y + deltaY)),
      }
    }),
  }
}

export function getSelectedLayers(scene: SceneDefinition, layerIds: string[]): SceneDefinition['layers'] {
  const selectedIdSet = new Set(layerIds)
  return scene.layers.filter((layer) => selectedIdSet.has(layer.id) && !layer.locked)
}

export function alignLayersByMode(
  scene: SceneDefinition,
  layerIds: string[],
  mode: LayerAlignMode,
): SceneDefinition {
  const selectedLayers = getSelectedLayers(scene, layerIds).filter((layer) => !layer.locked)
  const next = alignByAnchor(selectedLayers, mode, scene)
  if (next.size === 0) {
    return scene
  }

  return { ...scene, layers: scene.layers.map((layer) => (next.has(layer.id) ? { ...layer, ...next.get(layer.id) } : layer)) }
}

export function distributeLayers(scene: SceneDefinition, layerIds: string[], axis: LayerDistributeAxis): SceneDefinition {
  const selectedLayers = getSelectedLayers(scene, layerIds).filter((layer) => !layer.locked)
  const next = distributeByAnchor(selectedLayers, axis)
  if (next.size === 0) {
    return scene
  }

  return { ...scene, layers: scene.layers.map((layer) => (next.has(layer.id) ? { ...layer, ...next.get(layer.id) } : layer)) }
}

export function scenesEqual(a: SceneDefinition, b: SceneDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function pushHistoryFrame(stack: SceneDefinition[], scene: SceneDefinition): SceneDefinition[] {
  const nextStack = [...stack, cloneScene(scene)]
  if (nextStack.length <= MAX_UNDO_DEPTH) {
    return nextStack
  }

  return nextStack.slice(nextStack.length - MAX_UNDO_DEPTH)
}

/**
 * When an edit would move or resize a layer that auto layout places (Design), the flows it
 * touches are frozen first, at the positions they're drawn at, and taken out of auto layout.
 * Returns that frozen scene so the edit can be applied to what the user sees; null when the
 * edit doesn't touch a flow.
 */
export function freezeFlowsTouchedBy(previous: SceneDefinition, next: SceneDefinition, story: StoryState): SceneDefinition | null {
  if (!previous.flows?.length) return null
  const after = new Map(next.layers.map((layer) => [layer.id, layer]))
  const moved = new Set(
    previous.layers
      .filter((layer) => {
        const changed = after.get(layer.id)
        return changed && (changed.x !== layer.x || changed.y !== layer.y || changed.width !== layer.width || changed.height !== layer.height)
      })
      .map((layer) => layer.id),
  )
  const membersOf = (flow: SceneFlow) => [...flow.items.flatMap((item) => [item.layerId, ...(item.with ?? [])])]
  const touched = previous.flows.filter((flow) => membersOf(flow).some((id) => moved.has(id)))
  if (touched.length === 0) return null

  const drawn = new Map(layoutScene(previous, story).layers.map((layer) => [layer.id, layer]))
  const frozen = new Set(touched.flatMap(membersOf))
  return {
    ...previous,
    flows: previous.flows.filter((flow) => !touched.includes(flow)),
    layers: previous.layers.map((layer) => {
      const shown = drawn.get(layer.id)
      return frozen.has(layer.id) && shown ? ({ ...layer, x: shown.x, y: shown.y, height: shown.height } as SceneLayer) : layer
    }),
  }
}
