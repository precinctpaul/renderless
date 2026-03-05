import { describe, expect, test } from 'vitest'
import {
  buildSimulationBindingValues,
  createSimulationTimeline,
  simulationDelayForEvent,
  type SimulationSpeed,
  type SupportedLeague,
} from '../simulationEngine'

const EXPECTED_EVENT_RANGES: Record<SupportedLeague, { min: number; max: number }> = {
  MLB: { min: 800, max: 1500 },
  NBA: { min: 500, max: 900 },
  NFL: { min: 150, max: 250 },
  NHL: { min: 600, max: 1000 },
  MLS: { min: 400, max: 700 },
}

const EXPECTED_DELAY_RANGES: Record<SimulationSpeed, { min: number; max: number; burstMin: number; burstMax: number }> = {
  SLOW: { min: 800, max: 1600, burstMin: 240, burstMax: 620 },
  NORMAL: { min: 250, max: 700, burstMin: 80, burstMax: 210 },
  FAST: { min: 50, max: 150, burstMin: 35, burstMax: 90 },
}

function assertMonotonicTimeline(league: SupportedLeague) {
  const timeline = createSimulationTimeline({
    league,
    speed: 'NORMAL',
    seed: 20260304,
  })

  expect(timeline.frames.length).toBeGreaterThan(0)

  let previousSequence = 0
  let previousSimTime = 0
  let previousHome = 0
  let previousAway = 0

  timeline.frames.forEach((frame) => {
    expect(frame.event.sequence).toBeGreaterThan(previousSequence)
    expect(frame.event.simTimeMs).toBeGreaterThan(previousSimTime)
    expect(frame.snapshot.game.score.home).toBeGreaterThanOrEqual(previousHome)
    expect(frame.snapshot.game.score.away).toBeGreaterThanOrEqual(previousAway)

    previousSequence = frame.event.sequence
    previousSimTime = frame.event.simTimeMs
    previousHome = frame.snapshot.game.score.home
    previousAway = frame.snapshot.game.score.away
  })
}

describe('simulationEngine', () => {
  test('same seed generates identical event stream and scoreline', () => {
    const timelineA = createSimulationTimeline({
      league: 'NBA',
      speed: 'FAST',
      seed: 424242,
    })
    const timelineB = createSimulationTimeline({
      league: 'NBA',
      speed: 'SLOW',
      seed: 424242,
    })

    expect(timelineA.frames.length).toBe(timelineB.frames.length)
    expect(timelineA.frames[0]?.event.summary).toBe(timelineB.frames[0]?.event.summary)
    expect(timelineA.frames[25]?.event.summary).toBe(timelineB.frames[25]?.event.summary)

    const finalA = timelineA.frames[timelineA.frames.length - 1]!.snapshot.game.score
    const finalB = timelineB.frames[timelineB.frames.length - 1]!.snapshot.game.score
    expect(finalA.home).toBe(finalB.home)
    expect(finalA.away).toBe(finalB.away)
  })

  test('sequence/time ordering and score monotonicity hold across leagues', () => {
    assertMonotonicTimeline('MLB')
    assertMonotonicTimeline('NBA')
    assertMonotonicTimeline('NFL')
    assertMonotonicTimeline('NHL')
    assertMonotonicTimeline('MLS')
  })

  test('bindings expose hierarchy categories and derived analytics/graphics/story values', () => {
    const timeline = createSimulationTimeline({
      league: 'NFL',
      speed: 'NORMAL',
      seed: 777,
    })
    const snapshot = timeline.frames[12]?.snapshot ?? timeline.initialSnapshot
    const bindings = buildSimulationBindingValues(snapshot)

    expect(bindings['Game.League']).toBe('NFL')
    expect(bindings['Game.Score.Home']).toBeTypeOf('number')
    expect(bindings['Analytics.Team.Home.EPA']).toBeTypeOf('number')
    expect(bindings['Graphics.Momentum.Home']).toBeTypeOf('number')
    expect(bindings['Graphics.Pressure.Index']).toBeTypeOf('number')
    expect(bindings['Stories.HotStreak.description']).toBeTypeOf('string')
    expect(bindings['RecentEvents.1.Summary']).toBeTypeOf('string')
    expect(bindings.homeScore).toBe(snapshot.game.score.home)
  })

  test('generated event counts stay inside expected per-league ranges', () => {
    ;(['MLB', 'NBA', 'NFL', 'NHL', 'MLS'] as SupportedLeague[]).forEach((league) => {
      const timeline = createSimulationTimeline({
        league,
        speed: 'NORMAL',
        seed: 20260305,
      })
      const expected = EXPECTED_EVENT_RANGES[league]
      expect(timeline.frames.length).toBeGreaterThanOrEqual(expected.min)
      expect(timeline.frames.length).toBeLessThanOrEqual(expected.max)
    })
  })

  test('speed changes pacing only; event sequence and outcome stay deterministic', () => {
    ;(['MLB', 'NBA', 'NFL', 'NHL', 'MLS'] as SupportedLeague[]).forEach((league) => {
      const slow = createSimulationTimeline({ league, speed: 'SLOW', seed: 8675309 })
      const normal = createSimulationTimeline({ league, speed: 'NORMAL', seed: 8675309 })
      const fast = createSimulationTimeline({ league, speed: 'FAST', seed: 8675309 })

      expect(slow.frames.length).toBe(normal.frames.length)
      expect(normal.frames.length).toBe(fast.frames.length)

      const checkpoints = [0, Math.floor(normal.frames.length / 2), normal.frames.length - 1].filter((index) => index >= 0)
      checkpoints.forEach((index) => {
        expect(slow.frames[index]?.event.summary).toBe(normal.frames[index]?.event.summary)
        expect(normal.frames[index]?.event.summary).toBe(fast.frames[index]?.event.summary)
      })

      const slowFinal = slow.frames[slow.frames.length - 1]!.snapshot.game.score
      const normalFinal = normal.frames[normal.frames.length - 1]!.snapshot.game.score
      const fastFinal = fast.frames[fast.frames.length - 1]!.snapshot.game.score
      expect(slowFinal.home).toBe(normalFinal.home)
      expect(slowFinal.away).toBe(normalFinal.away)
      expect(normalFinal.home).toBe(fastFinal.home)
      expect(normalFinal.away).toBe(fastFinal.away)
    })
  })

  test('playback delay stays inside configured speed windows (burst and non-burst)', () => {
    const timeline = createSimulationTimeline({
      league: 'NBA',
      speed: 'NORMAL',
      seed: 20260305,
    })

    ;(['SLOW', 'NORMAL', 'FAST'] as SimulationSpeed[]).forEach((speed) => {
      const bounds = EXPECTED_DELAY_RANGES[speed]
      timeline.frames.forEach((frame, index) => {
        const previous = index > 0 ? timeline.frames[index - 1]!.event : undefined
        const delay = simulationDelayForEvent(speed, frame.event, previous)
        if (frame.event.burst) {
          expect(delay).toBeGreaterThanOrEqual(bounds.burstMin)
          expect(delay).toBeLessThanOrEqual(bounds.burstMax)
        } else {
          expect(delay).toBeGreaterThanOrEqual(bounds.min)
          expect(delay).toBeLessThanOrEqual(bounds.max)
        }
      })
    })
  })
})
