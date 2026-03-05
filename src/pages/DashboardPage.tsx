import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Folder, FolderOpen, Puzzle, Trash2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlayoutStore } from '../store/playoutStore'
import type { TemplateDefinition } from '../types/scene'

const MODES = ['Branded Assets', 'Fonts', 'Templates'] as const
const ASSET_FOLDERS = ['Branded Assets', 'BGs', 'Template Designs'] as const
const FONT_FOLDERS = ['Fonts', 'Imported'] as const

const DASHBOARD_ASSET_STORAGE_KEY = 'renderless.dashboard.assets.v1'
const DASHBOARD_FONT_STORAGE_KEY = 'renderless.dashboard.fonts.v1'

type DashboardMode = (typeof MODES)[number]
type TemplateFolderFilter = 'all' | 'builtIn' | 'custom'
type ExplorerTarget = 'assets' | 'fonts'

interface ExplorerEntry {
  id: string
  name: string
  folder: string
  size: number
  mime: string
  modifiedAt: number
}

function createEntryId(prefix: ExplorerTarget): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readExplorerEntries(storageKey: string): ExplorerEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }

        const record = entry as Record<string, unknown>
        const id = typeof record.id === 'string' ? record.id : null
        const name = typeof record.name === 'string' ? record.name : null
        const folder = typeof record.folder === 'string' ? record.folder : null
        const size = Number(record.size)
        const modifiedAt = Number(record.modifiedAt)
        if (!id || !name || !folder || !Number.isFinite(size) || !Number.isFinite(modifiedAt)) {
          return null
        }

        return {
          id,
          name,
          folder,
          size: Math.max(0, Math.round(size)),
          mime: typeof record.mime === 'string' ? record.mime : 'application/octet-stream',
          modifiedAt: Math.max(0, Math.round(modifiedAt)),
        } satisfies ExplorerEntry
      })
      .filter((entry): entry is ExplorerEntry => entry !== null)
  } catch {
    return []
  }
}

function persistExplorerEntries(storageKey: string, entries: ExplorerEntry[]) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries))
  } catch {
    // Ignore persistence failures and keep dashboard interaction in-memory.
  }
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

function buildExplorerEntry(file: File, folder: string, target: ExplorerTarget): ExplorerEntry {
  return {
    id: createEntryId(target),
    name: file.name,
    folder,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    modifiedAt: Date.now(),
  }
}

function isFontFile(fileName: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(fileName)
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
  const [isImporting, setIsImporting] = useState(false)
  const [assetEntries, setAssetEntries] = useState<ExplorerEntry[]>(() => readExplorerEntries(DASHBOARD_ASSET_STORAGE_KEY))
  const [fontEntries, setFontEntries] = useState<ExplorerEntry[]>(() => readExplorerEntries(DASHBOARD_FONT_STORAGE_KEY))
  const [selectedEntryId, setSelectedEntryId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    persistExplorerEntries(DASHBOARD_ASSET_STORAGE_KEY, assetEntries)
  }, [assetEntries])

  useEffect(() => {
    persistExplorerEntries(DASHBOARD_FONT_STORAGE_KEY, fontEntries)
  }, [fontEntries])

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

  const setTransientStatus = (message: string, timeoutMs = 2800) => {
    setStatusMessage(message)
    window.setTimeout(() => setStatusMessage(''), timeoutMs)
  }

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

    setIsImporting(true)
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

    setIsImporting(false)
  }

  const handleUploadExplorerFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    if (activeMode !== 'Branded Assets' && activeMode !== 'Fonts') {
      return
    }

    if (activeMode === 'Fonts') {
      const validEntries = Array.from(files).filter((file) => isFontFile(file.name))
      if (validEntries.length === 0) {
        setTransientStatus('Font upload failed. Accepted extensions: .ttf, .otf, .woff, .woff2')
        return
      }

      const nextEntries = validEntries.map((file) => buildExplorerEntry(file, selectedFontFolder, 'fonts'))
      setFontEntries((previous) => [...nextEntries, ...previous])
      setTransientStatus(`Uploaded ${nextEntries.length} font file(s) to ${selectedFontFolder}.`)
      return
    }

    const nextEntries = Array.from(files).map((file) => buildExplorerEntry(file, selectedAssetFolder, 'assets'))
    setAssetEntries((previous) => [...nextEntries, ...previous])
    setTransientStatus(`Uploaded ${nextEntries.length} asset file(s) to ${selectedAssetFolder}.`)
  }

  const handleFileInput = async (files: FileList | null) => {
    if (activeMode === 'Templates') {
      await handleImportPackages(files)
      return
    }

    handleUploadExplorerFiles(files)
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
      setFontEntries((previous) => previous.filter((item) => item.id !== entryId))
    } else {
      setAssetEntries((previous) => previous.filter((item) => item.id !== entryId))
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
          dashboardAssets: window.localStorage.getItem(DASHBOARD_ASSET_STORAGE_KEY),
          dashboardFonts: window.localStorage.getItem(DASHBOARD_FONT_STORAGE_KEY),
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
    setAssetEntries([])
    setFontEntries([])
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
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              {isImporting ? 'Working...' : uploadLabel}
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
                    <td>{entry.mime || 'file'}</td>
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
                    <td colSpan={5}>
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
