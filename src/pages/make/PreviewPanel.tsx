import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Download, X } from 'lucide-react'
import { CheckerToggle } from '../../components/CheckerToggle'
import { useChecker } from '../../lib/checkerPreference'
import { SceneRenderer } from '../../components/SceneRenderer'
import { downloadDataUrl, renderScenePng } from '../../lib/exportScenePng'
import { fieldToggleKey, isToggleOn, makeFileName } from '../../lib/makeFields'
import { textThatWontFit } from '../../lib/sceneLayout'
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
  const { template, baseScene, scene, story, fields, values, imageSlots, swaps, toggles, clearValues } = make
  const frameRef = useRef<HTMLDivElement>(null)
  const lastOverflow = useRef<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const checker = useChecker()
  const [status, setStatus] = useState('')
  // The export just made, until the graphic changes (then the confirmation goes away by itself).
  const [done, setDone] = useState<{ scene: unknown; fileName: string } | null>(null)

  // After each render (and once fonts load), find fields whose text spills out of its box,
  // or whose boxed text runs off the canvas.
  useEffect(() => {
    let cancelled = false
    const measure = () => {
      if (cancelled || !frameRef.current || !scene) return
      const root = frameRef.current
      const stage = root.querySelector<HTMLElement>('.scene-renderer__stage')
      const stageRect = stage?.getBoundingClientRect()
      const layerNodes = new Map(
        [...root.querySelectorAll<HTMLElement>('[data-layer-id]')].map((node) => [node.dataset.layerId, node]),
      )
      // Text that auto layout couldn't shrink enough, plus anything drawn outside its box.
      const tooLong = new Set(textThatWontFit(scene, story))
      const found = new Set<string>(fields.filter((field) => field.layerIds.some((id) => tooLong.has(id))).map((field) => field.key))
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

  const isOn = (key: string) => isToggleOn(baseScene ?? template.scene, toggles, key)
  const sampleFields = fields.filter((field) => !values[field.key]?.trim() && (!field.optional || isOn(fieldToggleKey(field.key))))
  const placeholderImages = imageSlots.filter((slot) => !swaps[slot.id] && isOn(slot.id))
  const stillSample = [...sampleFields.map((field) => field.label), ...placeholderImages.map((slot) => slot.name)]
  const fileName = makeFileName(template, fields, values)

  const handleExport = async () => {
    setExporting(true)
    setStatus('')
    setDone(null)
    try {
      downloadDataUrl(await renderScenePng(scene, story), fileName)
      setDone({ scene, fileName })
    } catch (error) {
      setStatus(`Export failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="panel make-preview" aria-label="Preview">
      <div className="make-preview__head">
        <div className="panel-title">3 · Preview &amp; export</div>
        <CheckerToggle />
      </div>
      <div ref={frameRef} className={`make-preview__frame ${checker ? 'monitor-surface--checker' : ''}`.trim()} style={{ ['--make-aspect' as string]: `${scene.width} / ${scene.height}` }} aria-hidden="true">
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
        <div role="status" aria-live="polite">
          {done && done.scene === scene ? (
            <div className="make-done">
              <CheckCircle2 size={20} aria-hidden="true" className="make-done__icon" />
              <div className="make-done__text">
                <strong>Exported</strong>
                <span className="mono">{done.fileName}</span>
              </div>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => {
                  clearValues()
                  setDone(null)
                }}
              >
                Start a new one
              </button>
              <button type="button" className="make-done__close" aria-label="Dismiss" onClick={() => setDone(null)}>
                <X size={16} />
              </button>
            </div>
          ) : status ? (
            <p className="make-export__status">{status}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
