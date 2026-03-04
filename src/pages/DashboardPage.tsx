import { useMemo, useRef, useState } from 'react'
import { Folder, FolderOpen, Puzzle, Trash2, Upload } from 'lucide-react'
import { usePlayoutStore } from '../store/playoutStore'

const MODES = ['Branded Assets', 'Fonts', 'Templates']

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

export function DashboardPage() {
  const templates = usePlayoutStore((state) => state.templates)
  const cuePreview = usePlayoutStore((state) => state.cuePreview)
  const deleteTemplate = usePlayoutStore((state) => state.deleteTemplate)
  const importTemplatePackage = usePlayoutStore((state) => state.importTemplatePackage)
  const packageSigningEnabled = usePlayoutStore((state) => state.packageSigningEnabled)
  const packageSigningKeyId = usePlayoutStore((state) => state.packageSigningKeyId)
  const packageSigningSecret = usePlayoutStore((state) => state.packageSigningSecret)
  const setPackageSigningConfig = usePlayoutStore((state) => state.setPackageSigningConfig)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)

  const [query, setQuery] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return templates
    }

    return templates.filter((template) => template.label.toLowerCase().includes(normalizedQuery))
  }, [query, templates])

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    setIsImporting(true)
    let importedCount = 0
    let failedCount = 0
    let migratedCount = 0

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
          }
        })
      } catch {
        failedCount += 1
      }
    }

    if (importedCount > 0 && failedCount === 0) {
      setImportStatus(
        migratedCount > 0
          ? `Imported ${importedCount} package(s), migrated ${migratedCount} to v2.`
          : `Imported ${importedCount} template package(s).`,
      )
    } else if (importedCount > 0) {
      setImportStatus(
        `Imported ${importedCount} package(s), ${failedCount} failed validation${migratedCount > 0 ? `, migrated ${migratedCount}.` : '.'}`,
      )
    } else {
      setImportStatus('Import failed. Package contract must be renderless.template-package v2.')
    }

    setIsImporting(false)
    window.setTimeout(() => setImportStatus(''), 2600)
  }

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
                className={`mode-item ${mode === 'Templates' ? 'mode-item--active' : ''}`.trim()}
                type="button"
              >
                {mode}
              </button>
            ))}
            <button type="button" className="mode-item mode-item--dev">
              DEV TOOLS
            </button>
          </div>
        </aside>

        <div className="panel panel--folders">
          <div className="panel-title">Templates Folders</div>
          <div className="tree-row tree-row--active">
            <FolderOpen size={14} />
            <span>Templates</span>
          </div>
          <div className="tree-row">
            <Folder size={14} />
            <span>Built-In</span>
          </div>
          <div className="tree-row">
            <Folder size={14} />
            <span>Custom</span>
          </div>
        </div>

        <div className="panel panel--table">
          <div className="table-toolbar">
            <input
              type="text"
              value={query}
              placeholder="Search templates"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="btn btn--ghost"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} />
              {isImporting ? 'Importing...' : 'Import Package'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.rltpl,.rltpl.json"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleImportFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </div>
          {importStatus ? <div className="table-toolbar__status mono">{importStatus}</div> : null}

          <table className="template-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Bindings</th>
                <th>Dimensions</th>
                <th>Modified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((template) => (
                <tr key={template.id} className={previewTemplateId === template.id ? 'template-row--active' : ''}>
                  <td>{template.label}</td>
                  <td>{template.builtIn ? 'Template (Built-In)' : 'Template (Custom)'}</td>
                  <td className="mono">v{template.version ?? 1}</td>
                  <td className="mono">{template.bindings?.length ?? 0}</td>
                  <td>
                    {template.scene.width}x{template.scene.height}
                  </td>
                  <td>{formatTemplateDate(template.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="btn btn--small btn--ghost" onClick={() => cuePreview(template.id)}>
                        Load
                      </button>
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        onClick={() => deleteTemplate(template.id)}
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
            </tbody>
          </table>
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
