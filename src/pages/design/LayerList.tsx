import { useState } from 'react'
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, GripVertical, Lock, Trash2, Unlock } from 'lucide-react'
import { usePlayoutStore } from '../../store/playoutStore'
import type { SceneLayer } from '../../types/scene'

interface LayerListProps {
  /** Layers in list order (front-most first). */
  layers: SceneLayer[]
  /** Layers in scene order (back-most first), for one-step moves. */
  sceneLayers: SceneLayer[]
  selectedLayerIds: string[]
  onSelect: (layerId: string, modifiers?: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  onDuplicate: (layerId: string) => void
  onStatus: (message: string, timeoutMs?: number) => void
}

/** Stage Pro layer list: select, rename, show/hide, lock, duplicate, delete, and reorder by drag or step. */
export function LayerList({ layers, sceneLayers, selectedLayerIds, onSelect, onDuplicate, onStatus }: LayerListProps) {
  const reorderPreviewLayerToIndex = usePlayoutStore((state) => state.reorderPreviewLayerToIndex)
  const deletePreviewLayer = usePlayoutStore((state) => state.deletePreviewLayer)
  const togglePreviewLayerVisibility = usePlayoutStore((state) => state.togglePreviewLayerVisibility)
  const togglePreviewLayerLock = usePlayoutStore((state) => state.togglePreviewLayerLock)
  const renamePreviewLayer = usePlayoutStore((state) => state.renamePreviewLayer)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)
  const [dragTargetLayerId, setDragTargetLayerId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below'>('above')
  const [justMovedLayerId, setJustMovedLayerId] = useState<string | null>(null)
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const flashMovedLayer = (layerId: string) => {
    setJustMovedLayerId(layerId)
    window.setTimeout(() => setJustMovedLayerId((current) => (current === layerId ? null : current)), 700)
  }
  /** Drops the dragged layer just above or below the target row (list order: top = front). */
  const handleDropOnLayer = (targetLayerId: string, position: 'above' | 'below') => {
    if (!draggingLayerId || draggingLayerId === targetLayerId) return
    const listWithout = layers.filter((layer) => layer.id !== draggingLayerId)
    const targetPos = listWithout.findIndex((layer) => layer.id === targetLayerId)
    if (targetPos < 0) return
    const newListIndex = targetPos + (position === 'below' ? 1 : 0)
    reorderPreviewLayerToIndex(draggingLayerId, sceneLayers.length - 1 - newListIndex)
    const moved = layers.find((layer) => layer.id === draggingLayerId)
    const target = layers.find((layer) => layer.id === targetLayerId)
    flashMovedLayer(draggingLayerId)
    onStatus(`Moved ${moved?.name ?? 'layer'} ${position} ${target?.name ?? 'layer'}.`, 1600)
  }
  /** One step toward the front (up) or back (down) of the stack. */
  const handleStepLayer = (layerId: string, direction: 'up' | 'down') => {
    const sceneIndex = sceneLayers.findIndex((layer) => layer.id === layerId)
    if (sceneIndex < 0) return
    const nextIndex = direction === 'up' ? sceneIndex + 1 : sceneIndex - 1
    if (nextIndex < 0 || nextIndex >= sceneLayers.length) return
    reorderPreviewLayerToIndex(layerId, nextIndex)
    flashMovedLayer(layerId)
  }
  const commitRenameLayer = () => {
    if (!renamingLayerId) return

    const nextName = renameDraft.trim()
    if (nextName) {
      renamePreviewLayer(renamingLayerId, nextName)
    } else {
      onStatus('Layer name cannot be empty.')
    }
    setRenamingLayerId(null)
  }

  return (
    <div className="layer-list">
      {layers.map((layer, listIndex) => {
        const isSelected = selectedLayerIds.includes(layer.id)
        const isDropTarget = dragTargetLayerId === layer.id && draggingLayerId !== null && draggingLayerId !== layer.id
        const classes = `layer-item ${isSelected ? 'layer-item--active' : ''} ${draggingLayerId === layer.id ? 'layer-item--dragging' : ''} ${isDropTarget ? `layer-item--drop-${dropPosition}` : ''} ${justMovedLayerId === layer.id ? 'layer-item--just-moved' : ''} ${layer.visible ? '' : 'layer-item--hidden'}`
        return (
          <div
            key={layer.id}
            className={classes.trim()}
            draggable={!layer.locked}
            onDragStart={(event) => {
              if (layer.locked) {
                event.preventDefault()
                return
              }
              setDraggingLayerId(layer.id)
              setDragTargetLayerId(layer.id)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', layer.id)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const bounds = event.currentTarget.getBoundingClientRect()
              setDragTargetLayerId(layer.id)
              setDropPosition(event.clientY < bounds.top + bounds.height / 2 ? 'above' : 'below')
            }}
            onDrop={(event) => {
              event.preventDefault()
              handleDropOnLayer(layer.id, dropPosition)
              setDraggingLayerId(null)
              setDragTargetLayerId(null)
            }}
            onDragEnd={() => {
              setDraggingLayerId(null)
              setDragTargetLayerId(null)
            }}
          >
            <div className="layer-item__order">
              <button
                type="button"
                className="layer-item__step"
                title="Move up one layer"
                aria-label="Move layer up"
                disabled={Boolean(layer.locked) || listIndex === 0}
                onClick={(event) => {
                  event.stopPropagation()
                  handleStepLayer(layer.id, 'up')
                }}
              >
                <ChevronUp size={11} />
              </button>
              <button
                type="button"
                className={`layer-item__handle ${layer.locked ? 'layer-item__handle--disabled' : ''}`.trim()}
                title={layer.locked ? 'Unlock layer to reorder' : 'Drag to reorder layer'}
                aria-label={layer.locked ? 'Layer locked' : 'Drag layer to reorder'}
              >
                <GripVertical size={14} />
              </button>
              <button
                type="button"
                className="layer-item__step"
                title="Move down one layer"
                aria-label="Move layer down"
                disabled={Boolean(layer.locked) || listIndex === layers.length - 1}
                onClick={(event) => {
                  event.stopPropagation()
                  handleStepLayer(layer.id, 'down')
                }}
              >
                <ChevronDown size={11} />
              </button>
            </div>
            <button type="button" className="layer-item__main" onClick={(event) => onSelect(layer.id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey })} onDoubleClick={() => { setRenamingLayerId(layer.id); setRenameDraft(layer.name) }}>
              {renamingLayerId === layer.id ? (
                <input
                  className="mono"
                  value={renameDraft}
                  autoFocus
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={commitRenameLayer}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRenameLayer()
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setRenameDraft(layer.name)
                      setRenamingLayerId(null)
                    }
                  }}
                />
              ) : <span title={layer.name}>{layer.name}</span>}
            </button>
            <div className="layer-item__actions">
              <button
                type="button"
                className="icon-btn icon-btn--mini"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={(event) => {
                  event.stopPropagation()
                  togglePreviewLayerVisibility(layer.id)
                }}
              >
                {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                type="button"
                className={`icon-btn icon-btn--mini ${layer.locked ? 'icon-btn--active' : ''}`.trim()}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(event) => {
                  event.stopPropagation()
                  togglePreviewLayerLock(layer.id)
                }}
              >
                {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--mini"
                title="Duplicate layer"
                onClick={(event) => {
                  event.stopPropagation()
                  onDuplicate(layer.id)
                }}
              >
                <Copy size={12} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn--mini"
                title={layer.locked ? 'Unlock layer before deleting' : 'Delete layer'}
                disabled={Boolean(layer.locked)}
                onClick={(event) => {
                  event.stopPropagation()
                  deletePreviewLayer(layer.id)
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
