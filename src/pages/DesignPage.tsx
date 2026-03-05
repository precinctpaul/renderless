import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  Move3D,
  Redo2,
  Undo2,
  Upload,
} from 'lucide-react'
import { StageCanvas } from '../components/StageCanvas'
import type { DataBindingKey, SceneLayer } from '../types/scene'
import { usePlayoutStore } from '../store/playoutStore'
import { BINDABLE_FIELDS } from '../data/storySchema'
import { resolveBindingValue } from '../lib/bindings'
import type { TemplatePackage } from '../lib/templatePackages'

type CreationItem = 'TEXT' | 'SHAPE' | 'FIGMA' | 'RIVE'
const CREATION_ITEMS: CreationItem[] = ['TEXT', 'SHAPE', 'FIGMA', 'RIVE']

interface SelectionModifiers {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

const toNumberOrNull = (value: string) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}
const asPercent = (opacity: number) => Math.round(opacity * 100)
const fromPercent = (percent: number) => Math.min(Math.max(percent, 0), 100) / 100
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template-package'
const GRID_SNAP_STEP = 10

function downloadTemplatePackageFile(templatePackage: TemplatePackage) {
  const fileName = `${slugify(templatePackage.metadata.label)}.rltpl.json`
  const payload = JSON.stringify(templatePackage, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(url)
}

function mixedNumber(layers: SceneLayer[], field: 'x' | 'y' | 'width' | 'height'): string {
  if (layers.length === 0) return ''
  const first = layers[0][field]
  return layers.every((layer) => layer[field] === first) ? String(first) : ''
}

function mixedTransform(layers: SceneLayer[], field: 'rotation' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY'): string {
  if (layers.length === 0) return ''
  const map = (layer: SceneLayer) => {
    if (field === 'rotation') return layer.rotation ?? 0
    if (field === 'anchorX') return layer.anchorX ?? 0
    if (field === 'anchorY') return layer.anchorY ?? 0
    if (field === 'scaleX') return layer.scaleX ?? 100
    return layer.scaleY ?? 100
  }
  const first = map(layers[0])
  return layers.every((layer) => map(layer) === first) ? String(first) : ''
}

function layerPositionInfo(layer: SceneLayer, layers: SceneLayer[]) {
  const index = layers.findIndex((entry) => entry.id === layer.id)
  return { canMoveForward: index >= 0 && index < layers.length - 1, canMoveBackward: index > 0 }
}

export function DesignPage() {
  const scene = usePlayoutStore((state) => state.previewScene)
  const story = usePlayoutStore((state) => state.story)
  const templates = usePlayoutStore((state) => state.templates)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const reorderPreviewLayer = usePlayoutStore((state) => state.reorderPreviewLayer)
  const reorderPreviewLayerToIndex = usePlayoutStore((state) => state.reorderPreviewLayerToIndex)
  const movePreviewLayersByDelta = usePlayoutStore((state) => state.movePreviewLayersByDelta)
  const updatePreviewLayerTransform = usePlayoutStore((state) => state.updatePreviewLayerTransform)
  const updatePreviewLayersTransform = usePlayoutStore((state) => state.updatePreviewLayersTransform)
  const updatePreviewShapeStyle = usePlayoutStore((state) => state.updatePreviewShapeStyle)
  const updatePreviewTextStyle = usePlayoutStore((state) => state.updatePreviewTextStyle)
  const updatePreviewTextBinding = usePlayoutStore((state) => state.updatePreviewTextBinding)
  const renamePreviewLayer = usePlayoutStore((state) => state.renamePreviewLayer)
  const createPreviewLayer = usePlayoutStore((state) => state.createPreviewLayer)
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
  const [saveStatus, setSaveStatus] = useState('')
  const [versionToRestore, setVersionToRestore] = useState('')
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select')
  const [sidebarTab, setSidebarTab] = useState<'layers' | 'assets'>('layers')
  const [showGrid, setShowGrid] = useState(true)
  const [showRulers, setShowRulers] = useState(false)
  const [showGuides, setShowGuides] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [uploadedAssets, setUploadedAssets] = useState<string[]>([])
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [isInspectorRenaming, setIsInspectorRenaming] = useState(false)
  const [inspectorRenameDraft, setInspectorRenameDraft] = useState('')
  const assetInputRef = useRef<HTMLInputElement | null>(null)

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
  const versionHistory = activeTemplate?.versions ?? []

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoPreviewScene()
        else undoPreviewScene()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setSelectedLayerIds([])
        setSelectionAnchorId(null)
        return
      }

      const selectedIds = activeSelectedLayerIds
      if (selectedIds.length === 0 || interactionMode !== 'select') {
        return
      }

      let deltaX = 0
      let deltaY = 0
      const nudgeBy = event.shiftKey ? GRID_SNAP_STEP : 1

      if (event.key === 'ArrowLeft') deltaX = -nudgeBy
      if (event.key === 'ArrowRight') deltaX = nudgeBy
      if (event.key === 'ArrowUp') deltaY = -nudgeBy
      if (event.key === 'ArrowDown') deltaY = nudgeBy

      if (deltaX !== 0 || deltaY !== 0) {
        event.preventDefault()
        movePreviewLayersByDelta(selectedIds, { x: deltaX, y: deltaY }, snapToGrid)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeSelectedLayerIds, interactionMode, movePreviewLayersByDelta, redoPreviewScene, snapToGrid, undoPreviewScene])

  const handleLayerSelection = (layerId: string, modifiers?: SelectionModifiers) => {
    if (!layerId) {
      setSelectedLayerIds([])
      setSelectionAnchorId(null)
      return
    }
    const toggle = Boolean(modifiers?.ctrlKey || modifiers?.metaKey)
    const range = Boolean(modifiers?.shiftKey)
    setSelectedLayerIds((previous) => {
      const anchor = selectionAnchorId && orderedLayerIds.includes(selectionAnchorId) ? selectionAnchorId : layerId
      if (range) {
        const anchorIndex = orderedLayerIds.indexOf(anchor)
        const targetIndex = orderedLayerIds.indexOf(layerId)
        if (anchorIndex < 0 || targetIndex < 0) return [layerId]
        return orderedLayerIds.slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
      }
      if (toggle) return previous.includes(layerId) ? previous.filter((id) => id !== layerId) : [...previous, layerId]
      return [layerId]
    })
    if (!range) setSelectionAnchorId(layerId)
  }

  const commitTransform = (field: 'x' | 'y' | 'width' | 'height', value: string) => {
    const numberValue = toNumberOrNull(value)
    if (numberValue === null || selectedLayers.length === 0) return

    const shouldSnap = snapToGrid && (field === 'x' || field === 'y' || field === 'width' || field === 'height')
    const normalizedValue = shouldSnap ? Math.round(numberValue / GRID_SNAP_STEP) * GRID_SNAP_STEP : numberValue

    if (selectedLayers.length === 1 && primarySelectedLayer) {
      updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: normalizedValue })
      return
    }

    updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: normalizedValue })
  }
  const commitAdvanced = (field: 'rotation' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY', value: string) => {
    const numberValue = toNumberOrNull(value)
    if (numberValue === null || selectedLayers.length === 0) return
    if (selectedLayers.length === 1 && primarySelectedLayer) updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: numberValue })
    else updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: numberValue })
  }

  const setTransientStatus = (message: string, timeoutMs = 1800) => {
    setSaveStatus(message)
    window.setTimeout(() => setSaveStatus(''), timeoutMs)
  }
  const handleCreateLayer = (item: CreationItem) => {
    if (item === 'TEXT' || item === 'SHAPE') {
      const layerId = createPreviewLayer(item === 'TEXT' ? 'text' : 'shape')
      if (layerId) {
        setSelectedLayerIds([layerId])
        setSelectionAnchorId(layerId)
        setInteractionMode('select')
        setTransientStatus(`${item} layer created.`, 1400)
      }
      return
    }
    setTransientStatus(`${item} layer import is not wired yet.`)
  }

  const handleAlign = (mode: 'left' | 'hCenter' | 'right' | 'top' | 'vMiddle' | 'bottom') => {
    if (selectedLayers.length === 0) return setTransientStatus('Select at least one layer.')
    if (selectedLayers.length >= 2) {
      alignPreviewLayers(activeSelectedLayerIds, mode, snapToGrid)
      setTransientStatus(`Aligned ${selectedLayers.length} layer(s).`, 1200)
      return
    }

    const layer = selectedLayers[0]
    if (!layer) return

    const snap = (value: number) => (snapToGrid ? Math.round(value / GRID_SNAP_STEP) * GRID_SNAP_STEP : Math.round(value))
    if (mode === 'left') return updatePreviewLayerTransform(layer.id, { x: 0 })
    if (mode === 'hCenter') return updatePreviewLayerTransform(layer.id, { x: snap((scene.width - layer.width) / 2) })
    if (mode === 'right') return updatePreviewLayerTransform(layer.id, { x: snap(scene.width - layer.width) })
    if (mode === 'top') return updatePreviewLayerTransform(layer.id, { y: 0 })
    if (mode === 'vMiddle') return updatePreviewLayerTransform(layer.id, { y: snap((scene.height - layer.height) / 2) })
    return updatePreviewLayerTransform(layer.id, { y: snap(scene.height - layer.height) })
  }

  const handleDistribute = (axis: 'horizontal' | 'vertical') => {
    if (selectedLayers.length < 3) {
      setTransientStatus('Select at least 3 layers to distribute.')
      return
    }

    distributePreviewLayers(activeSelectedLayerIds, axis, snapToGrid)
    setTransientStatus(`Distributed ${selectedLayers.length} layer(s).`, 1200)
  }

  const handleSaveTemplate = () => {
    const requested = window.prompt('Save template as', activeTemplate?.label ?? scene.name)
    if (!requested) return
    const savedId = savePreviewTemplate(requested)
    if (!savedId) return setTransientStatus('Template name is required.')
    setTransientStatus(`Saved ${requested.trim()}.`, 2200)
  }
  const handleExportPackage = () => {
    const templatePackage = exportPreviewTemplatePackage()
    downloadTemplatePackageFile(templatePackage)
    setTransientStatus(`Exported ${templatePackage.metadata.label}.rltpl.json`, 2200)
  }
  const handleRestoreVersion = () => {
    if (!activeTemplate || !versionToRestore) return
    if (!restoreTemplateVersion(activeTemplate.id, Number(versionToRestore))) return setTransientStatus('Restore failed.')
    setVersionToRestore('')
    setTransientStatus(`Restored v${versionToRestore}.`, 2200)
  }
  const handleDropOnLayer = (targetLayerId: string) => {
    if (!draggingLayerId || draggingLayerId === targetLayerId) return
    const targetListIndex = orderedLayers.findIndex((layer) => layer.id === targetLayerId)
    if (targetListIndex < 0) return
    reorderPreviewLayerToIndex(draggingLayerId, scene.layers.length - 1 - targetListIndex)
  }
  const commitRenameLayer = () => {
    if (!renamingLayerId) return

    const nextName = renameDraft.trim()
    if (nextName) {
      renamePreviewLayer(renamingLayerId, nextName)
    } else {
      setTransientStatus('Layer name cannot be empty.')
    }
    setRenamingLayerId(null)
  }

  const commitInspectorRename = () => {
    if (selectedLayers.length !== 1 || !primarySelectedLayer) {
      setIsInspectorRenaming(false)
      return
    }

    const nextName = inspectorRenameDraft.trim()
    if (nextName) {
      renamePreviewLayer(primarySelectedLayer.id, nextName)
      setInspectorRenameDraft(nextName)
    } else {
      setTransientStatus('Layer name cannot be empty.')
      setInspectorRenameDraft(primarySelectedLayer.name)
    }
    setIsInspectorRenaming(false)
  }

  const bindingPreviewValue =
    primarySelectedLayer && primarySelectedLayer.kind === 'text' && primarySelectedLayer.binding
      ? resolveBindingValue(primarySelectedLayer.binding, story)
      : ''

  return (
    <section className="screen screen--design">
      <div className="design-layout">
        <aside className="panel stage-sidebar">
          <div className="sidebar-tabs">
            <button type="button" className={`tab-btn ${sidebarTab === 'layers' ? 'tab-btn--active' : ''}`} onClick={() => setSidebarTab('layers')}>Layers</button>
            <button type="button" className={`tab-btn ${sidebarTab === 'assets' ? 'tab-btn--active' : ''}`} onClick={() => setSidebarTab('assets')}>Assets</button>
          </div>
          <div className="sidebar-heading"><div className="title">STAGE PRO</div><div className="subtitle">STUDIO EDITOR</div></div>
          <div className="icon-row">
            <button type="button" className="icon-btn" disabled={!canUndo} onClick={undoPreviewScene}><Undo2 size={15} /></button>
            <button type="button" className="icon-btn" disabled={!canRedo} onClick={redoPreviewScene}><Redo2 size={15} /></button>
          </div>
          <div className="creation-grid">{CREATION_ITEMS.map((item) => <button key={item} type="button" className="creation-btn" onClick={() => handleCreateLayer(item)}>{item}</button>)}</div>
          <div className="pill-toggle">
            <button type="button" className={`pill-toggle__item ${interactionMode === 'select' ? 'pill-toggle__item--active' : ''}`} onClick={() => setInteractionMode('select')}>SELECT</button>
            <button type="button" className={`pill-toggle__item ${interactionMode === 'pan' ? 'pill-toggle__item--active' : ''}`} onClick={() => setInteractionMode('pan')}>PAN</button>
          </div>
          {sidebarTab === 'layers' ? (
            <div className="layer-list">
              {orderedLayers.map((layer) => {
                const { canMoveForward, canMoveBackward } = layerPositionInfo(layer, scene.layers)
                const isSelected = activeSelectedLayerIds.includes(layer.id)
                const classes = `layer-item ${isSelected ? 'layer-item--active' : ''} ${draggingLayerId === layer.id ? 'layer-item--dragging' : ''} ${dragTargetLayerId === layer.id && draggingLayerId !== layer.id ? 'layer-item--drop-target' : ''}`
                return (
                  <div key={layer.id} className={classes.trim()} draggable onDragStart={(event) => { setDraggingLayerId(layer.id); setDragTargetLayerId(layer.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', layer.id) }} onDragOver={(event) => { event.preventDefault(); setDragTargetLayerId(layer.id) }} onDrop={(event) => { event.preventDefault(); handleDropOnLayer(layer.id); setDraggingLayerId(null); setDragTargetLayerId(null) }} onDragEnd={() => { setDraggingLayerId(null); setDragTargetLayerId(null) }}>
                    <button type="button" className="layer-item__main" onClick={(event) => handleLayerSelection(layer.id, { shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey })} onDoubleClick={() => { setRenamingLayerId(layer.id); setRenameDraft(layer.name) }}>
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
                      ) : <span>{layer.name}</span>}
                      <Move3D size={14} />
                    </button>
                    <div className="layer-item__order">
                      <button type="button" className="icon-btn icon-btn--mini" disabled={!canMoveForward} onClick={(event) => { event.stopPropagation(); reorderPreviewLayer(layer.id, 'forward') }}><ArrowUp size={12} /></button>
                      <button type="button" className="icon-btn icon-btn--mini" disabled={!canMoveBackward} onClick={(event) => { event.stopPropagation(); reorderPreviewLayer(layer.id, 'backward') }}><ArrowDown size={12} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="asset-list">{uploadedAssets.length === 0 ? <div className="inspector-empty">No assets uploaded yet.</div> : uploadedAssets.map((name) => <div key={name} className="tree-row">{name}</div>)}</div>
          )}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => assetInputRef.current?.click()}><Upload size={14} />Upload Asset</button>
          <input ref={assetInputRef} type="file" style={{ display: 'none' }} multiple onChange={(event) => { const names = Array.from(event.target.files ?? []).map((file) => file.name); if (names.length > 0) { setUploadedAssets((previous) => [...previous, ...names]); setSidebarTab('assets'); setTransientStatus(`Imported ${names.length} asset file(s).`, 2200) } event.target.value = '' }} />
        </aside>

        <section className="panel stage-center">
          <div className="stage-toolbar stage-toolbar--top">
            <span className="mono">CANVAS {scene.width} x {scene.height}</span>
            <div className="stage-toolbar__actions">
              <span className="mono stage-toolbar__template-name">{activeTemplate?.label ?? scene.name} | v{activeTemplate?.version ?? 1}</span>
              <button type="button" className="btn btn--small btn--accent" onClick={handleSaveTemplate}>Save Template</button>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleExportPackage}>Export Package</button>
            </div>
          </div>
          <div className="stage-toolbar stage-toolbar--subtle">
            <button type="button" className="btn btn--small btn--ghost" onClick={() => handleAlign('left')}><AlignJustify size={14} />Left</button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => handleAlign('hCenter')}><AlignCenter size={14} />H Center</button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => handleAlign('right')}><AlignJustify size={14} />Right</button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => handleAlign('top')}><AlignJustify size={14} />Top</button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => handleAlign('vMiddle')}><AlignCenter size={14} />V Middle</button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => handleAlign('bottom')}><AlignJustify size={14} />Bottom</button>
            <button type="button" className="btn btn--small btn--ghost" disabled={selectedLayers.length < 3} onClick={() => handleDistribute('horizontal')}><AlignHorizontalDistributeCenter size={14} />Dist H</button>
            <button type="button" className="btn btn--small btn--ghost" disabled={selectedLayers.length < 3} onClick={() => handleDistribute('vertical')}><AlignVerticalDistributeCenter size={14} />Dist V</button>
          </div>
          <div className="stage-toolbar stage-toolbar--subtle">
            <button
              type="button"
              className={`btn btn--small ${showRulers ? 'btn--accent-soft' : 'btn--ghost'}`}
              onClick={() => {
                setShowRulers((prev) => !prev)
                setTransientStatus(showRulers ? 'Rulers hidden.' : 'Rulers enabled.', 1100)
              }}
            >
              Rulers
            </button>
            <button
              type="button"
              className={`btn btn--small ${showGuides ? 'btn--accent-soft' : 'btn--ghost'}`}
              onClick={() => {
                setShowGuides((prev) => !prev)
                setTransientStatus(showGuides ? 'Guides hidden.' : 'Guides enabled.', 1100)
              }}
            >
              Guides
            </button>
            <button
              type="button"
              className={`btn btn--small ${showGrid ? 'btn--accent-soft' : 'btn--ghost'}`}
              onClick={() => {
                setShowGrid((prev) => !prev)
                setTransientStatus(showGrid ? 'Grid hidden.' : 'Grid enabled.', 1100)
              }}
            >
              Grid
            </button>
            <button
              type="button"
              className={`btn btn--small ${snapToGrid ? 'btn--accent-soft' : 'btn--ghost'}`}
              onClick={() => {
                setSnapToGrid((prev) => !prev)
                setTransientStatus(snapToGrid ? 'Snap disabled.' : `Snap enabled (${GRID_SNAP_STEP}px).`, 1100)
              }}
            >
              Snap
            </button>
            <span className="stage-toolbar__hint mono">
              {snapToGrid ? `SNAP ${GRID_SNAP_STEP}px` : 'SNAP OFF'} | ARROWS NUDGE
            </span>
            {versionHistory.length > 0 ? (
              <>
                <select className="stage-select mono" value={versionToRestore} onChange={(event) => setVersionToRestore(event.target.value)}>
                  <option value="">Restore version</option>
                  {[...versionHistory].sort((a, b) => b.version - a.version).map((entry) => <option key={entry.version} value={entry.version}>v{entry.version} ({new Date(entry.updatedAt).toLocaleDateString('en-US')})</option>)}
                </select>
                <button type="button" className="btn btn--small btn--ghost" disabled={!versionToRestore} onClick={handleRestoreVersion}>Restore</button>
              </>
            ) : null}
            {saveStatus ? <span className="mono stage-toolbar__save-status">{saveStatus}</span> : null}
          </div>
          <div className="stage-canvas-wrap">
            <StageCanvas scene={scene} story={story} selectedLayerIds={activeSelectedLayerIds} onSelectLayer={handleLayerSelection} onMoveLayers={movePreviewLayersByDelta} interactionMode={interactionMode} showGrid={showGrid} showRulers={showRulers} showGuides={showGuides} snapToGrid={snapToGrid} />
          </div>
        </section>

        <aside className="panel inspector">
          <div className="panel-title">LAYER INSPECTOR</div>
          {selectedLayers.length > 0 ? (
            <>
              <div className="inspector-section">
                <div className="inspector-section__label mono">SELECTED ({selectedLayers.length})</div>
                <div className="inspector-layer-name">
                  {selectedLayers.length > 1 ? (
                    'Multiple Layers'
                  ) : isInspectorRenaming ? (
                    <input
                      value={inspectorRenameDraft}
                      autoFocus
                      onChange={(event) => setInspectorRenameDraft(event.target.value)}
                      onBlur={commitInspectorRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitInspectorRename()
                        if (event.key === 'Escape') {
                          setIsInspectorRenaming(false)
                          setInspectorRenameDraft(primarySelectedLayer?.name ?? '')
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="inspector-rename-trigger"
                      onDoubleClick={() => {
                        setInspectorRenameDraft(primarySelectedLayer?.name ?? '')
                        setIsInspectorRenaming(true)
                      }}
                      onClick={() => {
                        setInspectorRenameDraft(primarySelectedLayer?.name ?? '')
                        setIsInspectorRenaming(true)
                      }}
                    >
                      {primarySelectedLayer?.name ?? ''}
                    </button>
                  )}
                </div>
              </div>
              <div className="inspector-section">
                <div className="inspector-section__label">Transform</div>
                <div className="transform-grid">
                  <label>X<input className="mono" type="number" value={mixedNumber(selectedLayers, 'x')} placeholder="mixed" onChange={(event) => commitTransform('x', event.target.value)} /></label>
                  <label>Y<input className="mono" type="number" value={mixedNumber(selectedLayers, 'y')} placeholder="mixed" onChange={(event) => commitTransform('y', event.target.value)} /></label>
                  <label>W<input className="mono" type="number" min={1} value={mixedNumber(selectedLayers, 'width')} placeholder="mixed" onChange={(event) => commitTransform('width', event.target.value)} /></label>
                  <label>H<input className="mono" type="number" min={1} value={mixedNumber(selectedLayers, 'height')} placeholder="mixed" onChange={(event) => commitTransform('height', event.target.value)} /></label>
                  <label>Scale X<input className="mono" type="number" value={mixedTransform(selectedLayers, 'scaleX')} placeholder="mixed" onChange={(event) => commitAdvanced('scaleX', event.target.value)} /></label>
                  <label>Scale Y<input className="mono" type="number" value={mixedTransform(selectedLayers, 'scaleY')} placeholder="mixed" onChange={(event) => commitAdvanced('scaleY', event.target.value)} /></label>
                  <label>Anchor X<input className="mono" type="number" value={mixedTransform(selectedLayers, 'anchorX')} placeholder="mixed" onChange={(event) => commitAdvanced('anchorX', event.target.value)} /></label>
                  <label>Anchor Y<input className="mono" type="number" value={mixedTransform(selectedLayers, 'anchorY')} placeholder="mixed" onChange={(event) => commitAdvanced('anchorY', event.target.value)} /></label>
                  <label>Rotation<input className="mono" type="number" value={mixedTransform(selectedLayers, 'rotation')} placeholder="mixed" onChange={(event) => commitAdvanced('rotation', event.target.value)} /></label>
                </div>
              </div>
              <div className="inspector-section">
                <div className="inspector-section__label">Style</div>
                {selectedLayers.length > 1 ? (
                  <div className="inspector-empty">Style editing is available for single-layer selection only.</div>
                ) : primarySelectedLayer && primarySelectedLayer.kind === 'shape' ? (
                  <>
                    <label>Fill<input className="mono" value={primarySelectedLayer.fill} onChange={(event) => updatePreviewShapeStyle(primarySelectedLayer.id, { fill: event.target.value })} /></label>
                    <label>Opacity<input className="mono" type="number" min={0} max={100} value={asPercent(primarySelectedLayer.opacity)} onChange={(event) => { const numberValue = toNumberOrNull(event.target.value); if (numberValue !== null) updatePreviewShapeStyle(primarySelectedLayer.id, { opacity: fromPercent(numberValue) }) }} /></label>
                  </>
                ) : primarySelectedLayer ? (
                  <>
                    <label>Binding<select className="mono" value={primarySelectedLayer.binding ?? ''} onChange={(event) => updatePreviewTextBinding(primarySelectedLayer.id, event.target.value ? (event.target.value as DataBindingKey) : null)}><option value="">None</option>{BINDABLE_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>
                    {primarySelectedLayer.binding ? <div className="binding-preview mono">TOKEN: {primarySelectedLayer.binding} = {bindingPreviewValue || 'n/a'}</div> : null}
                    <label>Text<input value={primarySelectedLayer.text} onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { text: event.target.value })} /></label>
                    <label>Color<input className="mono" value={primarySelectedLayer.color} onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { color: event.target.value })} /></label>
                    <label>Font Size<input className="mono" type="number" min={8} value={primarySelectedLayer.fontSize} onChange={(event) => { const numberValue = toNumberOrNull(event.target.value); if (numberValue !== null) updatePreviewTextStyle(primarySelectedLayer.id, { fontSize: numberValue }) }} /></label>
                    <label>Opacity<input className="mono" type="number" min={0} max={100} value={asPercent(primarySelectedLayer.opacity)} onChange={(event) => { const numberValue = toNumberOrNull(event.target.value); if (numberValue !== null) updatePreviewTextStyle(primarySelectedLayer.id, { opacity: fromPercent(numberValue) }) }} /></label>
                  </>
                ) : null}
              </div>
            </>
          ) : <div className="inspector-empty">Select one or more layers to inspect and edit virtual pixel values.</div>}
        </aside>
      </div>
    </section>
  )
}
