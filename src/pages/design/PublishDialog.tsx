import { SceneRenderer } from '../../components/SceneRenderer'
import type { TemplateDraft } from '../../store/templateCatalog'
import type { StoryState, TemplateDefinition } from '../../types/scene'

interface PublishDialogProps {
  template: TemplateDefinition
  draft: TemplateDraft
  story: StoryState
  onPublish: () => void
  onCancel: () => void
}

/** Confirms replacing the team's version of a template with your draft, showing both side by side. */
export function PublishDialog({ template, draft, story, onPublish, onCancel }: PublishDialogProps) {
  const currentVersion = template.version ?? 1
  // Someone published after this draft started: say so, since publishing replaces their version.
  const publishedMeanwhile = currentVersion > draft.baseVersion
  const sides = [
    { label: `Now: v${currentVersion}`, scene: template.scene },
    { label: 'Your draft', scene: draft.scene },
  ]

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal publish-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        aria-describedby="publish-dialog-body"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <div className="panel-title" id="publish-dialog-title">
          Publish changes to {template.label}?
        </div>
        <div className="publish-dialog__compare">
          {sides.map((side) => (
            <figure key={side.label} className="publish-dialog__side">
              <div className="publish-dialog__thumb" style={{ aspectRatio: `${side.scene.width} / ${side.scene.height}` }}>
                <SceneRenderer scene={side.scene} story={story} checkerboard />
              </div>
              <figcaption className="mono">{side.label}</figcaption>
            </figure>
          ))}
        </div>
        <div id="publish-dialog-body" className="publish-dialog__body">
          <p>
            Everyone on the team gets this version in Make, the Library and the Control Room. Graphics already on air don't
            change until the next TAKE. v{currentVersion} stays in History.
          </p>
          {publishedMeanwhile ? (
            <p className="publish-dialog__warning" role="note">
              {template.updatedBy ? `${template.updatedBy} published` : 'Someone published'} v{currentVersion} after you started
              this draft. Publishing replaces it with your draft.
            </p>
          ) : null}
        </div>
        <div className="publish-dialog__actions">
          <button type="button" className="btn btn--small btn--ghost" autoFocus onClick={onCancel}>
            Keep editing
          </button>
          <button type="button" className="btn btn--small btn--accent" onClick={onPublish}>
            Publish v{currentVersion + 1}
          </button>
        </div>
      </div>
    </div>
  )
}
