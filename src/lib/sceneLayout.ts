import type { SceneDefinition, SceneLayer, StoryState, TextLayer } from '../types/scene'
import { resolveBindingValue } from './bindings'
import { measureWidth, wrapText, type MeasureWidth } from './textMeasure'

/**
 * Auto layout, applied wherever a scene is drawn (editor, Make, outputs, PNG export), so the
 * same words always produce the same graphic:
 * 1. Text with `fit` shrinks until it fits its line limit and frame.
 * 2. Each flow stacks its items at their real size; hidden items take no room.
 * Scenes without `fit` or `flows` come back unchanged.
 */

export function resolvedText(layer: TextLayer, story: StoryState): string {
  if (!layer.binding) return layer.text
  return resolveBindingValue(layer.binding, story) || layer.text
}

function metrics(layer: TextLayer, text: string, fontSize: number, measure: MeasureWidth) {
  const padX = layer.box ? layer.box.paddingLeft + layer.box.paddingRight : 0
  const padY = layer.box ? layer.box.paddingTop + layer.box.paddingBottom : 0
  // Boxed text never wraps (the box hugs the words); plain text wraps in its frame.
  const wrapped = wrapText(
    { text, fontFamily: layer.fontFamily, fontWeight: layer.fontWeight, fontSize, lineHeight: layer.lineHeight ?? 1 },
    layer.box ? null : layer.width,
    measure,
  )
  return { lines: wrapped.lines.length, width: wrapped.widest + padX, height: wrapped.height + padY }
}

function fitsAt(layer: TextLayer, text: string, size: number, limitHeight: boolean, measure: MeasureWidth): boolean {
  const fit = layer.fit
  if (!fit) return true
  const m = metrics(layer, text, size, measure)
  // A word wider than the frame (or a box wider than it) also counts as not fitting.
  if (m.width > layer.width + 0.5) return false
  if (!layer.box && m.lines > fit.maxLines) return false
  if (limitHeight && m.height > layer.height + 0.5) return false
  return true
}

/** The largest whole font size (up to the layer's) at which the text fits. */
function fittedSize(layer: TextLayer, text: string, limitHeight: boolean, measure: MeasureWidth): number {
  const fit = layer.fit
  if (!fit) return layer.fontSize
  const fits = (size: number) => fitsAt(layer, text, size, limitHeight, measure)
  const max = Math.round(layer.fontSize)
  const min = Math.min(max, Math.max(8, Math.round(fit.minFontSize)))
  if (fits(max)) return max
  let low = min
  let high = max
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid - 1
  }
  return low
}

export function layoutScene(scene: SceneDefinition, story: StoryState, measure: MeasureWidth = measureWidth): SceneDefinition {
  const hasFit = scene.layers.some((layer) => layer.kind === 'text' && layer.fit)
  if (!hasFit && !scene.flows?.length) return scene

  const yFlowIds = new Set((scene.flows ?? []).filter((flow) => flow.axis === 'y').flatMap((flow) => flow.items.map((item) => item.layerId)))
  const byId = new Map<string, SceneLayer>()
  for (const layer of scene.layers) {
    if (layer.kind === 'text' && layer.fit) {
      const fontSize = fittedSize(layer, resolvedText(layer, story), !yFlowIds.has(layer.id), measure)
      byId.set(layer.id, fontSize === layer.fontSize ? layer : { ...layer, fontSize })
    } else {
      byId.set(layer.id, layer)
    }
  }

  const update = (id: string, patch: Partial<SceneLayer>) => {
    const layer = byId.get(id)
    if (layer) byId.set(id, { ...layer, ...patch } as SceneLayer)
  }

  for (const flow of scene.flows ?? []) {
    const placed: Array<{ id: string; size: number; gap: number; with: string[] }> = []
    for (const item of flow.items) {
      const layer = byId.get(item.layerId)
      if (!layer) continue
      if (!layer.visible) {
        item.with?.forEach((id) => update(id, { visible: false }))
        continue
      }
      let size = flow.axis === 'x' ? layer.width : layer.height
      if (flow.axis === 'y' && layer.kind === 'text') {
        size = Math.ceil(metrics(layer, resolvedText(layer, story), layer.fontSize, measure).height)
      }
      placed.push({ id: layer.id, size, gap: placed.length > 0 ? item.gap : 0, with: item.with ?? [] })
    }
    const total = placed.reduce((sum, entry) => sum + entry.gap + entry.size, 0)
    let cursor = flow.justify === 'start' ? flow.start : flow.justify === 'end' ? flow.end - total : (flow.start + flow.end - total) / 2
    for (const entry of placed) {
      cursor += entry.gap
      const layer = byId.get(entry.id)!
      const position = Math.round(cursor)
      const delta = position - (flow.axis === 'x' ? layer.x : layer.y)
      update(entry.id, flow.axis === 'x' ? { x: position } : { y: position, ...(layer.kind === 'text' ? { height: entry.size } : {}) })
      for (const id of entry.with) {
        const companion = byId.get(id)
        if (companion) update(id, flow.axis === 'x' ? { x: companion.x + delta } : { y: companion.y + delta })
      }
      cursor += entry.size
    }
  }

  return { ...scene, layers: scene.layers.map((layer) => byId.get(layer.id) ?? layer) }
}

/**
 * Text layers whose words don't fit even at their smallest allowed size (too many lines, or a
 * word wider than the frame). Make warns about these: shrinking has run out.
 */
export function textThatWontFit(scene: SceneDefinition, story: StoryState, measure: MeasureWidth = measureWidth): string[] {
  const yFlowIds = new Set((scene.flows ?? []).filter((flow) => flow.axis === 'y').flatMap((flow) => flow.items.map((item) => item.layerId)))
  return scene.layers
    .filter((layer): layer is TextLayer => layer.kind === 'text' && layer.visible && Boolean(layer.fit))
    .filter((layer) => {
      const text = resolvedText(layer, story)
      const limitHeight = !yFlowIds.has(layer.id)
      return !fitsAt(layer, text, fittedSize(layer, text, limitHeight, measure), limitHeight, measure)
    })
    .map((layer) => layer.id)
}

/** Whether a layer's position is set by a flow (dragging it by hand takes it out of auto layout). */
export function flowOf(scene: SceneDefinition, layerId: string) {
  return scene.flows?.find((flow) => flow.items.some((item) => item.layerId === layerId || item.with?.includes(layerId)))
}
