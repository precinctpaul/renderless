import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import { FileText, Folder, FolderOpen, FolderPlus, Puzzle, Trash2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlayoutStore } from '../store/playoutStore'
import type { TemplateDefinition } from '../types/scene'
import {
  ASSET_STORAGE_KEY,
  FONT_STORAGE_KEY,
  MEDIA_LIBRARY_UPDATED_EVENT,
  buildEntriesFromFiles,
  invalidateMediaEntriesCache,
  persistMediaEntries,
  readMediaEntries,
  readMediaEntriesAsync,
  registerFontEntries,
  type MediaLibraryEntry,
} from '../lib/mediaLibrary'

const DASHBOARD_FOLDER_STORAGE_KEY = 'renderless.dashboard.folders.v1'
const FOLDER_DRAG_MIME = 'application/x-renderless-dashboard-folder'
const ENTRY_DRAG_MIME = 'application/x-renderless-dashboard-entry'
const ASSET_ROOT = 'Branded Assets'
const FONT_ROOT = 'Fonts'
const DEFAULT_ASSET_FOLDERS = [ASSET_ROOT, `${ASSET_ROOT}/BGs`, `${ASSET_ROOT}/Template Designs`]
const DEFAULT_FONT_FOLDERS = [FONT_ROOT, `${FONT_ROOT}/Imported`]

type DashboardMode = 'Branded Assets' | 'Fonts' | 'Templates'
type TemplateFolderFilter = 'all' | 'builtIn' | 'custom'
type ExplorerKind = 'assets' | 'fonts'

interface FolderCatalog {
  assets: string[]
  fonts: string[]
}

interface FolderRow {
  path: string
  name: string
  depth: number
  root: boolean
}

interface FolderDragPayload {
  kind: ExplorerKind
  folderPath: string
}

