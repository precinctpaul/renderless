import { Eye, FileImage, Film, FolderOpen, Play, Puzzle, Tag, Upload } from 'lucide-react'
import { SceneRenderer } from '../../components/SceneRenderer'
import {
  ENTRY_DRAG_MIME,
  DEFAULT_FONT_SPECIMEN,
  formatDate,
  formatBytes,
  mediaTypeForEntry,
  type EntryDragPayload,
} from './dashboardModel'
import type { DashboardState } from './useDashboard'

/** Middle column: search, upload/import, breadcrumbs, the media/font/template grids and the import wizard. */
export function LibraryPanel({ d }: { d: DashboardState }) {
  const {
    previewTemplateId,
    story,
    activeMode,
    setSelectedAssetFolder,
    setExpandedAssetFolders,
    mediaTypeFilter,
    setMediaTypeFilter,
    mediaViewMode,
    mediaSortKey,
    mediaSortDirection,
    showUnusedOnly,
    setShowUnusedOnly,
    searchAll,
    setSearchAll,
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
    setFolderDropTarget,
    designImportDraft,
    designImportLabel,
    setDesignImportLabel,
    fileInputRef,
    resetDesignImportWizard,
    applyDesignImportWizard,
    handleFileInput,
    handleLoadTemplate,
    handleTemplateRowClick,
    handleDeleteTemplate,
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
    tableStatusLabel,
    activeBreadcrumbs,
    setExplorerMode,
    handleBreadcrumbClick,
    applyBatchTagsToCurrentView,
    setDesignImportBindingForLayer,
    applySuggestedImportBindings,
    handleMediaViewModeChange,
    handleMediaSortChange,
    mediaSortIndicator,
  } = d

  return (
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
  )
}
