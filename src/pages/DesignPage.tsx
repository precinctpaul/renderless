import { useEffect, useMemo, useState } from 'react'
import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignVerticalDistributeCenter,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Redo2,
  Trash2,
  Undo2,
  Unlock,
} from 'lucide-react'
import { StageCanvas } from '../components/StageCanvas'
import { TextBoxInspector } from '../components/TextBoxInspector'
import { NumberField } from '../components/NumberField'
import { AnchorPicker } from '../components/AnchorPicker'
import { anchorPosition, anchorPresetOf, type AnchorPresetId } from '../lib/layerAnchor'
import { LAYER_BLEND_MODES, type DataBindingKey, type LayerBlendMode, type SceneLayer } from '../types/scene'
import { usePlayoutStore } from '../store/playoutStore'
import { resolveBindingValue } from '../lib/bindings'
import { deriveBindingLevel, filterBindingFieldsForLeague, type BindingLevel } from '../lib/leagueBindings'
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
  type MediaLibraryEntry
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
  metricLabel: string
  teamSide?: 'Home' | 'Away'
  playerSlot?: string
  playerName?: string
}

function formatPlayerSlotLabel(slot: string): string {
  const [team, index] = slot.split('.')
  const teamLabel = team === 'Home' ? 'Home' : team === 'Away' ? 'Away' : team
  return index ? `${teamLabel} #${index}` : slot
}

function inferTeamSideFromKey(bindingKey: string): 'Home' | 'Away' | undefined {
  const segments = bindingKey.split('.')
  if (segments.includes('Home')) {
    return 'Home'
  }
  if (segments.includes('Away')) {
    return 'Away'
  }
  return undefined
}

