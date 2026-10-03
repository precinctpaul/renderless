import { useEffect, useMemo, useState } from 'react'
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignVerticalDistributeCenter,
  Hand,
  History,
  ImageDown,
  MousePointer2,
  Redo2,
  Undo2,
} from 'lucide-react'
import { StageCanvas } from '../components/StageCanvas'
import { LayerInspector } from './design/LayerInspector'
import { LayerList } from './design/LayerList'
import { CanvasSizeSelect, NewTemplateDialog } from '../components/CanvasSizeControls'
import { VersionHistoryDialog } from '../components/VersionHistoryDialog'
import { downloadDataUrl, renderScenePng } from '../lib/exportScenePng'
import { usePlayoutStore } from '../store/playoutStore'
import type { TemplatePackage } from '../lib/templatePackages'
import {
  ASSET_STORAGE_KEY,
  FONT_STORAGE_KEY,
  MEDIA_LIBRARY_UPDATED_EVENT,
  invalidateMediaEntriesCache,
  persistMediaEntries,
  isPlaceableImageEntry,
  readMediaEntries,
  readMediaEntriesAsync,
  registerFontEntries,
  type MediaLibraryEntry,
} from '../lib/mediaLibrary'

type CreationItem = 'TEXT' | 'SHAPE' | 'FIGMA' | 'RIVE'
const CREATION_ITEMS: CreationItem[] = ['TEXT', 'SHAPE', 'FIGMA', 'RIVE']

