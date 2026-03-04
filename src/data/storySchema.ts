import type { DataBindingKey, StoryState } from '../types/scene'

export interface StoryFieldDef<K extends DataBindingKey = DataBindingKey> {
  key: K
  label: string
  kind: 'number' | 'string' | 'enum'
  quickControl: boolean
  min?: number
  max?: number
  step?: number
  options?: Array<{ label: string; value: StoryState[K] }>
}

export const STORY_FIELD_DEFS: StoryFieldDef[] = [
  {
    key: 'homeScore',
    label: 'Home Score',
    kind: 'number',
    quickControl: true,
    min: 0,
    step: 1,
  },
  {
    key: 'awayScore',
    label: 'Away Score',
    kind: 'number',
    quickControl: true,
    min: 0,
    step: 1,
  },
  {
    key: 'clock',
    label: 'Game Clock',
    kind: 'string',
    quickControl: true,
  },
  {
    key: 'possession',
    label: 'Possession',
    kind: 'enum',
    quickControl: true,
    options: [
      { label: 'HOME', value: 'home' },
      { label: 'AWAY', value: 'away' },
    ],
  },
  {
    key: 'period',
    label: 'Period',
    kind: 'number',
    quickControl: false,
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'shotClock',
    label: 'Shot Clock',
    kind: 'number',
    quickControl: false,
    min: 0,
    max: 30,
    step: 1,
  },
  {
    key: 'homeFouls',
    label: 'Home Fouls',
    kind: 'number',
    quickControl: false,
    min: 0,
    step: 1,
  },
  {
    key: 'awayFouls',
    label: 'Away Fouls',
    kind: 'number',
    quickControl: false,
    min: 0,
    step: 1,
  },
  {
    key: 'headline',
    label: 'Headline',
    kind: 'string',
    quickControl: false,
  },
]

export const STORY_DEFAULTS: StoryState = {
  homeScore: 875,
  awayScore: 827,
  clock: '11:16',
  possession: 'home',
  period: 4,
  shotClock: 24,
  homeFouls: 3,
  awayFouls: 2,
  headline: 'Defensive rebound',
}

export const BINDABLE_FIELDS = STORY_FIELD_DEFS.filter((field) => field.key !== 'headline')

export const BINDING_KEY_SET = new Set<DataBindingKey>(STORY_FIELD_DEFS.map((field) => field.key))
