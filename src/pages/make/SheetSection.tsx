import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react'
import { CopyHeaderRowButton, SheetMatchReport } from '../../components/SheetMatchReport'
import { SheetPasteBox } from '../../components/SheetPasteBox'
import { rowLabel } from '../../lib/dataSheet'
import type { MakeState } from './useMake'

/** Optional: fill the fields from spreadsheet rows. Collapsed until used. */
export function SheetSection({ make }: { make: MakeState }) {
  const { template, fields, sheet, rowIndex, match, loadSheet, selectRow, clearSheet, chooseColumn } = make
  const [open, setOpen] = useState(false)
  if (!template || fields.length === 0) return null

  if (!sheet || !match) {
    return (
      <div className="make-sheet">
        <div className="make-sheet__head">
          <button type="button" className="make-sheet__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Fill from a spreadsheet
          </button>
          {open ? <CopyHeaderRowButton targets={fields} /> : null}
        </div>
        {open ? <SheetPasteBox onSheet={loadSheet} /> : null}
      </div>
    )
  }

  const step = (direction: -1 | 1) => {
    const current = rowIndex ?? (direction === 1 ? -1 : sheet.rows.length)
    selectRow(Math.min(Math.max(current + direction, 0), sheet.rows.length - 1))
  }

  return (
    <div className="make-sheet make-sheet--loaded">
      <div className="make-sheet__head">
        <span className="make-sheet__title">Spreadsheet</span>
        <CopyHeaderRowButton targets={fields} />
        <button type="button" className="btn btn--small btn--ghost" onClick={clearSheet}>
          <X size={14} />
          Remove
        </button>
      </div>
      <div className="make-sheet__rows">
        <button type="button" className="btn btn--small" aria-label="Previous row" onClick={() => step(-1)} disabled={rowIndex === 0}>
          <ChevronLeft size={14} />
        </button>
        <select
          aria-label="Spreadsheet row"
          value={rowIndex ?? ''}
          onChange={(event) => selectRow(event.target.value === '' ? null : Number(event.target.value))}
        >
          {rowIndex === null ? <option value="">Pick a row</option> : null}
          {sheet.rows.map((row, index) => (
            <option key={index} value={index}>
              Row {index + 1}: {rowLabel(sheet, row)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--small" aria-label="Next row" onClick={() => step(1)} disabled={rowIndex === sheet.rows.length - 1}>
          <ChevronRight size={14} />
        </button>
      </div>
      <SheetMatchReport match={match} targets={fields} rowCount={sheet.rows.length} templateLabel={template.label} onChoose={chooseColumn} />
    </div>
  )
}
