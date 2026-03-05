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
import { resolveBindingValue } from '../lib/bindings'
import { deriveBindingLevel, filterBindingFieldsForLeague, type BindingLevel } from '../lib/leagueBindings'
import type { TemplatePackage } from '../lib/templatePackages'
import {
  ASSET_STORAGE_KEY,
  FONT_STORAGE_KEY,
  buildEntriesFromFiles,
  persistMediaEntries,
  readMediaEntries,
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

interface BindingOption {
  key: string
  label: string
  level: BindingLevel
  scope: string
  playerSlot?: string
  playerName?: string
}

function formatPlayerSlotLabel(slot: string): string {
  const [team, index] = slot.split('.')
  const teamLabel = team === 'Home' ? 'Home' : team === 'Away' ? 'Away' : team
  return index ? `${teamLabel} #${index}` : slot
}

const toNumberOrNull = (value: string) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}
const asPercent = (opacity: number) => Math.round(opacity * 100)
const fromPercent = (percent: number) => Math.min(Math.max(percent, 0), 100) / 100
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template-package'
const GRID_SNAP_STEP = 10
const BINDING_LEVEL_OPTIONS: BindingLevel[] = ['Game', 'Team', 'Player', 'Analytics', 'Graphics', 'Stories', 'RecentEvents', 'Context', 'Core']
const DEFAULT_FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
]

function bindingScopeForField(fieldKey: string, level: BindingLevel): string {
  if (level === 'Game') {
    return 'Game'
  }

  if (level === 'Team') {
    if (fieldKey.startsWith('Teams.Home.') || fieldKey.startsWith('Analytics.Team.Home.')) return 'Home team'
    if (fieldKey.startsWith('Teams.Away.') || fieldKey.startsWith('Analytics.Team.Away.')) return 'Away team'
    if (fieldKey.startsWith('Graphics.Momentum.Home') || fieldKey.startsWith('Graphics.Dominance.Home')) return 'Home team'
    if (fieldKey.startsWith('Graphics.Momentum.Away') || fieldKey.startsWith('Graphics.Dominance.Away')) return 'Away team'
    return 'Team global'
  }

  if (level === 'Player') {
    if (fieldKey.startsWith('Players.Home.')) return 'Home players'
    if (fieldKey.startsWith('Players.Away.')) return 'Away players'
    if (fieldKey.startsWith('Analytics.Player.')) return 'Player analytics'
    return 'Players'
  }

  if (level === 'Analytics') {
    if (fieldKey.startsWith('Analytics.Game.')) return 'Game analytics'
    if (fieldKey.startsWith('Analytics.Team.Home.')) return 'Home team analytics'
    if (fieldKey.startsWith('Analytics.Team.Away.')) return 'Away team analytics'
    if (fieldKey.startsWith('Analytics.Player.')) return 'Player analytics'
    return 'Analytics'
  }

  if (level === 'Graphics') {
    return fieldKey.split('.')[1] ?? 'Graphics'
  }

  if (level === 'Stories') {
    return fieldKey.split('.')[1] ?? 'Stories'
  }

  if (level === 'RecentEvents') {
    return 'Recent events'
  }

  if (level === 'Context') {
    return fieldKey.split('.')[1] ?? 'Context'
  }

  return 'Core'
}

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

