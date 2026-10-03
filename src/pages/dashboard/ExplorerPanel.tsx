import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus } from 'lucide-react'
import {
  FOLDER_DRAG_MIME,
  ENTRY_DRAG_MIME,
  parseFolderDragPayload,
  parseEntryDragPayload,
  type FolderDragPayload,
} from './dashboardModel'
import type { DashboardState } from './useDashboard'

/** Left column: Media / Typography / Templates folder trees and dev tools. */
export function ExplorerPanel({ d }: { d: DashboardState }) {
  const {
    resetDemo,
    activeMode,
    openSections,
    setSelectedAssetFolder,
    setSelectedFontFolder,
    templateFolderFilter,
    setTemplateFolderFilter,
    showDevTools,
    setShowDevTools,
    setDraggedEntryId,
    setDraggedFolderPath,
    folderDropTarget,
    setFolderDropTarget,
    effectiveSelectedAssetFolder,
    effectiveSelectedFontFolder,
    assetFolderRows,
    fontFolderRows,
    handleExportPersistedState,
    handleResetDashboardStorage,
    handleDropOnFolder,
    setExplorerMode,
    toggleSectionOpen,
    canCreateFolder,
    handleCreateFolderForActiveMode,
    toggleFolderExpanded,
  } = d

  return (
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
  )
}
