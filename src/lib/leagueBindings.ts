import type { StoryFieldDef } from '../data/storySchema'
import type { SupportedLeague } from './simulationEngine'

export type BindingLevel =
  | 'Core'
  | 'Game'
  | 'Team'
  | 'Player'
  | 'Analytics'
  | 'Graphics'
  | 'Stories'
  | 'RecentEvents'
  | 'Context'

const NBA_ONLY_CORE_KEYS = new Set(['shotClock', 'homeFouls', 'awayFouls'])

export function isBindingKeyVisibleForLeague(key: string, league: SupportedLeague): boolean {
  if (key.startsWith('Context.')) {
    return key.startsWith(`Context.${league}.`)
  }

  if (league !== 'NBA' && NBA_ONLY_CORE_KEYS.has(key)) {
    return false
  }

  return true
}

export function filterBindingFieldsForLeague<T extends StoryFieldDef>(
  fields: T[],
  league: SupportedLeague,
): T[] {
  return fields.filter((field) => isBindingKeyVisibleForLeague(field.key, league))
}

export function deriveBindingLevel(key: string): BindingLevel {
  if (!key.includes('.')) {
    return 'Core'
  }

  if (key.startsWith('Game.')) {
    return 'Game'
  }
  if (key.startsWith('Teams.')) {
    return 'Team'
  }
  if (key.startsWith('Players.')) {
    return 'Player'
  }
  if (key.startsWith('Analytics.')) {
    return 'Analytics'
  }
  if (key.startsWith('Graphics.')) {
    return 'Graphics'
  }
  if (key.startsWith('Stories.')) {
    return 'Stories'
  }
  if (key.startsWith('RecentEvents.')) {
    return 'RecentEvents'
  }
  if (key.startsWith('Context.')) {
    return 'Context'
  }
  return 'Core'
}
