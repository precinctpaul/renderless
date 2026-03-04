import { Folder, FolderOpen, Puzzle } from 'lucide-react'
import { usePlayoutStore } from '../store/playoutStore'

const MODES = ['Branded Assets', 'Fonts', 'Templates']

export function DashboardPage() {
  const templates = usePlayoutStore((state) => state.templates)

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
            <span>Testing</span>
          </div>
          <div className="tree-row">
            <Folder size={14} />
            <span>_old</span>
          </div>
        </div>

        <div className="panel panel--table">
          <div className="table-toolbar">
            <input type="text" value="" placeholder="Search templates" readOnly />
            <button type="button" className="btn btn--ghost">
              Import SVG
            </button>
          </div>

          <table className="template-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Dimensions</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.label}</td>
                  <td>Template</td>
                  <td>
                    {template.scene.width}x{template.scene.height}
                  </td>
                  <td>03/04/2026</td>
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
            <span>One package contract per template</span>
          </div>
        </aside>
      </div>
    </section>
  )
}
