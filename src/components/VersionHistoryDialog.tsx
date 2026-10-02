import { SceneRenderer } from './SceneRenderer'
import type { StoryState, TemplateDefinition, TemplateVersionReason } from '../types/scene'

const REASON_LABEL: Record<TemplateVersionReason, string> = {
  save: 'Saved',
  autosave: 'Autosaved',
  restore: 'Restored',
}

function formatWhen(timestamp: number): string {
  if (!timestamp) return 'Not saved yet'
  return new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

interface VersionHistoryDialogProps {
  template: TemplateDefinition
  story: StoryState
  onRestore: (version: number) => void
  onClose: () => void
}

/** A template's restore points, newest first, with a thumbnail of each. */
export function VersionHistoryDialog({ template, story, onRestore, onClose }: VersionHistoryDialogProps) {
  const versions = [...(template.versions ?? [])].sort((a, b) => b.version - a.version)
  const current = {
    version: template.version ?? 1,
    scene: template.scene,
    updatedAt: template.updatedAt ?? 0,
    updatedBy: template.updatedBy,
    reason: template.versionReason ?? 'save',
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal version-history"
        role="dialog"
        aria-label="Version history"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <div className="version-history__header">
          <div className="panel-title">Version History: {template.label}</div>
          <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="panel-subtitle">
          Kept automatically: every Save, every Restore, and a checkpoint at least every 10 minutes while editing. Restoring
          keeps the current design as a version too, so nothing is lost.
        </p>
        <ul className="version-history__list">
          {[current, ...versions].map((entry, index) => (
            <li key={`${entry.version}-${index}`} className={`version-history__item ${index === 0 ? 'version-history__item--current' : ''}`.trim()}>
              <div className="version-history__thumb" style={{ aspectRatio: `${entry.scene.width} / ${entry.scene.height}` }}>
                <SceneRenderer scene={entry.scene} story={story} checkerboard />
              </div>
              <div className="version-history__meta">
                <span className="version-history__title">
                  v{entry.version} · {REASON_LABEL[entry.reason ?? 'save']}
                  {entry.updatedBy ? ` by ${entry.updatedBy}` : ''}
                </span>
                <span className="mono version-history__when">{formatWhen(entry.updatedAt)}</span>
              </div>
              {index === 0 ? (
                <span className="mono version-history__badge">CURRENT</span>
              ) : (
                <button type="button" className="btn btn--small" onClick={() => onRestore(entry.version)}>
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
        {versions.length === 0 ? <div className="inspector-empty">No earlier versions yet. Keep editing; checkpoints appear here.</div> : null}
      </div>
    </div>
  )
}
