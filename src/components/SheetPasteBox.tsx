import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { parseDataSheet, type DataSheet } from '../lib/dataSheet'

interface SheetPasteBoxProps {
  onSheet: (sheet: DataSheet) => void
  rows?: number
}

const TYPING_DELAY_MS = 300

/**
 * Paste cells from Google Sheets / Excel (or drop in a CSV) and they load at once: no button.
 * Typed text loads once typing pauses. Says why when the text isn't usable yet.
 */
export function SheetPasteBox({ onSheet, rows = 5 }: SheetPasteBoxProps) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tryLoad = (text: string, sourceName: string): boolean => {
    const sheet = parseDataSheet(text, sourceName)
    if (!sheet) {
      setProblem(
        text.trim().split(/\r?\n/).filter((line) => line.trim()).length < 2
          ? 'Include the header row and at least one row under it.'
          : 'Couldn’t read that. Copy the cells straight from the sheet, header row included.',
      )
      return false
    }
    setProblem('')
    setDraft('')
    onSheet(sheet)
    return true
  }

  // Typing (rather than pasting) loads after a short pause.
  useEffect(() => {
    if (!draft.trim()) return
    const timer = window.setTimeout(() => tryLoad(draft, 'Pasted data'), TYPING_DELAY_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the text changes
  }, [draft])

  return (
    <div className="sheet-paste">
      <textarea
        rows={rows}
        value={draft}
        aria-label="Paste spreadsheet rows"
        aria-describedby="sheet-paste-help"
        placeholder={'Paste cells from Google Sheets or Excel, header row included:\n\nQuote\tQuote Author\nWe will win.\tJane Doe'}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text')
          if (text && tryLoad(text, 'Pasted data')) event.preventDefault()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (!event.target.value.trim()) setProblem('')
        }}
      />
      <div className="sheet-paste__foot">
        <span id="sheet-paste-help" className={problem ? 'sheet-paste__problem' : 'sheet-paste__help'} role={problem ? 'alert' : undefined}>
          {problem || 'Loads as soon as you paste.'}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) tryLoad(await file.text(), file.name)
          }}
        />
        <button type="button" className="btn btn--small" onClick={() => fileInputRef.current?.click()}>
          <FileSpreadsheet size={14} />
          Upload CSV
        </button>
      </div>
    </div>
  )
}
