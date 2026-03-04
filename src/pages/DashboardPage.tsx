import { useMemo, useState } from 'react'
import { Folder, FolderOpen, Puzzle, Trash2 } from 'lucide-react'
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
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)

  const [query, setQuery] = useState('')

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return templates
    }

    return templates.filter((template) => template.label.toLowerCase().includes(normalizedQuery))
  }, [query, templates])

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
            <button type="button" className="btn btn--ghost">
              Import SVG
            </button>
          </div>

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
            Templates are saved compositions (<span className="mono">layers + canvas + bindings</span>), not raw assets.
          </p>
          <div className="protocol-item">
            <Puzzle size={16} />
            <span>Custom template saves persist across refreshes</span>
          </div>
        </aside>
      </div>
    </section>
  )
}
