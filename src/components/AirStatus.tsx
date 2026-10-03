import { usePlayoutStore } from '../store/playoutStore'

/** Plain-words on-air state with a dot: red "LIVE · ON AIR" or gray "OFF AIR". Announced when it changes. */
export function AirStatus({ className }: { className?: string }) {
  const onAir = usePlayoutStore((state) => state.onAir)
  return (
    <span className={`air-status ${onAir ? 'air-status--live' : 'air-status--off'} ${className ?? ''}`.trim()} role="status" aria-live="polite">
      <span className="air-status__dot" aria-hidden="true" />
      {onAir ? 'LIVE · ON AIR' : 'OFF AIR'}
    </span>
  )
}
