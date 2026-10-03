import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { usePlayoutStore } from '../store/playoutStore'
import { fieldKeyFromHeader, rowLabel, type DataSheet } from '../lib/dataSheet'
import { makeFieldsOf } from '../lib/makeFields'
import { matchSheet, readManualMapping } from '../lib/sheetMatching'
import { CopyHeaderRowButton, SheetMatchReport } from '../components/SheetMatchReport'
import { SheetPasteBox } from '../components/SheetPasteBox'

/**
 * Data: the named fields templates bind to (name, title, quote...) and an optional spreadsheet
 * whose rows fill those fields. Picking a row updates Preview and Program instantly.
 */
export function DataPage() {
  const values = usePlayoutStore((state) => state.story.bindings)
  const fields = usePlayoutStore((state) => state.bindingFields)
  const sheet = usePlayoutStore((state) => state.dataSheet)
  const rowIndex = usePlayoutStore((state) => state.dataRowIndex)
  const setFieldValue = usePlayoutStore((state) => state.setFieldValue)
  const removeField = usePlayoutStore((state) => state.removeField)
  const loadDataSheet = usePlayoutStore((state) => state.loadDataSheet)
  const selectDataRow = usePlayoutStore((state) => state.selectDataRow)
  const clearDataSheet = usePlayoutStore((state) => state.clearDataSheet)
  const chooseDataColumn = usePlayoutStore((state) => state.chooseDataColumn)
  const previewScene = usePlayoutStore((state) => state.previewScene)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const previewLabel = usePlayoutStore((state) => state.templates.find((template) => template.id === state.previewTemplateId)?.label ?? state.previewScene.name)
  const mappingRevision = usePlayoutStore((state) => state.dataMappingRevision)

  const [newFieldName, setNewFieldName] = useState('')
  const [status, setStatus] = useState('')

  // Sheets are matched against the template in Preview: that's what a row will fill next.
  const targets = useMemo(() => makeFieldsOf(previewScene), [previewScene])
  const match = useMemo(
    () => (sheet ? matchSheet(sheet, targets, readManualMapping(previewTemplateId)) : null),
    // mappingRevision: re-read the remembered choices after one changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sheet, targets, previewTemplateId, mappingRevision],
  )

  const loadSheet = (parsed: DataSheet) => {
    loadDataSheet(parsed)
    setStatus(`Loaded ${parsed.rows.length} rows from ${parsed.sourceName}. Pick a row to fill the fields (this updates Preview and Program).`)
  }

  const addField = () => {
    const key = fieldKeyFromHeader(newFieldName)
    if (!newFieldName.trim()) return
    setFieldValue(key, values[key] ?? '')
    setNewFieldName('')
    setStatus(`Added field "${key}". Bind a text layer to it in Design.`)
  }

  const step = (direction: -1 | 1) => {
    if (!sheet || sheet.rows.length === 0) return
    const current = rowIndex ?? (direction === 1 ? -1 : sheet.rows.length)
    selectDataRow(Math.min(Math.max(current + direction, 0), sheet.rows.length - 1))
  }

  return (
    <section className="screen screen--data">
      <div className="data-layout">
        <section className="panel data-fields">
          <div className="panel-title">Fields</div>
          <p className="panel-subtitle">
            Text layers bound to a field show its value everywhere: Design, Preview, Program and Output.
          </p>
          <div className="data-fields__list">
            {fields.map((field) => (
              <label key={field.key} className="data-field">
                <span className="data-field__head">
                  <span className="data-field__label">{field.label}</span>
                  <span className="data-field__key mono">{field.label.toLowerCase() === field.key ? '' : field.key}</span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--mini"
                    title={`Clear ${field.label}`}
                    aria-label={`Remove ${field.label}`}
                    onClick={(event) => {
                      event.preventDefault()
                      removeField(field.key)
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
                <textarea
                  rows={String(values[field.key] ?? '').length > 60 ? 3 : 1}
                  value={String(values[field.key] ?? '')}
                  placeholder="(empty)"
                  onChange={(event) => setFieldValue(field.key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <form
            className="data-fields__add"
            onSubmit={(event) => {
              event.preventDefault()
              addField()
            }}
          >
            <input value={newFieldName} placeholder="New field, e.g. event_date" onChange={(event) => setNewFieldName(event.target.value)} />
            <button type="submit" className="btn btn--small" disabled={!newFieldName.trim()}>
              <Plus size={14} />
              Add
            </button>
          </form>
        </section>

        <section className="panel data-sheet">
          <div className="data-sheet__header">
            <div>
              <div className="panel-title">Spreadsheet</div>
              <p className="panel-subtitle">
                One row per graphic. Column headers become fields ("Speaker Name" becomes <span className="mono">speaker_name</span>).
              </p>
            </div>
            <div className="data-sheet__actions">
              <CopyHeaderRowButton targets={targets} />
              {sheet ? (
                <button type="button" className="btn btn--small btn--ghost" onClick={clearDataSheet}>
                  <X size={14} />
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          {sheet && match ? (
            <>
              <SheetMatchReport match={match} targets={targets} rowCount={sheet.rows.length} templateLabel={previewLabel} onChoose={chooseDataColumn} />
              <div className="data-sheet__nav">
                <button type="button" className="btn btn--small" onClick={() => step(-1)} disabled={rowIndex === 0}>
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <span className="mono data-sheet__position">
                  {rowIndex === null ? 'No row selected' : `Row ${rowIndex + 1} of ${sheet.rows.length}: ${rowLabel(sheet, sheet.rows[rowIndex])}`}
                </span>
                <button type="button" className="btn btn--small" onClick={() => step(1)} disabled={rowIndex === sheet.rows.length - 1}>
                  Next
                  <ChevronRight size={14} />
                </button>
                <span className="mono data-sheet__source">{sheet.sourceName}</span>
              </div>
              <div className="data-sheet__table-wrap">
                <table className="data-sheet__table">
                  <thead>
                    <tr>
                      <th className="mono">#</th>
                      {sheet.columns.map((column) => (
                        <th
                          key={column.key}
                          title={column.key}
                          className={`data-sheet__th--${match.columns.find((entry) => entry.columnKey === column.key)?.status ?? 'unmatched'}`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.map((row, index) => (
                      <tr
                        key={index}
                        className={index === rowIndex ? 'data-sheet__row--active' : ''}
                        onClick={() => selectDataRow(index)}
                      >
                        <td className="mono">{index + 1}</td>
                        {sheet.columns.map((column) => (
                          <td key={column.key}>{row[column.key]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="data-sheet__empty">
              <SheetPasteBox onSheet={loadSheet} rows={8} />
            </div>
          )}
          {status ? <div className="data-sheet__status mono">{status}</div> : null}
        </section>
      </div>
    </section>
  )
}
