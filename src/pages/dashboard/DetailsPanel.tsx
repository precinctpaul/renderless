import { Eye, FileText, Puzzle, Tag, Trash2 } from 'lucide-react'
import { SceneRenderer } from '../../components/SceneRenderer'
import { DEFAULT_FONT_SPECIMEN, formatTemplateDate, formatDate, formatBytes, mediaTypeForEntry } from './dashboardModel'
import type { DashboardState } from './useDashboard'

/** Right column: details for the selected template or file, package signing. */
export function DetailsPanel({ d }: { d: DashboardState }) {
  const {
    packageSigningEnabled,
    packageSigningKeyId,
    packageSigningSecret,
    setPackageSigningConfig,
    story,
    activeMode,
    setSelectedAssetFolder,
    fontPreviewText,
    handleLoadTemplate,
    handleTemplateRowClick,
    handleDeleteExplorerEntry,
    usedFontFamilies,
    selectedTemplate,
    selectedMediaEntry,
    selectedFontGroup,
    inspectorTitle,
    setExplorerMode,
  } = d

  return (
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
  )
}
