import { beforeEach, describe, expect, it } from 'vitest'
import { parseDataSheet } from '../dataSheet'
import {
  IGNORE_COLUMN,
  headerRowFor,
  matchSheet,
  readManualMapping,
  rowValues,
  withManualChoice,
  writeManualMapping,
} from '../sheetMatching'

const QUOTE_FIELDS = [
  { key: 'quote', label: 'Quote' },
  { key: 'quote_author', label: 'Quote Author' },
]

const sheetOf = (text: string) => {
  const sheet = parseDataSheet(text)
  if (!sheet) throw new Error('bad fixture')
  return sheet
}

describe('matchSheet', () => {
  it('matches exact names however they are written', () => {
    for (const header of ['Quote Author', 'quote_author', 'QuoteAuthor', 'QUOTE AUTHOR']) {
      const match = matchSheet(sheetOf(`Quote\t${header}\na\tb`), QUOTE_FIELDS)
      expect(match.matchedCount).toBe(2)
      expect(match.unfilled).toEqual([])
    }
  })

  it('matches common aliases to the field the template actually has', () => {
    const quote = matchSheet(sheetOf('Statement\tSpeaker\na\tb'), QUOTE_FIELDS)
    expect(quote.mapping).toEqual({ statement: 'quote', speaker: 'quote_author' })
    const lowerThird = matchSheet(sheetOf('Speaker\tRole\na\tb'), [
      { key: 'name', label: 'Name' },
      { key: 'title', label: 'Title' },
    ])
    expect(lowerThird.mapping).toEqual({ speaker: 'name', role: 'title' })
  })

  it('lets an exact column beat another column’s alias for the same field', () => {
    const match = matchSheet(sheetOf('Speaker\tQuote Author\tQuote\na\tb\tc'), QUOTE_FIELDS)
    expect(match.mapping.quote_author).toBe('quote_author')
    expect(match.columns.find((column) => column.columnKey === 'speaker')?.status).toBe('unmatched')
  })

  it('flags columns with no field and lists fields the sheet leaves empty', () => {
    const match = matchSheet(sheetOf('Quote\tDate\na\tb'), QUOTE_FIELDS)
    expect(match.matchedCount).toBe(1)
    expect(match.columns.map((column) => column.status)).toEqual(['matched', 'unmatched'])
    expect(match.unfilled.map((field) => field.key)).toEqual(['quote_author'])
  })

  it('applies hand-made choices first, including leaving a column out', () => {
    const sheet = sheetOf('Quote\tWho\tNotes\na\tb\tc')
    const match = matchSheet(sheet, QUOTE_FIELDS, { who: 'quote_author', notes: IGNORE_COLUMN })
    expect(match.mapping).toEqual({ quote: 'quote', who: 'quote_author' })
    expect(match.columns.map((column) => [column.status, column.manual])).toEqual([
      ['matched', false],
      ['matched', true],
      ['ignored', true],
    ])
    // A hand-made pick takes the field away from the column that matched by name.
    const stolen = matchSheet(sheet, QUOTE_FIELDS, { notes: 'quote' })
    expect(stolen.mapping).toEqual({ notes: 'quote' })
  })
})

describe('helpers', () => {
  beforeEach(() => window.localStorage.clear())

  it('turns a row into field values and builds a pasteable header row', () => {
    expect(rowValues({ statement: 'We win', speaker: 'Jane' }, { statement: 'quote', speaker: 'quote_author' })).toEqual({
      quote: 'We win',
      quote_author: 'Jane',
    })
    expect(headerRowFor(QUOTE_FIELDS)).toBe('Quote\tQuote Author')
    // Pasted back in, that header row matches every field.
    expect(matchSheet(sheetOf(`${headerRowFor(QUOTE_FIELDS)}\na\tb`), QUOTE_FIELDS).matchedCount).toBe(2)
  })

  it('remembers hand-made choices per template, one column per field', () => {
    let mapping = withManualChoice({}, 'who', 'quote_author')
    mapping = withManualChoice(mapping, 'speaker', 'quote_author')
    expect(mapping).toEqual({ speaker: 'quote_author' })
    mapping = withManualChoice(mapping, 'speaker', null)
    expect(mapping).toEqual({})
    writeManualMapping('quote-card', { who: 'quote_author' })
    expect(readManualMapping('quote-card')).toEqual({ who: 'quote_author' })
    expect(readManualMapping('lower-third')).toEqual({})
  })
})
