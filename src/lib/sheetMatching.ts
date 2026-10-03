import { fieldKeyFromHeader, type DataSheet } from './dataSheet'

/** A template field a sheet column can fill. */
export interface MatchTarget {
  key: string
  label: string
}

export type ColumnMatchStatus = 'matched' | 'unmatched' | 'ignored'

export interface ColumnMatch {
  columnKey: string
  columnLabel: string
  status: ColumnMatchStatus
  /** The field this column fills (matched only). */
  fieldKey?: string
  /** Set by hand rather than by name. */
  manual: boolean
}

export interface SheetMatch {
  columns: ColumnMatch[]
  /** Template fields no column fills. */
  unfilled: MatchTarget[]
  matchedCount: number
  /** column key -> field key, for every matched column. */
  mapping: Record<string, string>
}

/** A hand-made choice for one column: fill this field, or leave the column out. */
export type ManualMapping = Record<string, string>
export const IGNORE_COLUMN = '__ignore__'

/** Other headers people use for the standard fields, best guess first. */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'quote_author'],
  full_name: ['name', 'quote_author'],
  speaker: ['quote_author', 'name'],
  speaker_name: ['quote_author', 'name'],
  author: ['quote_author', 'name'],
  attribution: ['quote_author', 'name'],
  said_by: ['quote_author', 'name'],
  title: ['title'],
  job_title: ['title'],
  role: ['title'],
  position: ['title'],
  office: ['title'],
  host: ['name'],
  host_1: ['name'],
  name_1: ['name'],
  host_2: ['name_2'],
  co_host: ['name_2'],
  cohost: ['name_2'],
  guest: ['name_2'],
  guest_name: ['name_2'],
  second_name: ['name_2'],
  title_1: ['title'],
  host_2_title: ['title_2'],
  guest_title: ['title_2'],
  second_title: ['title_2'],
  quote: ['quote'],
  quote_text: ['quote'],
  statement: ['quote'],
  headline: ['headline'],
  head: ['headline'],
  subhead: ['subhead'],
  subheadline: ['subhead'],
  subtitle: ['subhead'],
  dek: ['subhead'],
}

const squash = (text: string) => fieldKeyFromHeader(text).replace(/_/g, '')

/**
 * Matches sheet columns to a template's fields: hand-made choices first, then exact names
 * ("Quote Author", "quote_author", "QuoteAuthor"), then common aliases ("Speaker"). Each field
 * is filled by at most one column.
 */
export function matchSheet(sheet: Pick<DataSheet, 'columns'>, targets: MatchTarget[], manual: ManualMapping = {}): SheetMatch {
  const targetKeys = new Set(targets.map((target) => target.key))
  const taken = new Set<string>()
  const result = new Map<string, ColumnMatch>()

  sheet.columns.forEach((column) => {
    const choice = manual[column.key]
    if (choice === IGNORE_COLUMN) {
      result.set(column.key, { columnKey: column.key, columnLabel: column.label, status: 'ignored', manual: true })
    } else if (choice && targetKeys.has(choice) && !taken.has(choice)) {
      taken.add(choice)
      result.set(column.key, { columnKey: column.key, columnLabel: column.label, status: 'matched', fieldKey: choice, manual: true })
    }
  })

  type Column = DataSheet['columns'][number]
  const exactMatch = (column: Column) =>
    targets.find(
      (target) =>
        !taken.has(target.key) &&
        (target.key === column.key || squash(target.key) === squash(column.label) || squash(target.label) === squash(column.label)),
    )?.key
  const aliasMatch = (column: Column) => (HEADER_ALIASES[column.key] ?? []).find((key) => targetKeys.has(key) && !taken.has(key))

  // Every exact name first, so "Name" isn't claimed by another column's alias before its own column.
  for (const match of [exactMatch, aliasMatch]) {
    sheet.columns.forEach((column) => {
      if (result.has(column.key)) return
      const fieldKey = match(column)
      if (fieldKey) {
        taken.add(fieldKey)
        result.set(column.key, { columnKey: column.key, columnLabel: column.label, status: 'matched', fieldKey, manual: false })
      }
    })
  }

  const columns = sheet.columns.map(
    (column) => result.get(column.key) ?? { columnKey: column.key, columnLabel: column.label, status: 'unmatched' as const, manual: false },
  )
  const mapping = Object.fromEntries(columns.filter((entry) => entry.fieldKey).map((entry) => [entry.columnKey, entry.fieldKey as string]))
  return {
    columns,
    unfilled: targets.filter((target) => !taken.has(target.key)),
    matchedCount: taken.size,
    mapping,
  }
}

/** The field values one sheet row gives a template. */
export function rowValues(row: Record<string, string>, mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).map(([columnKey, fieldKey]) => [fieldKey, row[columnKey] ?? '']))
}

/** A tab-separated header row for a template's fields; pasted into a sheet it fills one cell each. */
export function headerRowFor(targets: MatchTarget[]): string {
  return targets.map((target) => target.label).join('\t')
}

// Hand-made column choices, remembered per template on this device.
const MEMORY_KEY = 'renderless.sheetMappings.v1'

export function readManualMapping(templateId: string): ManualMapping {
  try {
    const all = JSON.parse(window.localStorage.getItem(MEMORY_KEY) ?? '{}') as Record<string, ManualMapping>
    return all[templateId] ?? {}
  } catch {
    return {}
  }
}

export function writeManualMapping(templateId: string, mapping: ManualMapping) {
  try {
    const all = JSON.parse(window.localStorage.getItem(MEMORY_KEY) ?? '{}') as Record<string, ManualMapping>
    all[templateId] = mapping
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(all))
  } catch {
    // Storage blocked: the choice still applies until reload.
  }
}

/** Sets (or with null, clears) one column's hand-made choice. */
export function withManualChoice(mapping: ManualMapping, columnKey: string, choice: string | null): ManualMapping {
  const next = { ...mapping }
  if (choice === null) delete next[columnKey]
  else {
    // A field can only come from one column: drop other hand-made picks of the same field.
    Object.keys(next).forEach((key) => {
      if (choice !== IGNORE_COLUMN && next[key] === choice) delete next[key]
    })
    next[columnKey] = choice
  }
  return next
}
