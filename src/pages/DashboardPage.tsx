import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Folder, FolderOpen, Puzzle, Trash2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlayoutStore } from '../store/playoutStore'
import type { TemplateDefinition } from '../types/scene'
import {
  ASSET_STORAGE_KEY,
  FONT_STORAGE_KEY,
  buildEntriesFromFiles,
  persistMediaEntries,
  readMediaEntries,
  registerFontEntries,
  type MediaLibraryEntry,
} from '../lib/mediaLibrary'

const MODES = ['Branded Assets', 'Fonts', 'Templates'] as const
const ASSET_FOLDERS = ['Branded Assets', 'BGs', 'Template Designs'] as const
const FONT_FOLDERS = ['Fonts', 'Imported'] as const

type DashboardMode = (typeof MODES)[number]
type TemplateFolderFilter = 'all' | 'builtIn' | 'custom'

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

  const [activeMode, setActiveMode] = useState<DashboardMode>('Templates')
  const [selectedAssetFolder, setSelectedAssetFolder] = useState<string>(ASSET_FOLDERS[0])
  const [selectedFontFolder, setSelectedFontFolder] = useState<string>(FONT_FOLDERS[0])
  const [templateFolderFilter, setTemplateFolderFilter] = useState<TemplateFolderFilter>('all')
  const [showDevTools, setShowDevTools] = useState(false)
  const [query, setQuery] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [assetEntries, setAssetEntries] = useState<MediaLibraryEntry[]>(() => readMediaEntries('asset'))
  const [fontEntries, setFontEntries] = useState<MediaLibraryEntry[]>(() => readMediaEntries('font'))
  const [selectedEntryId, setSelectedEntryId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const setTransientStatus = (message: string, timeoutMs = 2800) => {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(''), timeoutMs)
  }

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

    void (async () => {
      const registration = await registerFontEntries(readMediaEntries('font'))
      if (cancelled) {
        return
      }
      if (registration.changed) {
        setFontEntries(registration.entries)
        const persisted = persistMediaEntries('font', registration.entries)
        if (!persisted.ok) {
          setStatusMessage(persisted.error ?? 'Font persistence failed.')
          window.setTimeout(() => setStatusMessage(''), 2800)
        }
        return
      }

      setFontEntries(registration.entries)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const activeFolder = activeMode === 'Branded Assets' ? selectedAssetFolder : activeMode === 'Fonts' ? selectedFontFolder : ''
  const activeExplorerEntries = useMemo(() => {
    if (activeMode === 'Branded Assets') {
      return assetEntries
    }
    if (activeMode === 'Fonts') {
      return fontEntries
    }

    return []
  }, [activeMode, assetEntries, fontEntries])

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
      const { entries, rejectedFiles } = await buildEntriesFromFiles(filesArray, 'font', selectedFontFolder)
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

    const { entries, rejectedFiles } = await buildEntriesFromFiles(filesArray, 'asset', selectedAssetFolder)
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
    setSelectedEntryId('')
    setTransientStatus('Dashboard uploaded assets/fonts reset.')
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

  return (
    <section className="screen screen--dashboard">
      <div className="screen-header">
        <h1>DASHBOARD</h1>
        <p>Single-pane explorer for branded assets, fonts, and templates with persistent structure.</p>
      </div>

      <div className="dashboard-layout">
        <aside className="panel panel--left">
          <div className="panel-title">MODE</div>
          <div className="mode-list">
            {MODES.map((mode) => (
              <button
                key={mode}
                className={`mode-item ${mode === activeMode ? 'mode-item--active' : ''}`.trim()}
                type="button"
                onClick={() => setActiveMode(mode)}
              >
                {mode}
              </button>
            ))}
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
          </div>
        </aside>

        <div className="panel panel--folders">
          <div className="panel-title">{activeMode} Folders</div>
          <div className="tree-row tree-row--active">
            <FolderOpen size={14} />
            <span>{activeMode}</span>
          </div>
          {activeMode === 'Templates' ? (
            <>
              <button
                type="button"
                className={`tree-row ${templateFolderFilter === 'builtIn' ? 'tree-row--active' : ''}`.trim()}
                onClick={() => setTemplateFolderFilter('builtIn')}
              >
                <Folder size={14} />
                <span>Built-In</span>
              </button>
              <button
                type="button"
                className={`tree-row ${templateFolderFilter === 'custom' ? 'tree-row--active' : ''}`.trim()}
                onClick={() => setTemplateFolderFilter('custom')}
              >
                <Folder size={14} />
                <span>Custom</span>
              </button>
              <button
                type="button"
                className={`tree-row ${templateFolderFilter === 'all' ? 'tree-row--active' : ''}`.trim()}
                onClick={() => setTemplateFolderFilter('all')}
              >
                <Folder size={14} />
                <span>All Templates</span>
              </button>
            </>
          ) : activeMode === 'Branded Assets' ? (
            ASSET_FOLDERS.map((folder) => (
              <button
                key={folder}
                type="button"
                className={`tree-row ${selectedAssetFolder === folder ? 'tree-row--active' : ''}`.trim()}
                onClick={() => setSelectedAssetFolder(folder)}
              >
                <Folder size={14} />
                <span>{folder}</span>
              </button>
            ))
          ) : (
            FONT_FOLDERS.map((folder) => (
              <button
                key={folder}
                type="button"
                className={`tree-row ${selectedFontFolder === folder ? 'tree-row--active' : ''}`.trim()}
                onClick={() => setSelectedFontFolder(folder)}
              >
                <Folder size={14} />
                <span>{folder}</span>
              </button>
            ))
          )}
        </div>

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
                    className={selectedEntryId === entry.id ? 'template-row--active' : ''}
                    onClick={() => setSelectedEntryId(entry.id)}
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
