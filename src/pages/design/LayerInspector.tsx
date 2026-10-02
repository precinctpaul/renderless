import { useMemo, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from 'lucide-react'
import { TextBoxInspector } from '../../components/TextBoxInspector'
import { NumberField } from '../../components/NumberField'
import { AnchorPicker } from '../../components/AnchorPicker'
import { InspectorSection } from '../../components/InspectorSection'
import { anchorPosition, anchorPresetOf, resolveAnchor, type AnchorPresetId } from '../../lib/layerAnchor'
import { LAYER_BLEND_MODES, type DataBindingKey, type LayerBlendMode, type SceneLayer } from '../../types/scene'
import { usePlayoutStore } from '../../store/playoutStore'
import { resolveBindingValue } from '../../lib/bindings'
import { fieldKeyFromHeader } from '../../lib/dataSheet'

const asPercent = (opacity: number) => Math.round(opacity * 100)
const fromPercent = (percent: number) => Math.min(Math.max(percent, 0), 100) / 100
/** The shared value across the selection, or null when layers differ ("mixed"). */
function mixedValue(layers: SceneLayer[], read: (layer: SceneLayer) => number): number | null {
  if (layers.length === 0) return null
  const first = read(layers[0])
  return layers.every((layer) => read(layer) === first) ? first : null
}

function mixedAnchorPreset(layers: SceneLayer[]): AnchorPresetId | null {
  if (layers.length === 0) return null
  const first = anchorPresetOf(layers[0])
  return layers.every((layer) => anchorPresetOf(layer) === first) ? first : null
}

interface LayerInspectorProps {
  selectedLayers: SceneLayer[]
  activeSelectedLayerIds: string[]
  /** Brand + uploaded font families for the Font Family menu. */
  fontOptions: Array<{ label: string; value: string }>
  /** Shows a short status message in the Design toolbar. */
  onStatus: (message: string, timeoutMs?: number) => void
}

/** Design page right-hand panel: name, text style, text box, transform and data field of the selection. */
export function LayerInspector({ selectedLayers, activeSelectedLayerIds, fontOptions, onStatus }: LayerInspectorProps) {
  const story = usePlayoutStore((state) => state.story)
  const bindingFields = usePlayoutStore((state) => state.bindingFields)
  const updatePreviewTextStyle = usePlayoutStore((state) => state.updatePreviewTextStyle)
  const updatePreviewLayerTransform = usePlayoutStore((state) => state.updatePreviewLayerTransform)
  const updatePreviewLayersTransform = usePlayoutStore((state) => state.updatePreviewLayersTransform)
  const setPreviewLayersPosition = usePlayoutStore((state) => state.setPreviewLayersPosition)
  const setPreviewLayersAnchor = usePlayoutStore((state) => state.setPreviewLayersAnchor)
  const updatePreviewShapeStyle = usePlayoutStore((state) => state.updatePreviewShapeStyle)
  const updatePreviewLayerBlendMode = usePlayoutStore((state) => state.updatePreviewLayerBlendMode)
  const updatePreviewTextBinding = usePlayoutStore((state) => state.updatePreviewTextBinding)
  const renamePreviewLayer = usePlayoutStore((state) => state.renamePreviewLayer)
  const setFieldValue = usePlayoutStore((state) => state.setFieldValue)
  const primarySelectedLayer = selectedLayers[0] ?? null
  const availableFontOptions = fontOptions

  const [isInspectorRenaming, setIsInspectorRenaming] = useState(false)
  const [inspectorRenameDraft, setInspectorRenameDraft] = useState('')
  const [newFieldDraft, setNewFieldDraft] = useState('')
  const inspectorFontOptions = useMemo(() => {
    if (!primarySelectedLayer || primarySelectedLayer.kind !== 'text') {
      return availableFontOptions
    }

    if (availableFontOptions.some((option) => option.value === primarySelectedLayer.fontFamily)) {
      return availableFontOptions
    }

    return [{ value: primarySelectedLayer.fontFamily, label: primarySelectedLayer.fontFamily }, ...availableFontOptions]
  }, [availableFontOptions, primarySelectedLayer])
  // Field picker options, grouped (People, Quote, Spreadsheet...).
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, typeof bindingFields>()
    bindingFields.forEach((field) => {
      const group = field.group ?? 'Fields'
      groups.set(group, [...(groups.get(group) ?? []), field])
    })
    return [...groups.entries()]
  }, [bindingFields])

  // Typed values apply exactly; grid snapping is for dragging only.
  const commitPosition = (field: 'x' | 'y', value: number) => {
    if (selectedLayers.length === 0) return
    setPreviewLayersPosition(activeSelectedLayerIds, { [field]: value })
  }
  const commitAnchor = (field: 'x' | 'y', value: number) => {
    if (selectedLayers.length === 0) return
    setPreviewLayersAnchor(activeSelectedLayerIds, { [field]: value })
  }
  const commitTransform = (field: 'width' | 'height', numberValue: number) => {
    if (selectedLayers.length === 0) return

    if (selectedLayers.length === 1 && primarySelectedLayer) {
      updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: numberValue })
      return
    }

    updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: numberValue })
  }
  const commitAdvanced = (field: 'rotation' | 'scaleX' | 'scaleY' | 'opacity', numberValue: number) => {
    if (selectedLayers.length === 0) return

    const normalizedValue = field === 'opacity' ? fromPercent(numberValue) : numberValue

    if (selectedLayers.length === 1 && primarySelectedLayer) {
      updatePreviewLayerTransform(primarySelectedLayer.id, { [field]: normalizedValue })
      return
    }

    updatePreviewLayersTransform(activeSelectedLayerIds, { [field]: normalizedValue })
  }

  const commitInspectorRename = () => {
    if (selectedLayers.length !== 1 || !primarySelectedLayer) {
      setIsInspectorRenaming(false)
      return
    }

    const nextName = inspectorRenameDraft.trim()
    if (nextName) {
      renamePreviewLayer(primarySelectedLayer.id, nextName)
      setInspectorRenameDraft(nextName)
    } else {
      onStatus('Layer name cannot be empty.')
      setInspectorRenameDraft(primarySelectedLayer.name)
    }
    setIsInspectorRenaming(false)
  }

  const bindingPreviewValue =
    primarySelectedLayer && primarySelectedLayer.kind === 'text' && primarySelectedLayer.binding
      ? resolveBindingValue(primarySelectedLayer.binding, story)
      : ''

  return (
        <aside className="panel inspector">
          <div className="panel-title">LAYER INSPECTOR</div>
          {selectedLayers.length > 0 ? (
            <>
              <div className="inspector-section">
                <div className="inspector-section__label mono">SELECTED ({selectedLayers.length})</div>
                <div className="inspector-layer-name">
                  {selectedLayers.length > 1 ? (
                    'Multiple Layers'
                  ) : isInspectorRenaming ? (
                    <input
                      value={inspectorRenameDraft}
                      autoFocus
                      onChange={(event) => setInspectorRenameDraft(event.target.value)}
                      onBlur={commitInspectorRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitInspectorRename()
                        if (event.key === 'Escape') {
                          setIsInspectorRenaming(false)
                          setInspectorRenameDraft(primarySelectedLayer?.name ?? '')
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="inspector-rename-trigger"
                      onDoubleClick={() => {
                        setInspectorRenameDraft(primarySelectedLayer?.name ?? '')
                        setIsInspectorRenaming(true)
                      }}
                      onClick={() => {
                        setInspectorRenameDraft(primarySelectedLayer?.name ?? '')
                        setIsInspectorRenaming(true)
                      }}
                    >
                      {primarySelectedLayer?.name ?? ''}
                    </button>
                  )}
                </div>
              </div>
              {selectedLayers.length === 1 && primarySelectedLayer?.kind === 'text' ? (
                <InspectorSection id="text-style" title="Text Style">
                  <label>
                    Text
                    <textarea
                      rows={Math.min(4, Math.max(2, primarySelectedLayer.text.split('\n').length))}
                      value={primarySelectedLayer.text}
                      onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { text: event.target.value })}
                    />
                  </label>
                  <label>
                    Font Family
                    <select
                      className="mono"
                      value={primarySelectedLayer.fontFamily}
                      onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { fontFamily: event.target.value })}
                    >
                      {inspectorFontOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Color
                    <input
                      className="mono"
                      value={primarySelectedLayer.color}
                      onChange={(event) => updatePreviewTextStyle(primarySelectedLayer.id, { color: event.target.value })}
                    />
                  </label>
                  <label>
                    Font Size
                    <NumberField
                      min={8}
                      value={primarySelectedLayer.fontSize}
                      onCommit={(value) => updatePreviewTextStyle(primarySelectedLayer.id, { fontSize: value })}
                    />
                  </label>
                  <label>
                    Line Height
                    <NumberField
                      min={0.5}
                      max={4}
                      step={0.05}
                      value={primarySelectedLayer.lineHeight ?? 1}
                      onCommit={(value) => updatePreviewTextStyle(primarySelectedLayer.id, { lineHeight: value })}
                    />
                  </label>
                  <div className="field-label">
                    Align
                    <div className="align-groups">
                      <div className="segmented" role="group" aria-label="Horizontal text alignment">
                        {([['left', AlignLeft, 'Align left'], ['center', AlignCenter, 'Align center'], ['right', AlignRight, 'Align right']] as const).map(([value, Icon, label]) => (
                          <button
                            key={value}
                            type="button"
                            title={label}
                            aria-label={label}
                            aria-pressed={(primarySelectedLayer.align ?? 'center') === value}
                            className={`segmented__btn ${(primarySelectedLayer.align ?? 'center') === value ? 'segmented__btn--active' : ''}`.trim()}
                            onClick={() => updatePreviewTextStyle(primarySelectedLayer.id, { align: value })}
                          >
                            <Icon size={14} />
                          </button>
                        ))}
                      </div>
                      <div className="segmented" role="group" aria-label="Vertical text alignment">
                        {([['top', AlignVerticalJustifyStart, 'Align top'], ['middle', AlignVerticalJustifyCenter, 'Align middle'], ['bottom', AlignVerticalJustifyEnd, 'Align bottom']] as const).map(([value, Icon, label]) => {
                          const current = primarySelectedLayer.verticalAlign ?? 'middle'
                          return (
                            <button
                              key={value}
                              type="button"
                              title={label}
                              aria-label={label}
                              aria-pressed={current === value}
                              className={`segmented__btn ${current === value ? 'segmented__btn--active' : ''}`.trim()}
                              onClick={() => updatePreviewTextStyle(primarySelectedLayer.id, { verticalAlign: value })}
                            >
                              <Icon size={14} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </InspectorSection>
              ) : null}
              {primarySelectedLayer?.kind === 'text' ? (
                <TextBoxInspector
                  box={primarySelectedLayer.box}
                  onChange={(box) => updatePreviewTextStyle(primarySelectedLayer.id, { box })}
                />
              ) : null}
              <InspectorSection id="transform" title="Transform">
                <div className="anchor-row">
                  <AnchorPicker
                    value={mixedAnchorPreset(selectedLayers)}
                    onChange={(preset) => setPreviewLayersAnchor(activeSelectedLayerIds, { preset })}
                  />
                  <div className="anchor-row__hint">Anchor point. X and Y are where the anchor sits; picking a point never moves the layer.</div>
                </div>
                <div className="transform-grid">
                  <label>X<NumberField value={mixedValue(selectedLayers, (layer) => anchorPosition(layer).x)} placeholder="mixed" onCommit={(value) => commitPosition('x', value)} /></label>
                  <label>Y<NumberField value={mixedValue(selectedLayers, (layer) => anchorPosition(layer).y)} placeholder="mixed" onCommit={(value) => commitPosition('y', value)} /></label>
                  <label>W<NumberField min={1} value={mixedValue(selectedLayers, (layer) => layer.width)} placeholder="mixed" onCommit={(value) => commitTransform('width', value)} /></label>
                  <label>H<NumberField min={1} value={mixedValue(selectedLayers, (layer) => layer.height)} placeholder="mixed" onCommit={(value) => commitTransform('height', value)} /></label>
                  <label>Anchor X<NumberField value={mixedValue(selectedLayers, (layer) => resolveAnchor(layer).x)} placeholder="mixed" onCommit={(value) => commitAnchor('x', value)} /></label>
                  <label>Anchor Y<NumberField value={mixedValue(selectedLayers, (layer) => resolveAnchor(layer).y)} placeholder="mixed" onCommit={(value) => commitAnchor('y', value)} /></label>
                  <label>Scale X<NumberField value={mixedValue(selectedLayers, (layer) => layer.scaleX ?? 100)} placeholder="mixed" onCommit={(value) => commitAdvanced('scaleX', value)} /></label>
                  <label>Scale Y<NumberField value={mixedValue(selectedLayers, (layer) => layer.scaleY ?? 100)} placeholder="mixed" onCommit={(value) => commitAdvanced('scaleY', value)} /></label>
                  <label>Rotation<NumberField value={mixedValue(selectedLayers, (layer) => layer.rotation ?? 0)} placeholder="mixed" onCommit={(value) => commitAdvanced('rotation', value)} /></label>
                  <label>Opacity<NumberField min={0} max={100} value={mixedValue(selectedLayers, (layer) => asPercent(layer.opacity))} placeholder="mixed" onCommit={(value) => commitAdvanced('opacity', value)} /></label>
                </div>
                {primarySelectedLayer && selectedLayers.length === 1 ? (
                  <label>
                    Blend
                    <select
                      className="mono"
                      value={primarySelectedLayer.blendMode ?? 'normal'}
                      onChange={(event) => updatePreviewLayerBlendMode(primarySelectedLayer.id, event.target.value as LayerBlendMode)}
                    >
                      {LAYER_BLEND_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode.replace(/-/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </InspectorSection>
              <InspectorSection id="binding-style" title="Binding & Style">
                {selectedLayers.length > 1 ? (
                  <div className="inspector-empty">Layer-specific binding and style editing is available for single-layer selection only.</div>
                ) : primarySelectedLayer && primarySelectedLayer.kind === 'shape' ? (
                  <label>
                    Fill
                    <input className="mono" value={primarySelectedLayer.fill} onChange={(event) => updatePreviewShapeStyle(primarySelectedLayer.id, { fill: event.target.value })} />
                  </label>
                ) : primarySelectedLayer && primarySelectedLayer.kind === 'image' ? (
                  <>
                    <label>
                      Source
                      <input className="mono" value={primarySelectedLayer.src} readOnly />
                    </label>
                    <div className="binding-preview mono">FIT: {(primarySelectedLayer.fit ?? 'contain').toUpperCase()}</div>
                    <div className="inspector-empty">Image layer styling currently uses default contain fit.</div>
                  </>
                ) : primarySelectedLayer ? (
                  <>
                    <div className="binding-panel">
                      <div className="inspector-section__label">Data Field</div>
                      <label>
                        Field
                        <select
                          className="mono"
                          value={primarySelectedLayer.binding ?? ''}
                          onChange={(event) => {
                            const nextKey = event.target.value.trim()
                            updatePreviewTextBinding(primarySelectedLayer.id, nextKey ? (nextKey as DataBindingKey) : null)
                          }}
                        >
                          <option value="">None (fixed text)</option>
                          {primarySelectedLayer.binding && !bindingFields.some((field) => field.key === primarySelectedLayer.binding) ? (
                            <option value={primarySelectedLayer.binding}>{primarySelectedLayer.binding}</option>
                          ) : null}
                          {fieldGroups.map(([group, fields]) => (
                            <optgroup key={group} label={group}>
                              {fields.map((field) => (
                                <option key={field.key} value={field.key}>
                                  {field.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <form
                        className="binding-panel__new"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const key = fieldKeyFromHeader(newFieldDraft)
                          if (!newFieldDraft.trim()) return
                          setFieldValue(key, primarySelectedLayer.text)
                          updatePreviewTextBinding(primarySelectedLayer.id, key as DataBindingKey)
                          setNewFieldDraft('')
                        }}
                      >
                        <input value={newFieldDraft} placeholder="Or new field name..." onChange={(event) => setNewFieldDraft(event.target.value)} />
                        <button type="submit" className="btn btn--small" disabled={!newFieldDraft.trim()}>Bind</button>
                      </form>
                    </div>
                    <div className="binding-preview mono">
                      {primarySelectedLayer.binding
                        ? `${primarySelectedLayer.binding} = ${bindingPreviewValue || '(empty, shows the layer text)'}`
                        : 'Fixed text. Pick a field to fill it from Data or a spreadsheet.'}
                    </div>
                    <div className="inspector-empty">Edit field values, or load a spreadsheet, on the Data page.</div>
                  </>
                ) : null}
              </InspectorSection>
            </>
          ) : <div className="inspector-empty">Select one or more layers to inspect and edit virtual pixel values.</div>}
        </aside>
  )
}
