import { useMemo, useState } from 'react'
import { Move3D, Redo2, Undo2, Upload } from 'lucide-react'
import { StageCanvas } from '../components/StageCanvas'
import { usePlayoutStore } from '../store/playoutStore'

const CREATION_ITEMS = ['TEXT', 'SHAPE', 'FIGMA', 'RIVE']

function displayNumber(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)}` : '0'
}

export function DesignPage() {
  const scene = usePlayoutStore((state) => state.previewScene)
  const story = usePlayoutStore((state) => state.story)
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)

  const orderedLayers = useMemo(() => [...scene.layers].reverse(), [scene.layers])
  const activeSelectedLayerId =
    selectedLayerId && scene.layers.some((layer) => layer.id === selectedLayerId)
      ? selectedLayerId
      : (orderedLayers[0]?.id ?? '')
  const selectedLayer = scene.layers.find((layer) => layer.id === activeSelectedLayerId) ?? null

  return (
    <section className="screen screen--design">
      <div className="design-layout">
        <aside className="panel stage-sidebar">
          <div className="sidebar-tabs">
            <button type="button" className="tab-btn tab-btn--active">
              Layers
            </button>
            <button type="button" className="tab-btn">
              Assets
            </button>
          </div>

          <div className="sidebar-heading">
            <div className="title">STAGE PRO</div>
            <div className="subtitle">STUDIO EDITOR</div>
          </div>

          <div className="icon-row">
            <button type="button" className="icon-btn" aria-label="Undo">
              <Undo2 size={15} />
            </button>
            <button type="button" className="icon-btn" aria-label="Redo">
              <Redo2 size={15} />
            </button>
          </div>

          <div className="creation-grid">
            {CREATION_ITEMS.map((item) => (
              <button key={item} type="button" className="creation-btn">
                {item}
              </button>
            ))}
          </div>

          <div className="pill-toggle">
            <button type="button" className="pill-toggle__item pill-toggle__item--active">
              SELECT
            </button>
            <button type="button" className="pill-toggle__item">
              PAN
            </button>
          </div>

          <div className="layer-list" role="listbox" aria-label="Layer stack">
            {orderedLayers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`layer-item ${activeSelectedLayerId === layer.id ? 'layer-item--active' : ''}`.trim()}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <span>{layer.name}</span>
                <Move3D size={14} />
              </button>
            ))}
          </div>

          <button type="button" className="btn btn--ghost btn--small">
            <Upload size={14} />
            Upload Asset
          </button>
        </aside>

        <section className="panel stage-center" aria-label="Stage canvas">
          <div className="stage-toolbar stage-toolbar--top">
            <span className="mono">CANVAS {scene.width} x {scene.height}</span>
            <div className="stage-toolbar__actions">
              <button type="button" className="btn btn--small btn--accent">
                Save Template
              </button>
              <button type="button" className="btn btn--small btn--ghost">
                Export
              </button>
            </div>
          </div>

          <div className="stage-toolbar stage-toolbar--subtle">
            <button type="button" className="btn btn--small btn--ghost">
              Rulers
            </button>
            <button type="button" className="btn btn--small btn--ghost">
              Guides
            </button>
            <button type="button" className="btn btn--small btn--ghost">
              Grid
            </button>
            <button type="button" className="btn btn--small btn--ghost btn--accent-soft">
              Snap
            </button>
            <span className="mono">1920x1080 VIRTUAL SPACE</span>
          </div>

          <div className="stage-canvas-wrap">
            <StageCanvas
              scene={scene}
              story={story}
              selectedLayerId={activeSelectedLayerId}
              onSelectLayer={(layerId) => setSelectedLayerId(layerId || null)}
            />
          </div>
        </section>

        <aside className="panel inspector" aria-label="Layer inspector">
          <div className="panel-title">LAYER INSPECTOR</div>

          {selectedLayer ? (
            <>
              <div className="inspector-section">
                <div className="inspector-section__label mono">SELECTED (1)</div>
                <div className="inspector-layer-name">{selectedLayer.name}</div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__label">Transform</div>
                <div className="transform-grid">
                  <label>
                    X
                    <input className="mono" value={displayNumber(selectedLayer.x)} readOnly />
                  </label>
                  <label>
                    Y
                    <input className="mono" value={displayNumber(selectedLayer.y)} readOnly />
                  </label>
                  <label>
                    W
                    <input className="mono" value={displayNumber(selectedLayer.width)} readOnly />
                  </label>
                  <label>
                    H
                    <input className="mono" value={displayNumber(selectedLayer.height)} readOnly />
                  </label>
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__label">Style</div>
                {'fill' in selectedLayer ? (
                  <label>
                    Fill
                    <input className="mono" value={selectedLayer.fill} readOnly />
                  </label>
                ) : (
                  <>
                    <label>
                      Text
                      <input value={selectedLayer.text} readOnly />
                    </label>
                    <label>
                      Font Size
                      <input className="mono" value={displayNumber(selectedLayer.fontSize)} readOnly />
                    </label>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="inspector-empty">Select a layer to inspect virtual pixel values.</div>
          )}
        </aside>
      </div>
    </section>
  )
}
