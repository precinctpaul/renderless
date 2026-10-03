import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayoutStore } from '../../store/playoutStore'
import type { TemplateDefinition } from '../../types/scene'
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
} from '../../lib/mediaLibrary'
import {
  createDesignImportDraft,
  isDesignImportFile,
  isLikelyLottieJsonPayload,
  isTemplatePackageFile,
  materializeTemplateFromDraft,
  type DesignImportDraft,
} from '../../lib/importPipeline'
import {
  DASHBOARD_FOLDER_STORAGE_KEY,
  FOLDER_DRAG_MIME,
  ENTRY_DRAG_MIME,
  ASSET_ROOT,
  FONT_ROOT,
  DEFAULT_ASSET_FOLDERS,
  DEFAULT_FONT_FOLDERS,
  DEFAULT_FONT_SPECIMEN,
  SYSTEM_FONT_FAMILIES,
  normalizeFolderPath,
  normalizeFolderList,
  normalizeEntriesForRoot,
  readFolderCatalog,
  persistFolderCatalog,
  getDirectChildFolderPaths,
  ancestorPaths,
  buildFolderRows,
  parseFolderDragPayload,
  parseEntryDragPayload,
  sameStringArray,
  parseBatchTags,
  mediaTypeForEntry,
  sortMediaEntries,
  formatUploadResult,
  looksLikeTemplatePackagePayload,
  type BreadcrumbItem,
  type DashboardMode,
  type ExplorerKind,
  type ExplorerSectionState,
  type FolderCatalog,
  type FontFamilyGroup,
  type MediaSortKey,
  type MediaTypeFilter,
  type MediaViewMode,
  type TemplateFolderFilter,
} from './dashboardModel'

/** All Dashboard state, derived lists and actions; the panels read what they need from this. */
export function useDashboard() {
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

  return {
    resetDemo,
    packageSigningEnabled,
    packageSigningKeyId,
    packageSigningSecret,
    setPackageSigningConfig,
    previewTemplateId,
    story,
    activeMode,
    openSections,
    setSelectedAssetFolder,
    setSelectedFontFolder,
    setExpandedAssetFolders,
    templateFolderFilter,
    setTemplateFolderFilter,
    mediaTypeFilter,
    setMediaTypeFilter,
    mediaViewMode,
    mediaSortKey,
    mediaSortDirection,
    showUnusedOnly,
    setShowUnusedOnly,
    searchAll,
    setSearchAll,
    showDevTools,
    setShowDevTools,
    query,
    setQuery,
    batchTagDraft,
    setBatchTagDraft,
    setSelectedSmartTag,
    fontPreviewText,
    setFontPreviewText,
    statusMessage,
    isBusy,
    selectedEntryId,
    setSelectedEntryId,
    setSelectedTemplateCardId,
    setDraggedEntryId,
    setDraggedFolderPath,
    folderDropTarget,
    setFolderDropTarget,
    designImportDraft,
    designImportLabel,
    setDesignImportLabel,
    fileInputRef,
    effectiveSelectedAssetFolder,
    effectiveSelectedFontFolder,
    assetFolderRows,
    fontFolderRows,
    resetDesignImportWizard,
    applyDesignImportWizard,
    handleFileInput,
    handleLoadTemplate,
    handleTemplateRowClick,
    handleDeleteTemplate,
    handleDeleteExplorerEntry,
    handleExportPersistedState,
    handleResetDashboardStorage,
    handleDropOnFolder,
    uploadLabel,
    uploadAccept,
    activeExplorerKind,
    usedFontFamilies,
    mediaTagOptions,
    activeSmartTag,
    mediaChildFolders,
    sortedMediaEntries,
    filteredFontGroups,
    filteredTemplatesForGrid,
    globalResults,
    fieldOptions,
    importHintRows,
    selectedTemplate,
    selectedMediaEntry,
    selectedFontGroup,
    inspectorTitle,
    tableStatusLabel,
    activeBreadcrumbs,
    setExplorerMode,
    toggleSectionOpen,
    canCreateFolder,
    handleCreateFolderForActiveMode,
    handleBreadcrumbClick,
    toggleFolderExpanded,
    applyBatchTagsToCurrentView,
    setDesignImportBindingForLayer,
    applySuggestedImportBindings,
    handleMediaViewModeChange,
    handleMediaSortChange,
    mediaSortIndicator,
  }
}

export type DashboardState = ReturnType<typeof useDashboard>
