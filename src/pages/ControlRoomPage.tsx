import { useEffect, useMemo, useState } from 'react'
import { Copy, Keyboard, Star } from 'lucide-react'
import { SceneRenderer } from '../components/SceneRenderer'
import { buildDefaultTransportWsUrl, buildOutputUrl } from '../lib/outputUrls'
import { usePlayoutStore, type TransitionType } from '../store/playoutStore'

const TRANSITIONS: Array<{ id: TransitionType; label: string }> = [
  { id: 'cut', label: 'CUT' },
  { id: 'fade', label: 'FADE' },
  { id: 'lumaWipe', label: 'LUMA WIPE' },
]

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function ControlRoomPage() {
  const templates = usePlayoutStore((state) => state.templates)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const programTemplateId = usePlayoutStore((state) => state.programTemplateId)
  const previewScene = usePlayoutStore((state) => state.previewScene)
  const programScene = usePlayoutStore((state) => state.programScene)
  const transitionType = usePlayoutStore((state) => state.transitionType)
  const transitionDurationMs = usePlayoutStore((state) => state.transitionDurationMs)
  const transitionInProgress = usePlayoutStore((state) => state.transitionInProgress)
  const onAir = usePlayoutStore((state) => state.onAir)
  const story = usePlayoutStore((state) => state.story)
  const transportMode = usePlayoutStore((state) => state.transportMode)
  const transportWsUrl = usePlayoutStore((state) => state.transportWsUrl)

  const cuePreview = usePlayoutStore((state) => state.cuePreview)
  const take = usePlayoutStore((state) => state.take)
  const clearProgram = usePlayoutStore((state) => state.clearProgram)
  const setTransition = usePlayoutStore((state) => state.setTransition)
  const setTransitionDuration = usePlayoutStore((state) => state.setTransitionDuration)
  const setTransportMode = usePlayoutStore((state) => state.setTransportMode)
  const setTransportWsUrl = usePlayoutStore((state) => state.setTransportWsUrl)

  const [copyLabel, setCopyLabel] = useState<string>('')

  const hasTemplates = templates.length > 0
  const favoriteTemplates = useMemo(() => templates.filter((template) => template.favorite).slice(0, 6), [templates])
  const quickLaunchTemplates = useMemo(() => {
    const prioritized = templates.filter((template) => !template.favorite)
    return prioritized.slice(0, 6)
  }, [templates])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        take()
      }

      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault()
        clearProgram()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearProgram, take])

  const copyFeedUrl = async (follow: 'preview' | 'program') => {
    const defaultWsUrl = buildDefaultTransportWsUrl()
    setTransportWsUrl(defaultWsUrl)
    setTransportMode('ws')

    const copied = await copyToClipboard(buildOutputUrl(follow))
    setCopyLabel(copied ? `${follow.toUpperCase()} URL copied (WebSocket relay armed)` : 'Clipboard unavailable')
    window.setTimeout(() => setCopyLabel(''), 1800)
  }

  return (
    <section className="screen screen--control-room">
      <h1>Control Room</h1>

      <div className="control-layout">
        <aside className="panel rundown-panel">
          <div className="panel-title">Template Library</div>
          <p className="panel-subtitle">Cue to Preview. TAKE pushes Preview to Program.</p>

          <div className="rundown-list">
            {!hasTemplates ? <div className="rundown-empty">No templates available.</div> : null}
            {templates.map((template) => {
              const isPreview = previewTemplateId === template.id
              const isProgram = programTemplateId === template.id
              const statusTokens: string[] = []

              if (isPreview) {
                statusTokens.push('PVW')
              }

              if (isProgram) {
                statusTokens.push('PGM')
              }

              return (
                <button
                  key={template.id}
                  type="button"
                  className={`rundown-item ${isPreview ? 'rundown-item--preview' : ''} ${isProgram ? 'rundown-item--program' : ''}`.trim()}
                  onClick={() => cuePreview(template.id)}
                >
                  <span>{template.label}</span>
                  <span className="rundown-status">
                    {template.favorite ? <Star size={13} /> : null}
                    {statusTokens.length > 0 ? <span className="mono">{statusTokens.join(' / ')}</span> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="control-main">
          <section className="panel monitors-panel control-top-row">
            <article className="monitor-tile">
              <header>
                <span>Preview</span>
                <span className="mono">{previewScene.name}</span>
              </header>
              <div className="monitor-surface">
                <SceneRenderer scene={previewScene} story={story} checkerboard />
              </div>
            </article>

            <div className="transition-console">
              <div className="panel-title">Transitions</div>
              <div className="transition-group">
                {TRANSITIONS.map((transition) => (
                  <button
                    key={transition.id}
                    type="button"
                    className={`btn btn--small ${transitionType === transition.id ? 'btn--accent' : 'btn--ghost'}`.trim()}
                    onClick={() => setTransition(transition.id)}
                    disabled={transitionInProgress}
                  >
                    {transition.label}
                  </button>
                ))}
              </div>

              <label className="range-wrap mono">
                TRANSITION {transitionDurationMs}ms
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={50}
                  value={transitionDurationMs}
                  onChange={(event) => setTransitionDuration(Number(event.target.value))}
                  disabled={transitionInProgress}
                />
              </label>

              <div className="take-group">
                <button
                  type="button"
                  className={`btn btn--take btn--wide btn--tactile ${transitionInProgress ? 'btn--take-pending' : ''}`.trim()}
                  onClick={take}
                  disabled={!hasTemplates || transitionInProgress}
                >
                  {transitionInProgress ? 'TAKING...' : 'TAKE'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--wide btn--tactile"
                  onClick={clearProgram}
                  disabled={!onAir && !transitionInProgress}
                >
                  CLEAR
                </button>
              </div>

              <div className="copy-group">
                <button type="button" className="btn btn--small btn--ghost" onClick={() => copyFeedUrl('preview')}>
                  <Copy size={14} />
                  Copy Preview URL
                </button>
                <button type="button" className="btn btn--small btn--ghost" onClick={() => copyFeedUrl('program')}>
                  <Copy size={14} />
                  Copy Program URL
                </button>
              </div>

              <div className="story-actions">
                <button
                  type="button"
                  className={`btn btn--small ${transportMode === 'local' ? 'btn--accent' : 'btn--ghost'}`.trim()}
                  onClick={() => setTransportMode('local')}
                >
                  Local
                </button>
                <button
                  type="button"
                  className={`btn btn--small ${transportMode === 'ws' ? 'btn--accent' : 'btn--ghost'}`.trim()}
                  onClick={() => setTransportMode('ws')}
                >
                  WebSocket
                </button>
              </div>
              <div className="transport-status mono">{transportMode.toUpperCase()} | {transportWsUrl}</div>

              <div className="hotkey-strip mono">
                <Keyboard size={14} />
                <span>SPACE = TAKE</span>
                <span>C = CLEAR</span>
                {transitionInProgress ? <span className="transition-status">TAKE IN PROGRESS</span> : null}
                {copyLabel ? <span className="copy-status">{copyLabel}</span> : null}
              </div>
            </div>

            <article className="monitor-tile">
              <header>
                <span>Program</span>
                <span className={`badge badge--mono ${onAir ? 'badge--air' : ''}`.trim()}>{onAir ? 'ON AIR' : 'CLEAR'}</span>
              </header>
              <div className="monitor-surface">
                <SceneRenderer scene={programScene} story={story} />
              </div>
            </article>
          </section>

          <section className="panel control-thumb-row">
            <div className="panel-title">Favorites</div>
            <div className="template-thumb-grid">
              {favoriteTemplates.length === 0 ? (
                <div className="rundown-empty">No favorites pinned yet.</div>
              ) : (
                favoriteTemplates.map((template) => (
                  <button
                    key={`favorite-${template.id}`}
                    type="button"
                    className={`template-thumb ${previewTemplateId === template.id ? 'template-thumb--active' : ''}`.trim()}
                    onClick={() => cuePreview(template.id)}
                  >
                    <div className="template-thumb__surface">
                      <SceneRenderer scene={template.scene} story={story} />
                    </div>
                    <div className="template-thumb__label mono">{template.label}</div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="panel control-thumb-row">
            <div className="panel-title">Quick Launch</div>
            <div className="template-thumb-grid">
              {quickLaunchTemplates.length === 0 ? (
                <div className="rundown-empty">No additional templates available.</div>
              ) : (
                quickLaunchTemplates.map((template) => (
                  <button
                    key={`quick-${template.id}`}
                    type="button"
                    className={`template-thumb ${previewTemplateId === template.id ? 'template-thumb--active' : ''}`.trim()}
                    onClick={() => cuePreview(template.id)}
                  >
                    <div className="template-thumb__surface">
                      <SceneRenderer scene={template.scene} story={story} checkerboard />
                    </div>
                    <div className="template-thumb__label mono">{template.label}</div>
                  </button>
                ))
              )}
            </div>
          </section>
        </section>
      </div>
    </section>
  )
}
