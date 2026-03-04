import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Move3D, Redo2, Undo2, Upload } from 'lucide-react'
import { StageCanvas } from '../components/StageCanvas'
import type { SceneLayer } from '../types/scene'
import { usePlayoutStore } from '../store/playoutStore'

const CREATION_ITEMS = ['TEXT', 'SHAPE', 'FIGMA', 'RIVE']

function toNumberOrNull(value: string): number | null {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function asPercent(opacity: number): number {
  return Math.round(opacity * 100)
}

function fromPercent(percent: number): number {
  return Math.min(Math.max(percent, 0), 100) / 100
}

function layerPositionInfo(layer: SceneLayer, layers: SceneLayer[]) {
  const index = layers.findIndex((entry) => entry.id === layer.id)

  return {
    canMoveForward: index >= 0 && index < layers.length - 1,
    canMoveBackward: index > 0,
  }
}

export function DesignPage() {
  const scene = usePlayoutStore((state) => state.previewScene)
  const story = usePlayoutStore((state) => state.story)
  const reorderPreviewLayer = usePlayoutStore((state) => state.reorderPreviewLayer)
  const updatePreviewLayerTransform = usePlayoutStore((state) => state.updatePreviewLayerTransform)
  const updatePreviewShapeStyle = usePlayoutStore((state) => state.updatePreviewShapeStyle)
  const updatePreviewTextStyle = usePlayoutStore((state) => state.updatePreviewTextStyle)

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)

  const orderedLayers = useMemo(() => [...scene.layers].reverse(), [scene.layers])
  const activeSelectedLayerId =
    selectedLayerId && scene.layers.some((layer) => layer.id === selectedLayerId)
      ? selectedLayerId
      : (orderedLayers[0]?.id ?? '')
  const selectedLayer = scene.layers.find((layer) => layer.id === activeSelectedLayerId) ?? null

  const commitTransformField = (field: 'x' | 'y' | 'width' | 'height', value: string) => {
    if (!selectedLayer) {
      return
    }

    const numericValue = toNumberOrNull(value)
    if (numericValue === null) {
      return
    }

    updatePreviewLayerTransform(selectedLayer.id, { [field]: numericValue })
  }

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
            {orderedLayers.map((layer) => {
              const { canMoveForward, canMoveBackward } = layerPositionInfo(layer, scene.layers)

              return (
                <div key={layer.id} className={`layer-item ${activeSelectedLayerId === layer.id ? 'layer-item--active' : ''}`.trim()}>
                  <button type="button" className="layer-item__main" onClick={() => setSelectedLayerId(layer.id)}>
                    <span>{layer.name}</span>
                    <Move3D size={14} />
                  </button>
                  <div className="layer-item__order">
                    <button
                      type="button"
                      className="icon-btn icon-btn--mini"
                      onClick={(event) => {
                        event.stopPropagation()
                        reorderPreviewLayer(layer.id, 'forward')
                      }}
                      disabled={!canMoveForward}
                      aria-label="Move layer up"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--mini"
                      onClick={(event) => {
                        event.stopPropagation()
                        reorderPreviewLayer(layer.id, 'backward')
                      }}
                      disabled={!canMoveBackward}
                      aria-label="Move layer down"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
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
                    <input
                      className="mono"
                      type="number"
                      value={selectedLayer.x}
                      onChange={(event) => commitTransformField('x', event.target.value)}
                    />
                  </label>
                  <label>
                    Y
                    <input
                      className="mono"
                      type="number"
                      value={selectedLayer.y}
                      onChange={(event) => commitTransformField('y', event.target.value)}
                    />
                  </label>
                  <label>
                    W
                    <input
                      className="mono"
                      type="number"
                      min={1}
                      value={selectedLayer.width}
                      onChange={(event) => commitTransformField('width', event.target.value)}
                    />
                  </label>
                  <label>
                    H
                    <input
                      className="mono"
                      type="number"
                      min={1}
                      value={selectedLayer.height}
                      onChange={(event) => commitTransformField('height', event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="inspector-section">
                <div className="inspector-section__label">Style</div>
                {'fill' in selectedLayer ? (
                  <>
                    <label>
                      Fill
                      <input
                        className="mono"
                        value={selectedLayer.fill}
                        onChange={(event) => updatePreviewShapeStyle(selectedLayer.id, { fill: event.target.value })}
                      />
                    </label>
                    <label>
                      Opacity
                      <input
                        className="mono"
                        type="number"
                        min={0}
                        max={100}
                        value={asPercent(selectedLayer.opacity)}
                        onChange={(event) => {
                          const nextPercent = toNumberOrNull(event.target.value)
                          if (nextPercent === null) {
                            return
                          }

                          updatePreviewShapeStyle(selectedLayer.id, { opacity: fromPercent(nextPercent) })
                        }}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Text
                      <input
                        value={selectedLayer.text}
                        onChange={(event) => updatePreviewTextStyle(selectedLayer.id, { text: event.target.value })}
                      />
                    </label>
                    <label>
                      Color
                      <input
                        className="mono"
                        value={selectedLayer.color}
                        onChange={(event) => updatePreviewTextStyle(selectedLayer.id, { color: event.target.value })}
                      />
                    </label>
                    <label>
                      Font Size
                      <input
                        className="mono"
                        type="number"
                        min={8}
                        value={selectedLayer.fontSize}
                        onChange={(event) => {
                          const nextFontSize = toNumberOrNull(event.target.value)
                          if (nextFontSize === null) {
                            return
                          }

                          updatePreviewTextStyle(selectedLayer.id, { fontSize: nextFontSize })
                        }}
                      />
                    </label>
                    <label>
                      Opacity
                      <input
                        className="mono"
                        type="number"
                        min={0}
                        max={100}
                        value={asPercent(selectedLayer.opacity)}
                        onChange={(event) => {
                          const nextPercent = toNumberOrNull(event.target.value)
                          if (nextPercent === null) {
                            return
                          }

                          updatePreviewTextStyle(selectedLayer.id, { opacity: fromPercent(nextPercent) })
                        }}
                      />
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
