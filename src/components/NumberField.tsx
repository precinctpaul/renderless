import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Current value; null shows the field empty (e.g. mixed multi-selection). */
  value: number | null
  onCommit: (value: number) => void
}

function format(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 100) / 100)
}

/**
 * Number input that can be cleared while typing. Valid numbers apply immediately (so the
 * spinner arrows work); an empty or partial entry is kept as a draft and reverts on blur.
 */
export function NumberField({ value, onCommit, onBlur, onKeyDown, className, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <input
      {...rest}
      type="number"
      className={className ?? 'mono'}
      value={draft ?? format(value)}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        const parsed = Number(raw)
        if (raw.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
      }}
      onBlur={(event) => {
        setDraft(null)
        onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
        onKeyDown?.(event)
      }}
    />
  )
}
