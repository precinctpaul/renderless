/**
 * Spreadsheet rows for filling templates: a CSV file, or cells pasted straight from Google
 * Sheets / Excel (tab-separated). The first row is the header; each header becomes a field key.
 */

export interface DataSheetColumn {
  /** Field key layers bind to, e.g. "Speaker Name" -> "speaker_name". */
  key: string
  /** The header as written in the sheet. */
  label: string
}

export interface DataSheet {
  sourceName: string
  columns: DataSheetColumn[]
  rows: Record<string, string>[]
}

/** "Speaker Name" -> "speaker_name"; keeps existing snake_case keys as they are. */
export function fieldKeyFromHeader(header: string): string {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return key || 'column'
}

/** Splits delimited text into rows of cells, honouring "quoted, cells" and doubled quotes. */
function splitDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }
    if (char === '"' && cell === '') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

/** Parses CSV or tab-separated text. Returns null when there is no header plus at least one row. */
export function parseDataSheet(text: string, sourceName = 'Pasted data'): DataSheet | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const cells = splitDelimited(text.replace(/^\uFEFF/, ''), delimiter)
  if (cells.length < 2) return null

  const used = new Map<string, number>()
  const columns = cells[0].map((header, index) => {
    const label = header.trim() || `Column ${index + 1}`
    const base = fieldKeyFromHeader(label)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return { key: count === 0 ? base : `${base}_${count + 1}`, label }
  })

  const rows = cells.slice(1).map((values) =>
    Object.fromEntries(columns.map((column, index) => [column.key, (values[index] ?? '').trim()])),
  )
  return { sourceName, columns, rows }
}

/** A short label for a row: its first non-empty cell. */
export function rowLabel(sheet: DataSheet, row: Record<string, string>): string {
  for (const column of sheet.columns) {
    const value = row[column.key]
    if (value) return value
  }
  return '(empty row)'
}
