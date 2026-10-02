import { createRoot } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { SceneRenderer } from '../components/SceneRenderer'
import type { SceneDefinition, StoryState } from '../types/scene'

// A timer as well as a frame: animation frames pause in background tabs.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 50)
    requestAnimationFrame(() => {
      window.clearTimeout(timer)
      resolve()
    })
  })

/**
 * Renders the scene at its native size (e.g. 1920×1080, 1280×720 for a thumbnail) and returns
 * a PNG data URL. Uses the same SceneRenderer as the editor and outputs, so the file matches
 * what's on screen; a transparent scene background stays transparent.
 */
export async function renderScenePng(scene: SceneDefinition, story: StoryState): Promise<string> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${scene.width}px`,
    height: `${scene.height}px`,
    pointerEvents: 'none',
  })
  document.body.appendChild(host)
  const root = createRoot(host)

  try {
    root.render(<SceneRenderer scene={scene} story={story} className="scene-renderer--export" />)
    // Wait until the renderer has measured itself and draws the stage at scale 1 (it starts at a
    // placeholder size), then for fonts and images.
    const startedAt = Date.now()
    await nextFrame()
    while (Date.now() - startedAt < 3000) {
      const stage = host.querySelector<HTMLElement>('.scene-renderer__stage')
      if (stage && /scale\(1(\.0+)?\)/.test(stage.style.transform)) break
      await nextFrame()
    }
    await document.fonts?.ready
    await Promise.all([...host.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)))
    const node = host.querySelector<HTMLElement>('.scene-renderer')
    if (!node) throw new Error('Scene did not render.')
    return await toPng(node, { width: scene.width, height: scene.height, pixelRatio: 1, cacheBust: true })
  } finally {
    root.unmount()
    host.remove()
  }
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
}
