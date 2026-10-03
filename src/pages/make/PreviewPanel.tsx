import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { SceneRenderer } from '../../components/SceneRenderer'
import { downloadDataUrl, renderScenePng } from '../../lib/exportScenePng'
import { makeFileName } from '../../lib/makeFields'
import type { MakeState } from './useMake'

interface PreviewPanelProps {
  make: MakeState
  onOverflowChange: (keys: Set<string>) => void
}

const TOLERANCE_PX = 1.5

function sameKeys(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((key) => b.has(key))
}

/**
 * Right column: a read-only render of the filled template and the Export button. The canvas
 * takes no clicks at all, so nothing here can select or move a layer.
 */
export function PreviewPanel({ make, onOverflowChange }: PreviewPanelProps) {
  const { template, scene, story, fields, values, imageSlots, swaps, hiddenImages } = make
  const frameRef = useRef<HTMLDivElement>(null)
  const lastOverflow = useRef<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState('')

  // After each render (and once fonts load), find fields whose text spills out of its box,
  // or whose boxed text runs off the canvas.
  useEffect(() => {
    let cancelled = false
    const measure = () => {
      if (cancelled || !frameRef.current) return
      const root = frameRef.current
      const stage = root.querySelector<HTMLElement>('.scene-renderer__stage')
      const stageRect = stage?.getBoundingClientRect()
      const layerNodes = new Map(
        [...root.querySelectorAll<HTMLElement>('[data-layer-id]')].map((node) => [node.dataset.layerId, node]),
      )
      const found = new Set<string>()
      fields.forEach((field) =>
        field.layerIds.forEach((layerId) => {
          const layerNode = layerNodes.get(layerId)
          const text = layerNode?.querySelector<HTMLElement>('.scene-renderer__text')
          if (!layerNode || !text || layerNode.style.display === 'none') return
          const boxed = text.classList.contains('scene-renderer__text-box')
          const bounds = boxed ? stageRect : layerNode.getBoundingClientRect()
          const rect = text.getBoundingClientRect()
          if (
            bounds &&
            (rect.left < bounds.left - TOLERANCE_PX ||
              rect.top < bounds.top - TOLERANCE_PX ||
              rect.right > bounds.right + TOLERANCE_PX ||
              rect.bottom > bounds.bottom + TOLERANCE_PX)
          ) {
            found.add(field.key)
          }
        }),
      )
      if (!sameKeys(found, lastOverflow.current)) {
        lastOverflow.current = found
        onOverflowChange(found)
      }
    }
    const frame = requestAnimationFrame(measure)
    const timer = window.setTimeout(measure, 250)
    void document.fonts?.ready?.then(measure)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [scene, story, fields, onOverflowChange])

  if (!template || !scene) {
    return <section className="panel make-preview" aria-label="Preview" />
  }

  const sampleFields = fields.filter((field) => !values[field.key]?.trim())
  const placeholderImages = imageSlots.filter((slot) => !swaps[slot.id] && !hiddenImages.includes(slot.id))
  const stillSample = [...sampleFields.map((field) => field.label), ...placeholderImages.map((slot) => slot.name)]
  const fileName = makeFileName(template, fields, values)

  const handleExport = async () => {
    setExporting(true)
    setStatus('')
    try {
      downloadDataUrl(await renderScenePng(scene, story), fileName)
      setStatus(`Saved ${fileName}`)
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="panel make-preview" aria-label="Preview">
      <div className="panel-title">3 · Preview &amp; export</div>
      <div ref={frameRef} className="make-preview__frame" style={{ ['--make-aspect' as string]: `${scene.width} / ${scene.height}` }} aria-hidden="true">
        <SceneRenderer scene={scene} story={story} checkerboard />
      </div>
      <div className="make-preview__meta mono">
        {template.label} · {scene.width}×{scene.height}
      </div>

      <div className="make-export">
        {stillSample.length > 0 ? <p className="make-export__note">Still showing the sample: {stillSample.join(', ')}</p> : null}
        <button type="button" className="btn btn--take make-export__button" onClick={handleExport} disabled={exporting}>
          <Download size={20} />
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
        <p className="make-export__status" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </section>
  )
}
