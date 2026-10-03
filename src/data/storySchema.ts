import type { BindingPrimitive, DataBindingKey, StoryState } from '../types/scene'

/** A named data field a text layer can bind to (e.g. `name`, `quote`). */
export interface StoryFieldDef<K extends DataBindingKey = DataBindingKey> {
  key: K
  label: string
  group?: string
  kind: 'number' | 'string' | 'enum'
  quickControl: boolean
  min?: number
  max?: number
  step?: number
  options?: Array<{ label: string; value: string | number }>
}

/** Fields every install starts with; spreadsheets and the Data page can add more. */
export const STORY_FIELD_DEFS: StoryFieldDef[] = [
  { key: 'name', label: 'Name', group: 'People', kind: 'string', quickControl: true },
  { key: 'title', label: 'Title', group: 'People', kind: 'string', quickControl: true },
  { key: 'name_2', label: 'Second Name', group: 'People', kind: 'string', quickControl: true },
  { key: 'title_2', label: 'Second Title', group: 'People', kind: 'string', quickControl: true },
  { key: 'quote', label: 'Quote', group: 'Quote', kind: 'string', quickControl: true },
  { key: 'quote_author', label: 'Speaker', group: 'Quote', kind: 'string', quickControl: true },
  { key: 'headline', label: 'Headline', group: 'Thumbnail', kind: 'string', quickControl: true },
  { key: 'subhead', label: 'Subhead', group: 'Thumbnail', kind: 'string', quickControl: true },
]

export const DEFAULT_FIELD_VALUES: Record<string, BindingPrimitive> = {
  name: 'Jane Doe',
  title: 'State Senator, District 12',
  name_2: 'Sam Lee',
  title_2: 'Co-host',
  quote: 'Democracy works when everyone has a seat at the table.',
  quote_author: 'Jane Doe',
  headline: 'Big News This Week',
  subhead: 'What it means for you',
}

export const STORY_DEFAULTS: StoryState = {
  bindings: { ...DEFAULT_FIELD_VALUES },
}

/** Field catalog: the built-in fields plus any other key that currently has a value. */
export function fieldDefsFor(values: Record<string, BindingPrimitive>, extra: StoryFieldDef[] = []): StoryFieldDef[] {
  const byKey = new Map<string, StoryFieldDef>()
  ;[...STORY_FIELD_DEFS, ...extra].forEach((field) => byKey.set(field.key, field))
  Object.keys(values).forEach((key) => {
    if (!byKey.has(key)) byKey.set(key, { key, label: labelFromKey(key), group: 'Data', kind: 'string', quickControl: false })
  })
  return [...byKey.values()]
}

/** `quote_author` -> `Quote Author`. */
export function labelFromKey(key: string): string {
  return key
    .split(/[_\s.-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