function mixedOpacity(layers: SceneLayer[]): string {
  if (layers.length === 0) return ''
  const first = asPercent(layers[0].opacity)
  return layers.every((layer) => asPercent(layer.opacity) === first) ? String(first) : ''
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
  const bindingFields = usePlayoutStore((state) => state.bindingFields)
  const simulationLeague = usePlayoutStore((state) => state.simulationLeague)

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
  const [assetEntries, setAssetEntries] = useState<MediaLibraryEntry[]>(() => readMediaEntries('asset'))
  const [fontEntries, setFontEntries] = useState<MediaLibraryEntry[]>(() => readMediaEntries('font'))
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [isInspectorRenaming, setIsInspectorRenaming] = useState(false)
  const [inspectorRenameDraft, setInspectorRenameDraft] = useState('')
  const [bindingLevel, setBindingLevel] = useState<BindingLevel>('Game')
  const [bindingScope, setBindingScope] = useState<string>('All scopes')
  const [bindingPlayerSearch, setBindingPlayerSearch] = useState('')
  const [bindingPlayerSlot, setBindingPlayerSlot] = useState<string>('All players')
  const [bindingMetricQuery, setBindingMetricQuery] = useState('')
  const assetInputRef = useRef<HTMLInputElement | null>(null)
  const fontInputRef = useRef<HTMLInputElement | null>(null)
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
  const primarySelectedLayer = selectedLayers[0] ?? null
  const activeTemplate = templates.find((template) => template.id === previewTemplateId) ?? null
  const versionHistory = activeTemplate?.versions ?? []
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
  const inspectorFontOptions = useMemo(() => {
    if (!primarySelectedLayer || primarySelectedLayer.kind !== 'text') {
      return availableFontOptions
    }

    if (availableFontOptions.some((option) => option.value === primarySelectedLayer.fontFamily)) {
      return availableFontOptions
    }

    return [{ value: primarySelectedLayer.fontFamily, label: primarySelectedLayer.fontFamily }, ...availableFontOptions]
  }, [availableFontOptions, primarySelectedLayer])
  const leagueBindingFields = useMemo(
    () => filterBindingFieldsForLeague(bindingFields, simulationLeague),
    [bindingFields, simulationLeague],
  )
  const bindingPlayerNameSignature = useMemo(() => {
    const entries: Array<[string, string]> = []

    leagueBindingFields.forEach((field) => {
      const match = field.key.match(/^Players\.(Home|Away)\.(\d+)\.Name$/)
      if (!match) {
        return
      }

      const value = story.bindings?.[field.key]
      if (typeof value !== 'string') {
        return
      }

      const trimmed = value.trim()
      if (!trimmed) {
        return
      }

      entries.push([`${match[1]}.${match[2]}`, trimmed])
    })

    entries.sort((left, right) => left[0].localeCompare(right[0]))
    return JSON.stringify(entries)
  }, [leagueBindingFields, story.bindings])
  const bindingPlayerNamesBySlot = useMemo(() => {
    const entries = JSON.parse(bindingPlayerNameSignature) as Array<[string, string]>
    return new Map<string, string>(entries)
  }, [bindingPlayerNameSignature])
  const bindingOptions = useMemo<BindingOption[]>(() => {
    return leagueBindingFields.map((field) => {
      const level = deriveBindingLevel(field.key)
      const scope = bindingScopeForField(field.key, level)
      let playerSlot: string | undefined
      let playerName: string | undefined

      if (field.key.startsWith('Players.Home.') || field.key.startsWith('Players.Away.')) {
        const match = field.key.match(/^Players\.(Home|Away)\.(\d+)\./)
        if (match) {
          playerSlot = `${match[1]}.${match[2]}`
          playerName = bindingPlayerNamesBySlot.get(playerSlot)
        }
      }

      return {
        key: field.key,
        label: field.label,
        level,
        scope,
        playerSlot,
        playerName,
      }
    })
  }, [bindingPlayerNamesBySlot, leagueBindingFields])
  const availableBindingLevels = useMemo(() => {
    return BINDING_LEVEL_OPTIONS.filter((level) => bindingOptions.some((option) => option.level === level))
  }, [bindingOptions])
  const activeBindingLevel = availableBindingLevels.includes(bindingLevel)
    ? bindingLevel
    : (availableBindingLevels[0] ?? 'Game')
  const bindingScopeOptions = useMemo(() => {
    const scopes = new Set<string>()
    bindingOptions
      .filter((option) => option.level === activeBindingLevel)
      .forEach((option) => {
        scopes.add(option.scope)
      })

    return ['All scopes', ...Array.from(scopes).sort((left, right) => left.localeCompare(right))]
  }, [activeBindingLevel, bindingOptions])
  const activeBindingScope = bindingScopeOptions.includes(bindingScope) ? bindingScope : 'All scopes'
  const bindingPlayerOptions = useMemo(() => {
    if (activeBindingLevel !== 'Player') {
      return []
    }

    const bySlot = new Map<string, string>()
    bindingOptions
      .filter((option) => option.level === 'Player')
      .forEach((option) => {
        if (!option.playerSlot) {
          return
        }

        const nextLabel = option.playerName || formatPlayerSlotLabel(option.playerSlot)
        if (!bySlot.has(option.playerSlot)) {
          bySlot.set(option.playerSlot, nextLabel)
        }
      })

    const search = bindingPlayerSearch.trim().toLowerCase()
    const values = Array.from(bySlot.entries())
      .map(([slot, label]) => ({ slot, label }))
      .filter((entry) => {
        if (!search) {
          return true
        }
        return entry.label.toLowerCase().includes(search) || entry.slot.toLowerCase().includes(search)
      })
      .sort((left, right) => left.label.localeCompare(right.label))

    return [{ slot: 'All players', label: 'All players' }, ...values]
  }, [activeBindingLevel, bindingOptions, bindingPlayerSearch])
  const activeBindingPlayerSlot =
    activeBindingLevel === 'Player' && bindingPlayerOptions.some((option) => option.slot === bindingPlayerSlot)
      ? bindingPlayerSlot
      : 'All players'
  const filteredBindingOptions = useMemo(() => {
    const query = bindingMetricQuery.trim().toLowerCase()
    return bindingOptions
      .filter((option) => option.level === activeBindingLevel)
      .filter((option) => (activeBindingScope === 'All scopes' ? true : option.scope === activeBindingScope))
      .filter((option) => {
        if (activeBindingLevel !== 'Player' || activeBindingPlayerSlot === 'All players') {
          return true
        }
        return option.playerSlot === activeBindingPlayerSlot
      })
      .filter((option) => {
        if (!query) {
          return true
        }
        return option.label.toLowerCase().includes(query) || option.key.toLowerCase().includes(query)
      })
      .sort((left, right) => left.label.localeCompare(right.label))
  }, [activeBindingLevel, activeBindingPlayerSlot, activeBindingScope, bindingMetricQuery, bindingOptions])
  const groupedBindingOptions = useMemo(() => {
    const byScope = new Map<string, BindingOption[]>()
    filteredBindingOptions.forEach((option) => {
      const existing = byScope.get(option.scope)
      if (existing) {
        existing.push(option)
      } else {
        byScope.set(option.scope, [option])
      }
    })

    return [...byScope.entries()]
      .map(([scope, options]) => ({
        scope,
        options: options.sort((left, right) => left.label.localeCompare(right.label)),
      }))
      .sort((left, right) => left.scope.localeCompare(right.scope))
  }, [filteredBindingOptions])
  const selectedBindingOption = useMemo(() => {
    if (!primarySelectedLayer || primarySelectedLayer.kind !== 'text' || !primarySelectedLayer.binding) {
      return null
    }

    return (
      bindingOptions.find((option) => option.key === primarySelectedLayer.binding) ??
      filteredBindingOptions.find((option) => option.key === primarySelectedLayer.binding) ??
      null
    )
  }, [bindingOptions, filteredBindingOptions, primarySelectedLayer])

  const persistAssets = (nextEntries: MediaLibraryEntry[]) => {
    setAssetEntries(nextEntries)
    const persisted = persistMediaEntries('asset', nextEntries)
    if (!persisted.ok) {
      setTransientStatus(persisted.error ?? 'Asset persistence failed.')
    }
  }

  const persistFonts = (nextEntries: MediaLibraryEntry[]) => {
    setFontEntries(nextEntries)
    const persisted = persistMediaEntries('font', nextEntries)
    if (!persisted.ok) {
      setTransientStatus(persisted.error ?? 'Font persistence failed.')
    }
  }

  useEffect(() => {
    let cancelled = false

    const hydrateFonts = async () => {
      const registration = await registerFontEntries(readMediaEntries('font'))
      if (cancelled) {
        return
      }

      if (registration.changed) {
        setFontEntries(registration.entries)
        const persisted = persistMediaEntries('font', registration.entries)
        if (!persisted.ok) {
          setSaveStatus(persisted.error ?? 'Font persistence failed.')
          window.setTimeout(() => setSaveStatus(''), 1800)
        }
        return
      }

      setFontEntries(registration.entries)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === ASSET_STORAGE_KEY) {
        setAssetEntries(readMediaEntries('asset'))
        return
      }

      if (event.key === FONT_STORAGE_KEY) {
        void hydrateFonts()
      }
    }

    void hydrateFonts()
    window.addEventListener('storage', onStorage)

    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
    }
  }, [])

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
  const commitAdvanced = (field: 'rotation' | 'anchorX' | 'anchorY' | 'scaleX' | 'scaleY' | 'opacity', value: string) => {
    const numberValue = toNumberOrNull(value)
    if (numberValue === null || selectedLayers.length === 0) return

    const normalizedValue = field === 'opacity' ? fromPercent(numberValue) : numberValue

    if (selectedLayers.length === 1 && primarySelectedLayer) {
      updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: normalizedValue })
      return
    }

    updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: normalizedValue })
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

  const handleAssetUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    const { entries, rejectedFiles } = await buildEntriesFromFiles(Array.from(files), 'asset', 'Stage Pro')
    if (entries.length > 0) {
      persistAssets([...entries, ...assetEntries])
      setSidebarTab('assets')
    }

    if (entries.length > 0 && rejectedFiles.length === 0) {
      setTransientStatus(`Imported ${entries.length} asset file(s).`, 2200)
      return
    }

    if (entries.length > 0) {
      setTransientStatus(`Imported ${entries.length} asset file(s), rejected ${rejectedFiles.length}.`, 2200)
      return
    }

    setTransientStatus('Asset import failed.')
  }

  const handleFontUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    const { entries, rejectedFiles } = await buildEntriesFromFiles(Array.from(files), 'font', 'Stage Pro')
    const registration = await registerFontEntries(entries)

    if (registration.entries.length > 0) {
      persistFonts([...registration.entries, ...fontEntries])
      setSidebarTab('assets')
    }

    const loadedCount = registration.entries.length - registration.failed
    if (loadedCount > 0) {
      setTransientStatus(
        `Imported ${loadedCount} font file(s)${rejectedFiles.length > 0 ? `, rejected ${rejectedFiles.length}` : ''}${registration.failed > 0 ? `, failed ${registration.failed}` : ''}.`,
        2400,
      )
      return
    }

    if (rejectedFiles.length > 0 || registration.failed > 0) {
      setTransientStatus(
        `Font import failed${rejectedFiles.length > 0 ? `, rejected ${rejectedFiles.length}` : ''}${registration.failed > 0 ? `, failed ${registration.failed}` : ''}.`,
        2400,
      )
      return
    }

    setTransientStatus('No fonts imported.')
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
            <div className="asset-list">
              {assetEntries.length === 0 && fontEntries.length === 0 ? (
                <div className="inspector-empty">No assets or fonts uploaded yet.</div>
              ) : null}
              {assetEntries.map((entry) => (
                <div key={entry.id} className="tree-row asset-row">
                  <span>{entry.name}</span>
                  <span className="mono asset-row__meta">{entry.dataUrl ? 'ASSET' : 'MISSING DATA'}</span>
                </div>
              ))}
              {fontEntries.map((entry) => (
                <div key={entry.id} className="tree-row asset-row">
                  <span>{entry.fontFamily ?? entry.name}</span>
                  <span className="mono asset-row__meta">{entry.dataUrl ? 'FONT READY' : 'FONT MISSING DATA'}</span>
                </div>
              ))}
            </div>
          )}
          <div className="asset-upload-group">
            <button type="button" className="btn btn--ghost btn--small" onClick={() => assetInputRef.current?.click()}>
              <Upload size={14} />
              Upload Asset
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => fontInputRef.current?.click()}>
              <Upload size={14} />
              Upload Font
            </button>
          </div>
          <input
            ref={assetInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.svg,.png,.jpg,.jpeg,.webp"
            style={{ display: 'none' }}
            multiple
            onChange={(event) => {
              void handleAssetUpload(event.target.files)
              event.target.value = ''
            }}
          />
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            style={{ display: 'none' }}
            multiple
            onChange={(event) => {
              void handleFontUpload(event.target.files)
              event.target.value = ''
            }}
          />
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
              {selectedLayers.length === 1 && primarySelectedLayer?.kind === 'text' ? (
                <div className="inspector-section">
                  <div className="inspector-section__label">Text Style</div>
                  <label>
                    Text
                    <input
                      value={primarySelectedLayer.text}
                      onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { text: event.target.value })}
                    />
                  </label>
                  <label>
                    Font Family
                    <select
                      className="mono"
                      value={primarySelectedLayer.fontFamily}
                      onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { fontFamily: event.target.value })}
                    >
                      {inspectorFontOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
                        const numberValue = toNumberOrNull(event.target.value)
                        if (numberValue !== null) {
                          updatePreviewTextStyle(primarySelectedLayer.id, { fontSize: numberValue })
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}
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
                  <label>Opacity<input className="mono" type="number" min={0} max={100} value={mixedOpacity(selectedLayers)} placeholder="mixed" onChange={(event) => commitAdvanced('opacity', event.target.value)} /></label>
                </div>
              </div>
              <div className="inspector-section">
                <div className="inspector-section__label">Binding & Style</div>
                {selectedLayers.length > 1 ? (
                  <div className="inspector-empty">Layer-specific binding and style editing is available for single-layer selection only.</div>
                ) : primarySelectedLayer && primarySelectedLayer.kind === 'shape' ? (
                  <label>
                    Fill
                    <input className="mono" value={primarySelectedLayer.fill} onChange={(event) => updatePreviewShapeStyle(primarySelectedLayer.id, { fill: event.target.value })} />
                  </label>
                ) : primarySelectedLayer ? (
                  <>
                    <div className="binding-panel">
                      <div className="inspector-section__label">Data Binding</div>
                      <label>
                        Source
                        <select className="mono" value="live-feed" disabled>
                          <option value="live-feed">Live Feed ({simulationLeague})</option>
                        </select>
                      </label>
                      <label>
                        Level
                        <select
                          className="mono"
                          value={activeBindingLevel}
                          onChange={(event) => setBindingLevel(event.target.value as BindingLevel)}
                        >
                          {availableBindingLevels.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Scope
                        <select className="mono" value={activeBindingScope} onChange={(event) => setBindingScope(event.target.value)}>
                          {bindingScopeOptions.map((scope) => (
                            <option key={scope} value={scope}>
                              {scope}
                            </option>
                          ))}
                        </select>
                      </label>
                      {activeBindingLevel === 'Player' ? (
                        <>
                          <label>
                            Player Search
                            <input
                              value={bindingPlayerSearch}
                              onChange={(event) => setBindingPlayerSearch(event.target.value)}
                              placeholder="Search players..."
                            />
                          </label>
                          <label>
                            Player
                            <select
                              className="mono"
                              value={activeBindingPlayerSlot}
                              onChange={(event) => setBindingPlayerSlot(event.target.value)}
                            >
                              {bindingPlayerOptions.map((player) => (
                                <option key={player.slot} value={player.slot}>
                                  {player.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </>
                      ) : null}
                      <label>
                        Metric Search
                        <input
                          value={bindingMetricQuery}
                          onChange={(event) => setBindingMetricQuery(event.target.value)}
                          placeholder="Search metrics in current level/scope..."
                        />
                      </label>
                      <div className="binding-metric-browser" role="listbox" aria-label="Metric Browser">
                        {groupedBindingOptions.length === 0 ? (
                          <div className="inspector-empty">No metrics in the current level/scope/player view.</div>
                        ) : (
                          groupedBindingOptions.map((group) => (
                            <section key={group.scope} className="binding-metric-group">
                              <header className="binding-metric-group__header mono">
                                {group.scope}
                                <span>{group.options.length}</span>
                              </header>
                              <div className="binding-metric-group__rows">
                                {group.options.map((option) => {
                                  const isActive = primarySelectedLayer.binding === option.key
                                  return (
                                    <button
                                      key={option.key}
                                      type="button"
                                      className={`binding-metric-row ${isActive ? 'binding-metric-row--active' : ''}`.trim()}
                                      onClick={() => updatePreviewTextBinding(primarySelectedLayer.id, option.key as DataBindingKey)}
                                    >
                                      <span className="binding-metric-row__label">
                                        {option.playerName ? `${option.playerName} | ${option.label}` : option.label}
                                      </span>
                                      <span className="binding-metric-row__token mono">{option.key}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </section>
                          ))
                        )}
                      </div>
                      <div className="binding-panel__meta mono">
                        {simulationLeague} | {filteredBindingOptions.length} metrics in current view
                      </div>
                    </div>
                    <div className="binding-preview mono">
                      {primarySelectedLayer.binding
                        ? `TOKEN: ${primarySelectedLayer.binding} = ${bindingPreviewValue || 'n/a'}`
                        : 'TOKEN: none selected'}
                    </div>
                    {selectedBindingOption ? (
                      <div className="binding-preview mono">
                        ACTIVE: {selectedBindingOption.scope}
                        {selectedBindingOption.playerName ? ` | ${selectedBindingOption.playerName}` : ''} | {selectedBindingOption.label}
                      </div>
                    ) : null}
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
