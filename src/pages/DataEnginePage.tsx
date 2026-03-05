import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Shuffle, Square } from 'lucide-react'
import type { SimulationSpeed, SupportedLeague } from '../lib/simulationEngine'
import { usePlayoutStore } from '../store/playoutStore'

const LEAGUES: SupportedLeague[] = ['NBA', 'NFL', 'MLB', 'NHL', 'MLS']
const SPEEDS: SimulationSpeed[] = ['SLOW', 'NORMAL', 'FAST']

function formatBindingValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'n/a'
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  const text = String(value)
  return text.length > 92 ? `${text.slice(0, 89)}...` : text
}

function parseSeed(rawValue: string, fallback: number): number {
  const numericValue = Number(rawValue)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback
  }
  return Math.max(1, Math.floor(numericValue))
}

export function DataEnginePage() {
  const story = usePlayoutStore((state) => state.story)
  const bindingFields = usePlayoutStore((state) => state.bindingFields)

  const simulationLeague = usePlayoutStore((state) => state.simulationLeague)
  const simulationSpeed = usePlayoutStore((state) => state.simulationSpeed)
  const simulationSeed = usePlayoutStore((state) => state.simulationSeed)
  const simulationStatus = usePlayoutStore((state) => state.simulationStatus)
  const simulationCursor = usePlayoutStore((state) => state.simulationCursor)
  const simulationTotalEvents = usePlayoutStore((state) => state.simulationTotalEvents)
  const simulationSnapshot = usePlayoutStore((state) => state.simulationSnapshot)
  const simulationRecentEvents = usePlayoutStore((state) => state.simulationRecentEvents)

  const transportMode = usePlayoutStore((state) => state.transportMode)
  const transportWsUrl = usePlayoutStore((state) => state.transportWsUrl)
  const transportStatus = usePlayoutStore((state) => state.transportStatus)
  const transportError = usePlayoutStore((state) => state.transportError)

  const setSimulationLeague = usePlayoutStore((state) => state.setSimulationLeague)
  const setSimulationSpeed = usePlayoutStore((state) => state.setSimulationSpeed)
  const setSimulationSeed = usePlayoutStore((state) => state.setSimulationSeed)
  const startSimulation = usePlayoutStore((state) => state.startSimulation)
  const pauseSimulation = usePlayoutStore((state) => state.pauseSimulation)
  const resumeSimulation = usePlayoutStore((state) => state.resumeSimulation)
  const stopSimulation = usePlayoutStore((state) => state.stopSimulation)

  const setTransportMode = usePlayoutStore((state) => state.setTransportMode)
  const setTransportWsUrl = usePlayoutStore((state) => state.setTransportWsUrl)
  const adjustScore = usePlayoutStore((state) => state.adjustScore)
  const nudgeClock = usePlayoutStore((state) => state.nudgeClock)
  const resetClock = usePlayoutStore((state) => state.resetClock)
  const togglePossession = usePlayoutStore((state) => state.togglePossession)
  const setStoryValue = usePlayoutStore((state) => state.setStoryValue)

  const [simulationSeedInput, setSimulationSeedInput] = useState<string>(() => String(simulationSeed))
  const [registryQuery, setRegistryQuery] = useState<string>('')

  useEffect(() => {
    setSimulationSeedInput(String(simulationSeed))
  }, [simulationSeed])

  const simulationCanStart = simulationStatus === 'idle' || simulationStatus === 'complete'
  const simulationProgressLabel = simulationTotalEvents > 0 ? `${simulationCursor}/${simulationTotalEvents}` : '0/0'
  const simulationStatusLabel = simulationStatus.toUpperCase()
  const liveBindingCount = bindingFields.length

  const registryGroups = useMemo(() => {
    const query = registryQuery.trim().toLowerCase()
    const matchingFields = query
      ? bindingFields.filter((field) => {
          return (
            field.label.toLowerCase().includes(query) ||
            field.key.toLowerCase().includes(query) ||
            (field.group ?? '').toLowerCase().includes(query)
          )
        })
      : bindingFields

    const byGroup = new Map<string, typeof matchingFields>()
    matchingFields.forEach((field) => {
      const group = field.group ?? 'Ungrouped'
      const existing = byGroup.get(group)
      if (existing) {
        existing.push(field)
      } else {
        byGroup.set(group, [field])
      }
    })

    return [...byGroup.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, fields]) => ({
        group,
        fields: [...fields].sort((left, right) => left.label.localeCompare(right.label)),
      }))
  }, [bindingFields, registryQuery])

  const visibleRegistryCount = useMemo(
    () => registryGroups.reduce((total, group) => total + group.fields.length, 0),
    [registryGroups],
  )

  const commitSeed = () => {
    const nextSeed = parseSeed(simulationSeedInput, simulationSeed)
    setSimulationSeed(nextSeed)
    setSimulationSeedInput(String(nextSeed))
  }

  const randomizeSeed = () => {
    const nextSeed = Math.max(1, Math.floor(Date.now() % 1_000_000_000))
    setSimulationSeed(nextSeed)
    setSimulationSeedInput(String(nextSeed))
  }

  return (
    <section className="screen screen--data-engine">
      <h1>Data Engine</h1>

      <div className="data-engine-layout">
        <aside className="panel data-engine-sidebar">
          <div className="panel-title">Quick Start</div>
          <div className="quick-start-status mono">STATUS: {transportStatus.toUpperCase()}</div>
          <div className="quick-start-status mono">
            {simulationLeague} | {simulationStatusLabel} | EVENTS {simulationProgressLabel}
          </div>

          <div className="sim-action-grid">
            <button
              type="button"
              className={`btn btn--small ${simulationCanStart ? 'btn--accent' : 'btn--ghost'}`.trim()}
              onClick={startSimulation}
              disabled={!simulationCanStart}
            >
              <Play size={13} />
              Start
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={pauseSimulation}
              disabled={simulationStatus !== 'running'}
            >
              <Pause size={13} />
              Pause
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={resumeSimulation}
              disabled={simulationStatus !== 'paused'}
            >
              <Play size={13} />
              Resume
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={stopSimulation}
              disabled={simulationStatus === 'idle'}
            >
              <Square size={13} />
              Stop
            </button>
          </div>

          <label className="field-label mono">League</label>
          <div className="segment-grid segment-grid--five">
            {LEAGUES.map((league) => (
              <button
                key={league}
                type="button"
                className={`segment-btn ${simulationLeague === league ? 'segment-btn--active' : ''}`.trim()}
                onClick={() => setSimulationLeague(league)}
                disabled={simulationStatus === 'running'}
              >
                {league}
              </button>
            ))}
          </div>

          <label className="field-label mono">Speed</label>
          <div className="segment-grid segment-grid--three">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={`segment-btn ${simulationSpeed === speed ? 'segment-btn--active' : ''}`.trim()}
                onClick={() => setSimulationSpeed(speed)}
              >
                {speed}
              </button>
            ))}
          </div>

          <label className="field-label mono">Seed (deterministic)</label>
          <div className="seed-row">
            <input
              className="mono"
              aria-label="Seed (deterministic)"
              value={simulationSeedInput}
              onChange={(event) => setSimulationSeedInput(event.target.value)}
              onBlur={commitSeed}
              disabled={simulationStatus === 'running'}
            />
            <button
              type="button"
              className="icon-btn"
              title="Randomize seed"
              onClick={randomizeSeed}
              disabled={simulationStatus === 'running'}
            >
              <Shuffle size={14} />
            </button>
          </div>

          <div className="inspector-section">
            <div className="inspector-section__label">Live Snapshot</div>
            <div className="data-status-grid">
              <div className="binding-preview mono">
                {simulationSnapshot
                  ? `${simulationSnapshot.teams.home.abbr} ${simulationSnapshot.game.score.home} - ${simulationSnapshot.teams.away.abbr} ${simulationSnapshot.game.score.away}`
                  : 'No simulation snapshot'}
              </div>
              <div className="binding-preview mono">
                {simulationSnapshot
                  ? `Momentum ${simulationSnapshot.graphics.momentum.home}/${simulationSnapshot.graphics.momentum.away} | Pressure ${simulationSnapshot.graphics.pressure.index}`
                  : 'Momentum unavailable'}
              </div>
              <div className="binding-preview mono">
                {simulationSnapshot ? `Story: ${simulationSnapshot.story.headline}` : 'Story engine idle'}
              </div>
              <div className="binding-preview mono">
                {simulationSnapshot
                  ? `Hottest: ${simulationSnapshot.graphics.hottestPlayer.name} (${simulationSnapshot.graphics.hottestPlayer.metric})`
                  : 'Hottest player unavailable'}
              </div>
            </div>
            <div className="binding-preview mono">Bindings Ready: {liveBindingCount} tokens</div>
          </div>

          <div className="inspector-section">
            <div className="inspector-section__label">Manual Controls</div>
            <div className="story-actions">
              <button type="button" className="btn btn--small btn--ghost" onClick={() => adjustScore('home', 1)}>
                Home +1
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => adjustScore('away', 1)}>
                Away +1
              </button>
            </div>
            <div className="story-actions">
              <button type="button" className="btn btn--small btn--ghost" onClick={() => nudgeClock(5)}>
                +00:05
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => nudgeClock(-5)}>
                -00:05
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={resetClock}>
                Reset Clock
              </button>
            </div>
            <label className="field-label mono">
              Headline
              <input value={story.headline} onChange={(event) => setStoryValue('headline', event.target.value)} />
            </label>
            <button type="button" className="btn btn--small btn--ghost" onClick={togglePossession}>
              Possession: {story.possession === 'home' ? 'HOME' : 'AWAY'}
            </button>
          </div>

          <div className="inspector-section">
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
              {transportMode.toUpperCase()} | {transportStatus.toUpperCase()}
              {transportError ? ` | ${transportError}` : ''}
            </div>
          </div>
        </aside>

        <section className="panel data-engine-main">
          <div className="data-engine-main__header">
            <span className="panel-title">Registry Schema Tree</span>
            <span className="mono data-engine-main__meta">{visibleRegistryCount} signals</span>
          </div>

          <div className="registry-toolbar">
            <input
              className="mono"
              placeholder="Filter signals..."
              value={registryQuery}
              onChange={(event) => setRegistryQuery(event.target.value)}
            />
          </div>

          <div className="registry-scroll">
            {registryGroups.length === 0 ? (
              <div className="rundown-empty">No bindings match your search.</div>
            ) : (
              registryGroups.map((group) => (
                <section key={group.group} className="registry-group">
                  <header className="registry-group__header mono">
                    {group.group} <span>{group.fields.length}</span>
                  </header>
                  <div className="registry-group__rows">
                    {group.fields.map((field) => (
                      <article key={field.key} className="registry-row">
                        <div className="registry-row__left">
                          <div className="registry-row__label">{field.label}</div>
                          <div className="registry-row__key mono">{field.key}</div>
                        </div>
                        <div className="registry-row__value mono">
                          {formatBindingValue(story.bindings?.[field.key])}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </section>

        <aside className="panel data-engine-egress">
          <div className="panel-title">Egress Pulse</div>
          <p className="panel-subtitle">Live output stream heartbeat and event pulse.</p>
          <div className="egress-feed">
            {simulationRecentEvents.length === 0 ? (
              <div className="rundown-empty">Waiting for signal data...</div>
            ) : (
              simulationRecentEvents.map((event) => (
                <article key={`${event.sequence}-${event.simTimeMs}`} className="egress-item">
                  <div className="egress-item__meta mono">
                    <span>{event.clock}</span>
                    <span>#{event.sequence}</span>
                  </div>
                  <div className="egress-item__summary">{event.summary}</div>
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
