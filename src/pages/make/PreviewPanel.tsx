import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, Download, X } from 'lucide-react'
import { BATCH_SOFT_LIMIT, planBatch, renderBatchZip } from '../../lib/batchExport'
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
  const { template, baseScene, scene, story, fields, values, imageSlots, swaps, toggles, clearValues, sheet, match } = make
  const frameRef = useRef<HTMLDivElement>(null)
  const lastOverflow = useRef<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const checker = useChecker()
  const [status, setStatus] = useState('')
  // The export just made, until the graphic changes (then the confirmation goes away by itself).
  const [done, setDone] = useState<{ scene: unknown; fileName: string; count?: number; problems?: string[] } | null>(null)
  // Batch export: one graphic per spreadsheet row, packed into a ZIP.
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const batchCancelled = useRef(false)

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

  const batchCount = sheet && match && sheet.rows.length > 1 ? sheet.rows.length : 0

  const handleBatchExport = async () => {
    if (!sheet || !match) return
    if (
      batchCount > BATCH_SOFT_LIMIT &&
      !window.confirm(
        `Export all ${batchCount} graphics? Big batches can slow down or crash the browser. Splitting the sheet into batches of ${BATCH_SOFT_LIMIT} or fewer is safer.`,
      )
    )
      return
    const items = planBatch({ template, scene, fields, values, sheet, mapping: match.mapping })
    batchCancelled.current = false
    setStatus('')
    setDone(null)
    setBatchProgress({ done: 0, total: items.length })
    try {
      const zip = await renderBatchZip(items, renderScenePng, (count) => setBatchProgress({ done: count, total: items.length }), () => batchCancelled.current)
      if (!zip) {
        setStatus('Batch export cancelled. Nothing was saved.')
        return
      }
      const zipName = `${fileName.split('_')[0].replace(/\.png$/, '')}_${items.length}-graphics.zip`
      const url = URL.createObjectURL(zip)
      downloadDataUrl(url, zipName)
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
      const problems = items.filter((item) => item.problems.length > 0).map((item) => `Row ${item.row}: ${item.problems.join(', ')}`)
      setDone({ scene, fileName: zipName, count: items.length, problems })
    } catch (error) {
      setStatus(`Batch export failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setBatchProgress(null)
    }
  }

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
        {batchProgress ? (
          <div className="make-batch-progress">
            <div className="make-batch-progress__row">
              <span>
                Exporting {batchProgress.done} of {batchProgress.total}…
              </span>
              <button type="button" className="btn btn--small btn--ghost" onClick={() => (batchCancelled.current = true)}>
                Cancel
              </button>
            </div>
            <progress max={batchProgress.total} value={batchProgress.done} aria-label="Batch export progress" />
          </div>
        ) : batchCount > 0 ? (
          <>
            {batchCount > BATCH_SOFT_LIMIT ? (
              <p className="make-batch-warning">
                <AlertTriangle size={13} aria-hidden="true" />
                {batchCount} graphics is a big batch and may be slow. Batches of {BATCH_SOFT_LIMIT} or fewer are safer.
              </p>
            ) : null}
            <button type="button" className="btn btn--take make-export__button" onClick={handleBatchExport}>
              <Archive size={20} />
              <span>
                Batch export ({batchCount}) PNG<span className="make-export__plural">s</span>
              </span>
            </button>
            <button type="button" className="btn btn--small btn--ghost make-export__single" onClick={handleExport} disabled={exporting}>
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Export only this row'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--take make-export__button" onClick={handleExport} disabled={exporting}>
            <Download size={20} />
            {exporting ? 'Exporting…' : 'Export PNG'}
          </button>
        )}
        <div role="status" aria-live="polite">
          {done && done.scene === scene ? (
            <div className="make-done">
              <CheckCircle2 size={20} aria-hidden="true" className="make-done__icon" />
              <div className="make-done__text">
                <strong>{done.count ? `Exported ${done.count} graphics` : 'Exported'}</strong>
                <span className="mono">{done.fileName}</span>
                {done.problems && done.problems.length > 0 ? (
                  <span className="make-done__problems">
                    Check {done.problems.length === 1 ? 'this row' : `these ${done.problems.length} rows`}: {done.problems.slice(0, 4).join('; ')}
                    {done.problems.length > 4 ? '; …' : ''}
                  </span>
                ) : null}
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
