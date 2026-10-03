import { describe, expect, it } from 'vitest'
import { withoutLegacyFields } from '../persistence'

describe('old sports-demo data', () => {
  it('drops sports fields and replaces sports text in fields that still exist', () => {
    const cleaned = withoutLegacyFields({
      homeScore: 54,
      'Game.clock': '11:16',
      headline: 'Defensive rebound',
      subhead: 'Simulation live: HOM 54 - AWY 50',
      name: 'Jordan Davis pulls down the offensive rebound',
      title: 'Momentum currently balanced',
      quote: 'Democracy works when everyone has a seat at the table.',
      custom: 'Town hall at 7pm',
    })
    expect(cleaned).toEqual({
      headline: 'Big News This Week',
      subhead: 'What it means for you',
      name: 'Jane Doe',
      title: 'State Senator, District 12',
      quote: 'Democracy works when everyone has a seat at the table.',
      custom: 'Town hall at 7pm',
    })
  })
})