interface EntryDragPayload {
  kind: ExplorerKind
  entryId: string
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

function buildFolderRows(paths: string[], root: string): FolderRow[] {
  return normalizeFolderList(paths, root).map((path) => {
    const segments = path.split('/')
    return {
      path,
      name: segments[segments.length - 1] ?? path,
      depth: Math.max(0, segments.length - 1),
      root: path === root,
    }
  })
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

export function DashboardPage() {
  const navigate = useNavigate()
  const templates = usePlayoutStore((state) => state.templates)
  const cuePreview = usePlayoutStore((state) => state.cuePreview)
  const deleteTemplate = usePlayoutStore((state) => state.deleteTemplate)
  const resetDemo = usePlayoutStore((state) => state.resetDemo)
  const importTemplatePackage = usePlayoutStore((state) => state.importTemplatePackage)
  const packageSigningEnabled = usePlayoutStore((state) => state.packageSigningEnabled)
  const packageSigningKeyId = usePlayoutStore((state) => state.packageSigningKeyId)
  const packageSigningSecret = usePlayoutStore((state) => state.packageSigningSecret)
  const setPackageSigningConfig = usePlayoutStore((state) => state.setPackageSigningConfig)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)

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
  const [expandedMode, setExpandedMode] = useState<DashboardMode>('Templates')
  const [folderCatalog, setFolderCatalog] = useState<FolderCatalog>(initialFolderCatalog)
  const [selectedAssetFolder, setSelectedAssetFolder] = useState<string>(initialFolderCatalog.assets[0] ?? ASSET_ROOT)
  const [selectedFontFolder, setSelectedFontFolder] = useState<string>(initialFolderCatalog.fonts[0] ?? FONT_ROOT)
  const [templateFolderFilter, setTemplateFolderFilter] = useState<TemplateFolderFilter>('all')
  const [showDevTools, setShowDevTools] = useState(false)
  const [query, setQuery] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [assetEntries, setAssetEntries] = useState<MediaLibraryEntry[]>(initialAssetEntries)
  const [fontEntries, setFontEntries] = useState<MediaLibraryEntry[]>(initialFontEntries)
  const [selectedEntryId, setSelectedEntryId] = useState<string>('')
  const [draggedEntryId, setDraggedEntryId] = useState<string>('')
  const [draggedFolderPath, setDraggedFolderPath] = useState<string>('')
  const [folderDropTarget, setFolderDropTarget] = useState<string>('')
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
    activeMode === 'Branded Assets'
      ? effectiveSelectedAssetFolder
      : activeMode === 'Fonts'
        ? effectiveSelectedFontFolder
        : ''
  const activeExplorerEntries = useMemo(() => {
    if (activeMode === 'Branded Assets') {
      return assetEntries
    }
    if (activeMode === 'Fonts') {
      return fontEntries
    }

    return []
  }, [activeMode, assetEntries, fontEntries])
  const assetFolderRows = useMemo(() => buildFolderRows(folderCatalog.assets, ASSET_ROOT), [folderCatalog.assets])
  const fontFolderRows = useMemo(() => buildFolderRows(folderCatalog.fonts, FONT_ROOT), [folderCatalog.fonts])

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const folderFiltered = templates.filter((template) => {
      if (templateFolderFilter === 'builtIn') {
        return Boolean(template.builtIn)
      }
      if (templateFolderFilter === 'custom') {
        return !template.builtIn
      }
      return true
    })

    if (!normalizedQuery) {
      return folderFiltered
    }

    return folderFiltered.filter((template) => template.label.toLowerCase().includes(normalizedQuery))
  }, [query, templateFolderFilter, templates])

  const filteredExplorerEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return activeExplorerEntries.filter((entry) => {
      if (entry.folder !== activeFolder) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      return entry.name.toLowerCase().includes(normalizedQuery)
    })
  }, [activeExplorerEntries, activeFolder, query])

  const handleImportPackages = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    setIsBusy(true)
    let importedCount = 0
    let failedCount = 0
    let migratedCount = 0
    let firstError = ''

    for (const file of Array.from(files)) {
      try {
        const rawText = await file.text()
        const parsedJson = JSON.parse(rawText) as unknown
        const packageEntries = Array.isArray(parsedJson) ? parsedJson : [parsedJson]

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

    if (importedCount > 0 && failedCount === 0) {
      setTransientStatus(
        migratedCount > 0
          ? `Imported ${importedCount} package(s), migrated ${migratedCount} to v2.`
          : `Imported ${importedCount} template package(s).`,
      )
    } else if (importedCount > 0) {
      setTransientStatus(
        `Imported ${importedCount}, failed ${failedCount}${migratedCount > 0 ? `, migrated ${migratedCount}` : ''}.`,
      )
    } else {
      setTransientStatus(
        firstError
          ? `Import failed: ${firstError}`
          : 'Import failed. Contract must be renderless.template-package.',
      )
    }

    setIsBusy(false)
  }

  const handleUploadExplorerFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    if (activeMode !== 'Branded Assets' && activeMode !== 'Fonts') {
      return
    }

    setIsBusy(true)
    const filesArray = Array.from(files)

    if (activeMode === 'Fonts') {
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
    const nextEntries = [...entries, ...assetEntries]
    persistAssets(nextEntries)
    setTransientStatus(
      formatUploadResult({
        kind: 'assets',
        imported: entries.length,
        rejected: rejectedFiles.length,
      }),
    )
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
    const template = templates.find((entry) => entry.id === templateId)
    setTransientStatus(`Loaded ${template?.label ?? 'template'} into Stage Pro.`)
    void navigate('/design')
  }

  const handleTemplateRowClick = (templateId: string) => {
    cuePreview(templateId)
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
    const source = activeMode === 'Fonts' ? fontEntries : assetEntries
    const entry = source.find((item) => item.id === entryId)
    if (!entry) {
      return
    }

    const shouldDelete = window.confirm(`Delete "${entry.name}" from ${entry.folder}?`)
    if (!shouldDelete) {
      return
    }

    if (activeMode === 'Fonts') {
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
    } else {
      setSelectedFontFolder(nextFolderPath)
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

  const uploadLabel = activeMode === 'Templates' ? 'Import Package' : activeMode === 'Fonts' ? 'Upload Font' : 'Upload Asset'
  const uploadAccept =
    activeMode === 'Templates'
      ? '.json,.rltpl,.rltpl.json'
      : activeMode === 'Fonts'
        ? '.ttf,.otf,.woff,.woff2'
        : '*/*'
  const tableStatusLabel =
    activeMode === 'Templates'
      ? `Showing ${filteredTemplates.length} template(s)`
      : `Showing ${filteredExplorerEntries.length} item(s) in ${activeFolder}`
  const activeExplorerKind: ExplorerKind = activeMode === 'Fonts' ? 'fonts' : 'assets'
  const setExplorerMode = (mode: DashboardMode) => {
    setActiveMode(mode)
    setExpandedMode(mode)
  }

  return (
    <section className="screen screen--dashboard">
      <div className="dashboard-layout">
        <aside className="panel panel--explorer">
          <div className="panel-title">Explorer</div>
          <div className="explorer-sections">
            <section className="explorer-section">
              <button
                type="button"
                className={`mode-item ${activeMode === 'Branded Assets' ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setExplorerMode('Branded Assets')}
              >
                Branded Assets
              </button>
              {expandedMode === 'Branded Assets' ? (
                <div className="explorer-section__body">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => createSubfolder('assets')}
                  >
                    <FolderPlus size={14} />
                    New Folder
                  </button>
                  <div className="folder-tree">
                    {assetFolderRows.map((row) => {
                      const isSelected = effectiveSelectedAssetFolder === row.path
                      const isDropTarget = folderDropTarget === row.path

                      return (
                        <button
                          key={row.path}
                          type="button"
                          draggable={!row.root}
                          className={`tree-row ${isSelected ? 'tree-row--active' : ''} ${isDropTarget ? 'tree-row--drop-target' : ''}`.trim()}
                          style={{ paddingLeft: `${8 + row.depth * 14}px` }}
                          onClick={() => {
                            setSelectedAssetFolder(row.path)
                            setExplorerMode('Branded Assets')
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
                className={`mode-item ${activeMode === 'Fonts' ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setExplorerMode('Fonts')}
              >
                Fonts
              </button>
              {expandedMode === 'Fonts' ? (
                <div className="explorer-section__body">
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => createSubfolder('fonts')}
                  >
                    <FolderPlus size={14} />
                    New Folder
                  </button>
                  <div className="folder-tree">
                    {fontFolderRows.map((row) => {
                      const isSelected = effectiveSelectedFontFolder === row.path
                      const isDropTarget = folderDropTarget === row.path

                      return (
                        <button
                          key={row.path}
                          type="button"
                          draggable={!row.root}
                          className={`tree-row ${isSelected ? 'tree-row--active' : ''} ${isDropTarget ? 'tree-row--drop-target' : ''}`.trim()}
                          style={{ paddingLeft: `${8 + row.depth * 14}px` }}
                          onClick={() => {
                            setSelectedFontFolder(row.path)
                            setExplorerMode('Fonts')
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
                className={`mode-item ${activeMode === 'Templates' ? 'mode-item--active' : ''}`.trim()}
                onClick={() => setExplorerMode('Templates')}
              >
                Templates
              </button>
              {expandedMode === 'Templates' ? (
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
              placeholder={activeMode === 'Templates' ? 'Search templates' : `Search ${activeMode.toLowerCase()}`}
              onChange={(event) => setQuery(event.target.value)}
            />
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

          <div className="table-toolbar__status mono">{tableStatusLabel}</div>
          {statusMessage ? <div className="table-toolbar__status mono">{statusMessage}</div> : null}

          {activeMode === 'Templates' ? (
            <table className="template-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Bindings</th>
                  <th>Dimensions</th>
                  <th>Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((template) => (
                  <tr
                    key={template.id}
                    className={previewTemplateId === template.id ? 'template-row--active' : ''}
                    onClick={() => handleTemplateRowClick(template.id)}
                  >
                    <td>{template.label}</td>
                    <td>{template.builtIn ? 'Template (Built-In)' : 'Template (Custom)'}</td>
                    <td className="mono">{previewTemplateId === template.id ? 'PVW' : ''}</td>
                    <td className="mono">v{template.version ?? 1}</td>
                    <td className="mono">{template.bindings?.length ?? 0}</td>
                    <td>
                      {template.scene.width}x{template.scene.height}
                    </td>
                    <td>{formatTemplateDate(template.updatedAt)}</td>
                    <td>
                      <div className="table-actions">
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
                          title={template.builtIn ? 'Built-in templates cannot be deleted' : 'Delete custom template'}
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredTemplates.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="inspector-empty">No templates match the current query/filter.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <table className="template-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExplorerEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    draggable
                    className={selectedEntryId === entry.id ? 'template-row--active' : ''}
                    onClick={() => setSelectedEntryId(entry.id)}
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
                    <td className="asset-entry-name">
                      <FileText size={14} />
                      <span>{entry.name}</span>
                    </td>
                    <td>{entry.kind === 'font' ? entry.fontFamily ?? 'Font' : entry.mime || 'file'}</td>
                    <td className="mono">{entry.dataUrl ? 'READY' : 'METADATA ONLY'}</td>
                    <td className="mono">{formatBytes(entry.size)}</td>
                    <td>{formatDate(entry.modifiedAt)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleDeleteExplorerEntry(entry.id)
                          }}
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredExplorerEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="inspector-empty">No files in this folder yet. Use {uploadLabel} to add files.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>

        <aside className="panel panel--right">
          <div className="panel-title">Templates Protocol</div>
          <p>
            Package contract: <span className="mono">scenegraph + bindings + metadata + integrity</span> with v1/v2
            migration tooling.
          </p>
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
