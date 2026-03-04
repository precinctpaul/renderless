import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SceneRenderer } from '../components/SceneRenderer'
import { normalizeOutputFollow } from '../lib/outputUrls'
import { usePlayoutStore } from '../store/playoutStore'

const OUTPUT_HEARTBEAT_BASE_KEY = 'renderless.output.heartbeat.v1'
const STALE_THRESHOLD_MS = 15000

declare global {
  interface Window {
    __renderlessOutputStatus?: {
      follow: 'preview' | 'program'
      stale: boolean
      ageMs: number
      updatedAt: number
      heartbeatAt: number
      sceneName: string
    }
  }
}

export function OutputFeedPage() {
  const [searchParams] = useSearchParams()

  const follow = normalizeOutputFollow(searchParams.get('follow'))
  const embed = searchParams.get('embed') === '1'
  const debug = searchParams.get('debug') === '1'

  const scene = usePlayoutStore((state) => (follow === 'preview' ? state.previewScene : state.programScene))
  const story = usePlayoutStore((state) => state.story)
  const updatedAt = usePlayoutStore((state) => state.updatedAt)
  const [tick, setTick] = useState<number>(updatedAt)
  const hasLoggedStaleRef = useRef<boolean>(false)

  useEffect(() => {
    const heartbeatKey = `${OUTPUT_HEARTBEAT_BASE_KEY}.${follow}`

    const handle = window.setInterval(() => {
      const now = Date.now()
      setTick(now)

      try {
        window.localStorage.setItem(
          heartbeatKey,
          JSON.stringify({
            ts: now,
            follow,
            updatedAt: usePlayoutStore.getState().updatedAt,
            sceneName: usePlayoutStore.getState()[follow === 'preview' ? 'previewScene' : 'programScene'].name,
          }),
        )
      } catch {
        // Ignore heartbeat storage failures.
      }
    }, 1000)

    return () => window.clearInterval(handle)
  }, [follow])

  const ageMs = Math.max(0, tick - updatedAt)
  const stale = ageMs > STALE_THRESHOLD_MS

  useEffect(() => {
    window.__renderlessOutputStatus = {
      follow,
      stale,
      ageMs,
      updatedAt,
      heartbeatAt: Date.now(),
      sceneName: scene.name,
    }

    if (stale && debug && !hasLoggedStaleRef.current) {
      hasLoggedStaleRef.current = true
      console.warn(`[RenderLess] output-feed ${follow} is stale (${Math.round(ageMs)}ms since last playout update).`)
    }

    if (!stale) {
      hasLoggedStaleRef.current = false
    }
  }, [ageMs, debug, follow, scene.name, stale, updatedAt])

  const watermark = useMemo(() => {
    const status = stale ? `STALE ${Math.round(ageMs / 1000)}s` : 'LIVE'
    return `OUTPUT ${follow.toUpperCase()} | ${scene.name} | ${status} | ${new Date().toLocaleTimeString('en-US')}`
  }, [ageMs, follow, scene.name, stale])

  return (
    <div className={`output-feed-root ${embed ? 'output-feed-root--embed' : ''}`.trim()}>
      <SceneRenderer scene={scene} story={story} className="output-feed-surface" />
      {debug ? <div className="output-watermark mono">{watermark}</div> : null}
    </div>
  )
}
