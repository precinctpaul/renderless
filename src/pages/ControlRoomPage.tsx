import { useEffect, useMemo, useState } from 'react'
import { Copy, Keyboard, Star } from 'lucide-react'
import { SceneRenderer } from '../components/SceneRenderer'
import { buildOutputUrl } from '../lib/outputUrls'
import { STORY_FIELD_DEFS } from '../data/storySchema'
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

function toBoundedInteger(rawValue: string, fallback: number, min?: number, max?: number): number {
  const numericValue = Number(rawValue)
  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  let nextValue = Math.floor(numericValue)

  if (Number.isFinite(min)) {
    nextValue = Math.max(nextValue, min ?? nextValue)
  }

  if (Number.isFinite(max)) {
    nextValue = Math.min(nextValue, max ?? nextValue)
  }

  return nextValue
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
  const story = usePlayoutStore((state) => state.story)
  const onAir = usePlayoutStore((state) => state.onAir)
  const transportMode = usePlayoutStore((state) => state.transportMode)
  const transportWsUrl = usePlayoutStore((state) => state.transportWsUrl)
  const transportStatus = usePlayoutStore((state) => state.transportStatus)
  const transportError = usePlayoutStore((state) => state.transportError)

  const cuePreview = usePlayoutStore((state) => state.cuePreview)
  const take = usePlayoutStore((state) => state.take)
  const clearProgram = usePlayoutStore((state) => state.clearProgram)
  const setTransition = usePlayoutStore((state) => state.setTransition)
  const setTransitionDuration = usePlayoutStore((state) => state.setTransitionDuration)
  const adjustScore = usePlayoutStore((state) => state.adjustScore)
  const setStoryValue = usePlayoutStore((state) => state.setStoryValue)
  const setTransportMode = usePlayoutStore((state) => state.setTransportMode)
  const setTransportWsUrl = usePlayoutStore((state) => state.setTransportWsUrl)
  const resetClock = usePlayoutStore((state) => state.resetClock)
  const togglePossession = usePlayoutStore((state) => state.togglePossession)
  const nudgeClock = usePlayoutStore((state) => state.nudgeClock)

  const [copyLabel, setCopyLabel] = useState<string>('')

  const typedOverrideFields = useMemo(
    () => STORY_FIELD_DEFS.filter((field) => !field.quickControl),
    [],
  )
  const quickLaunchTemplates = useMemo(() => {
    const favorites = templates.filter((template) => template.favorite)
    return (favorites.length > 0 ? favorites : templates).slice(0, 6)
  }, [templates])
  const hasTemplates = templates.length > 0

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

          <div className="rundown-launch">
            <div className="inspector-section__label">Quick Launch</div>
            <div className="rundown-launch-grid">
              {quickLaunchTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`btn btn--small ${previewTemplateId === template.id ? 'btn--accent' : 'btn--ghost'}`.trim()}
                  onClick={() => cuePreview(template.id)}
                  disabled={transitionInProgress}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel monitors-panel">
          <div className="monitor-header">
            <span className="panel-title">MONITORS</span>
            <div className="monitor-header__meta">
              <span className={`badge badge--mono ${transitionInProgress ? 'badge--transition' : ''}`.trim()}>
                {transitionInProgress ? 'TRANSITIONING' : 'READY'}
              </span>
              <span className="mono">25 / 45 / 30 LAYOUT LOCK</span>
            </div>
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

          <div className="hotkey-strip mono">
            <Keyboard size={14} />
            <span>SPACE = TAKE</span>
            <span>C = CLEAR</span>
            {transitionInProgress ? <span className="transition-status">TAKE IN PROGRESS</span> : null}
            {copyLabel ? <span className="copy-status">{copyLabel}</span> : null}
          </div>
        </section>

        <aside className="panel story-panel">
          <div className="panel-title">STORY CONTROL</div>
          <p className="panel-subtitle">Typed overrides routed through data binding schema.</p>

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
              onChange={(event) => setStoryValue('clock', event.target.value)}
              placeholder="MM:SS"
            />
          </label>

          <div className="story-actions">
            <button type="button" className="btn btn--ghost" onClick={() => nudgeClock(5)}>
              +00:05
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => nudgeClock(-5)}>
              -00:05
            </button>
          </div>

          <div className="story-actions">
            <button type="button" className="btn btn--ghost" onClick={resetClock}>
              Reset Clock
            </button>
            <button type="button" className="btn btn--ghost" onClick={togglePossession}>
              Possession: {story.possession === 'home' ? 'HOME' : 'AWAY'}
            </button>
          </div>

          <div className="inspector-section story-binding-panel">
            <div className="inspector-section__label">Data Engine Overrides</div>
            <div className="override-grid">
              {typedOverrideFields.map((field) => {
                const key = field.key
                const value = story[key]

                if (field.kind === 'number') {
                  return (
                    <label key={field.key} className="field-label">
                      {field.label}
                      <input
                        className="mono"
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step ?? 1}
                        value={Number(value)}
                        onChange={(event) =>
                          setStoryValue(
                            key,
                            toBoundedInteger(event.target.value, Number(value), field.min, field.max),
                          )
                        }
                      />
                    </label>
                  )
                }

                if (field.kind === 'enum') {
                  return (
                    <label key={field.key} className="field-label">
                      {field.label}
                      <select
                        className="mono"
                        value={String(value)}
                        onChange={(event) => setStoryValue(key, event.target.value as typeof value)}
                      >
                        {(field.options ?? []).map((option) => (
                          <option key={String(option.value)} value={String(option.value)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                }

                return (
                  <label key={field.key} className="field-label">
                    {field.label}
                    <input
                      value={String(value)}
                      onChange={(event) => setStoryValue(key, event.target.value as typeof value)}
                    />
                  </label>
                )
              })}
            </div>
          </div>

          <div className="inspector-section transport-panel">
            <div className="inspector-section__label">Cross-Device Transport</div>
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

            <label className="field-label mono">
              WS URL
              <input
                className="mono"
                value={transportWsUrl}
                placeholder="ws://localhost:8787"
                onChange={(event) => setTransportWsUrl(event.target.value)}
                disabled={transportMode !== 'ws'}
              />
            </label>

            <div className="transport-status mono">
              STATUS: {transportStatus.toUpperCase()}
              {transportError ? ` | ${transportError}` : ''}
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
