import { useEffect, useMemo, useState } from 'react'
import { AlignCenter, AlignHorizontalDistributeCenter, AlignJustify, AlignVerticalDistributeCenter, ArrowDown, ArrowUp, Move3D, Redo2, Undo2, Upload } from 'lucide-react'
import { StageCanvas } from '../components/StageCanvas'
import type { DataBindingKey, SceneLayer } from '../types/scene'
import { usePlayoutStore } from '../store/playoutStore'
import { BINDABLE_FIELDS } from '../data/storySchema'
import { resolveBindingValue } from '../lib/bindings'
import type { TemplatePackage } from '../lib/templatePackages'

const CREATION_ITEMS = ['TEXT', 'SHAPE', 'FIGMA', 'RIVE']

interface SelectionModifiers {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

function toNumberOrNull(value: string): number | null {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function asPercent(opacity: number): number {
  return Math.round(opacity * 100)
}

function fromPercent(percent: number): number {
  return Math.min(Math.max(percent, 0), 100) / 100
}

function layerPositionInfo(layer: SceneLayer, layers: SceneLayer[]) {
  const index = layers.findIndex((entry) => entry.id === layer.id)

  return {
    canMoveForward: index >= 0 && index < layers.length - 1,
    canMoveBackward: index > 0,
  }
}

function mixedNumberOrValue(layers: SceneLayer[], field: 'x' | 'y' | 'width' | 'height'): string {
  if (layers.length === 0) {
    return ''
  }

  const values = layers.map((layer) => layer[field])
  const firstValue = values[0]
  return values.every((value) => value === firstValue) ? String(firstValue) : ''
}

function slugifyFileName(rawValue: string): string {
  const normalized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'template-package'
}

function downloadTemplatePackageFile(templatePackage: TemplatePackage) {
  const fileName = `${slugifyFileName(templatePackage.metadata.label)}.rltpl.json`
  const payload = JSON.stringify(templatePackage, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const objectUrl = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(objectUrl)
}

export function DesignPage() {
  const scene = usePlayoutStore((state) => state.previewScene)
  const story = usePlayoutStore((state) => state.story)
  const templates = usePlayoutStore((state) => state.templates)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const reorderPreviewLayer = usePlayoutStore((state) => state.reorderPreviewLayer)
  const reorderPreviewLayerToIndex = usePlayoutStore((state) => state.reorderPreviewLayerToIndex)
  const updatePreviewLayerTransform = usePlayoutStore((state) => state.updatePreviewLayerTransform)
  const updatePreviewLayersTransform = usePlayoutStore((state) => state.updatePreviewLayersTransform)
  const updatePreviewShapeStyle = usePlayoutStore((state) => state.updatePreviewShapeStyle)
  const updatePreviewTextStyle = usePlayoutStore((state) => state.updatePreviewTextStyle)
  const updatePreviewTextBinding = usePlayoutStore((state) => state.updatePreviewTextBinding)
  const alignPreviewLayers = usePlayoutStore((state) => state.alignPreviewLayers)
  const distributePreviewLayers = usePlayoutStore((state) => state.distributePreviewLayers)
  const undoPreviewScene = usePlayoutStore((state) => state.undoPreviewScene)
  const redoPreviewScene = usePlayoutStore((state) => state.redoPreviewScene)
  const canUndo = usePlayoutStore((state) => state.canUndo)
  const canRedo = usePlayoutStore((state) => state.canRedo)
  const savePreviewTemplate = usePlayoutStore((state) => state.savePreviewTemplate)
  const exportPreviewTemplatePackage = usePlayoutStore((state) => state.exportPreviewTemplatePackage)
  const restoreTemplateVersion = usePlayoutStore((state) => state.restoreTemplateVersion)

  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)
  const [dragTargetLayerId, setDragTargetLayerId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string>('')
  const [versionToRestore, setVersionToRestore] = useState<string>('')

  const orderedLayers = useMemo(() => [...scene.layers].reverse(), [scene.layers])
  const orderedLayerIds = useMemo(() => orderedLayers.map((layer) => layer.id), [orderedLayers])

  const activeSelectedLayerIds = useMemo(
    () => selectedLayerIds.filter((layerId) => scene.layers.some((layer) => layer.id === layerId)),
    [scene.layers, selectedLayerIds],
  )

  const selectedLayers = useMemo(
    () => scene.layers.filter((layer) => activeSelectedLayerIds.includes(layer.id)),
    [activeSelectedLayerIds, scene.layers],
  )

  const primarySelectedLayer = selectedLayers[0] ?? null
  const activeTemplate = templates.find((template) => template.id === previewTemplateId) ?? null
  const canAlignSelection = selectedLayers.length >= 2
  const canDistributeSelection = selectedLayers.length >= 3
  const isMultiSelection = selectedLayers.length > 1

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redoPreviewScene()
          return
        }

        undoPreviewScene()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redoPreviewScene, undoPreviewScene])

