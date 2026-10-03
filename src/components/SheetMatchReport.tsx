import { useState } from 'react'
import { AlertTriangle, Check, ClipboardCopy, Minus } from 'lucide-react'
import { IGNORE_COLUMN, headerRowFor, type MatchTarget, type SheetMatch } from '../lib/sheetMatching'

/** Copies the template's field names as a tab-separated header row, ready to paste into row 1 of a sheet. */
export function CopyHeaderRowButton({ targets }: { targets: MatchTarget[] }) {
  const [copied, setCopied] = useState<'yes' | 'blocked' | null>(null)
  if (targets.length === 0) return null
  const header = headerRowFor(targets)
  const readable = targets.map((target) => target.label).join(', ')

  return (
    <button
      type="button"
      className="btn btn--small btn--ghost copy-header"
      title={`Headers: ${readable}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(header)
          setCopied('yes')
        } catch {
          setCopied('blocked')
        }
        window.setTimeout(() => setCopied(null), 4000)
      }}
    >
      {copied === 'yes' ? <Check size={14} /> : <ClipboardCopy size={14} />}
      <span aria-live="polite">
        {copied === 'yes'
          ? 'Copied: paste into row 1'
          : copied === 'blocked'
            ? `Copy blocked. Headers: ${readable}`
            : 'Copy header row'}
      </span>
    </button>
  )
}

interface SheetMatchReportProps {
  match: SheetMatch
  targets: MatchTarget[]
  rowCount: number
  templateLabel: string
  /** Set a column's field by hand (IGNORE_COLUMN leaves it out; null goes back to automatic). */
  onChoose: (columnKey: string, choice: string | null) => void
}

/**
 * What a pasted sheet fills: a one-line summary, every column marked matched / not matched /
 * left out (with a picker to match it by hand), and the template fields the sheet leaves empty.
 */
export function SheetMatchReport({ match, targets, rowCount, templateLabel, onChoose }: SheetMatchReportProps) {
  const total = targets.length
  const allMatched = total > 0 && match.matchedCount === total
  const labelOf = (key?: string) => targets.find((target) => target.key === key)?.label ?? key

  return (
    <div className="sheet-match">
      <div className={`sheet-match__summary ${allMatched ? 'sheet-match__summary--ok' : 'sheet-match__summary--partial'}`} role="status">
        {allMatched ? <Check size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
        <span>
          {total === 0
            ? `${templateLabel} has no fields to fill`
            : `${match.matchedCount} of ${total} ${templateLabel} field${total === 1 ? '' : 's'} matched`}
          {' · '}
          {rowCount} row{rowCount === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="sheet-match__columns" aria-label="Sheet columns">
        {match.columns.map((column) => (
          <li key={column.columnKey} className={`sheet-chip sheet-chip--${column.status}`}>
            <span className="sheet-chip__icon" aria-hidden="true">
              {column.status === 'matched' ? <Check size={13} /> : column.status === 'ignored' ? <Minus size={13} /> : <AlertTriangle size={13} />}
            </span>
            <span className="sheet-chip__text">
              <span className="sheet-chip__name">{column.columnLabel}</span>
              <span className="sheet-chip__detail">
                {column.status === 'matched'
                  ? `→ ${labelOf(column.fieldKey)}${column.manual ? ' (set by hand)' : ''}`
                  : column.status === 'ignored'
                    ? 'Left out'
                    : `No field called “${column.columnLabel}”`}
              </span>
            </span>
            <select
              className="sheet-chip__picker"
              aria-label={`Field for column ${column.columnLabel}`}
              value={column.manual ? (column.status === 'ignored' ? IGNORE_COLUMN : (column.fieldKey ?? '')) : ''}
              onChange={(event) => onChoose(column.columnKey, event.target.value || null)}
            >
              <option value="">Automatic</option>
              {targets.map((target) => (
                <option key={target.key} value={target.key}>
                  Use for {target.label}
                </option>
              ))}
              <option value={IGNORE_COLUMN}>Leave out</option>
            </select>
          </li>
        ))}
      </ul>

      {match.unfilled.length > 0 ? (
        <p className="sheet-match__unfilled">
          Not in your sheet (stays as typed): {match.unfilled.map((target) => target.label).join(', ')}
        </p>
      ) : null}
    </div>
  )
}
