import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileImage,
  FileText,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Play,
  Puzzle,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlayoutStore } from '../store/playoutStore'
import type { TemplateDefinition } from '../types/scene'
import { SceneRenderer } from '../components/SceneRenderer'
import {
  ASSET_STORAGE_KEY,
  FONT_STORAGE_KEY,
  MEDIA_LIBRARY_UPDATED_EVENT,
  buildEntriesFromFiles,
  isDesignFileName,
  invalidateMediaEntriesCache,
  persistMediaEntries,
  readMediaEntries,
  readMediaEntriesAsync,
  registerFontEntries,
  type MediaLibraryEntry,
} from '../lib/mediaLibrary'
import {
  createDesignImportDraft,
  isDesignImportFile,
  isLikelyLottieJsonPayload,
  isTemplatePackageFile,
  materializeTemplateFromDraft,
  type DesignImportDraft,
} from '../lib/importPipeline'

const DASHBOARD_FOLDER_STORAGE_KEY = 'renderless.dashboard.folders.v1'
const FOLDER_DRAG_MIME = 'application/x-renderless-dashboard-folder'
const ENTRY_DRAG_MIME = 'application/x-renderless-dashboard-entry'
const ASSET_ROOT = 'Branded Assets'
const FONT_ROOT = 'Fonts'
const DEFAULT_ASSET_FOLDERS = [ASSET_ROOT, `${ASSET_ROOT}/BGs`, `${ASSET_ROOT}/Template Designs`]
const DEFAULT_FONT_FOLDERS = [FONT_ROOT, `${FONT_ROOT}/Imported`]
const DEFAULT_FONT_SPECIMEN = 'Majority Dems'
const SYSTEM_FONT_FAMILIES = [
  'Inter, sans-serif',
  'Roboto, sans-serif',
  'JetBrains Mono, monospace',
] as const

type DashboardMode = 'Media' | 'Typography' | 'Templates'
type TemplateFolderFilter = 'all' | 'builtIn' | 'custom'
type ExplorerKind = 'assets' | 'fonts'
type MediaTypeFilter = 'all' | 'image' | 'video' | 'animation'
type MediaViewMode = 'gridLarge' | 'gridSmall' | 'list'
type MediaSortKey = 'name' | 'type' | 'size' | 'modifiedAt'

interface FolderCatalog {
  assets: string[]
  fonts: string[]
}

interface FolderRow {
  path: string
  name: string
  depth: number
  root: boolean
  hasChildren: boolean
  expanded: boolean
}

interface FolderDragPayload {
  kind: ExplorerKind
  folderPath: string
}

interface EntryDragPayload {
  kind: ExplorerKind
  entryId: string
}

interface FontFamilyGroup {
  family: string
  entries: MediaLibraryEntry[]
  source: 'system' | 'custom'
}

interface BreadcrumbItem {
  label: string
  mode: DashboardMode
  path?: string
  templateFilter?: TemplateFolderFilter
}

interface ExplorerSectionState {
  Media: boolean
  Typography: boolean
  Templates: boolean
}

function normalizeFolderPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

function normalizeFolderList(paths: string[], root: string): string[] {
  const normalized = new Set<string>()
  normalized.add(root)
  paths.forEach((path) => {
    const nextPath = normalizeFolderPath(path)
    if (!nextPath) {
      return
    }
    if (nextPath === root || nextPath.startsWith(`${root}/`)) {
      normalized.add(nextPath)
      return
    }
    normalized.add(`${root}/${nextPath}`)
  })

  return Array.from(normalized).sort((left, right) => {
    const depthDiff = left.split('/').length - right.split('/').length
    if (depthDiff !== 0) {
      return depthDiff
    }
    return left.localeCompare(right)
  })
}

function normalizeEntryFolder(folder: string, root: string): string {
  const nextPath = normalizeFolderPath(folder)
  if (!nextPath) {
    return root
  }
  if (nextPath === root || nextPath.startsWith(`${root}/`)) {
    return nextPath
  }
  return `${root}/${nextPath}`
}

function normalizeEntriesForRoot(entries: MediaLibraryEntry[], root: string): MediaLibraryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    folder: normalizeEntryFolder(entry.folder, root),
  }))
}

function readFolderCatalog(): FolderCatalog {
  if (typeof window === 'undefined') {
    return {
      assets: DEFAULT_ASSET_FOLDERS,
      fonts: DEFAULT_FONT_FOLDERS,
    }
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_FOLDER_STORAGE_KEY)
    if (!raw) {
      return {
        assets: DEFAULT_ASSET_FOLDERS,
        fonts: DEFAULT_FONT_FOLDERS,
      }
    }

    const parsed = JSON.parse(raw) as Partial<FolderCatalog>
    const assets = Array.isArray(parsed.assets) ? parsed.assets.filter((entry): entry is string => typeof entry === 'string') : []
    const fonts = Array.isArray(parsed.fonts) ? parsed.fonts.filter((entry): entry is string => typeof entry === 'string') : []
    return {
      assets: normalizeFolderList(assets, ASSET_ROOT),
      fonts: normalizeFolderList(fonts, FONT_ROOT),
    }
  } catch {
    return {
      assets: DEFAULT_ASSET_FOLDERS,
      fonts: DEFAULT_FONT_FOLDERS,
    }
  }
}

function persistFolderCatalog(catalog: FolderCatalog): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_FOLDER_STORAGE_KEY, JSON.stringify(catalog))
  } catch {
    // Ignore storage write failures.
  }
}

function getParentPath(path: string): string {
  const index = path.lastIndexOf('/')
  if (index <= 0) {
    return ''
  }
  return path.slice(0, index)
}

function getDirectChildFolderPaths(paths: string[], parentPath: string): string[] {
  return paths
    .filter((path) => getParentPath(path) === parentPath)
    .sort((left, right) => {
      const leftName = left.split('/').pop() ?? left
      const rightName = right.split('/').pop() ?? right
      return leftName.localeCompare(rightName)
    })
}

function ancestorPaths(path: string): string[] {
  const segments = normalizeFolderPath(path).split('/')
  const ancestors: string[] = []
  for (let index = 1; index <= segments.length; index += 1) {
    ancestors.push(segments.slice(0, index).join('/'))
  }
  return ancestors
}

function buildFolderRows(paths: string[], root: string, expandedPaths: string[]): FolderRow[] {
  const normalized = normalizeFolderList(paths, root)
  const expandedSet = new Set(expandedPaths)
  const rows: FolderRow[] = []

  const walk = (path: string, depth: number) => {
    const children = getDirectChildFolderPaths(normalized, path)
    const row: FolderRow = {
      path,
      name: path.split('/').pop() ?? path,
      depth,
      root: path === root,
      hasChildren: children.length > 0,
      expanded: path === root || expandedSet.has(path),
    }
    rows.push(row)

    if (!row.expanded) {
      return
    }

    children.forEach((childPath) => {
      walk(childPath, depth + 1)
    })
  }

  walk(root, 0)
  return rows
}

function parseFolderDragPayload(raw: string): FolderDragPayload | null {
  if (!raw) {
    return null
  }
  const normalized = raw.startsWith('renderless-folder:') ? raw.slice('renderless-folder:'.length) : raw

  try {
    const parsed = JSON.parse(normalized) as Partial<FolderDragPayload>
    if (!parsed || (parsed.kind !== 'assets' && parsed.kind !== 'fonts') || typeof parsed.folderPath !== 'string') {
      return null
    }

    return {
      kind: parsed.kind,
      folderPath: parsed.folderPath,
    }
  } catch {
    return null
  }
}

function parseEntryDragPayload(raw: string): EntryDragPayload | null {
  if (!raw) {
    return null
  }
  const normalized = raw.startsWith('renderless-entry:') ? raw.slice('renderless-entry:'.length) : raw

  try {
    const parsed = JSON.parse(normalized) as Partial<EntryDragPayload>
    if (!parsed || (parsed.kind !== 'assets' && parsed.kind !== 'fonts') || typeof parsed.entryId !== 'string') {
      return null
    }

    return {
      kind: parsed.kind,
      entryId: parsed.entryId,
    }
  } catch {
    return null
  }
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function formatTemplateDate(updatedAt?: number): string {
  if (!updatedAt || !Number.isFinite(updatedAt)) {
    return '03/04/2026'
  }

  return new Date(updatedAt).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function parseBatchTags(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function mediaTypeForEntry(entry: MediaLibraryEntry): MediaTypeFilter {
  const mime = entry.mime.toLowerCase()
  const name = entry.name.toLowerCase()
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) {
    return 'video'
  }
  if (mime.includes('json') || name.endsWith('.json') || name.endsWith('.lottie')) {
    return 'animation'
  }
  return 'image'
}

function sortMediaEntries(
  entries: MediaLibraryEntry[],
  sortKey: MediaSortKey,
  sortDirection: 'asc' | 'desc',
): MediaLibraryEntry[] {
  const direction = sortDirection === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    let comparison = 0
    if (sortKey === 'name') {
      comparison = left.name.localeCompare(right.name)
    } else if (sortKey === 'type') {
      comparison = mediaTypeForEntry(left).localeCompare(mediaTypeForEntry(right))
      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name)
      }
    } else if (sortKey === 'size') {
      comparison = left.size - right.size
      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name)
      }
    } else {
      comparison = left.modifiedAt - right.modifiedAt
      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name)
      }
    }

    return comparison * direction
  })
}

function formatUploadResult({
  kind,
  imported,
  rejected,
  failedFonts,
}: {
  kind: 'assets' | 'fonts'
  imported: number
  rejected: number
  failedFonts?: number
}): string {
  if (imported === 0 && rejected === 0 && (failedFonts ?? 0) === 0) {
    return `No ${kind} selected.`
  }

  const parts: string[] = []
  if (imported > 0) {
    parts.push(`uploaded ${imported}`)
  }
  if (rejected > 0) {
    parts.push(`rejected ${rejected}`)
  }
  if ((failedFonts ?? 0) > 0) {
    parts.push(`font load failed ${failedFonts ?? 0}`)
  }

  return `${kind === 'fonts' ? 'Font' : 'Asset'} ingest: ${parts.join(', ')}.`
}

function looksLikeTemplatePackagePayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return record.kind === 'renderless.template-package'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const templates = usePlayoutStore((state) => state.templates)
  const cuePreview = usePlayoutStore((state) => state.cuePreview)
  const deleteTemplate = usePlayoutStore((state) => state.deleteTemplate)
  const resetDemo = usePlayoutStore((state) => state.resetDemo)
  const importTemplatePackage = usePlayoutStore((state) => state.importTemplatePackage)
  const importTemplateDefinition = usePlayoutStore((state) => state.importTemplateDefinition)
  const packageSigningEnabled = usePlayoutStore((state) => state.packageSigningEnabled)
  const packageSigningKeyId = usePlayoutStore((state) => state.packageSigningKeyId)
  const packageSigningSecret = usePlayoutStore((state) => state.packageSigningSecret)
  const setPackageSigningConfig = usePlayoutStore((state) => state.setPackageSigningConfig)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const story = usePlayoutStore((state) => state.story)
  const bindingFields = usePlayoutStore((state) => state.bindingFields)

  const initialAssetEntries = useMemo(() => normalizeEntriesForRoot(readMediaEntries('asset'), ASSET_ROOT), [])
  const initialFontEntries = useMemo(() => normalizeEntriesForRoot(readMediaEntries('font'), FONT_ROOT), [])
  const initialFolderCatalog = useMemo(() => {
    const catalog = readFolderCatalog()
    return {
      assets: normalizeFolderList([...catalog.assets, ...initialAssetEntries.map((entry) => entry.folder)], ASSET_ROOT),
      fonts: normalizeFolderList([...catalog.fonts, ...initialFontEntries.map((entry) => entry.folder)], FONT_ROOT),
    }
  }, [initialAssetEntries, initialFontEntries])
  const [activeMode, setActiveMode] = useState<DashboardMode>('Templates')
  const [openSections, setOpenSections] = useState<ExplorerSectionState>({
    Media: true,
    Typography: false,
    Templates: true,
  })
  const [folderCatalog, setFolderCatalog] = useState<FolderCatalog>(initialFolderCatalog)
  const [selectedAssetFolder, setSelectedAssetFolder] = useState<string>(initialFolderCatalog.assets[0] ?? ASSET_ROOT)
  const [selectedFontFolder, setSelectedFontFolder] = useState<string>(initialFolderCatalog.fonts[0] ?? FONT_ROOT)
  const [expandedAssetFolders, setExpandedAssetFolders] = useState<string[]>(() => [ASSET_ROOT])
  const [expandedFontFolders, setExpandedFontFolders] = useState<string[]>(() => [FONT_ROOT])
  const [templateFolderFilter, setTemplateFolderFilter] = useState<TemplateFolderFilter>('all')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all')
  const [mediaViewMode, setMediaViewMode] = useState<MediaViewMode>('gridLarge')
  const [mediaSortKey, setMediaSortKey] = useState<MediaSortKey>('name')
  const [mediaSortDirection, setMediaSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showUnusedOnly, setShowUnusedOnly] = useState(false)
  const [searchAll, setSearchAll] = useState(true)
  const [showDevTools, setShowDevTools] = useState(false)
  const [query, setQuery] = useState('')
  const [batchTagDraft, setBatchTagDraft] = useState('')
  const [selectedSmartTag, setSelectedSmartTag] = useState<string>('all')
  const [fontPreviewText, setFontPreviewText] = useState(DEFAULT_FONT_SPECIMEN)
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [assetEntries, setAssetEntries] = useState<MediaLibraryEntry[]>(initialAssetEntries)
  const [fontEntries, setFontEntries] = useState<MediaLibraryEntry[]>(initialFontEntries)
  const [selectedEntryId, setSelectedEntryId] = useState<string>('')
  const [selectedTemplateCardId, setSelectedTemplateCardId] = useState<string>('')
  const [draggedEntryId, setDraggedEntryId] = useState<string>('')
  const [draggedFolderPath, setDraggedFolderPath] = useState<string>('')
  const [folderDropTarget, setFolderDropTarget] = useState<string>('')
  const [designImportDraft, setDesignImportDraft] = useState<DesignImportDraft | null>(null)
  const [designImportLabel, setDesignImportLabel] = useState('')
  const [designImportBindingMap, setDesignImportBindingMap] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const setTransientStatus = (message: string, timeoutMs = 2800) => {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(''), timeoutMs)
  }

  const persistFolders = (nextCatalog: FolderCatalog) => {
    const normalizedCatalog: FolderCatalog = {
      assets: normalizeFolderList(nextCatalog.assets, ASSET_ROOT),
      fonts: normalizeFolderList(nextCatalog.fonts, FONT_ROOT),
    }
    setFolderCatalog(normalizedCatalog)
    persistFolderCatalog(normalizedCatalog)
  }

  const persistAssets = (nextEntries: MediaLibraryEntry[]) => {
    const normalizedEntries = normalizeEntriesForRoot(nextEntries, ASSET_ROOT)
    setAssetEntries(normalizedEntries)
    const persisted = persistMediaEntries('asset', normalizedEntries)
    if (!persisted.ok) {
      setTransientStatus(persisted.error ?? 'Asset persistence failed.')
    }

    setFolderCatalog((previous) => {
      const nextFolders = normalizeFolderList(
        [...previous.assets, ...normalizedEntries.map((entry) => entry.folder)],
        ASSET_ROOT,
      )
      if (sameStringArray(nextFolders, previous.assets)) {
        return previous
      }
      const nextCatalog = {
        ...previous,
        assets: nextFolders,
      }
      persistFolderCatalog(nextCatalog)
      return nextCatalog
    })
  }

  const persistFonts = (nextEntries: MediaLibraryEntry[]) => {
    const normalizedEntries = normalizeEntriesForRoot(nextEntries, FONT_ROOT)
    setFontEntries(normalizedEntries)
    const persisted = persistMediaEntries('font', normalizedEntries)
    if (!persisted.ok) {
      setTransientStatus(persisted.error ?? 'Font persistence failed.')
    }

    setFolderCatalog((previous) => {
      const nextFolders = normalizeFolderList(
        [...previous.fonts, ...normalizedEntries.map((entry) => entry.folder)],
        FONT_ROOT,
      )
      if (sameStringArray(nextFolders, previous.fonts)) {
        return previous
      }
      const nextCatalog = {
        ...previous,
        fonts: nextFolders,
      }
      persistFolderCatalog(nextCatalog)
      return nextCatalog
    })
  }

  useEffect(() => {
    let cancelled = false

    const reconcileFolders = (kind: ExplorerKind, folders: string[]) => {
      setFolderCatalog((previous) => {
        const nextCatalog =
          kind === 'assets'
            ? {
                ...previous,
                assets: normalizeFolderList([...previous.assets, ...folders], ASSET_ROOT),
              }
            : {
                ...previous,
                fonts: normalizeFolderList([...previous.fonts, ...folders], FONT_ROOT),
              }

        if (sameStringArray(nextCatalog.assets, previous.assets) && sameStringArray(nextCatalog.fonts, previous.fonts)) {
          return previous
        }

        persistFolderCatalog(nextCatalog)
        return nextCatalog
      })
    }

    const hydrateAssets = async () => {
      const entries = normalizeEntriesForRoot(await readMediaEntriesAsync('asset'), ASSET_ROOT)
      if (cancelled) {
        return
      }
      setAssetEntries(entries)
      reconcileFolders('assets', entries.map((entry) => entry.folder))
    }

    const hydrateFonts = async () => {
      const entries = normalizeEntriesForRoot(await readMediaEntriesAsync('font'), FONT_ROOT)
      const registration = await registerFontEntries(entries)
      if (cancelled) {
        return
      }
      setFontEntries(registration.entries)
      reconcileFolders('fonts', registration.entries.map((entry) => entry.folder))

      if (registration.changed) {
        const persisted = persistMediaEntries('font', registration.entries)
        if (!persisted.ok) {
          setStatusMessage(persisted.error ?? 'Font persistence failed.')
          window.setTimeout(() => setStatusMessage(''), 2800)
        }
      }
    }

    const hydrate = () => {
      void hydrateAssets()
      void hydrateFonts()
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
        return
      }

      if (event.key === DASHBOARD_FOLDER_STORAGE_KEY) {
        const nextCatalog = readFolderCatalog()
        setFolderCatalog(nextCatalog)
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

    hydrate()
    window.addEventListener('storage', onStorage)
    window.addEventListener(MEDIA_LIBRARY_UPDATED_EVENT, onMediaLibraryUpdated as EventListener)

    return () => {
      cancelled = true
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(MEDIA_LIBRARY_UPDATED_EVENT, onMediaLibraryUpdated as EventListener)
    }
  }, [])

  const effectiveSelectedAssetFolder = folderCatalog.assets.includes(selectedAssetFolder)
    ? selectedAssetFolder
    : (folderCatalog.assets[0] ?? ASSET_ROOT)
  const effectiveSelectedFontFolder = folderCatalog.fonts.includes(selectedFontFolder)
    ? selectedFontFolder
    : (folderCatalog.fonts[0] ?? FONT_ROOT)

  const activeFolder =
    activeMode === 'Media'
      ? effectiveSelectedAssetFolder
      : activeMode === 'Typography'
        ? effectiveSelectedFontFolder
        : ''
  const effectiveExpandedAssetFolders = useMemo(
    () => Array.from(new Set([...expandedAssetFolders, ...ancestorPaths(effectiveSelectedAssetFolder)])),
    [effectiveSelectedAssetFolder, expandedAssetFolders],
  )
  const effectiveExpandedFontFolders = useMemo(
    () => Array.from(new Set([...expandedFontFolders, ...ancestorPaths(effectiveSelectedFontFolder)])),
    [effectiveSelectedFontFolder, expandedFontFolders],
  )
  const assetFolderRows = useMemo(
    () => buildFolderRows(folderCatalog.assets, ASSET_ROOT, effectiveExpandedAssetFolders),
    [effectiveExpandedAssetFolders, folderCatalog.assets],
  )
  const fontFolderRows = useMemo(
    () => buildFolderRows(folderCatalog.fonts, FONT_ROOT, effectiveExpandedFontFolders),
    [effectiveExpandedFontFolders, folderCatalog.fonts],
  )

  const openDesignImportWizard = (draft: DesignImportDraft) => {
    const suggestedMap: Record<string, string> = {}
    draft.bindingHints.forEach((hint) => {
      if (hint.suggestedBinding) {
        suggestedMap[hint.layerId] = hint.suggestedBinding
      }
    })
    setDesignImportDraft(draft)
    setDesignImportLabel(draft.templateLabel)
    setDesignImportBindingMap(suggestedMap)
    setExplorerMode('Templates')
  }

  const resetDesignImportWizard = () => {
    setDesignImportDraft(null)
    setDesignImportLabel('')
    setDesignImportBindingMap({})
  }

  const applyDesignImportWizard = () => {
    if (!designImportDraft) {
      return
    }

    const template = materializeTemplateFromDraft(designImportDraft, {
      label: designImportLabel,
      layerBindingMap: designImportBindingMap,
    })
    const result = importTemplateDefinition(template)
    if (!result.ok) {
      setTransientStatus(result.error ?? 'Template import failed.')
      return
    }

    resetDesignImportWizard()
    setSelectedTemplateCardId(result.templateId ?? '')
    setTransientStatus(
      `Imported ${template.label} from ${designImportDraft.sourceType.toUpperCase()} with ${template.bindingHints?.length ?? 0} binding hints.`,
    )
  }

  // Fonts from the library, registered so the importer can measure text with the real typeface.
  const loadImportFontFamilies = async (): Promise<string[]> => {
    const registration = await registerFontEntries(await readMediaEntriesAsync('font'))
    return registration.entries.map((entry) => entry.fontFamily).filter((family): family is string => Boolean(family))
  }

  const handleImportPackages = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    setIsBusy(true)
    let importedCount = 0
    let failedCount = 0
    let migratedCount = 0
    let stagedDesignDraft = false
    let stagedDesignSkipped = 0
    let firstError = ''

    for (const file of Array.from(files)) {
      const lowerName = file.name.toLowerCase()

      try {
        if (isDesignImportFile(file.name) || lowerName.endsWith('.psd') || lowerName.endsWith('.lottie')) {
          if (stagedDesignDraft || designImportDraft) {
            stagedDesignSkipped += 1
            continue
          }

          const draft = await createDesignImportDraft(file, { fontFamilies: await loadImportFontFamilies() })
          openDesignImportWizard(draft)
          stagedDesignDraft = true
          continue
        }

        const isJsonLike = lowerName.endsWith('.json') || lowerName.endsWith('.rltpl') || isTemplatePackageFile(file.name)
        if (!isJsonLike) {
          failedCount += 1
          if (!firstError) {
            firstError = `Unsupported file type: ${file.name}`
          }
          continue
        }

        const rawText = await file.text()
        const parsedJson = JSON.parse(rawText) as unknown
        const packageEntries = Array.isArray(parsedJson) ? parsedJson : [parsedJson]
        const packagePayload = packageEntries.some((entry) => looksLikeTemplatePackagePayload(entry))
        const lottiePayload = !packagePayload && !Array.isArray(parsedJson) && isLikelyLottieJsonPayload(parsedJson)

        if (lottiePayload) {
          if (stagedDesignDraft || designImportDraft) {
            stagedDesignSkipped += 1
            continue
          }

          const draft = await createDesignImportDraft(file, { fontFamilies: await loadImportFontFamilies() })
          openDesignImportWizard(draft)
          stagedDesignDraft = true
          continue
        }

        packageEntries.forEach((entry) => {
          const result = importTemplatePackage(entry)
          if (result.ok) {
            importedCount += 1
            if (result.migrationTrail && result.migrationTrail.length > 0) {
              migratedCount += 1
            }
          } else {
            failedCount += 1
            if (!firstError && result.error) {
              firstError = result.error
            }
          }
        })
      } catch {
        failedCount += 1
        if (!firstError) {
          firstError = `Invalid JSON in ${file.name}`
        }
      }
    }

    const statusParts: string[] = []
    if (importedCount > 0) {
      statusParts.push(
        migratedCount > 0
          ? `Imported ${importedCount} package(s), migrated ${migratedCount} to v2`
          : `Imported ${importedCount} package(s)`,
      )
    }
    if (stagedDesignDraft) {
      statusParts.push('Opened import wizard for external design')
    }
    if (stagedDesignSkipped > 0) {
      statusParts.push(`Skipped ${stagedDesignSkipped} extra design file(s) while wizard is active`)
    }
    if (failedCount > 0) {
      statusParts.push(`Failed ${failedCount}${firstError ? ` (${firstError})` : ''}`)
    }

    if (statusParts.length === 0) {
      setTransientStatus('No importable files selected.')
    } else {
      setTransientStatus(`${statusParts.join('. ')}.`)
    }

    setIsBusy(false)
  }

  const handleUploadExplorerFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    if (activeMode !== 'Media' && activeMode !== 'Typography') {
      return
    }

    setIsBusy(true)
    const filesArray = Array.from(files)

    if (activeMode === 'Typography') {
      const { entries, rejectedFiles } = await buildEntriesFromFiles(filesArray, 'font', effectiveSelectedFontFolder)
      const registration = await registerFontEntries(entries)

      const nextEntries = [...registration.entries, ...fontEntries]
      persistFonts(nextEntries)

      const message = formatUploadResult({
        kind: 'fonts',
        imported: registration.entries.length - registration.failed,
        rejected: rejectedFiles.length,
        failedFonts: registration.failed,
      })
      const detail = registration.errors.length > 0 ? ` ${registration.errors[0]}` : ''
      setTransientStatus(`${message}${detail}`)
      setIsBusy(false)
      return
    }

    const { entries, rejectedFiles } = await buildEntriesFromFiles(filesArray, 'asset', effectiveSelectedAssetFolder)
    const designFiles = rejectedFiles.filter((name) => isDesignFileName(name))
    const batchTags = parseBatchTags(batchTagDraft)
    const taggedEntries = entries.map((entry) => ({
      ...entry,
      tags: batchTags,
    }))
    const nextEntries = [...taggedEntries, ...assetEntries]
    persistAssets(nextEntries)
    const uploadSummary = formatUploadResult({
      kind: 'assets',
      imported: taggedEntries.length,
      rejected: rejectedFiles.length,
    })
    setTransientStatus(
      designFiles.length > 0
        ? `${uploadSummary} Media takes images only (PNG, JPG, WebP, SVG, GIF). Import ${designFiles.join(', ')} from Templates > Import File.`
        : rejectedFiles.length > 0
          ? `${uploadSummary} Media takes images only (PNG, JPG, WebP, SVG, GIF).`
          : uploadSummary,
      6000,
    )
    setBatchTagDraft('')
    setIsBusy(false)
  }

  const handleFileInput = async (files: FileList | null) => {
    if (activeMode === 'Templates') {
      await handleImportPackages(files)
      return
    }

    await handleUploadExplorerFiles(files)
  }

  const handleLoadTemplate = (templateId: string) => {
    cuePreview(templateId)
    setSelectedTemplateCardId(templateId)
    const template = templates.find((entry) => entry.id === templateId)
    setTransientStatus(`Loaded ${template?.label ?? 'template'} into Stage Pro.`)
    void navigate('/design')
  }

  const handleTemplateRowClick = (templateId: string) => {
    cuePreview(templateId)
    setSelectedTemplateCardId(templateId)
    const template = templates.find((entry) => entry.id === templateId)
    setTransientStatus(`Preview cued: ${template?.label ?? templateId}`, 1800)
  }

  const handleDeleteTemplate = (template: TemplateDefinition) => {
    if (template.builtIn) {
      setTransientStatus('Built-in templates cannot be deleted.')
      return
    }

    const shouldDelete = window.confirm(`Delete custom template "${template.label}"?`)
    if (!shouldDelete) {
      return
    }

    deleteTemplate(template.id)
    setTransientStatus(`Deleted template: ${template.label}`)
  }

  const handleDeleteExplorerEntry = (entryId: string) => {
    const source = activeMode === 'Typography' ? fontEntries : assetEntries
    const entry = source.find((item) => item.id === entryId)
    if (!entry) {
      return
    }

    const shouldDelete = window.confirm(`Delete "${entry.name}" from ${entry.folder}?`)
    if (!shouldDelete) {
      return
    }

    if (activeMode === 'Typography') {
      persistFonts(fontEntries.filter((item) => item.id !== entryId))
    } else {
      persistAssets(assetEntries.filter((item) => item.id !== entryId))
    }

    if (selectedEntryId === entryId) {
      setSelectedEntryId('')
    }

    setTransientStatus(`Deleted ${entry.name}`)
  }

  const handleExportPersistedState = async () => {
    try {
      const payload = JSON.stringify(
        {
          playout: window.localStorage.getItem('renderless.playout.snapshot.v1'),
          templates: window.localStorage.getItem('renderless.templates.v1'),
          transport: window.localStorage.getItem('renderless.playout.transport.v1'),
          dashboardAssets: window.localStorage.getItem(ASSET_STORAGE_KEY),
          dashboardFonts: window.localStorage.getItem(FONT_STORAGE_KEY),
          dashboardFolders: window.localStorage.getItem(DASHBOARD_FOLDER_STORAGE_KEY),
        },
        null,
        2,
      )
      await navigator.clipboard.writeText(payload)
      setTransientStatus('Persisted state copied to clipboard.')
    } catch {
      setTransientStatus('Clipboard unavailable for state export.')
    }
  }

  const handleResetDashboardStorage = () => {
    persistAssets([])
    persistFonts([])
    persistFolders({
      assets: DEFAULT_ASSET_FOLDERS,
      fonts: DEFAULT_FONT_FOLDERS,
    })
    setSelectedAssetFolder(ASSET_ROOT)
    setSelectedFontFolder(FONT_ROOT)
    setSelectedEntryId('')
    setTransientStatus('Dashboard uploaded assets/fonts reset.')
  }

  const createSubfolder = (kind: ExplorerKind) => {
    const parentFolder = kind === 'assets' ? effectiveSelectedAssetFolder : effectiveSelectedFontFolder
    const rawName = window.prompt(`Create subfolder inside "${parentFolder}"`, '')
    if (!rawName) {
      return
    }

    const folderName = rawName.replace(/[\\/]/g, ' ').trim()
    if (!folderName) {
      setTransientStatus('Folder name cannot be empty.')
      return
    }

    const nextFolderPath = normalizeFolderPath(`${parentFolder}/${folderName}`)
    const existing = kind === 'assets' ? folderCatalog.assets : folderCatalog.fonts
    if (existing.includes(nextFolderPath)) {
      setTransientStatus('Folder already exists.')
      return
    }

    const nextCatalog: FolderCatalog =
      kind === 'assets'
        ? {
            ...folderCatalog,
            assets: [...folderCatalog.assets, nextFolderPath],
          }
        : {
            ...folderCatalog,
            fonts: [...folderCatalog.fonts, nextFolderPath],
          }
    persistFolders(nextCatalog)
    if (kind === 'assets') {
      setSelectedAssetFolder(nextFolderPath)
      setExpandedAssetFolders((previous) => Array.from(new Set([...previous, parentFolder, nextFolderPath])))
    } else {
      setSelectedFontFolder(nextFolderPath)
      setExpandedFontFolders((previous) => Array.from(new Set([...previous, parentFolder, nextFolderPath])))
    }
    setTransientStatus(`Created folder: ${nextFolderPath}`)
  }

  const moveEntryToFolder = (kind: ExplorerKind, entryId: string, targetFolder: string) => {
    const normalizedTarget = normalizeFolderPath(targetFolder)
    if (kind === 'assets') {
      const nextEntries = assetEntries.map((entry) =>
        entry.id === entryId ? { ...entry, folder: normalizedTarget } : entry,
      )
      persistAssets(nextEntries)
      return
    }

    const nextEntries = fontEntries.map((entry) =>
      entry.id === entryId ? { ...entry, folder: normalizedTarget } : entry,
    )
    persistFonts(nextEntries)
  }

  const moveFolderToFolder = (kind: ExplorerKind, sourcePath: string, targetPath: string) => {
    const rootPath = kind === 'assets' ? ASSET_ROOT : FONT_ROOT
    if (sourcePath === rootPath) {
      setTransientStatus('Root folder cannot be moved.')
      return
    }

    if (targetPath === sourcePath || targetPath.startsWith(`${sourcePath}/`)) {
      setTransientStatus('Invalid folder move target.')
      return
    }

    const sourceName = sourcePath.split('/').pop() ?? sourcePath
    const destinationBase = normalizeFolderPath(`${targetPath}/${sourceName}`)
    const currentPaths = kind === 'assets' ? folderCatalog.assets : folderCatalog.fonts
    if (currentPaths.includes(destinationBase)) {
      setTransientStatus('Target already has a folder with this name.')
      return
    }

    const rewritePath = (path: string) => {
      if (path === sourcePath) {
        return destinationBase
      }
      if (path.startsWith(`${sourcePath}/`)) {
        return `${destinationBase}${path.slice(sourcePath.length)}`
      }
      return path
    }

    const nextCatalog: FolderCatalog =
      kind === 'assets'
        ? {
            ...folderCatalog,
            assets: folderCatalog.assets.map(rewritePath),
          }
        : {
            ...folderCatalog,
            fonts: folderCatalog.fonts.map(rewritePath),
          }
    persistFolders(nextCatalog)
    if (kind === 'assets') {
      setExpandedAssetFolders((previous) => Array.from(new Set(previous.map(rewritePath))))
    } else {
      setExpandedFontFolders((previous) => Array.from(new Set(previous.map(rewritePath))))
    }

    if (kind === 'assets') {
      persistAssets(
        assetEntries.map((entry) => ({
          ...entry,
          folder: rewritePath(entry.folder),
        })),
      )
      if (selectedAssetFolder === sourcePath || selectedAssetFolder.startsWith(`${sourcePath}/`)) {
        setSelectedAssetFolder(rewritePath(selectedAssetFolder))
      }
    } else {
      persistFonts(
        fontEntries.map((entry) => ({
          ...entry,
          folder: rewritePath(entry.folder),
        })),
      )
      if (selectedFontFolder === sourcePath || selectedFontFolder.startsWith(`${sourcePath}/`)) {
        setSelectedFontFolder(rewritePath(selectedFontFolder))
      }
    }

    setTransientStatus(`Moved folder to ${destinationBase}`)
  }

  const handleDropOnFolder = (event: ReactDragEvent<HTMLElement>, kind: ExplorerKind, targetFolder: string) => {
    const entryPayload =
      parseEntryDragPayload(event.dataTransfer.getData(ENTRY_DRAG_MIME)) ??
      parseEntryDragPayload(event.dataTransfer.getData('text/plain'))
    const folderPayload =
      parseFolderDragPayload(event.dataTransfer.getData(FOLDER_DRAG_MIME)) ??
      parseFolderDragPayload(event.dataTransfer.getData('text/plain'))

    if (entryPayload && entryPayload.kind === kind) {
      moveEntryToFolder(kind, entryPayload.entryId, targetFolder)
      setTransientStatus(`Moved file to ${targetFolder}`)
    } else if (folderPayload && folderPayload.kind === kind) {
      moveFolderToFolder(kind, folderPayload.folderPath, targetFolder)
    } else if (draggedEntryId) {
      moveEntryToFolder(kind, draggedEntryId, targetFolder)
      setTransientStatus(`Moved file to ${targetFolder}`)
    } else if (draggedFolderPath) {
      moveFolderToFolder(kind, draggedFolderPath, targetFolder)
    }

    setDraggedEntryId('')
    setDraggedFolderPath('')
    setFolderDropTarget('')
  }

  const uploadLabel = activeMode === 'Templates' ? 'Import File' : activeMode === 'Typography' ? 'Upload Font' : 'Upload Media'
  const uploadAccept =
    activeMode === 'Templates'
      ? '.json,.rltpl,.rltpl.json,.ai,.pdf,.psd,.lottie,.lottie.zip,.zip'
      : activeMode === 'Typography'
        ? '.ttf,.otf,.woff,.woff2'
        : 'image/*,.png,.jpg,.jpeg,.gif,.webp,.avif,.svg'
  const activeExplorerKind: ExplorerKind = activeMode === 'Typography' ? 'fonts' : 'assets'
  const usedAssetIds = useMemo(() => {
    const used = new Set<string>()
    templates.forEach((template) => {
      template.scene.layers.forEach((layer) => {
        if (layer.kind !== 'image') {
          return
        }
        const matched = assetEntries.find((entry) => entry.dataUrl && entry.dataUrl === layer.src)
        if (matched) {
          used.add(matched.id)
        }
      })
    })
    return used
  }, [assetEntries, templates])
  const usedFontFamilies = useMemo(() => {
    const used = new Set<string>()
    templates.forEach((template) => {
      template.scene.layers.forEach((layer) => {
        if (layer.kind === 'text') {
          used.add(layer.fontFamily)
        }
      })
    })
    return used
  }, [templates])
  const mediaTagOptions = useMemo(() => {
    const tags = new Set<string>()
    assetEntries.forEach((entry) => {
      ;(entry.tags ?? []).forEach((tag) => tags.add(tag))
    })
    return [...tags].sort((left, right) => left.localeCompare(right))
  }, [assetEntries])
  const activeSmartTag = selectedSmartTag === 'all' || mediaTagOptions.includes(selectedSmartTag) ? selectedSmartTag : 'all'
  const mediaChildFolders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return getDirectChildFolderPaths(folderCatalog.assets, effectiveSelectedAssetFolder)
      .filter((path) => {
        if (!normalizedQuery || searchAll) {
          return true
        }
        const label = path.split('/').pop() ?? path
        return label.toLowerCase().includes(normalizedQuery)
      })
      .sort((left, right) => {
        const leftName = left.split('/').pop() ?? left
        const rightName = right.split('/').pop() ?? right
        return leftName.localeCompare(rightName)
      })
  }, [effectiveSelectedAssetFolder, folderCatalog.assets, query, searchAll])
  const filteredMediaEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return assetEntries
      .filter((entry) => entry.folder === effectiveSelectedAssetFolder)
      .filter((entry) => {
        if (mediaTypeFilter === 'all') {
          return true
        }
        return mediaTypeForEntry(entry) === mediaTypeFilter
      })
      .filter((entry) => (showUnusedOnly ? !usedAssetIds.has(entry.id) : true))
      .filter((entry) => {
        if (activeSmartTag === 'all') {
          return true
        }
        return (entry.tags ?? []).includes(activeSmartTag)
      })
      .filter((entry) => {
        if (!normalizedQuery || searchAll) {
          return true
        }
        const tags = (entry.tags ?? []).join(' ').toLowerCase()
        return entry.name.toLowerCase().includes(normalizedQuery) || tags.includes(normalizedQuery)
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [activeSmartTag, assetEntries, effectiveSelectedAssetFolder, mediaTypeFilter, query, searchAll, showUnusedOnly, usedAssetIds])
  const sortedMediaEntries = useMemo(
    () => sortMediaEntries(filteredMediaEntries, mediaSortKey, mediaSortDirection),
    [filteredMediaEntries, mediaSortDirection, mediaSortKey],
  )
  const fontFamilyGroups = useMemo<FontFamilyGroup[]>(() => {
    const byFamily = new Map<string, MediaLibraryEntry[]>()
    fontEntries
      .filter((entry) => entry.folder === effectiveSelectedFontFolder)
      .forEach((entry) => {
        const family = entry.fontFamily?.trim() || entry.name.replace(/\.[^.]+$/, '')
        const list = byFamily.get(family)
        if (list) {
          list.push(entry)
        } else {
          byFamily.set(family, [entry])
        }
      })

    const customGroups = [...byFamily.entries()]
      .map(([family, entries]) => ({
        family,
        entries,
        source: 'custom' as const,
      }))
      .sort((left, right) => left.family.localeCompare(right.family))

    const systemGroups = SYSTEM_FONT_FAMILIES.map((family) => ({
      family,
      entries: [],
      source: 'system' as const,
    }))

    return [...customGroups, ...systemGroups]
  }, [effectiveSelectedFontFolder, fontEntries])
  const filteredFontGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return fontFamilyGroups.filter((group) => {
      if (!normalizedQuery || searchAll) {
        return true
      }
      return group.family.toLowerCase().includes(normalizedQuery)
    })
  }, [fontFamilyGroups, query, searchAll])
  const filteredTemplatesForGrid = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const base = templates.filter((template) => {
      if (templateFolderFilter === 'builtIn') return Boolean(template.builtIn)
      if (templateFolderFilter === 'custom') return !template.builtIn
      return true
    })
    const filtered = !normalizedQuery || searchAll
      ? base
      : base.filter((template) => template.label.toLowerCase().includes(normalizedQuery))
    return filtered.sort((left, right) => left.label.localeCompare(right.label))
  }, [query, searchAll, templateFolderFilter, templates])
  const globalResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!searchAll || normalizedQuery.length === 0) {
      return {
        templates: [] as TemplateDefinition[],
        media: [] as MediaLibraryEntry[],
        fonts: [] as FontFamilyGroup[],
      }
    }

    const templateResults = templates.filter((template) => template.label.toLowerCase().includes(normalizedQuery)).slice(0, 6)
    const mediaResults = assetEntries
      .filter((entry) => {
        const tags = (entry.tags ?? []).join(' ').toLowerCase()
        return entry.name.toLowerCase().includes(normalizedQuery) || tags.includes(normalizedQuery)
      })
      .slice(0, 8)
    const fontResults = fontFamilyGroups.filter((group) => group.family.toLowerCase().includes(normalizedQuery)).slice(0, 8)
    return {
      templates: templateResults,
      media: mediaResults,
      fonts: fontResults,
    }
  }, [assetEntries, fontFamilyGroups, query, searchAll, templates])
  const fieldOptions = useMemo(
    () => bindingFields.slice().sort((left, right) => left.label.localeCompare(right.label)),
    [bindingFields],
  )
  const importHintRows = useMemo(() => {
    if (!designImportDraft) {
      return []
    }

    return designImportDraft.bindingHints.map((hint) => {
      const resolvedBinding = designImportBindingMap[hint.layerId] || hint.suggestedBinding || ''
      return {
        ...hint,
        resolvedBinding,
      }
    })
  }, [designImportBindingMap, designImportDraft])
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateCardId || template.id === previewTemplateId) ?? null
  const selectedMediaEntry = assetEntries.find((entry) => entry.id === selectedEntryId) ?? null
  const selectedFontGroup = fontFamilyGroups.find((group) => group.family === selectedEntryId) ?? null
  const inspectorTitle =
    activeMode === 'Templates'
      ? selectedTemplate?.label ?? 'Template Inspector'
      : activeMode === 'Media'
        ? selectedMediaEntry?.name ?? 'Asset Inspector'
        : selectedFontGroup?.family ?? 'Font Inspector'
  const tableStatusLabel =
    activeMode === 'Templates'
      ? `Showing ${filteredTemplatesForGrid.length} template(s) in ${
          templateFolderFilter === 'all'
            ? 'All Templates'
            : templateFolderFilter === 'builtIn'
              ? 'Built-In'
              : 'Custom'
        }`
      : activeMode === 'Media'
        ? `Showing ${mediaChildFolders.length} folder(s), ${filteredMediaEntries.length} file(s) in ${activeFolder}`
        : `Showing ${filteredFontGroups.length} font family group(s) in ${activeFolder}`
  const activeBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (activeMode === 'Media') {
      const segments = effectiveSelectedAssetFolder.split('/')
      const folderCrumbs = segments.map((label, index) => ({
        label,
        mode: 'Media' as const,
        path: segments.slice(0, index + 1).join('/'),
      }))
      return [{ label: 'Media', mode: 'Media' }, ...folderCrumbs]
    }

    if (activeMode === 'Typography') {
      const segments = effectiveSelectedFontFolder.split('/')
      const folderCrumbs = segments.map((label, index) => ({
        label,
        mode: 'Typography' as const,
        path: segments.slice(0, index + 1).join('/'),
      }))
      return [{ label: 'Typography', mode: 'Typography' }, ...folderCrumbs]
    }

    return [
      { label: 'Templates', mode: 'Templates' },
      {
        label: templateFolderFilter === 'all' ? 'All' : templateFolderFilter === 'builtIn' ? 'Built-In' : 'Custom',
        mode: 'Templates',
        templateFilter: templateFolderFilter,
      },
    ]
  }, [activeMode, effectiveSelectedAssetFolder, effectiveSelectedFontFolder, templateFolderFilter])
  const setExplorerMode = (mode: DashboardMode) => {
    setActiveMode(mode)
    setOpenSections((previous) => ({
      ...previous,
      [mode]: true,
    }))
    if (mode === 'Media') {
      setSelectedEntryId('')
    }
    if (mode === 'Typography') {
      setSelectedEntryId('')
    }
  }
  const toggleSectionOpen = (mode: DashboardMode) => {
    setOpenSections((previous) => ({
      ...previous,
      [mode]: !previous[mode],
    }))
  }
  const canCreateFolder = activeMode === 'Media' || activeMode === 'Typography'
  const handleCreateFolderForActiveMode = () => {
    if (activeMode === 'Media') {
      createSubfolder('assets')
      return
    }
    if (activeMode === 'Typography') {
      createSubfolder('fonts')
      return
    }
    setTransientStatus('Folders can be created in Media or Typography.')
  }
  const handleBreadcrumbClick = (crumb: BreadcrumbItem) => {
    setExplorerMode(crumb.mode)

    if (crumb.mode === 'Media' && crumb.path) {
      const path = crumb.path
      setSelectedAssetFolder(path)
      setExpandedAssetFolders((previous) => Array.from(new Set([...previous, ...ancestorPaths(path)])))
      return
    }

    if (crumb.mode === 'Typography' && crumb.path) {
      const path = crumb.path
      setSelectedFontFolder(path)
      setExpandedFontFolders((previous) => Array.from(new Set([...previous, ...ancestorPaths(path)])))
      return
    }

    if (crumb.mode === 'Templates' && crumb.templateFilter) {
      setTemplateFolderFilter(crumb.templateFilter)
    }
  }
  const toggleFolderExpanded = (kind: ExplorerKind, path: string) => {
    const root = kind === 'assets' ? ASSET_ROOT : FONT_ROOT
    if (path === root) {
      return
    }

    if (kind === 'assets') {
      setExpandedAssetFolders((previous) =>
        previous.includes(path) ? previous.filter((entry) => entry !== path) : [...previous, path],
      )
      return
    }

    setExpandedFontFolders((previous) =>
      previous.includes(path) ? previous.filter((entry) => entry !== path) : [...previous, path],
    )
  }
  const applyBatchTagsToCurrentView = () => {
    if (activeMode !== 'Media') {
      return
    }

    const nextTags = parseBatchTags(batchTagDraft)
    if (nextTags.length === 0) {
      setTransientStatus('Enter one or more tags (comma separated).')
      return
    }

    const visibleIds = new Set(filteredMediaEntries.map((entry) => entry.id))
    if (visibleIds.size === 0) {
      setTransientStatus('No visible media to tag.')
      return
    }

    const nextEntries = assetEntries.map((entry) => {
      if (!visibleIds.has(entry.id)) {
        return entry
      }
      return {
        ...entry,
        tags: Array.from(new Set([...(entry.tags ?? []), ...nextTags])),
      }
    })

    persistAssets(nextEntries)
    setTransientStatus(`Tagged ${visibleIds.size} visible media item(s).`)
  }
  const setDesignImportBindingForLayer = (layerId: string, binding: string) => {
    setDesignImportBindingMap((previous) => {
      if (!binding.trim()) {
        const next = { ...previous }
        delete next[layerId]
        return next
      }
      return {
        ...previous,
        [layerId]: binding,
      }
    })
  }
  const applySuggestedImportBindings = () => {
    if (!designImportDraft) {
      return
    }

    const nextMap: Record<string, string> = {}
    designImportDraft.bindingHints.forEach((hint) => {
      if (hint.suggestedBinding) {
        nextMap[hint.layerId] = hint.suggestedBinding
      }
    })
    setDesignImportBindingMap(nextMap)
  }
  const handleMediaViewModeChange = (mode: MediaViewMode) => {
    setMediaViewMode(mode)
  }
  const handleMediaSortChange = (nextSortKey: MediaSortKey) => {
    if (mediaSortKey === nextSortKey) {
      setMediaSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))
      return
    }
    setMediaSortKey(nextSortKey)
    setMediaSortDirection('asc')
  }
  const mediaSortIndicator = (key: MediaSortKey) => {
    if (mediaSortKey !== key) {
      return ''
    }
    return mediaSortDirection === 'asc' ? '↑' : '↓'
  }

  return (
    <section className="screen screen--dashboard">
      <div className="dashboard-layout">
        <aside className="panel panel--explorer">
          <div className="panel-title">Asset Library</div>
          <div className="panel-subtitle">Templates, media, and typography in one explorer.</div>
          <div className="explorer-toolbar">
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={handleCreateFolderForActiveMode}
              disabled={!canCreateFolder}
            >
              <FolderPlus size={14} />
              New Folder
            </button>
          </div>
          <div className="explorer-sections">
            <section className="explorer-section">
              <button
                type="button"
                className={`mode-item mode-item--bucket ${activeMode === 'Media' ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setExplorerMode('Media')}
              >
                <span>Media</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="mode-item__toggle"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSectionOpen('Media')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleSectionOpen('Media')
                    }
                  }}
                >
                  {openSections.Media ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
              {openSections.Media ? (
                <div className="explorer-section__body">
                  <div className="folder-tree">
                    {assetFolderRows.map((row) => {
                      const isSelected = effectiveSelectedAssetFolder === row.path
                      const isAncestor = !isSelected && effectiveSelectedAssetFolder.startsWith(`${row.path}/`)
                      const isDropTarget = folderDropTarget === row.path

                      return (
                        <button
                          key={row.path}
                          type="button"
                          draggable={!row.root}
                          className={`tree-row ${isSelected ? 'tree-row--active' : ''} ${isAncestor ? 'tree-row--ancestor' : ''} ${isDropTarget ? 'tree-row--drop-target' : ''}`.trim()}
                          onClick={() => {
                            setSelectedAssetFolder(row.path)
                            setExplorerMode('Media')
                          }}
                          onDragStart={(event) => {
                            if (row.root) {
                              event.preventDefault()
                              return
                            }
                            setDraggedFolderPath(row.path)
                            setDraggedEntryId('')
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData(
                              FOLDER_DRAG_MIME,
                              JSON.stringify({
                                kind: 'assets',
                                folderPath: row.path,
                              } satisfies FolderDragPayload),
                            )
                            event.dataTransfer.setData(
                              'text/plain',
                              `renderless-folder:${JSON.stringify({
                                kind: 'assets',
                                folderPath: row.path,
                              } satisfies FolderDragPayload)}`,
                            )
                          }}
                          onDragOver={(event) => {
                            const folderPayload =
                              parseFolderDragPayload(event.dataTransfer.getData(FOLDER_DRAG_MIME)) ??
                              parseFolderDragPayload(event.dataTransfer.getData('text/plain'))
                            const entryPayload =
                              parseEntryDragPayload(event.dataTransfer.getData(ENTRY_DRAG_MIME)) ??
                              parseEntryDragPayload(event.dataTransfer.getData('text/plain'))
                            if (folderPayload?.kind !== 'assets' && entryPayload?.kind !== 'assets') {
                              return
                            }
                            event.preventDefault()
                            setFolderDropTarget(row.path)
                          }}
                          onDragLeave={() => {
                            if (folderDropTarget === row.path) {
                              setFolderDropTarget('')
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            handleDropOnFolder(event, 'assets', row.path)
                          }}
                          onDragEnd={() => {
                            setDraggedFolderPath('')
                            setFolderDropTarget('')
                          }}
                        >
                          {row.depth > 0 ? (
                            <span className="tree-row__branch" style={{ width: `${row.depth * 16}px` }} />
                          ) : null}
                          {row.hasChildren ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className="tree-row__chevron"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleFolderExpanded('assets', row.path)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  toggleFolderExpanded('assets', row.path)
                                }
                              }}
                            >
                              {row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </span>
                          ) : (
                            <span className="tree-row__chevron tree-row__chevron--placeholder" />
                          )}
                          {row.root ? <FolderOpen size={14} /> : <Folder size={14} />}
                          <span>{row.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="explorer-section">
              <button
                type="button"
                className={`mode-item mode-item--bucket ${activeMode === 'Typography' ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setExplorerMode('Typography')}
              >
                <span>Typography</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="mode-item__toggle"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSectionOpen('Typography')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleSectionOpen('Typography')
                    }
                  }}
                >
                  {openSections.Typography ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
              {openSections.Typography ? (
                <div className="explorer-section__body">
                  <div className="folder-tree">
                    {fontFolderRows.map((row) => {
                      const isSelected = effectiveSelectedFontFolder === row.path
                      const isAncestor = !isSelected && effectiveSelectedFontFolder.startsWith(`${row.path}/`)
                      const isDropTarget = folderDropTarget === row.path

                      return (
                        <button
                          key={row.path}
                          type="button"
                          draggable={!row.root}
                          className={`tree-row ${isSelected ? 'tree-row--active' : ''} ${isAncestor ? 'tree-row--ancestor' : ''} ${isDropTarget ? 'tree-row--drop-target' : ''}`.trim()}
                          onClick={() => {
                            setSelectedFontFolder(row.path)
                            setExplorerMode('Typography')
                          }}
                          onDragStart={(event) => {
                            if (row.root) {
                              event.preventDefault()
                              return
                            }
                            setDraggedFolderPath(row.path)
                            setDraggedEntryId('')
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData(
                              FOLDER_DRAG_MIME,
                              JSON.stringify({
                                kind: 'fonts',
                                folderPath: row.path,
                              } satisfies FolderDragPayload),
                            )
                            event.dataTransfer.setData(
                              'text/plain',
                              `renderless-folder:${JSON.stringify({
                                kind: 'fonts',
                                folderPath: row.path,
                              } satisfies FolderDragPayload)}`,
                            )
                          }}
                          onDragOver={(event) => {
                            const folderPayload =
                              parseFolderDragPayload(event.dataTransfer.getData(FOLDER_DRAG_MIME)) ??
                              parseFolderDragPayload(event.dataTransfer.getData('text/plain'))
                            const entryPayload =
                              parseEntryDragPayload(event.dataTransfer.getData(ENTRY_DRAG_MIME)) ??
                              parseEntryDragPayload(event.dataTransfer.getData('text/plain'))
                            if (folderPayload?.kind !== 'fonts' && entryPayload?.kind !== 'fonts') {
                              return
                            }
                            event.preventDefault()
                            setFolderDropTarget(row.path)
                          }}
                          onDragLeave={() => {
                            if (folderDropTarget === row.path) {
                              setFolderDropTarget('')
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            handleDropOnFolder(event, 'fonts', row.path)
                          }}
                          onDragEnd={() => {
                            setDraggedFolderPath('')
                            setFolderDropTarget('')
                          }}
                        >
                          {row.depth > 0 ? (
                            <span className="tree-row__branch" style={{ width: `${row.depth * 16}px` }} />
                          ) : null}
                          {row.hasChildren ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className="tree-row__chevron"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleFolderExpanded('fonts', row.path)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  toggleFolderExpanded('fonts', row.path)
                                }
                              }}
                            >
                              {row.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </span>
                          ) : (
                            <span className="tree-row__chevron tree-row__chevron--placeholder" />
                          )}
                          {row.root ? <FolderOpen size={14} /> : <Folder size={14} />}
                          <span>{row.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="explorer-section">
              <button
                type="button"
                className={`mode-item mode-item--bucket ${activeMode === 'Templates' ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setExplorerMode('Templates')}
              >
                <span>Templates</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="mode-item__toggle"
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSectionOpen('Templates')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleSectionOpen('Templates')
                    }
                  }}
                >
                  {openSections.Templates ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
              {openSections.Templates ? (
                <div className="explorer-section__body">
                  <button
                    type="button"
                    className={`tree-row ${templateFolderFilter === 'builtIn' ? 'tree-row--active' : ''}`.trim()}
                    onClick={() => {
                      setExplorerMode('Templates')
                      setTemplateFolderFilter('builtIn')
                    }}
                  >
                    <Folder size={14} />
                    <span>Built-In</span>
                  </button>
                  <button
                    type="button"
                    className={`tree-row ${templateFolderFilter === 'custom' ? 'tree-row--active' : ''}`.trim()}
                    onClick={() => {
                      setExplorerMode('Templates')
                      setTemplateFolderFilter('custom')
                    }}
                  >
                    <Folder size={14} />
                    <span>Custom</span>
                  </button>
                  <button
                    type="button"
                    className={`tree-row ${templateFolderFilter === 'all' ? 'tree-row--active' : ''}`.trim()}
                    onClick={() => {
                      setExplorerMode('Templates')
                      setTemplateFolderFilter('all')
                    }}
                  >
                    <FolderOpen size={14} />
                    <span>All Templates</span>
                  </button>
                </div>
              ) : null}
            </section>

            <section className="explorer-section explorer-section--dev">
              <button
                type="button"
                className={`mode-item mode-item--dev ${showDevTools ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setShowDevTools((previous) => !previous)}
              >
                DEV TOOLS
              </button>
              {showDevTools ? (
                <div className="dev-tools-panel">
                  <button type="button" className="btn btn--small btn--ghost" onClick={handleExportPersistedState}>
                    Export persisted state
                  </button>
                  <button type="button" className="btn btn--small btn--ghost" onClick={handleResetDashboardStorage}>
                    Reset dashboard uploads
                  </button>
                  <button type="button" className="btn btn--small btn--ghost" onClick={resetDemo}>
                    Reset playout state
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        </aside>

        <div className="panel panel--table">
          <div className="table-toolbar">
            <input
              type="text"
              value={query}
              placeholder={searchAll ? 'Search templates, media, and typography' : `Search ${activeMode.toLowerCase()}`}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className={`btn btn--small ${searchAll ? 'btn--accent' : 'btn--ghost'}`.trim()}
              onClick={() => setSearchAll((previous) => !previous)}
            >
              {searchAll ? 'Global Search' : 'Current View'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              {isBusy ? 'Working...' : uploadLabel}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={uploadAccept}
              multiple
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleFileInput(event.target.files)
                event.target.value = ''
              }}
            />
          </div>

          {activeMode === 'Media' ? (
            <div className="dashboard-controls-grid">
              <div className="dashboard-filter-row">
                {(['all', 'image', 'video', 'animation'] as const).map((filterValue) => (
                  <button
                    key={filterValue}
                    type="button"
                    className={`btn btn--small ${mediaTypeFilter === filterValue ? 'btn--accent' : 'btn--ghost'}`.trim()}
                    onClick={() => setMediaTypeFilter(filterValue)}
                  >
                    {filterValue.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  className={`btn btn--small ${showUnusedOnly ? 'btn--accent' : 'btn--ghost'}`.trim()}
                  onClick={() => setShowUnusedOnly((previous) => !previous)}
                >
                  {showUnusedOnly ? 'Unused Only: On' : 'Unused Only: Off'}
                </button>
                <label className="table-toolbar__field">
                  Smart Tag
                  <select value={activeSmartTag} onChange={(event) => setSelectedSmartTag(event.target.value)}>
                    <option value="all">All tags</option>
                    {mediaTagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="table-toolbar__field">
                  View
                  <div className="table-toolbar__toggle-row">
                    <button
                      type="button"
                      className={`btn btn--small ${mediaViewMode === 'gridLarge' ? 'btn--accent' : 'btn--ghost'}`.trim()}
                      onClick={() => handleMediaViewModeChange('gridLarge')}
                    >
                      Grid Large
                    </button>
                    <button
                      type="button"
                      className={`btn btn--small ${mediaViewMode === 'gridSmall' ? 'btn--accent' : 'btn--ghost'}`.trim()}
                      onClick={() => handleMediaViewModeChange('gridSmall')}
                    >
                      Grid Small
                    </button>
                    <button
                      type="button"
                      className={`btn btn--small ${mediaViewMode === 'list' ? 'btn--accent' : 'btn--ghost'}`.trim()}
                      onClick={() => handleMediaViewModeChange('list')}
                    >
                      List
                    </button>
                  </div>
                </div>
              </div>
              <div className="dashboard-filter-row">
                <label className="table-toolbar__field table-toolbar__field--grow">
                  Batch Tag (comma separated)
                  <input
                    value={batchTagDraft}
                    onChange={(event) => setBatchTagDraft(event.target.value)}
                    placeholder="Campaign Photos, Event Logos"
                  />
                </label>
                <button type="button" className="btn btn--ghost" onClick={applyBatchTagsToCurrentView}>
                  <Tag size={14} />
                  Apply to Current View
                </button>
                <div className="dashboard-filter-row__meta mono">
                  Sort: {mediaSortKey.toUpperCase()} {mediaSortDirection.toUpperCase()}
                </div>
              </div>
            </div>
          ) : null}

          {activeMode === 'Typography' ? (
            <div className="dashboard-controls-grid">
              <div className="dashboard-filter-row">
                <label className="table-toolbar__field table-toolbar__field--grow">
                  Specimen Preview
                  <input
                    value={fontPreviewText}
                    onChange={(event) => setFontPreviewText(event.target.value)}
                    placeholder={DEFAULT_FONT_SPECIMEN}
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="dashboard-breadcrumbs">
            {activeBreadcrumbs.map((crumb, index) => (
              <div key={`${crumb.mode}-${crumb.label}-${crumb.path ?? crumb.templateFilter ?? index}`} className="dashboard-breadcrumbs__item">
                {index > 0 ? <span className="dashboard-breadcrumbs__sep">&gt;</span> : null}
                <button
                  type="button"
                  className={`dashboard-breadcrumbs__btn ${
                    index === activeBreadcrumbs.length - 1 ? 'dashboard-breadcrumbs__btn--active' : ''
                  }`.trim()}
                  onClick={() => handleBreadcrumbClick(crumb)}
                >
                  {crumb.label}
                </button>
              </div>
            ))}
          </div>

          <div className="table-toolbar__status mono">{tableStatusLabel}</div>
          {statusMessage ? <div className="table-toolbar__status mono">{statusMessage}</div> : null}

          {designImportDraft ? (
            <div className="import-wizard">
              <div className="import-wizard__header">
                <div className="panel-title">Import Wizard</div>
                <div className="import-wizard__meta mono">
                  {designImportDraft.sourceType.toUpperCase()} | {designImportDraft.sourceName} | {designImportDraft.scene.width}x
                  {designImportDraft.scene.height}
                </div>
              </div>
              <div className="import-wizard__grid">
                <div className="import-wizard__preview">
                  <div className="import-wizard__surface">
                    <SceneRenderer
                      scene={designImportDraft.scene}
                      story={story}
                      showActionSafe
                      showTitleSafe
                      showCanvasBounds
                    />
                  </div>
                  {designImportDraft.warnings.length > 0 ? (
                    <div className="import-wizard__warnings mono">
                      {designImportDraft.warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`}>- {warning}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="import-wizard__bindings">
                  <label className="table-toolbar__field">
                    Template Label
                    <input
                      value={designImportLabel}
                      onChange={(event) => setDesignImportLabel(event.target.value)}
                      placeholder="Imported Template"
                    />
                  </label>
                  <div className="import-wizard__bindings-header">
                    <div className="mono">Binding Hints ({importHintRows.length})</div>
                    <button type="button" className="btn btn--small btn--ghost" onClick={applySuggestedImportBindings}>
                      Apply Suggestions
                    </button>
                  </div>
                  {importHintRows.length > 0 ? (
                    <div className="import-wizard__binding-list">
                      {importHintRows.map((hint) => (
                        <div key={hint.layerId} className="import-wizard__binding-row">
                          <div className="import-wizard__binding-meta">
                            <div className="import-wizard__binding-title">{hint.layerName}</div>
                            <div className="mono import-wizard__binding-token">
                              {hint.sourceToken ? `${hint.sourceToken}` : hint.sampleText || 'No token detected'}
                              {typeof hint.confidence === 'number' ? ` | ${(hint.confidence * 100).toFixed(0)}%` : ''}
                            </div>
                          </div>
                          <select
                            className="mono"
                            value={hint.resolvedBinding}
                            onChange={(event) => setDesignImportBindingForLayer(hint.layerId, event.target.value)}
                          >
                            <option value="">No binding</option>
                            {fieldOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label} ({option.key})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="inspector-empty">
                      No auto-detected binding tokens. You can still import this template and bind text in Stage Pro.
                    </div>
                  )}
                </div>
              </div>
              <div className="import-wizard__actions">
                <button type="button" className="btn btn--small btn--ghost" onClick={resetDesignImportWizard}>
                  Cancel
                </button>
                <button type="button" className="btn btn--small btn--accent" onClick={applyDesignImportWizard}>
                  Import Template
                </button>
              </div>
            </div>
          ) : null}

          {searchAll && query.trim().length > 0 ? (
            <div className="global-search-panel">
              <div className="global-search-panel__header mono">GLOBAL SEARCH</div>
              {globalResults.templates.length + globalResults.media.length + globalResults.fonts.length > 0 ? (
                <div className="global-search-panel__columns">
                  <div>
                    <div className="global-search-panel__title">Templates ({globalResults.templates.length})</div>
                    {globalResults.templates.slice(0, 4).map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="global-search-panel__item mono"
                        onClick={() => {
                          setExplorerMode('Templates')
                          setSelectedTemplateCardId(template.id)
                          handleTemplateRowClick(template.id)
                        }}
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="global-search-panel__title">Media ({globalResults.media.length})</div>
                    {globalResults.media.slice(0, 4).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="global-search-panel__item mono"
                        onClick={() => {
                          setExplorerMode('Media')
                          setSelectedAssetFolder(entry.folder)
                          setSelectedEntryId(entry.id)
                        }}
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="global-search-panel__title">Typography ({globalResults.fonts.length})</div>
                    {globalResults.fonts.slice(0, 4).map((group) => (
                      <button
                        key={group.family}
                        type="button"
                        className="global-search-panel__item mono"
                        onClick={() => {
                          setExplorerMode('Typography')
                          setSelectedEntryId(group.family)
                        }}
                      >
                        {group.family}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="inspector-empty">No global matches.</div>
              )}
            </div>
          ) : null}

          {activeMode === 'Templates' ? (
            <div className="library-grid library-grid--templates">
              {filteredTemplatesForGrid.map((template) => (
                <article
                  key={template.id}
                  className={`library-card ${previewTemplateId === template.id ? 'library-card--active' : ''}`.trim()}
                  onClick={() => handleTemplateRowClick(template.id)}
                  onDoubleClick={() => handleLoadTemplate(template.id)}
                >
                  <div className="library-card__surface">
                    <SceneRenderer scene={template.scene} story={story} showSafeZone />
                  </div>
                  <div className="library-card__title">{template.label}</div>
                  <div className="library-card__meta mono">v{template.version ?? 1} | {template.builtIn ? 'Built-In' : 'Custom'}</div>
                  <div className="library-card__meta mono">{template.bindings?.length ?? 0} bindings</div>
                  <div className="library-card__actions">
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleTemplateRowClick(template.id)
                      }}
                    >
                      <Eye size={12} />
                      Cue
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleLoadTemplate(template.id)
                      }}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="btn btn--small btn--ghost"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteTemplate(template)
                      }}
                      disabled={template.builtIn}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
              {filteredTemplatesForGrid.length === 0 ? (
                <div className="inspector-empty">No templates match the current query/filter.</div>
              ) : null}
            </div>
          ) : activeMode === 'Media' ? mediaViewMode === 'list' ? (
            <div className="library-list">
              <div className="library-list__header">
                <button type="button" className="library-list__sort-btn" onClick={() => handleMediaSortChange('name')}>
                  Name {mediaSortIndicator('name')}
                </button>
                <button type="button" className="library-list__sort-btn" onClick={() => handleMediaSortChange('type')}>
                  Type {mediaSortIndicator('type')}
                </button>
                <button type="button" className="library-list__sort-btn" onClick={() => handleMediaSortChange('size')}>
                  Size {mediaSortIndicator('size')}
                </button>
                <button type="button" className="library-list__sort-btn" onClick={() => handleMediaSortChange('modifiedAt')}>
                  Last Modified {mediaSortIndicator('modifiedAt')}
                </button>
              </div>
              <div className="library-list__body">
                {mediaChildFolders.map((folderPath) => {
                  const folderName = folderPath.split('/').pop() ?? folderPath
                  return (
                    <button
                      key={folderPath}
                      type="button"
                      className="library-list__row library-list__row--folder"
                      onClick={() => {
                        setSelectedAssetFolder(folderPath)
                        setExpandedAssetFolders((previous) => Array.from(new Set([...previous, folderPath])))
                      }}
                    >
                      <span className="library-list__name">
                        <span className="library-list__thumb library-list__thumb--folder">
                          <FolderOpen size={16} />
                        </span>
                        <span className="library-list__name-text">
                          <span className="library-list__title">{folderName}</span>
                          <span className="library-list__sub mono">{folderPath}</span>
                        </span>
                      </span>
                      <span className="library-list__type mono">FOLDER</span>
                      <span className="library-list__size mono">--</span>
                      <span className="library-list__modified mono">--</span>
                    </button>
                  )
                })}
                {sortedMediaEntries.map((entry) => {
                  const mediaType = mediaTypeForEntry(entry)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`library-list__row ${selectedEntryId === entry.id ? 'library-list__row--active' : ''}`.trim()}
                      onClick={() => setSelectedEntryId(entry.id)}
                      draggable
                      onDragStart={(event) => {
                        setDraggedEntryId(entry.id)
                        setDraggedFolderPath('')
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData(
                          ENTRY_DRAG_MIME,
                          JSON.stringify({
                            kind: activeExplorerKind,
                            entryId: entry.id,
                          } satisfies EntryDragPayload),
                        )
                        event.dataTransfer.setData(
                          'text/plain',
                          `renderless-entry:${JSON.stringify({
                            kind: activeExplorerKind,
                            entryId: entry.id,
                          } satisfies EntryDragPayload)}`,
                        )
                      }}
                      onDragEnd={() => {
                        setDraggedEntryId('')
                        setFolderDropTarget('')
                      }}
                    >
                      <span className="library-list__name">
                        <span className={`library-list__thumb ${mediaType === 'video' ? 'library-list__thumb--video' : ''}`.trim()}>
                          {entry.dataUrl ? (
                            mediaType === 'video' ? (
                              <>
                                <video src={entry.dataUrl} muted playsInline preload="metadata" />
                                <span className="library-list__video-badge">
                                  <Play size={10} />
                                </span>
                              </>
                            ) : (
                              <img src={entry.dataUrl} alt={entry.name} />
                            )
                          ) : (
                            <span className="library-card__fallback mono">NO PREVIEW</span>
                          )}
                        </span>
                        <span className="library-list__name-text">
                          <span className="library-list__title">{entry.name}</span>
                          <span className="library-list__sub mono">{(entry.tags ?? []).join(', ') || 'No tags'}</span>
                        </span>
                      </span>
                      <span className="library-list__type mono">{mediaType.toUpperCase()}</span>
                      <span className="library-list__size mono">{formatBytes(entry.size)}</span>
                      <span className="library-list__modified mono">{formatDate(entry.modifiedAt)}</span>
                    </button>
                  )
                })}
                {sortedMediaEntries.length === 0 && mediaChildFolders.length === 0 ? (
                  <div className="inspector-empty">No media in current view.</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div
              className={`library-grid library-grid--media ${
                mediaViewMode === 'gridSmall' ? 'library-grid--media-small' : 'library-grid--media-large'
              }`.trim()}
            >
              {mediaChildFolders.map((folderPath) => {
                const folderName = folderPath.split('/').pop() ?? folderPath
                return (
                  <article
                    key={folderPath}
                    className={`library-card library-card--media library-card--folder ${
                      mediaViewMode === 'gridSmall' ? 'library-card--media-small' : 'library-card--media-large'
                    }`.trim()}
                    onClick={() => {
                      setSelectedAssetFolder(folderPath)
                      setExpandedAssetFolders((previous) => Array.from(new Set([...previous, folderPath])))
                    }}
                  >
                    <div className="library-card__surface library-card__surface--folder">
                      <FolderOpen size={24} />
                    </div>
                    <div className="library-card__title">{folderName}</div>
                    <div className="library-card__meta mono">FOLDER</div>
                  </article>
                )
              })}
              {sortedMediaEntries.map((entry) => {
                const mediaType = mediaTypeForEntry(entry)
                return (
                  <article
                    key={entry.id}
                    className={`library-card library-card--media ${
                      mediaViewMode === 'gridSmall' ? 'library-card--media-small' : 'library-card--media-large'
                    } ${selectedEntryId === entry.id ? 'library-card--active' : ''}`.trim()}
                    onClick={() => setSelectedEntryId(entry.id)}
                    draggable
                    onDragStart={(event) => {
                      setDraggedEntryId(entry.id)
                      setDraggedFolderPath('')
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData(
                        ENTRY_DRAG_MIME,
                        JSON.stringify({
                          kind: activeExplorerKind,
                          entryId: entry.id,
                        } satisfies EntryDragPayload),
                      )
                      event.dataTransfer.setData(
                        'text/plain',
                        `renderless-entry:${JSON.stringify({
                          kind: activeExplorerKind,
                          entryId: entry.id,
                        } satisfies EntryDragPayload)}`,
                      )
                    }}
                    onDragEnd={() => {
                      setDraggedEntryId('')
                      setFolderDropTarget('')
                    }}
                  >
                    <div className="library-card__surface library-card__surface--asset">
                      {mediaType === 'video' && entry.dataUrl ? (
                        <>
                          <video
                            src={entry.dataUrl}
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            onMouseEnter={(event) => {
                              void event.currentTarget.play().catch(() => {})
                            }}
                            onMouseLeave={(event) => event.currentTarget.pause()}
                          />
                          <span className="library-card__video-badge mono">
                            <Play size={11} />
                            VIDEO
                          </span>
                        </>
                      ) : entry.dataUrl ? (
                        <img src={entry.dataUrl} alt={entry.name} />
                      ) : (
                        <div className="library-card__fallback mono">NO PREVIEW</div>
                      )}
                    </div>
                    <div className="library-card__title">{entry.name}</div>
                    <div className="library-card__meta mono">
                      {mediaType === 'video' ? (
                        <Film size={12} />
                      ) : mediaType === 'animation' ? (
                        <Puzzle size={12} />
                      ) : (
                        <FileImage size={12} />
                      )}
                      {mediaType.toUpperCase()} | {formatBytes(entry.size)}
                    </div>
                    <div className="library-card__meta mono">{formatDate(entry.modifiedAt)}</div>
                  </article>
                )
              })}
              {sortedMediaEntries.length === 0 && mediaChildFolders.length === 0 ? (
                <div className="inspector-empty">No media in current view.</div>
              ) : null}
            </div>
          ) : (
            <div className="library-grid">
              {filteredFontGroups.map((group) => (
                <button
                  key={group.family}
                  type="button"
                  className={`library-card ${selectedEntryId === group.family ? 'library-card--active' : ''}`.trim()}
                  onClick={() => setSelectedEntryId(group.family)}
                >
                  <div className="library-card__surface library-card__surface--font">
                    <div className="library-card__font-preview" style={{ fontFamily: group.family }}>
                      {fontPreviewText || DEFAULT_FONT_SPECIMEN}
                    </div>
                  </div>
                  <div className="library-card__title">{group.family}</div>
                  <div className="library-card__meta mono">{group.source === 'custom' ? 'CUSTOM' : 'SYSTEM'}</div>
                  <div className="library-card__meta mono">{usedFontFamilies.has(group.family) ? 'USED' : 'UNUSED'}</div>
                </button>
              ))}
              {filteredFontGroups.length === 0 ? <div className="inspector-empty">No fonts in current view.</div> : null}
            </div>
          )}
        </div>

        <aside className="panel panel--right">
          <div className="panel-title">{inspectorTitle}</div>
          <div className="panel-subtitle">
            {activeMode === 'Templates'
              ? 'Template package metadata, versions, and binding coverage.'
              : activeMode === 'Media'
                ? 'Asset details, usage, and cleanup actions.'
                : 'Font family groups and specimen preview.'}
          </div>

          {activeMode === 'Templates' ? (
            selectedTemplate ? (
              <div className="inspector-section">
                <div className="template-thumb__surface">
                  <SceneRenderer scene={selectedTemplate.scene} story={story} showSafeZone />
                </div>
                <div className="binding-panel">
                  <div className="binding-panel__meta mono">ID: {selectedTemplate.id}</div>
                  <div className="binding-panel__meta mono">Version: v{selectedTemplate.version ?? 1}</div>
                  <div className="binding-panel__meta mono">Updated: {formatTemplateDate(selectedTemplate.updatedAt)}</div>
                  <div className="binding-panel__meta mono">Bindings: {selectedTemplate.bindings?.length ?? 0}</div>
                </div>
                <div className="story-actions">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => handleTemplateRowClick(selectedTemplate.id)}
                  >
                    <Eye size={14} />
                    Cue Preview
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--accent"
                    onClick={() => handleLoadTemplate(selectedTemplate.id)}
                  >
                    Load to Design
                  </button>
                </div>
              </div>
            ) : (
              <div className="inspector-empty">Select a template card to inspect metadata and bindings.</div>
            )
          ) : null}

          {activeMode === 'Media' ? (
            selectedMediaEntry ? (
              <div className="inspector-section">
                <div className="library-card__surface">
                  {mediaTypeForEntry(selectedMediaEntry) === 'video' ? (
                    <video src={selectedMediaEntry.dataUrl} controls muted preload="metadata" />
                  ) : selectedMediaEntry.dataUrl ? (
                    <img src={selectedMediaEntry.dataUrl} alt={selectedMediaEntry.name} />
                  ) : (
                    <div className="library-card__fallback mono">NO PREVIEW</div>
                  )}
                </div>
                <div className="binding-panel">
                  <div className="binding-panel__meta mono">Type: {mediaTypeForEntry(selectedMediaEntry).toUpperCase()}</div>
                  <div className="binding-panel__meta mono">Size: {formatBytes(selectedMediaEntry.size)}</div>
                  <div className="binding-panel__meta mono">Modified: {formatDate(selectedMediaEntry.modifiedAt)}</div>
                  <div className="binding-panel__meta mono">Folder: {selectedMediaEntry.folder}</div>
                  <div className="binding-panel__meta mono">
                    <Tag size={12} />
                    {(selectedMediaEntry.tags ?? []).join(', ') || 'No tags'}
                  </div>
                </div>
                <div className="story-actions">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => {
                      setSelectedAssetFolder(selectedMediaEntry.folder)
                      setExplorerMode('Media')
                    }}
                  >
                    Show Folder
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => handleDeleteExplorerEntry(selectedMediaEntry.id)}
                  >
                    <Trash2 size={14} />
                    Delete Asset
                  </button>
                </div>
              </div>
            ) : (
              <div className="inspector-empty">Select a media card to inspect metadata and tags.</div>
            )
          ) : null}

          {activeMode === 'Typography' ? (
            selectedFontGroup ? (
              <div className="inspector-section">
                <div className="library-card__surface library-card__surface--font">
                  <div className="library-card__font-preview" style={{ fontFamily: selectedFontGroup.family }}>
                    {fontPreviewText || DEFAULT_FONT_SPECIMEN}
                  </div>
                </div>
                <div className="binding-panel">
                  <div className="binding-panel__meta mono">Source: {selectedFontGroup.source.toUpperCase()}</div>
                  <div className="binding-panel__meta mono">Variants: {selectedFontGroup.entries.length}</div>
                  <div className="binding-panel__meta mono">
                    Usage: {usedFontFamilies.has(selectedFontGroup.family) ? 'In Use' : 'Unused'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="inspector-empty">Select a font family to inspect variants and usage.</div>
            )
          ) : null}

          <div className="protocol-item">
            <FileText size={16} />
            <span>Package contract: scenegraph + bindings + metadata + integrity</span>
          </div>
          <div className="protocol-item">
            <Puzzle size={16} />
            <span>Import/export uses renderless.template-package v2</span>
          </div>

          <div className="inspector-section signing-panel">
            <div className="inspector-section__label">Package Signing</div>
            <div className="story-actions">
              <button
                type="button"
                className={`btn btn--small ${packageSigningEnabled ? 'btn--accent' : 'btn--ghost'}`.trim()}
                onClick={() => setPackageSigningConfig({ enabled: !packageSigningEnabled })}
              >
                {packageSigningEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <label className="field-label">
              Key ID
              <input
                className="mono"
                value={packageSigningKeyId}
                onChange={(event) => setPackageSigningConfig({ keyId: event.target.value })}
              />
            </label>
            <label className="field-label">
              Shared Secret
              <input
                className="mono"
                type="password"
                value={packageSigningSecret}
                onChange={(event) => setPackageSigningConfig({ secret: event.target.value })}
              />
            </label>
          </div>
        </aside>
      </div>
    </section>
  )
}