function inferMetricLabel(option: BindingOption): string {
  if (option.level === 'Player' && option.playerName) {
    return `${option.metricLabel} (${option.playerName})`
  }

  if (option.teamSide) {
    return `${option.teamSide} ${option.metricLabel}`
  }

  return option.label
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

/** The shared value across the selection, or null when layers differ ("mixed"). */
function mixedValue(layers: SceneLayer[], read: (layer: SceneLayer) => number): number | null {
  if (layers.length === 0) return null
  const first = read(layers[0])
  return layers.every((layer) => read(layer) === first) ? first : null
}

function mixedAnchorPreset(layers: SceneLayer[]): AnchorPresetId | null {
  if (layers.length === 0) return null
  const first = anchorPresetOf(layers[0])
  return layers.every((layer) => anchorPresetOf(layer) === first) ? first : null
}

export function DesignPage() {
  const scene = usePlayoutStore((state) => state.previewScene)
  const story = usePlayoutStore((state) => state.story)
  const templates = usePlayoutStore((state) => state.templates)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const reorderPreviewLayerToIndex = usePlayoutStore((state) => state.reorderPreviewLayerToIndex)
  const movePreviewLayersByDelta = usePlayoutStore((state) => state.movePreviewLayersByDelta)
  const updatePreviewLayerTransform = usePlayoutStore((state) => state.updatePreviewLayerTransform)
  const updatePreviewLayersTransform = usePlayoutStore((state) => state.updatePreviewLayersTransform)
  const setPreviewLayersPosition = usePlayoutStore((state) => state.setPreviewLayersPosition)
  const setPreviewLayersAnchor = usePlayoutStore((state) => state.setPreviewLayersAnchor)
  const updatePreviewShapeStyle = usePlayoutStore((state) => state.updatePreviewShapeStyle)
  const updatePreviewTextStyle = usePlayoutStore((state) => state.updatePreviewTextStyle)
  const updatePreviewLayerBlendMode = usePlayoutStore((state) => state.updatePreviewLayerBlendMode)
  const updatePreviewTextBinding = usePlayoutStore((state) => state.updatePreviewTextBinding)
  const addPreviewImageLayerFromAsset = usePlayoutStore((state) => state.addPreviewImageLayerFromAsset)
  const duplicatePreviewLayer = usePlayoutStore((state) => state.duplicatePreviewLayer)
  const deletePreviewLayer = usePlayoutStore((state) => state.deletePreviewLayer)
  const togglePreviewLayerVisibility = usePlayoutStore((state) => state.togglePreviewLayerVisibility)
  const togglePreviewLayerLock = usePlayoutStore((state) => state.togglePreviewLayerLock)
  const renamePreviewLayer = usePlayoutStore((state) => state.renamePreviewLayer)
  const createPreviewLayer = usePlayoutStore((state) => state.createPreviewLayer)
  const alignPreviewLayers = usePlayoutStore((state) => state.alignPreviewLayers)
  const distributePreviewLayers = usePlayoutStore((state) => state.distributePreviewLayers)
  const undoPreviewScene = usePlayoutStore((state) => state.undoPreviewScene)
  const redoPreviewScene = usePlayoutStore((state) => state.redoPreviewScene)
  const canUndo = usePlayoutStore((state) => state.canUndo)
  const canRedo = usePlayoutStore((state) => state.canRedo)
  const savePreviewTemplate = usePlayoutStore((state) => state.savePreviewTemplate)
  const createBlankTemplate = usePlayoutStore((state) => state.createBlankTemplate)
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
  const [showGrid, setShowGrid] = useState(false)
  const [showSafeZones, setShowSafeZones] = useState(false)
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
  const [bindingTeamSide, setBindingTeamSide] = useState<'All' | 'Home' | 'Away'>('All')
  const [bindingPlayerSearch, setBindingPlayerSearch] = useState('')
  const [bindingPlayerSlot, setBindingPlayerSlot] = useState<string>('')
  const [bindingMetricQuery, setBindingMetricQuery] = useState('')
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
      const teamSide = inferTeamSideFromKey(field.key)
      const segments = field.key.split('.')
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
        metricLabel: segments.length > 1 ? (segments[segments.length - 1] ?? field.label) : field.label,
        teamSide,
        playerSlot,
        playerName,
      }
    })
  }, [bindingPlayerNamesBySlot, leagueBindingFields])
  const selectedLayerBindingOption = useMemo(() => {
    if (!primarySelectedLayer || primarySelectedLayer.kind !== 'text' || !primarySelectedLayer.binding) {
      return null
    }

    return bindingOptions.find((option) => option.key === primarySelectedLayer.binding) ?? null
  }, [bindingOptions, primarySelectedLayer])
  const availableBindingLevels = useMemo(() => {
    return BINDING_LEVEL_OPTIONS.filter((level) => bindingOptions.some((option) => option.level === level))
  }, [bindingOptions])
  const preferredBindingLevel = selectedLayerBindingOption?.level ?? bindingLevel
  const activeBindingLevel = availableBindingLevels.includes(preferredBindingLevel)
    ? preferredBindingLevel
    : (availableBindingLevels[0] ?? 'Game')
  const bindingTeamSideOptions = useMemo<Array<'All' | 'Home' | 'Away'>>(() => {
    const sides = new Set<'Home' | 'Away'>()
    bindingOptions
      .filter((option) => option.level === activeBindingLevel)
      .forEach((option) => {
        if (option.teamSide) {
          sides.add(option.teamSide)
        }
      })

    const sorted: Array<'Home' | 'Away'> = []
    if (sides.has('Home')) {
      sorted.push('Home')
    }
    if (sides.has('Away')) {
      sorted.push('Away')
    }
    if (sorted.length === 0) {
      return ['All']
    }

    if (activeBindingLevel === 'Player') {
      return sorted
    }

    return ['All', ...sorted]
  }, [activeBindingLevel, bindingOptions])
  const activeBindingTeamSide = bindingTeamSideOptions.includes(bindingTeamSide)
    ? bindingTeamSide
    : (
        selectedLayerBindingOption?.teamSide && bindingTeamSideOptions.includes(selectedLayerBindingOption.teamSide)
          ? selectedLayerBindingOption.teamSide
          : (bindingTeamSideOptions[0] ?? 'All')
      )
  const bindingPlayerOptions = useMemo(() => {
    if (activeBindingLevel !== 'Player') {
      return []
    }

    const bySlot = new Map<string, string>()
    bindingOptions
      .filter((option) => option.level === 'Player')
      .filter((option) => (activeBindingTeamSide === 'All' ? true : option.teamSide === activeBindingTeamSide))
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

    return values
  }, [activeBindingLevel, activeBindingTeamSide, bindingOptions, bindingPlayerSearch])
  const activeBindingPlayerSlot =
    activeBindingLevel === 'Player' && bindingPlayerOptions.some((option) => option.slot === bindingPlayerSlot)
      ? bindingPlayerSlot
      : (
          activeBindingLevel === 'Player' &&
          selectedLayerBindingOption?.playerSlot &&
          bindingPlayerOptions.some((option) => option.slot === selectedLayerBindingOption.playerSlot)
            ? selectedLayerBindingOption.playerSlot
            : (bindingPlayerOptions[0]?.slot ?? '')
        )
  const filteredBindingOptions = useMemo(() => {
    const query = bindingMetricQuery.trim().toLowerCase()
    return bindingOptions
      .filter((option) => option.level === activeBindingLevel)
      .filter((option) => (activeBindingTeamSide === 'All' ? true : option.teamSide === activeBindingTeamSide))
      .filter((option) => {
        if (activeBindingLevel !== 'Player') {
          return true
        }
        return option.playerSlot === activeBindingPlayerSlot
      })
      .filter((option) => {
        if (!query) {
          return true
        }
        const playerName = option.playerName?.toLowerCase() ?? ''
        return (
          option.label.toLowerCase().includes(query) ||
          option.key.toLowerCase().includes(query) ||
          option.metricLabel.toLowerCase().includes(query) ||
          playerName.includes(query)
        )
      })
      .sort((left, right) => {
        const byMetric = left.metricLabel.localeCompare(right.metricLabel)
        if (byMetric !== 0) {
          return byMetric
        }

        const leftName = left.playerName ?? ''
        const rightName = right.playerName ?? ''
        return leftName.localeCompare(rightName)
      })
  }, [activeBindingLevel, activeBindingPlayerSlot, activeBindingTeamSide, bindingMetricQuery, bindingOptions])
  const metricSelectOptions = useMemo(() => {
    const byKey = new Map<string, BindingOption>()
    filteredBindingOptions.forEach((option) => {
      byKey.set(option.key, option)
    })

    if (primarySelectedLayer && primarySelectedLayer.kind === 'text' && primarySelectedLayer.binding) {
      const current = bindingOptions.find((option) => option.key === primarySelectedLayer.binding)
      if (current) {
        byKey.set(current.key, current)
      }
    }

    return [...byKey.values()].sort((left, right) => inferMetricLabel(left).localeCompare(inferMetricLabel(right)))
  }, [bindingOptions, filteredBindingOptions, primarySelectedLayer])
  const selectedBindingOption = selectedLayerBindingOption

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

  // Typed values apply exactly; grid snapping is for dragging only.
  const commitPosition = (field: 'x' | 'y', value: number) => {
    if (selectedLayers.length === 0) return
    setPreviewLayersPosition(activeSelectedLayerIds, { [field]: value })
  }
  const commitAnchor = (field: 'x' | 'y', value: number) => {
    if (selectedLayers.length === 0) return
    setPreviewLayersAnchor(activeSelectedLayerIds, { [field]: value })
  }
  const commitTransform = (field: 'width' | 'height', numberValue: number) => {
    if (selectedLayers.length === 0) return

    if (selectedLayers.length === 1 && primarySelectedLayer) {
      updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: numberValue })
      return
    }

    updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: numberValue })
  }
  const commitAdvanced = (field: 'rotation' | 'scaleX' | 'scaleY' | 'opacity', numberValue: number) => {
    if (selectedLayers.length === 0) return

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
  const handleSaveAsNewTemplate = () => {
    const requested = window.prompt('Save as a new template', `${activeTemplate?.label ?? scene.name} copy`)
    if (!requested) return
    const savedId = savePreviewTemplate(requested, { asNew: true })
    if (!savedId) return setTransientStatus('Template name is required.')
    setTransientStatus(`Saved new template ${requested.trim()}.`, 2200)
  }
  const handleNewTemplate = () => {
    if (canUndo && !window.confirm('Start a new blank template? Unsaved changes to the current design will be lost.')) return
    const requested = window.prompt('New template name', 'Untitled Template')
    if (!requested) return
    if (!createBlankTemplate(requested)) return setTransientStatus('Template name is required.')
    setTransientStatus(`Created ${requested.trim()} (1920 x 1080).`, 2200)
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

  const handleDropAssetOnCanvas = (entryId: string, position: { x: number; y: number }) => {
    const entry = assetEntries.find((asset) => asset.id === entryId)
    if (!entry || !entry.dataUrl) {
      setTransientStatus('Asset missing data URL. Re-import from Dashboard.')
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

  const bindingPreviewValue =
    primarySelectedLayer && primarySelectedLayer.kind === 'text' && primarySelectedLayer.binding
      ? resolveBindingValue(primarySelectedLayer.binding, story)
      : ''

  return (
    <section className="screen screen--design">
      <div className="design-layout">
        <aside className="panel stage-sidebar">
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
          <div className="sidebar-tabs sidebar-tabs--stack">
            <button type="button" className={`tab-btn ${sidebarTab === 'layers' ? 'tab-btn--active' : ''}`} onClick={() => setSidebarTab('layers')}>Layers</button>
            <button type="button" className={`tab-btn ${sidebarTab === 'assets' ? 'tab-btn--active' : ''}`} onClick={() => setSidebarTab('assets')}>Assets</button>
          </div>
          {sidebarTab === 'layers' ? (
            <div className="layer-list">
              {orderedLayers.map((layer) => {
                const isSelected = activeSelectedLayerIds.includes(layer.id)
                const classes = `layer-item ${isSelected ? 'layer-item--active' : ''} ${draggingLayerId === layer.id ? 'layer-item--dragging' : ''} ${dragTargetLayerId === layer.id && draggingLayerId !== layer.id ? 'layer-item--drop-target' : ''}`
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
                      className={`layer-item__handle ${layer.locked ? 'layer-item__handle--disabled' : ''}`.trim()}
                      title={layer.locked ? 'Unlock layer to reorder' : 'Drag to reorder layer'}
                      aria-label={layer.locked ? 'Layer locked' : 'Drag layer to reorder'}
                    >
                      <GripVertical size={14} />
                    </button>
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
                          handleDuplicateLayer(layer.id)
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
          ) : (
            <div className="asset-list">
              {assetEntries.length === 0 && fontEntries.length === 0 ? (
                <div className="inspector-empty">No assets found. Upload media in Dashboard and return here.</div>
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
            <span className="mono">CANVAS {scene.width} x {scene.height}</span>
            <div className="stage-toolbar__actions">
              <span className="mono stage-toolbar__template-name">{activeTemplate?.label ?? scene.name} | v{activeTemplate?.version ?? 1}</span>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleNewTemplate}>New Template</button>
              <button type="button" className="btn btn--small btn--accent" onClick={handleSaveTemplate}>Save Template</button>
              <button type="button" className="btn btn--small btn--ghost" onClick={handleSaveAsNewTemplate}>Save As New</button>
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
            />
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
                    <textarea
                      rows={Math.min(4, Math.max(2, primarySelectedLayer.text.split('\n').length))}
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
                    <NumberField
                      min={8}
                      value={primarySelectedLayer.fontSize}
                      onCommit={(value) => updatePreviewTextStyle(primarySelectedLayer.id, { fontSize: value })}
                    />
                  </label>
                  <label>
                    Line Height
                    <NumberField
                      min={0.5}
                      max={4}
                      step={0.05}
                      value={primarySelectedLayer.lineHeight ?? 1}
                      onCommit={(value) => updatePreviewTextStyle(primarySelectedLayer.id, { lineHeight: value })}
                    />
                  </label>
                  <label>
                    Align
                    <select
                      className="mono"
                      value={primarySelectedLayer.align ?? 'left'}
                      onChange={(event) =>
                        updatePreviewTextStyle(primarySelectedLayer.id, { align: event.target.value as 'left' | 'center' | 'right' })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {primarySelectedLayer?.kind === 'text' ? (
                <TextBoxInspector
                  box={primarySelectedLayer.box}
                  onChange={(box) => updatePreviewTextStyle(primarySelectedLayer.id, { box })}
                />
              ) : null}
              <div className="inspector-section">
                <div className="inspector-section__label">Transform</div>
                <div className="anchor-row">
                  <AnchorPicker
                    value={mixedAnchorPreset(selectedLayers)}
                    onChange={(preset) => setPreviewLayersAnchor(activeSelectedLayerIds, { preset })}
                  />
                  <div className="anchor-row__hint">Anchor point. X and Y are where the anchor sits; picking a point never moves the layer.</div>
                </div>
                <div className="transform-grid">
                  <label>X<NumberField value={mixedValue(selectedLayers, (layer) => anchorPosition(layer).x)} placeholder="mixed" onCommit={(value) => commitPosition('x', value)} /></label>
                  <label>Y<NumberField value={mixedValue(selectedLayers, (layer) => anchorPosition(layer).y)} placeholder="mixed" onCommit={(value) => commitPosition('y', value)} /></label>
                  <label>W<NumberField min={1} value={mixedValue(selectedLayers, (layer) => layer.width)} placeholder="mixed" onCommit={(value) => commitTransform('width', value)} /></label>
                  <label>H<NumberField min={1} value={mixedValue(selectedLayers, (layer) => layer.height)} placeholder="mixed" onCommit={(value) => commitTransform('height', value)} /></label>
                  <label>Anchor X<NumberField value={mixedValue(selectedLayers, (layer) => layer.anchorX ?? 0)} placeholder="mixed" onCommit={(value) => commitAnchor('x', value)} /></label>
                  <label>Anchor Y<NumberField value={mixedValue(selectedLayers, (layer) => layer.anchorY ?? 0)} placeholder="mixed" onCommit={(value) => commitAnchor('y', value)} /></label>
                  <label>Scale X<NumberField value={mixedValue(selectedLayers, (layer) => layer.scaleX ?? 100)} placeholder="mixed" onCommit={(value) => commitAdvanced('scaleX', value)} /></label>
                  <label>Scale Y<NumberField value={mixedValue(selectedLayers, (layer) => layer.scaleY ?? 100)} placeholder="mixed" onCommit={(value) => commitAdvanced('scaleY', value)} /></label>
                  <label>Rotation<NumberField value={mixedValue(selectedLayers, (layer) => layer.rotation ?? 0)} placeholder="mixed" onCommit={(value) => commitAdvanced('rotation', value)} /></label>
                  <label>Opacity<NumberField min={0} max={100} value={mixedValue(selectedLayers, (layer) => asPercent(layer.opacity))} placeholder="mixed" onCommit={(value) => commitAdvanced('opacity', value)} /></label>
                </div>
                {primarySelectedLayer && selectedLayers.length === 1 ? (
                  <label>
                    Blend
                    <select
                      className="mono"
                      value={primarySelectedLayer.blendMode ?? 'normal'}
                      onChange={(event) => updatePreviewLayerBlendMode(primarySelectedLayer.id, event.target.value as LayerBlendMode)}
                    >
                      {LAYER_BLEND_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode.replace(/-/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                ) : primarySelectedLayer && primarySelectedLayer.kind === 'image' ? (
                  <>
                    <label>
                      Source
                      <input className="mono" value={primarySelectedLayer.src} readOnly />
                    </label>
                    <div className="binding-preview mono">FIT: {(primarySelectedLayer.fit ?? 'contain').toUpperCase()}</div>
                    <div className="inspector-empty">Image layer styling currently uses default contain fit.</div>
                  </>
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
                        Category
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
                      {bindingTeamSideOptions.length > 1 ? (
                        <label>
                          Team Side
                          <select
                            className="mono"
                            value={activeBindingTeamSide}
                            onChange={(event) => setBindingTeamSide(event.target.value as 'All' | 'Home' | 'Away')}
                          >
                            {bindingTeamSideOptions.map((teamSide) => (
                              <option key={teamSide} value={teamSide}>
                                {teamSide === 'All' ? 'All teams' : `${teamSide} team`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {activeBindingLevel === 'Player' ? (
                        <>
                          <label>
                            Player Search
                            <input
                              value={bindingPlayerSearch}
                              onChange={(event) => setBindingPlayerSearch(event.target.value)}
                              placeholder="Search players in selected team..."
                            />
                          </label>
                          <label>
                            Player
                            <select
                              className="mono"
                              value={activeBindingPlayerSlot}
                              onChange={(event) => setBindingPlayerSlot(event.target.value)}
                            >
                              {bindingPlayerOptions.length === 0 ? (
                                <option value="">No players in current context</option>
                              ) : null}
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
                          placeholder={`Search ${activeBindingLevel.toLowerCase()} metrics...`}
                        />
                      </label>
                      <label>
                        Metric
                        <select
                          className="mono"
                          value={primarySelectedLayer.binding ?? ''}
                          onChange={(event) => {
                            const nextKey = event.target.value.trim()
                            updatePreviewTextBinding(primarySelectedLayer.id, nextKey ? (nextKey as DataBindingKey) : null)
                          }}
                        >
                          <option value="">Choose metric...</option>
                          {metricSelectOptions.map((option) => (
                            <option key={option.key} value={option.key}>
                              {inferMetricLabel(option)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="binding-panel__meta mono">
                        {simulationLeague} | {activeBindingLevel}
                        {activeBindingTeamSide !== 'All' ? ` | ${activeBindingTeamSide}` : ''} | {filteredBindingOptions.length} metrics in view
                      </div>
                    </div>
                    <div className="binding-preview mono">
                      {primarySelectedLayer.binding
                        ? `TOKEN: ${primarySelectedLayer.binding} = ${bindingPreviewValue || 'n/a'}`
                        : 'TOKEN: none selected'}
                    </div>
                    {selectedBindingOption ? (
                      <div className="binding-preview mono">
                        ACTIVE: {selectedBindingOption.level}
                        {selectedBindingOption.teamSide ? ` | ${selectedBindingOption.teamSide}` : ''}
                        {selectedBindingOption.playerName ? ` | ${selectedBindingOption.playerName}` : ''} | {selectedBindingOption.metricLabel}
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
