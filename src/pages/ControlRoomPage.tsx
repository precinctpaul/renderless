import { useState } from 'react'
import { Copy, Star } from 'lucide-react'
import { SceneRenderer } from '../components/SceneRenderer'
import { buildOutputUrl } from '../lib/outputUrls'
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
  const story = usePlayoutStore((state) => state.story)
  const onAir = usePlayoutStore((state) => state.onAir)

  const cuePreview = usePlayoutStore((state) => state.cuePreview)
  const take = usePlayoutStore((state) => state.take)
  const clearProgram = usePlayoutStore((state) => state.clearProgram)
  const setTransition = usePlayoutStore((state) => state.setTransition)
  const setTransitionDuration = usePlayoutStore((state) => state.setTransitionDuration)
  const adjustScore = usePlayoutStore((state) => state.adjustScore)
  const setClock = usePlayoutStore((state) => state.setClock)
  const resetClock = usePlayoutStore((state) => state.resetClock)
  const togglePossession = usePlayoutStore((state) => state.togglePossession)

  const [copyLabel, setCopyLabel] = useState<string>('')

  const copyFeedUrl = async (follow: 'preview' | 'program') => {
    const copied = await copyToClipboard(buildOutputUrl(follow))
    setCopyLabel(copied ? `${follow.toUpperCase()} URL copied` : 'Clipboard unavailable')
    window.setTimeout(() => setCopyLabel(''), 1800)
  }

  return (
    <section className="screen screen--control-room">
      <h1>Control Room</h1>

      <div className="control-layout">
        <aside className="panel rundown-panel">
          <div className="panel-title">RUNDOWN</div>
          <p className="panel-subtitle">Cue templates to Preview. TAKE pushes Preview to Program.</p>

          <div className="rundown-list">
            {templates.map((template) => {
              const isPreview = previewTemplateId === template.id
              const isProgram = programTemplateId === template.id

              return (
                <button
                  key={template.id}
                  type="button"
                  className={`rundown-item ${isPreview ? 'rundown-item--preview' : ''}`.trim()}
                  onClick={() => cuePreview(template.id)}
                >
                  <span>{template.label}</span>
                  <span className="rundown-status">
                    {template.favorite ? <Star size={13} /> : null}
                    {isProgram ? 'PGM' : isPreview ? 'PVW' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="panel monitors-panel">
          <div className="monitor-header">
            <span className="panel-title">MONITORS</span>
            <span className="mono">16:9 LOCKED</span>
          </div>

          <article className="monitor-tile">
            <header>
              <span>Preview</span>
              <span className="mono">{previewScene.name}</span>
            </header>
            <div className="monitor-surface">
              <SceneRenderer scene={previewScene} story={story} checkerboard />
            </div>
          </article>

          <div className="action-strip">
            <div className="transition-group">
              {TRANSITIONS.map((transition) => (
                <button
                  key={transition.id}
                  type="button"
                  className={`btn btn--small ${transitionType === transition.id ? 'btn--accent' : 'btn--ghost'}`.trim()}
                  onClick={() => setTransition(transition.id)}
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
              />
            </label>

            <div className="take-group">
              <button type="button" className="btn btn--take btn--wide" onClick={take}>
                TAKE
              </button>
              <button type="button" className="btn btn--ghost btn--wide" onClick={clearProgram}>
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
          </div>

          <article className="monitor-tile">
            <header>
              <span>Program</span>
              <span className={`badge badge--mono ${onAir ? 'badge--air' : ''}`.trim()}>{onAir ? 'ON AIR' : 'CLEAR'}</span>
            </header>
            <div className="monitor-surface">
              <SceneRenderer scene={programScene} story={story} checkerboard />
            </div>
          </article>

          {copyLabel ? <div className="copy-status mono">{copyLabel}</div> : null}
        </section>

        <aside className="panel story-panel">
          <div className="panel-title">STORY CONTROL</div>
          <p className="panel-subtitle">High-frequency overrides only. Data engine owns the rest.</p>

          <div className="score-control">
            <div>
              <div className="label">HOME</div>
              <div className="score mono">{story.homeScore}</div>
              <div className="score-buttons">
                <button type="button" className="btn btn--ghost" onClick={() => adjustScore('home', 1)}>
                  +1
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => adjustScore('home', -1)}>
                  -1
                </button>
              </div>
            </div>

            <div>
              <div className="label">AWAY</div>
              <div className="score mono">{story.awayScore}</div>
              <div className="score-buttons">
                <button type="button" className="btn btn--ghost" onClick={() => adjustScore('away', 1)}>
                  +1
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => adjustScore('away', -1)}>
                  -1
                </button>
              </div>
            </div>
          </div>

          <label className="field-label mono">
            GAME CLOCK
            <input
              className="mono"
              value={story.clock}
              onChange={(event) => setClock(event.target.value)}
              placeholder="MM:SS"
            />
          </label>

          <div className="story-actions">
            <button type="button" className="btn btn--ghost" onClick={resetClock}>
              Reset Clock
            </button>
            <button type="button" className="btn btn--ghost" onClick={togglePossession}>
              Possession: {story.possession === 'home' ? 'HOME' : 'AWAY'}
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}
