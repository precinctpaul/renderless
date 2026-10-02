import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePlayoutStore } from '../store/playoutStore'
import { rowLabel } from '../lib/dataSheet'

/** Step through spreadsheet rows live (e.g. the next speaker's lower third). Hidden with no sheet. */
export function DataRowStepper() {
  const sheet = usePlayoutStore((state) => state.dataSheet)
  const rowIndex = usePlayoutStore((state) => state.dataRowIndex)
  const selectDataRow = usePlayoutStore((state) => state.selectDataRow)

  if (!sheet || sheet.rows.length === 0) return null

  const step = (direction: -1 | 1) => {
    const current = rowIndex ?? (direction === 1 ? -1 : sheet.rows.length)
    selectDataRow(Math.min(Math.max(current + direction, 0), sheet.rows.length - 1))
  }

  return (
    <div className="data-row-stepper">
      <div className="panel-title">
        Data Row <Link to="/data" className="data-row-stepper__link">edit</Link>
      </div>
      <div className="data-row-stepper__label" title={sheet.sourceName}>
        {rowIndex === null ? 'No row selected' : `${rowIndex + 1}/${sheet.rows.length} · ${rowLabel(sheet, sheet.rows[rowIndex])}`}
      </div>
      <div className="data-row-stepper__buttons">
        <button type="button" className="btn btn--small" aria-label="Previous row" onClick={() => step(-1)} disabled={rowIndex === 0}>
          <ChevronLeft size={14} />
          Prev
        </button>
        <button type="button" className="btn btn--small" aria-label="Next row" onClick={() => step(1)} disabled={rowIndex === sheet.rows.length - 1}>
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
