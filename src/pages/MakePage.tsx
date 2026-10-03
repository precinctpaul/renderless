import { useState } from 'react'
import { FillPanel } from './make/FillPanel'
import { PreviewPanel } from './make/PreviewPanel'
import { TemplatePicker } from './make/TemplatePicker'
import { useMake } from './make/useMake'

/**
 * Make: the staffer fast path. Pick a template, fill its fields, export a PNG. One screen, no
 * layers, snapping or switcher; the layout is read-only and nothing here touches Program.
 */
export function MakePage() {
  const make = useMake()
  const [overflowKeys, setOverflowKeys] = useState<Set<string>>(() => new Set())

  return (
    <section className="screen screen--make">
      <div className="make-layout">
        <TemplatePicker templates={make.templates} selectedId={make.template?.id ?? ''} onSelect={make.selectTemplate} />
        <FillPanel make={make} overflowKeys={overflowKeys} />
        <PreviewPanel make={make} onOverflowChange={setOverflowKeys} />
      </div>
    </section>
  )
}
