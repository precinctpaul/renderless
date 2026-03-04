import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SceneRenderer } from '../components/SceneRenderer'
import { normalizeOutputFollow } from '../lib/outputUrls'
import { usePlayoutStore } from '../store/playoutStore'

export function OutputFeedPage() {
  const [searchParams] = useSearchParams()

  const follow = normalizeOutputFollow(searchParams.get('follow'))
  const embed = searchParams.get('embed') === '1'
  const debug = searchParams.get('debug') === '1'

  const scene = usePlayoutStore((state) => (follow === 'preview' ? state.previewScene : state.programScene))
  const story = usePlayoutStore((state) => state.story)

  const watermark = useMemo(
    () => `OUTPUT ${follow.toUpperCase()} | ${scene.name} | ${new Date().toLocaleTimeString('en-US')}`,
    [follow, scene.name],
  )

  return (
    <div className={`output-feed-root ${embed ? 'output-feed-root--embed' : ''}`.trim()}>
      <SceneRenderer scene={scene} story={story} className="output-feed-surface" />
      {debug ? <div className="output-watermark mono">{watermark}</div> : null}
    </div>
  )
}
