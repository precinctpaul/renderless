import { Grid2x2 } from 'lucide-react'
import { setChecker, useChecker } from '../lib/checkerPreference'

/** Toggles the checkerboard behind every monitor and preview. */
export function CheckerToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const on = useChecker()
  return (
    <button
      type="button"
      className={`btn btn--small ${on ? 'btn--accent-soft' : 'btn--ghost'} checker-toggle`.trim()}
      aria-pressed={on}
      aria-label={iconOnly ? 'Checkerboard behind transparent areas' : undefined}
      title="Show transparent areas as a checkerboard"
      onClick={() => setChecker(!on)}
    >
      <Grid2x2 size={14} />
      {iconOnly ? null : <span className="checker-toggle__label">Checker</span>}
    </button>
  )
}