  const handleLayerSelection = (layerId: string, modifiers?: SelectionModifiers) => {
    if (!layerId) {
      setSelectedLayerIds([])
      setSelectionAnchorId(null)
      return
    }

    const toggle = Boolean(modifiers?.ctrlKey || modifiers?.metaKey)
    const range = Boolean(modifiers?.shiftKey)

    setSelectedLayerIds((previousSelection) => {
      const fallbackAnchor = selectionAnchorId && orderedLayerIds.includes(selectionAnchorId) ? selectionAnchorId : layerId

      if (range) {
        const anchorIndex = orderedLayerIds.indexOf(fallbackAnchor)
        const targetIndex = orderedLayerIds.indexOf(layerId)

        if (anchorIndex < 0 || targetIndex < 0) {
          return [layerId]
        }

        const start = Math.min(anchorIndex, targetIndex)
        const end = Math.max(anchorIndex, targetIndex)
        return orderedLayerIds.slice(start, end + 1)
      }

      if (toggle) {
        if (previousSelection.includes(layerId)) {
          return previousSelection.filter((id) => id !== layerId)
        }

        return [...previousSelection, layerId]
      }

      return [layerId]
    })

    if (!range) {
      setSelectionAnchorId(layerId)
    }
  }

  const commitTransformField = (field: 'x' | 'y' | 'width' | 'height', value: string) => {
    const numericValue = toNumberOrNull(value)
    if (numericValue === null || selectedLayers.length === 0) {
      return
    }

    if (selectedLayers.length === 1 && primarySelectedLayer) {
      updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: numericValue })
      return
    }

    updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: numericValue })
  }

  const handleSaveTemplate = () => {
    const defaultName = activeTemplate?.label ?? scene.name
    const requestedName = window.prompt('Save template as', defaultName)
    if (!requestedName) {
      return
    }

    const savedTemplateId = savePreviewTemplate(requestedName)
    if (!savedTemplateId) {
      setSaveStatus('Template name is required.')
      return
    }

    setSaveStatus(`Saved ${requestedName.trim()} (v${(activeTemplate?.version ?? 0) + 1}).`)
    window.setTimeout(() => setSaveStatus(''), 2200)
  }

  const handleRestoreVersion = () => {
    if (!activeTemplate || !versionToRestore) {
      return
    }

    const restored = restoreTemplateVersion(activeTemplate.id, Number(versionToRestore))
    if (!restored) {
      setSaveStatus('Version restore failed.')
      return
    }

    setSaveStatus(`Restored v${versionToRestore}; current is now v${(activeTemplate.version ?? 1) + 1}.`)
    setVersionToRestore('')
    window.setTimeout(() => setSaveStatus(''), 2200)
  }

  const handleExportPackage = () => {
    const templatePackage = exportPreviewTemplatePackage()
    downloadTemplatePackageFile(templatePackage)
    setSaveStatus(`Exported package ${templatePackage.metadata.label}.rltpl.json`)
    window.setTimeout(() => setSaveStatus(''), 2200)
  }

  const handleDropOnLayer = (targetLayerId: string) => {
    if (!draggingLayerId || draggingLayerId === targetLayerId) {
      return
    }

    const targetListIndex = orderedLayers.findIndex((layer) => layer.id === targetLayerId)
    if (targetListIndex < 0) {
      return
    }

    const targetSceneIndex = scene.layers.length - 1 - targetListIndex
    reorderPreviewLayerToIndex(draggingLayerId, targetSceneIndex)
  }

  const versionHistory = activeTemplate?.versions ?? []
  const bindingPreviewValue =
    primarySelectedLayer && primarySelectedLayer.kind === 'text' && primarySelectedLayer.binding
      ? resolveBindingValue(primarySelectedLayer.binding, story)
      : ''

  return (
    <section className="screen screen--design">
      <div className="design-layout">
        <aside className="panel stage-sidebar">
          <div className="sidebar-tabs">
            <button type="button" className="tab-btn tab-btn--active">
              Layers
            </button>
            <button type="button" className="tab-btn">
              Assets
            </button>
          </div>

          <div className="sidebar-heading">
            <div className="title">STAGE PRO</div>
            <div className="subtitle">STUDIO EDITOR</div>
          </div>

          <div className="icon-row">
            <button type="button" className="icon-btn" aria-label="Undo" disabled={!canUndo} onClick={undoPreviewScene}>
              <Undo2 size={15} />
            </button>
            <button type="button" className="icon-btn" aria-label="Redo" disabled={!canRedo} onClick={redoPreviewScene}>
              <Redo2 size={15} />
            </button>
          </div>

          <div className="creation-grid">
            {CREATION_ITEMS.map((item) => (
              <button key={item} type="button" className="creation-btn">
                {item}
              </button>
            ))}
          </div>

          <div className="pill-toggle">
            <button type="button" className="pill-toggle__item pill-toggle__item--active">
              SELECT
            </button>
            <button type="button" className="pill-toggle__item">
              PAN
            </button>
          </div>

          <div className="layer-list" role="listbox" aria-label="Layer stack">
            {orderedLayers.map((layer) => {
              const { canMoveForward, canMoveBackward } = layerPositionInfo(layer, scene.layers)
              const isDragging = draggingLayerId === layer.id
              const isDropTarget = dragTargetLayerId === layer.id && draggingLayerId !== layer.id
              const isSelected = activeSelectedLayerIds.includes(layer.id)

              return (
                <div
                  key={layer.id}
                  className={`layer-item ${isSelected ? 'layer-item--active' : ''} ${isDragging ? 'layer-item--dragging' : ''} ${isDropTarget ? 'layer-item--drop-target' : ''}`.trim()}
                  draggable
                  onDragStart={(event) => {
                    setDraggingLayerId(layer.id)
                    setDragTargetLayerId(layer.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', layer.id)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDragTargetLayerId(layer.id)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    handleDropOnLayer(layer.id)
                    setDraggingLayerId(null)
                    setDragTargetLayerId(null)
                  }}
                  onDragEnd={() => {
                    setDraggingLayerId(null)
                    setDragTargetLayerId(null)
                  }}
                >
                  <button
                    type="button"
                    className="layer-item__main"
                    onClick={(event) =>
                      handleLayerSelection(layer.id, {
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                      })
                    }
                  >
                    <span>{layer.name}</span>
                    <Move3D size={14} />
                  </button>
                  <div className="layer-item__order">
                    <button
                      type="button"
                      className="icon-btn icon-btn--mini"
                      onClick={(event) => {
                        event.stopPropagation()
                        reorderPreviewLayer(layer.id, 'forward')
                      }}
                      disabled={!canMoveForward}
                      aria-label="Move layer up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--mini"
                      onClick={(event) => {
                        event.stopPropagation()
                        reorderPreviewLayer(layer.id, 'backward')
                      }}
                      disabled={!canMoveBackward}
                      aria-label="Move layer down"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <button type="button" className="btn btn--ghost btn--small">
            <Upload size={14} />
            Upload Asset
          </button>
        </aside>

        <section className="panel stage-center" aria-label="Stage canvas">
          <div className="stage-toolbar stage-toolbar--top">
            <span className="mono">CANVAS {scene.width} x {scene.height}</span>
            <div className="stage-toolbar__actions">
              <span className="mono stage-toolbar__template-name">
                {activeTemplate?.label ?? scene.name} | v{activeTemplate?.version ?? 1}
              </span>
              <button type="button" className="btn btn--small btn--accent" onClick={handleSaveTemplate}>
                Save Template
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleExportPackage}>
                Export Package
              </button>
            </div>
          </div>

          <div className="stage-toolbar stage-toolbar--subtle">
            <button type="button" className="btn btn--small btn--ghost" disabled={!canAlignSelection} onClick={() => alignPreviewLayers(activeSelectedLayerIds, 'left')}>
              <AlignJustify size={14} />
              Left
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canAlignSelection} onClick={() => alignPreviewLayers(activeSelectedLayerIds, 'hCenter')}>
              <AlignCenter size={14} />
              H Center
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canAlignSelection} onClick={() => alignPreviewLayers(activeSelectedLayerIds, 'right')}>
              <AlignJustify size={14} />
              Right
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canAlignSelection} onClick={() => alignPreviewLayers(activeSelectedLayerIds, 'top')}>
              <AlignJustify size={14} />
              Top
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canAlignSelection} onClick={() => alignPreviewLayers(activeSelectedLayerIds, 'vMiddle')}>
              <AlignCenter size={14} />
              V Middle
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canAlignSelection} onClick={() => alignPreviewLayers(activeSelectedLayerIds, 'bottom')}>
              <AlignJustify size={14} />
              Bottom
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canDistributeSelection} onClick={() => distributePreviewLayers(activeSelectedLayerIds, 'horizontal')}>
              <AlignHorizontalDistributeCenter size={14} />
              Dist H
            </button>
            <button type="button" className="btn btn--small btn--ghost" disabled={!canDistributeSelection} onClick={() => distributePreviewLayers(activeSelectedLayerIds, 'vertical')}>
              <AlignVerticalDistributeCenter size={14} />
              Dist V
            </button>
            <span className="mono">1920x1080 VIRTUAL SPACE</span>
          </div>

          <div className="stage-toolbar stage-toolbar--subtle">
            <button type="button" className="btn btn--small btn--ghost">
              Rulers
            </button>
            <button type="button" className="btn btn--small btn--ghost">
              Guides
            </button>
            <button type="button" className="btn btn--small btn--ghost">
              Grid
            </button>
            <button type="button" className="btn btn--small btn--ghost btn--accent-soft">
              Snap
            </button>
            {versionHistory.length > 0 ? (
              <>
                <select
                  className="stage-select mono"
                  value={versionToRestore}
                  onChange={(event) => setVersionToRestore(event.target.value)}
                >
                  <option value="">Restore version</option>
                  {[...versionHistory]
                    .sort((a, b) => b.version - a.version)
                    .map((entry) => (
                      <option key={entry.version} value={entry.version}>
                        v{entry.version} ({new Date(entry.updatedAt).toLocaleDateString('en-US')})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={!versionToRestore}
                  onClick={handleRestoreVersion}
                >
                  Restore
                </button>
              </>
            ) : null}
            {saveStatus ? <span className="mono stage-toolbar__save-status">{saveStatus}</span> : null}
          </div>

          <div className="stage-canvas-wrap">
            <StageCanvas
              scene={scene}
              story={story}
              selectedLayerIds={activeSelectedLayerIds}
              onSelectLayer={handleLayerSelection}
            />
          </div>
        </section>

        <aside className="panel inspector" aria-label="Layer inspector">
          <div className="panel-title">LAYER INSPECTOR</div>

          {selectedLayers.length > 0 ? (
            <>
              <div className="inspector-section">
                <div className="inspector-section__label mono">SELECTED ({selectedLayers.length})</div>
                <div className="inspector-layer-name">
                  {isMultiSelection ? 'Multiple Layers' : primarySelectedLayer?.name}
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__label">Transform</div>
                <div className="transform-grid">
                  <label>
                    X
                    <input
                      className="mono"
                      type="number"
                      value={mixedNumberOrValue(selectedLayers, 'x')}
                      placeholder="mixed"
                      onChange={(event) => commitTransformField('x', event.target.value)}
                    />
                  </label>
                  <label>
                    Y
                    <input
                      className="mono"
                      type="number"
                      value={mixedNumberOrValue(selectedLayers, 'y')}
                      placeholder="mixed"
                      onChange={(event) => commitTransformField('y', event.target.value)}
                    />
                  </label>
                  <label>
                    W
                    <input
                      className="mono"
                      type="number"
                      min={1}
                      value={mixedNumberOrValue(selectedLayers, 'width')}
                      placeholder="mixed"
                      onChange={(event) => commitTransformField('width', event.target.value)}
                    />
                  </label>
                  <label>
                    H
                    <input
                      className="mono"
                      type="number"
                      min={1}
                      value={mixedNumberOrValue(selectedLayers, 'height')}
                      placeholder="mixed"
                      onChange={(event) => commitTransformField('height', event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__label">Style</div>
                {isMultiSelection ? (
                  <div className="inspector-empty">Style editing is available for single-layer selection only.</div>
                ) : primarySelectedLayer && 'fill' in primarySelectedLayer ? (
                  <>
                    <label>
                      Fill
                      <input
                        className="mono"
                        value={primarySelectedLayer.fill}
                        onChange={(event) => updatePreviewShapeStyle(primarySelectedLayer.id, { fill: event.target.value })}
                      />
                    </label>
                    <label>
                      Opacity
                      <input
                        className="mono"
                        type="number"
                        min={0}
                        max={100}
                        value={asPercent(primarySelectedLayer.opacity)}
                        onChange={(event) => {
                          const nextPercent = toNumberOrNull(event.target.value)
                          if (nextPercent === null) {
                            return
                          }

                          updatePreviewShapeStyle(primarySelectedLayer.id, { opacity: fromPercent(nextPercent) })
                        }}
                      />
                    </label>
                  </>
                ) : primarySelectedLayer ? (
                  <>
                    <label>
                      Binding
                      <select
                        className="mono"
                        value={primarySelectedLayer.binding ?? ''}
                        onChange={(event) =>
                          updatePreviewTextBinding(
                            primarySelectedLayer.id,
                            event.target.value ? (event.target.value as DataBindingKey) : null,
                          )
                        }
                      >
                        <option value="">None</option>
                        {BINDABLE_FIELDS.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {primarySelectedLayer.binding ? (
                      <div className="binding-preview mono">
                        TOKEN: {primarySelectedLayer.binding} = {bindingPreviewValue || 'n/a'}
                      </div>
                    ) : null}
                    <label>
                      Text
                      <input
                        value={primarySelectedLayer.text}
                        onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { text: event.target.value })}
                      />
                    </label>
                    <label>
                      Color
                      <input
                        className="mono"
                        value={primarySelectedLayer.color}
                        onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { color: event.target.value })}
                      />
                    </label>
                    <label>
                      Font Size
                      <input
                        className="mono"
                        type="number"
                        min={8}
                        value={primarySelectedLayer.fontSize}
                        onChange={(event) => {
                          const nextFontSize = toNumberOrNull(event.target.value)
                          if (nextFontSize === null) {
                            return
                          }

                          updatePreviewTextStyle(primarySelectedLayer.id, { fontSize: nextFontSize })
                        }}
                      />
                    </label>
                    <label>
                      Opacity
                      <input
                        className="mono"
                        type="number"
                        min={0}
                        max={100}
                        value={asPercent(primarySelectedLayer.opacity)}
                        onChange={(event) => {
                          const nextPercent = toNumberOrNull(event.target.value)
                          if (nextPercent === null) {
                            return
                          }

                          updatePreviewTextStyle(primarySelectedLayer.id, { opacity: fromPercent(nextPercent) })
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="inspector-empty">Select one or more layers to inspect and edit virtual pixel values.</div>
          )}
        </aside>
      </div>
    </section>
  )
}
