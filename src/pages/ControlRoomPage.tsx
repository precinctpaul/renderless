import { useEffect, useMemo, useRef, useState } from 'react'
import { DataRowStepper } from '../components/DataRowStepper'
import { Check, Copy, RefreshCw, Star } from 'lucide-react'
import { SceneRenderer } from '../components/SceneRenderer'
import { ProgramTransitionSurface } from '../components/ProgramTransitionSurface'
import { buildDefaultTransportWsUrl, buildOutputUrl } from '../lib/outputUrls'
import { usePlayoutStore, type TransitionType } from '../store/playoutStore'
import { takeBlocker } from '../store/takeReadiness'
import { previewHasUnpublishedEdits } from '../store/templateCatalog'
import { StudioLookPicker } from '../components/StudioLookPicker'
import { CheckerToggle } from '../components/CheckerToggle'
import { useChecker } from '../lib/checkerPreference'
import { AirStatus } from '../components/AirStatus'
import { ConsoleDrawer } from '../components/ConsoleDrawer'
import { smartTemplate } from '../data/templates'
import { brandStyle } from '../data/brandStyles'

/** How long C must be held to clear Program, so a stray keypress can't take a graphic off air. */
const CLEAR_HOLD_MS = 400

const TRANSITIONS: Array<{ id: TransitionType; label: string }> = [
  { id: 'cut', label: 'Cut' },
  { id: 'fade', label: 'Fade' },
  { id: 'lumaWipe', label: 'Luma wipe' },
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
  const checker = useChecker()
  const studioStyle = usePlayoutStore((state) => state.studioStyle)
  const studioLayouts = usePlayoutStore((state) => state.studioLayouts)
  const previewIsBuiltIn = templates.find((template) => template.id === previewTemplateId)?.builtIn ?? false
  const previewLayouts = previewIsBuiltIn ? (smartTemplate(previewTemplateId)?.layouts ?? []) : []
  const lookSummary = previewIsBuiltIn
    ? [brandStyle(studioStyle).name, previewLayouts.find((layout) => layout.id === (studioLayouts[previewTemplateId] ?? previewLayouts[0]?.id))?.label]
        .filter(Boolean)
        .join(' · ')
    : 'Custom template'
  // Your unpublished draft is in Preview (from Design): offer the team's version instead. The draft is kept.
  const previewIsDraft = usePlayoutStore(previewHasUnpublishedEdits)
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

  // CLEAR takes Program off air only after a short hold (C key or the button), so a slip can't.
  const startClearHold = () => {
    if (!canClear || clearTimer.current !== null) return
    setClearArming(true)
    setClearHint('')
    clearTimer.current = window.setTimeout(() => {
      clearTimer.current = null
      setClearArming(false)
      clearProgram()
    }, CLEAR_HOLD_MS)
  }
  const cancelClearHold = (hint?: string) => {
    if (clearTimer.current === null) return
    window.clearTimeout(clearTimer.current)
    clearTimer.current = null
    setClearArming(false)
    if (hint) {
      setClearHint(hint)
      window.setTimeout(() => setClearHint(''), 2000)
    }
  }
  const clearHold = useRef({ start: startClearHold, cancel: cancelClearHold })
  useEffect(() => {
    clearHold.current = { start: startClearHold, cancel: cancelClearHold }
  })

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
      if ((event.key === 'c' || event.key === 'C') && !event.repeat) {
        event.preventDefault()
        clearHold.current.start()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'c' || event.key === 'C') clearHold.current.cancel('Hold C to clear Program')
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
  }, [take])

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
                    <CheckerToggle iconOnly />
                    {renderCopyButton('preview')}
                  </span>
                </header>
                <div className="monitor-fit">
                  <div className={`monitor-surface ${checker ? 'monitor-surface--checker' : ''}`.trim()}>
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
                <ConsoleDrawer title="Look" summary={lookSummary} storageKey="look">
                  <StudioLookPicker />
                </ConsoleDrawer>
              </article>

              <div className="transition-console" aria-label="Take controls">
                <label className="console-field">
                  <span className="console-field__label">Transition</span>
                  <select
                    value={transitionType}
                    onChange={(event) => setTransition(event.target.value as TransitionType)}
                    disabled={transitionInProgress}
                  >
                    {TRANSITIONS.map((transition) => (
                      <option key={transition.id} value={transition.id}>
                        {transition.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="console-field">
                  <span className="console-field__label">
                    Duration <span className="mono">{transitionDurationMs} ms</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={50}
                    value={transitionDurationMs}
                    onChange={(event) => setTransitionDuration(Number(event.target.value))}
                    disabled={transitionInProgress || transitionType === 'cut'}
                  />
                </label>

                <div className="take-group">
                  <button
                    type="button"
                    className={`btn btn--take btn--wide btn--tactile ${transitionInProgress ? 'btn--take-pending' : ''}`.trim()}
                    onClick={take}
                    disabled={Boolean(takeBlockedBy)}
                    aria-describedby="take-reason"
                    aria-keyshortcuts="Space"
                  >
                    <span>{transitionInProgress ? 'TAKING...' : 'TAKE'}</span>
                    <kbd className="console-kbd" aria-hidden="true">Space</kbd>
                  </button>
                  <p id="take-reason" className="take-reason">
                    {takeBlockedBy && !transitionInProgress ? takeBlockedBy : ''}
                  </p>
                  {previewIsDraft && !transitionInProgress ? (
                    <button type="button" className="btn btn--small btn--ghost" onClick={() => cuePreview(previewTemplateId)}>
                      Use published version
                    </button>
                  ) : null}
                </div>

                <div className="clear-group">
                  <button
                    type="button"
                    className={`btn btn--wide clear-button ${clearArming ? 'clear-button--arming' : ''}`.trim()}
                    disabled={!canClear}
                    aria-describedby="clear-help"
                    aria-keyshortcuts="C"
                    onPointerDown={(event) => {
                      if (event.button === 0) startClearHold()
                    }}
                    onPointerUp={() => cancelClearHold('Hold to clear Program')}
                    onPointerLeave={() => cancelClearHold()}
                    onPointerCancel={() => cancelClearHold()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.repeat) startClearHold()
                    }}
                    onKeyUp={(event) => {
                      if (event.key === 'Enter') cancelClearHold('Hold to clear Program')
                    }}
                  >
                    <span>CLEAR</span>
                    <kbd className="console-kbd" aria-hidden="true">Hold C</kbd>
                  </button>
                  <p id="clear-help" className="take-reason">
                    {clearHint || (canClear ? 'Press and hold to take Program off air.' : 'Nothing on air.')}
                  </p>
                </div>

                {transitionInProgress ? <p className="transition-status mono">TAKE IN PROGRESS</p> : null}
                <span className="visually-hidden" role="status" aria-live="polite">
                  {copyLabel}
                </span>
              </div>

              <article className="monitor-tile monitor-tile--program">
                <header>
                  <span>Program</span>
                  <span className="monitor-tile__meta">
                    <AirStatus className="air-status--compact" />
                    <CheckerToggle iconOnly />
                    {renderCopyButton('program')}
                  </span>
                </header>
                <div className="monitor-fit">
                  <div className={`monitor-surface ${checker ? 'monitor-surface--checker' : ''}`.trim()}>
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
                <ConsoleDrawer title="Outputs" storageKey="outputs">
                  <div className="story-actions">
                    <button
                      type="button"
                      className={`btn btn--small ${transportMode === 'local' ? 'btn--accent-soft' : 'btn--ghost'}`.trim()}
                      aria-pressed={transportMode === 'local'}
                      onClick={() => setTransportMode('local')}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      className={`btn btn--small ${transportMode === 'ws' ? 'btn--accent-soft' : 'btn--ghost'}`.trim()}
                      aria-pressed={transportMode === 'ws'}
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
                </ConsoleDrawer>
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
