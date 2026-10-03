import { useEffect, useMemo, useRef, useState } from 'react'
import { DataRowStepper } from '../components/DataRowStepper'
import { Check, Copy, Keyboard, RefreshCw, Star } from 'lucide-react'
import { SceneRenderer } from '../components/SceneRenderer'
import { ProgramTransitionSurface } from '../components/ProgramTransitionSurface'
import { buildDefaultTransportWsUrl, buildOutputUrl } from '../lib/outputUrls'
import { usePlayoutStore, type TransitionType } from '../store/playoutStore'
import { takeBlocker } from '../store/takeReadiness'
import { AirStatus } from '../components/AirStatus'

/** How long C must be held to clear Program, so a stray keypress can't take a graphic off air. */
const CLEAR_HOLD_MS = 400

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
  const programTransition = usePlayoutStore((state) => state.programTransition)
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
  const [copiedFollow, setCopiedFollow] = useState<'preview' | 'program' | null>(null)
  const [confirmingNewRoom, setConfirmingNewRoom] = useState(false)
  const takeBlockedBy = usePlayoutStore(takeBlocker)
  const [clearArming, setClearArming] = useState(false)
  const [clearHint, setClearHint] = useState('')
  const clearTimer = useRef<number | null>(null)
  const canClear = onAir || transitionInProgress
  const transportRoomId = usePlayoutStore((state) => state.transportRoomId)
  const rotateTransportRoom = usePlayoutStore((state) => state.rotateTransportRoom)

  // The confirm state expires on its own and Escape cancels it, so a stray click never rotates.
  useEffect(() => {
    if (!confirmingNewRoom) {
      return
    }

    const timeout = window.setTimeout(() => setConfirmingNewRoom(false), 4000)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmingNewRoom(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [confirmingNewRoom])

  const handleNewRoom = () => {
    if (!confirmingNewRoom) {
      setConfirmingNewRoom(true)
      return
    }

    setConfirmingNewRoom(false)
    const nextRoomId = rotateTransportRoom()
    setCopyLabel(`New room ${nextRoomId}. Old output links are disconnected; copy the URLs again.`)
    window.setTimeout(() => setCopyLabel(''), 4000)
  }

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
        if (!takeBlocker(usePlayoutStore.getState())) take()
      }

      // CLEAR needs C held down; a tap only explains that.
      if ((event.key === 'c' || event.key === 'C') && !event.repeat && canClear && clearTimer.current === null) {
        event.preventDefault()
        setClearArming(true)
        setClearHint('')
        clearTimer.current = window.setTimeout(() => {
          clearTimer.current = null
          setClearArming(false)
          clearProgram()
        }, CLEAR_HOLD_MS)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if ((event.key === 'c' || event.key === 'C') && clearTimer.current !== null) {
        window.clearTimeout(clearTimer.current)
        clearTimer.current = null
        setClearArming(false)
        setClearHint('Hold C to clear Program')
        window.setTimeout(() => setClearHint(''), 2000)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      // Leaving the page (or Program going off air) mid-hold cancels the clear.
      if (clearTimer.current !== null) {
        window.clearTimeout(clearTimer.current)
        clearTimer.current = null
        setClearArming(false)
      }
    }
  }, [clearProgram, take, canClear])

  const copyFeedUrl = async (follow: 'preview' | 'program') => {
    // Only touch transport settings when they change, so copying never forces a reconnect.
    const defaultWsUrl = buildDefaultTransportWsUrl()
    if (transportWsUrl !== defaultWsUrl) {
      setTransportWsUrl(defaultWsUrl)
    }
    if (transportMode !== 'ws') {
      setTransportMode('ws')
    }

    const copied = await copyToClipboard(buildOutputUrl(follow))
    // Feedback swaps the button label in place (and is announced to screen readers) so nothing reflows.
    setCopiedFollow(copied ? follow : null)
    setCopyLabel(copied ? `${follow.toUpperCase()} URL copied (WebSocket relay armed)` : 'Clipboard unavailable')
    window.setTimeout(() => {
      setCopyLabel('')
      setCopiedFollow(null)
    }, 1800)
  }

  const renderCopyButton = (follow: 'preview' | 'program') => {
    const label = follow === 'preview' ? 'Copy Preview URL' : 'Copy Program URL'
    const copied = copiedFollow === follow
    return (
      <button
        type="button"
        className={`btn btn--small btn--ghost copy-button ${copied ? 'copy-button--copied' : ''}`.trim()}
        aria-label={label}
        onClick={() => copyFeedUrl(follow)}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? 'Copied' : 'Copy URL'}</span>
      </button>
    )
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
          <DataRowStepper />
        </aside>

        <section className="control-main">
          <div className="control-stack">
            <section className="panel monitors-panel control-top-row">
              <article className="monitor-tile monitor-tile--preview">
                <header>
                  <span>Preview</span>
                  <span className="monitor-tile__meta">
                    <span className="mono monitor-tile__scene">{previewScene.name}</span>
                    {renderCopyButton('preview')}
                  </span>
                </header>
                <div className="monitor-fit">
                  <div className="monitor-surface">
                    <SceneRenderer
                      scene={previewScene}
                      story={story}
                      checkerboard
                      showActionSafe
                      showTitleSafe
                      showCanvasBounds
                    />
                  </div>
                </div>
              </article>

              <div className="transition-console">
                <div className="console-section">
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
                </div>

                <div className="take-group">
                  <button
                    type="button"
                    className={`btn btn--take btn--wide btn--tactile ${transitionInProgress ? 'btn--take-pending' : ''}`.trim()}
                    onClick={take}
                    disabled={Boolean(takeBlockedBy)}
                    aria-describedby="take-reason"
                  >
                    {transitionInProgress ? 'TAKING...' : 'TAKE'}
                  </button>
                  <p id="take-reason" className="take-reason">
                    {takeBlockedBy && !transitionInProgress ? takeBlockedBy : ''}
                  </p>
                </div>

                <div className="console-section console-section--outputs">
                  <div className="panel-title">Output Transport</div>
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
                  <div className="transport-status mono" title={transportWsUrl}>
                    {transportMode.toUpperCase()} | ROOM {transportRoomId}
                  </div>
                  <button
                    type="button"
                    className={`btn btn--small btn--wide new-room-button ${confirmingNewRoom ? 'new-room-button--confirm' : 'btn--ghost'}`.trim()}
                    onClick={handleNewRoom}
                    title="Generate a new room code. Every existing Output link stops updating."
                  >
                    <RefreshCw size={14} />
                    <span>{confirmingNewRoom ? (onAir ? 'On air: click to confirm' : 'Click to confirm') : 'New room'}</span>
                  </button>
                </div>

                <div className="hotkey-strip mono">
                  <Keyboard size={14} />
                  <span>SPACE = TAKE</span>
                  <span>HOLD C = CLEAR</span>
                  {clearHint ? <span className="clear-hint">{clearHint}</span> : null}
                  {transitionInProgress ? <span className="transition-status">TAKE IN PROGRESS</span> : null}
                </div>
                <span className="visually-hidden" role="status" aria-live="polite">
                  {copyLabel}
                </span>
              </div>

              <article className="monitor-tile monitor-tile--program">
                <header>
                  <span>Program</span>
                  <span className="monitor-tile__meta">
                    <AirStatus className="air-status--compact" />
                    {renderCopyButton('program')}
                    <button
                      type="button"
                      className={`btn btn--small clear-button ${clearArming ? 'clear-button--arming' : ''}`.trim()}
                      onClick={clearProgram}
                      disabled={!canClear}
                      title="Take Program off air (or hold C)"
                    >
                      CLEAR
                    </button>
                  </span>
                </header>
                <div className="monitor-fit">
                  <div className="monitor-surface">
                    <ProgramTransitionSurface
                      scene={programScene}
                      story={story}
                      transition={programTransition}
                      showActionSafe
                      showTitleSafe
                      showCanvasBounds
                    />
                  </div>
                </div>
              </article>
            </section>

            <div className="control-bins">
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
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