interface SelectionModifiers {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template-package'
const GRID_SNAP_STEP = 10
// Brand faces first (same stacks the built-in templates use), then general-purpose fonts.
const DEFAULT_FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Druk Wide', value: '"Druk Wide", "Archivo Expanded", "Arial Black", sans-serif' },
  { label: 'Druk', value: '"Druk", Oswald, "Arial Narrow", sans-serif' },
  { label: 'Recoleta', value: '"Recoleta", Georgia, serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
]

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

export function DesignPage() {
  const scene = usePlayoutStore((state) => state.previewScene)
  const story = usePlayoutStore((state) => state.story)
  const templates = usePlayoutStore((state) => state.templates)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const movePreviewLayersByDelta = usePlayoutStore((state) => state.movePreviewLayersByDelta)
  const addPreviewImageLayerFromAsset = usePlayoutStore((state) => state.addPreviewImageLayerFromAsset)
  const duplicatePreviewLayer = usePlayoutStore((state) => state.duplicatePreviewLayer)
  const createPreviewLayer = usePlayoutStore((state) => state.createPreviewLayer)
  const alignPreviewLayers = usePlayoutStore((state) => state.alignPreviewLayers)
  const distributePreviewLayers = usePlayoutStore((state) => state.distributePreviewLayers)
  const undoPreviewScene = usePlayoutStore((state) => state.undoPreviewScene)
  const redoPreviewScene = usePlayoutStore((state) => state.redoPreviewScene)
  const canUndo = usePlayoutStore((state) => state.canUndo)
  const canRedo = usePlayoutStore((state) => state.canRedo)
  const savePreviewTemplate = usePlayoutStore((state) => state.savePreviewTemplate)
  const createBlankTemplate = usePlayoutStore((state) => state.createBlankTemplate)
  const setPreviewCanvasSize = usePlayoutStore((state) => state.setPreviewCanvasSize)
  const exportPreviewTemplatePackage = usePlayoutStore((state) => state.exportPreviewTemplatePackage)
  const restoreTemplateVersion = usePlayoutStore((state) => state.restoreTemplateVersion)
  const autosavePreviewTemplate = usePlayoutStore((state) => state.autosavePreviewTemplate)

  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [isExportingPng, setIsExportingPng] = useState(false)
  const [isNewTemplateOpen, setIsNewTemplateOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [autosavePending, setAutosavePending] = useState(false)
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select')
  const [sidebarTab, setSidebarTab] = useState<'layers' | 'assets'>('layers')
  const [showGrid, setShowGrid] = useState(false)
  const [showSafeZones, setShowSafeZones] = useState(false)
  const [showRulers, setShowRulers] = useState(false)
  const [showGuides, setShowGuides] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [smartSnap, setSmartSnap] = useState(true)
  const [assetEntries, setAssetEntries] = useState<MediaLibraryEntry[]>(() => readMediaEntries('asset'))
  const [fontEntries, setFontEntries] = useState<MediaLibraryEntry[]>(() => readMediaEntries('font'))
  const setTransientStatus = (message: string, timeoutMs = 1800) => {
    setSaveStatus(message)
    window.setTimeout(() => setSaveStatus(''), timeoutMs)
  }

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
  const activeTemplate = templates.find((template) => template.id === previewTemplateId) ?? null
  const availableFontOptions = useMemo(() => {
    const options = new Map<string, string>()

    DEFAULT_FONT_OPTIONS.forEach((option) => {
      options.set(option.value, option.label)
    })

    fontEntries
      .filter((entry) => entry.kind === 'font' && entry.dataUrl)
      .forEach((entry) => {
        const family = entry.fontFamily?.trim()
        if (!family) {
          return
        }

        if (!options.has(family)) {
          options.set(family, family)
        }
      })

    return Array.from(options.entries()).map(([value, label]) => ({ value, label }))
  }, [fontEntries])
  useEffect(() => {
    let cancelled = false

    const hydrateAssets = async () => {
      const entries = await readMediaEntriesAsync('asset')
      if (cancelled) {
        return
      }

      setAssetEntries(entries)
    }

    const hydrateFonts = async () => {
      const loadedEntries = await readMediaEntriesAsync('font')
      const registration = await registerFontEntries(loadedEntries)
      if (cancelled) {
        return
      }

      if (registration.changed) {
        setFontEntries(registration.entries)
        // Persist normalized family names and keep storage in sync.
        persistMediaEntries('font', registration.entries)
        return
      }

      setFontEntries(registration.entries)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === ASSET_STORAGE_KEY) {
        invalidateMediaEntriesCache('asset')
        void hydrateAssets()
        return
      }

      if (event.key === FONT_STORAGE_KEY) {
        invalidateMediaEntriesCache('font')
        void hydrateFonts()
      }
    }

    const onMediaLibraryUpdated = (event: Event) => {
      const payload = (event as CustomEvent<{ kind?: 'asset' | 'font' }>).detail
      if (!payload || payload.kind === 'asset') {
        invalidateMediaEntriesCache('asset')
        void hydrateAssets()
      }

      if (!payload || payload.kind === 'font') {
        invalidateMediaEntriesCache('font')
        void hydrateFonts()
      }
    }

    void hydrateAssets()
    void hydrateFonts()
    window.addEventListener('storage', onStorage)
    window.addEventListener(MEDIA_LIBRARY_UPDATED_EVENT, onMediaLibraryUpdated as EventListener)

    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(MEDIA_LIBRARY_UPDATED_EVENT, onMediaLibraryUpdated as EventListener)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      const active = document.activeElement as HTMLElement | null
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable) return
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
      // Nudges are exact (1px, or 10px with Shift); grid snapping applies to dragging only.
      const nudgeBy = event.shiftKey ? GRID_SNAP_STEP : 1

      if (event.key === 'ArrowLeft') deltaX = -nudgeBy
      if (event.key === 'ArrowRight') deltaX = nudgeBy
      if (event.key === 'ArrowUp') deltaY = -nudgeBy
      if (event.key === 'ArrowDown') deltaY = nudgeBy

      if (deltaX !== 0 || deltaY !== 0) {
        event.preventDefault()
        movePreviewLayersByDelta(selectedIds, { x: deltaX, y: deltaY }, false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeSelectedLayerIds, interactionMode, movePreviewLayersByDelta, redoPreviewScene, undoPreviewScene])

  // Autosave: your own templates save themselves shortly after edits stop (built-ins never change).
  const activeTemplateId = activeTemplate?.id
  const activeIsBuiltIn = Boolean(activeTemplate?.builtIn)
  useEffect(() => {
    if (!activeTemplateId || activeIsBuiltIn) return
    setAutosavePending(true)
    const handle = window.setTimeout(() => {
      autosavePreviewTemplate()
      setAutosavePending(false)
    }, 1500)
    return () => window.clearTimeout(handle)
  }, [scene, activeTemplateId, activeIsBuiltIn, autosavePreviewTemplate])

  // Closing or hiding the tab saves immediately, so no edit is lost.
  useEffect(() => {
    const flush = () => {
      usePlayoutStore.getState().autosavePreviewTemplate()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

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

  // Aligns anchor points: one layer to the canvas, several to each other.
  const handleAlign = (mode: 'left' | 'hCenter' | 'right' | 'top' | 'vMiddle' | 'bottom') => {
    if (selectedLayers.length === 0) return setTransientStatus('Select at least one layer.')
    alignPreviewLayers(activeSelectedLayerIds, mode)
    setTransientStatus(selectedLayers.length === 1 ? 'Aligned anchor to canvas.' : `Aligned ${selectedLayers.length} anchors.`, 1200)
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
    // Your own templates save in place; a built-in is saved as a new copy, so it needs a name.
    const requested =
      activeTemplate && !activeTemplate.builtIn ? activeTemplate.label : window.prompt('Save as a new template', `${activeTemplate?.label ?? scene.name} copy`)
    if (!requested) return
    const savedId = savePreviewTemplate(requested)
    if (!savedId) return setTransientStatus('Template name is required.')
    setTransientStatus(`Saved ${requested.trim()}.`, 2200)
  }
  const handleSaveAsNewTemplate = () => {
    const requested = window.prompt('Save as a new template', `${activeTemplate?.label ?? scene.name} copy`)
    if (!requested) return
    const savedId = savePreviewTemplate(requested, { asNew: true })
    if (!savedId) return setTransientStatus('Template name is required.')
    setTransientStatus(`Saved new template ${requested.trim()}.`, 2200)
  }
  const handleNewTemplate = () => {
    if (canUndo && !window.confirm('Start a new blank template? Unsaved changes to the current design will be lost.')) return
    setIsNewTemplateOpen(true)
  }
  const handleCreateTemplate = (name: string, size: { width: number; height: number }) => {
    setIsNewTemplateOpen(false)
    if (!createBlankTemplate(name, size)) return setTransientStatus('Template name is required.')
    setTransientStatus(`Created ${name} (${size.width} x ${size.height}).`, 2200)
  }
  const handleExportPng = async () => {
    setIsExportingPng(true)
    try {
      const dataUrl = await renderScenePng(scene, story)
      downloadDataUrl(dataUrl, `${slugify(activeTemplate?.label ?? scene.name ?? 'canvas')}-${scene.width}x${scene.height}.png`)
      setTransientStatus(`Exported ${scene.width}×${scene.height} PNG.`, 2200)
    } catch (error) {
      setTransientStatus(`PNG export failed: ${error instanceof Error ? error.message : 'unknown error'}`, 4000)
    } finally {
      setIsExportingPng(false)
    }
  }
  const handleExportPackage = () => {
    const templatePackage = exportPreviewTemplatePackage()
    downloadTemplatePackageFile(templatePackage)
    setTransientStatus(`Exported ${templatePackage.metadata.label}.rltpl.json`, 2200)
  }
  const handleRestoreVersion = (version: number) => {
    if (!activeTemplate) return
    // Save any pending edits first so they become a version rather than being overwritten.
    autosavePreviewTemplate()
    if (!restoreTemplateVersion(activeTemplate.id, version)) return setTransientStatus('Restore failed.')
    setIsHistoryOpen(false)
    setTransientStatus(`Restored v${version}. The previous design is kept in History.`, 2600)
  }
  const handleDropAssetOnCanvas = (entryId: string, position: { x: number; y: number }) => {
    const entry = assetEntries.find((asset) => asset.id === entryId)
    if (!entry || !entry.dataUrl) {
      setTransientStatus('Asset missing data URL. Re-import it in Studio → Library.')
      return
    }
    if (!isPlaceableImageEntry(entry)) {
      setTransientStatus(`${entry.name} is not an image. Import .ai/.pdf files from Templates > Import File.`, 4000)
      return
    }

    const nextLayerId = addPreviewImageLayerFromAsset({
      name: entry.name,
      dataUrl: entry.dataUrl,
      x: position.x,
      y: position.y,
    })

    if (!nextLayerId) {
      setTransientStatus('Unable to create image layer from asset.')
      return
    }

    setSelectedLayerIds([nextLayerId])
    setSelectionAnchorId(nextLayerId)
    setSidebarTab('layers')
    setTransientStatus(`Placed ${entry.name} on stage.`, 1600)
  }

  const handleDuplicateLayer = (layerId: string) => {
    const nextLayerId = duplicatePreviewLayer(layerId)
    if (!nextLayerId) {
      setTransientStatus('Layer is locked and cannot be duplicated.')
      return
    }

    setSelectedLayerIds([nextLayerId])
    setSelectionAnchorId(nextLayerId)
  }

  return (
    <section className="screen screen--design">
      {isHistoryOpen && activeTemplate ? (
        <VersionHistoryDialog template={activeTemplate} story={story} onRestore={handleRestoreVersion} onClose={() => setIsHistoryOpen(false)} />
      ) : null}
      {isNewTemplateOpen ? (
        <NewTemplateDialog
          defaultSize={{ width: scene.width, height: scene.height }}
          onCreate={handleCreateTemplate}
          onCancel={() => setIsNewTemplateOpen(false)}
        />
      ) : null}
      <div className="design-layout">
        <aside className="panel stage-sidebar">
          <div className="sidebar-head">
            <div className="sidebar-heading"><div className="title">STAGE PRO</div><div className="subtitle">STUDIO EDITOR</div></div>
            <div className="icon-row">
              <button type="button" className="icon-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undoPreviewScene}><Undo2 size={15} /></button>
              <button type="button" className="icon-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redoPreviewScene}><Redo2 size={15} /></button>
            </div>
          </div>
          <div className="sidebar-group">
            <div className="sidebar-group__label">Tool</div>
            <div className="pill-toggle">
              <button type="button" className={`pill-toggle__item ${interactionMode === 'select' ? 'pill-toggle__item--active' : ''}`} onClick={() => setInteractionMode('select')}><MousePointer2 size={13} />SELECT</button>
              <button type="button" className={`pill-toggle__item ${interactionMode === 'pan' ? 'pill-toggle__item--active' : ''}`} onClick={() => setInteractionMode('pan')}><Hand size={13} />PAN</button>
            </div>
          </div>
          <div className="sidebar-group">
            <div className="sidebar-group__label">Add Layer</div>
            <div className="creation-grid">{CREATION_ITEMS.map((item) => <button key={item} type="button" className="creation-btn" onClick={() => handleCreateLayer(item)}>{item}</button>)}</div>
          </div>
          <div className="sidebar-tabs sidebar-tabs--stack">
            <button type="button" className={`tab-btn ${sidebarTab === 'layers' ? 'tab-btn--active' : ''}`} onClick={() => setSidebarTab('layers')}>Layers</button>
            <button type="button" className={`tab-btn ${sidebarTab === 'assets' ? 'tab-btn--active' : ''}`} onClick={() => setSidebarTab('assets')}>Assets</button>
          </div>
          {sidebarTab === 'layers' ? (
            <LayerList
              layers={orderedLayers}
              sceneLayers={scene.layers}
              selectedLayerIds={activeSelectedLayerIds}
              onSelect={handleLayerSelection}
              onDuplicate={handleDuplicateLayer}
              onStatus={setTransientStatus}
            />
          ) : (
            <div className="asset-list">
              {assetEntries.length === 0 && fontEntries.length === 0 ? (
                <div className="inspector-empty">No assets found. Upload media in Studio → Library and return here.</div>
              ) : null}
              {assetEntries.length > 0 ? <div className="asset-list__section-title mono">ASSETS</div> : null}
              {assetEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="tree-row asset-row asset-row--draggable"
                  draggable={Boolean(entry.dataUrl)}
                  onDragStart={(event) => {
                    if (!entry.dataUrl) {
                      event.preventDefault()
                      return
                    }
                    event.dataTransfer.effectAllowed = 'copy'
                    event.dataTransfer.setData('application/x-renderless-asset-entry', entry.id)
                  }}
                >
                  <span>{entry.name}</span>
                  <span className="mono asset-row__meta">{entry.dataUrl ? 'DRAG TO STAGE' : 'MISSING DATA'}</span>
                </div>
              ))}
              {fontEntries.length > 0 ? <div className="asset-list__section-title mono">FONTS</div> : null}
              {fontEntries.map((entry) => (
                <div key={entry.id} className="tree-row asset-row">
                  <span>{entry.fontFamily ?? entry.name}</span>
                  <span className="mono asset-row__meta">{entry.dataUrl ? 'FONT READY' : 'FONT MISSING DATA'}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="panel stage-center">
          <div className="stage-toolbar stage-toolbar--top">
            <CanvasSizeSelect
              width={scene.width}
              height={scene.height}
              onChange={(size) => {
                setPreviewCanvasSize(size)
                setTransientStatus(`Canvas set to ${size.width} x ${size.height}. Undo to revert.`, 2200)
              }}
            />
            <div className="stage-toolbar__actions">
              <span className="mono stage-toolbar__template-name">{activeTemplate?.label ?? scene.name} | v{activeTemplate?.version ?? 1}</span>
              <span className={`mono autosave-status ${activeTemplate?.builtIn ? 'autosave-status--builtin' : ''}`.trim()}>
                {!activeTemplate
                  ? ''
                  : activeTemplate.builtIn
                    ? 'Built-in: Save As New to keep changes'
                    : autosavePending
                      ? 'Saving…'
                      : activeTemplate.updatedAt
                        ? `Saved ${new Date(activeTemplate.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                        : 'Saved'}
              </span>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={!activeTemplate || activeTemplate.builtIn}
                title={activeTemplate?.builtIn ? 'Built-in templates have no history. Save As New first.' : 'See and restore earlier versions'}
                onClick={() => {
                  autosavePreviewTemplate()
                  setIsHistoryOpen(true)
                }}
              >
                <History size={14} />
                History
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleNewTemplate}>New Template</button>
              <button type="button" className="btn btn--small btn--accent" onClick={handleSaveTemplate}>Save Template</button>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleSaveAsNewTemplate}>Save As New</button>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleExportPackage}>Export Package</button>
              <button type="button" className="btn btn--small btn--ghost" disabled={isExportingPng} onClick={() => void handleExportPng()} title={`Download a ${scene.width}×${scene.height} PNG of the canvas`}>
                <ImageDown size={14} />
                {isExportingPng ? 'Exporting…' : 'Export PNG'}
              </button>
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
              className={`btn btn--small ${showSafeZones ? 'btn--accent-soft' : 'btn--ghost'}`}
              onClick={() => {
                setShowSafeZones((prev) => !prev)
                setTransientStatus(showSafeZones ? 'Safe zones hidden.' : 'Safe zones shown.', 1100)
              }}
            >
              Safe
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
            <button
              type="button"
              className={`btn btn--small ${smartSnap ? 'btn--accent-soft' : 'btn--ghost'}`}
              title="Snap dragged layers to the canvas edges and center, other layers and visible guides"
              onClick={() => {
                setSmartSnap((prev) => !prev)
                setTransientStatus(smartSnap ? 'Smart snap off.' : 'Smart snap on: canvas, layers and guides.', 1400)
              }}
            >
              Smart
            </button>
            <span className="stage-toolbar__hint mono">
              {snapToGrid ? `GRID ${GRID_SNAP_STEP}px` : 'GRID SNAP OFF'} | ALT = FREE DRAG | ARROWS NUDGE
            </span>
            {saveStatus ? <span className="mono stage-toolbar__save-status">{saveStatus}</span> : null}
          </div>
          <div className="stage-canvas-wrap">
            <StageCanvas
              scene={scene}
              story={story}
              selectedLayerIds={activeSelectedLayerIds}
              onSelectLayer={handleLayerSelection}
              onMoveLayers={movePreviewLayersByDelta}
              onAssetDrop={handleDropAssetOnCanvas}
              interactionMode={interactionMode}
              showGrid={showGrid}
              showRulers={showRulers}
              showGuides={showGuides}
              showSafeZone={showSafeZones}
              snapToGrid={snapToGrid}
              guideStorageKey={previewTemplateId ?? 'unsaved'}
              smartSnap={smartSnap}
              onShowGuides={() => setShowGuides(true)}
            />
          </div>
        </section>

        <LayerInspector
          selectedLayers={selectedLayers}
          activeSelectedLayerIds={activeSelectedLayerIds}
          fontOptions={availableFontOptions}
          onStatus={setTransientStatus}
        />
      </div>
    </section>
  )
}
