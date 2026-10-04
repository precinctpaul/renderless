import { STORY_FIELD_DEFS, labelFromKey } from '../data/storySchema'
import type { ImageFraming, ImageLayer, SceneDefinition, SceneLayer, TemplateDefinition, TextLayer } from '../types/scene'

/** A fill-in field in Make: one per data field the template's text layers use. */
export interface MakeField {
  key: string
  label: string
  /** The template's own text for this field, shown while the field is empty. */
  sample: string
  /** Room for more than one line, so the input is a text area. */
  multiline: boolean
  /** Text layers that show this field. */
  layerIds: string[]
  /** The template lets staffers turn this field off. */
  optional: boolean
}

export type CanvasShape = 'feed' | 'story' | 'wide'

const KNOWN_LABELS = new Map(STORY_FIELD_DEFS.map((field) => [field.key, field.label]))

/**
 * Reading order: text side by side in separate columns (e.g. two people in a lower third) is
 * grouped by column, left to right; within a column, top to bottom.
 */
function readingOrder<T extends SceneLayer>(layers: T[]): T[] {
  const columns: Array<{ left: number; right: number; layers: T[] }> = []
  for (const layer of [...layers].sort((a, b) => a.x - b.x)) {
    const column = columns.find((entry) => layer.x < entry.right && layer.x + layer.width > entry.left)
    if (column) {
      column.layers.push(layer)
      column.left = Math.min(column.left, layer.x)
      column.right = Math.max(column.right, layer.x + layer.width)
    } else {
      columns.push({ left: layer.x, right: layer.x + layer.width, layers: [layer] })
    }
  }
  return columns.flatMap((column) => column.layers.sort((a, b) => a.y - b.y || a.x - b.x))
}

/** Fields a template fills, in reading order on the canvas. */
export function makeFieldsOf(scene: SceneDefinition): MakeField[] {
  const bound = readingOrder(
    scene.layers.filter((layer): layer is TextLayer & { binding: string } => layer.kind === 'text' && Boolean(layer.binding?.trim())),
  )
  const byKey = new Map<string, MakeField>()
  bound.forEach((layer) => {
    const lineHeightPx = layer.fontSize * (layer.lineHeight ?? 1)
    // Shrink-to-fit text knows its line limit; otherwise go by the frame's height.
    const multiline = layer.text.includes('\n') || (layer.fit ? layer.fit.maxLines > 1 : layer.height >= lineHeightPx * 1.8)
    const existing = byKey.get(layer.binding)
    if (existing) {
      existing.layerIds.push(layer.id)
      existing.multiline ||= multiline
      existing.optional ||= Boolean(layer.optional)
      return
    }
    byKey.set(layer.binding, {
      key: layer.binding,
      label: KNOWN_LABELS.get(layer.binding) ?? labelFromKey(layer.binding),
      sample: layer.text,
      multiline,
      layerIds: [layer.id],
      optional: Boolean(layer.optional),
    })
  })
  return [...byKey.values()]
}

/** Images a builder marked as replaceable, top to bottom. */
export function swappableImagesOf(scene: SceneDefinition): ImageLayer[] {
  return scene.layers
    .filter((layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.swappable))
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/** The scene with replaced images. Only `src` changes, so the layout cannot move. */
export function withImageSwaps(scene: SceneDefinition, swaps: Record<string, string>): SceneDefinition {
  if (Object.keys(swaps).length === 0) return scene
  return {
    ...scene,
    layers: scene.layers.map((layer) =>
      layer.kind === 'image' && layer.swappable && swaps[layer.id] ? { ...layer, src: swaps[layer.id] } : layer,
    ),
  }
}

/** A shape drawn just around the photo (a ring, frame or backing) belongs to it: at most 25% bigger each way. */
function framesImage(layer: SceneLayer, image: SceneLayer): boolean {
  return (
    image.kind === 'image' &&
    layer.kind === 'shape' &&
    layer.x <= image.x &&
    layer.y <= image.y &&
    layer.x + layer.width >= image.x + image.width &&
    layer.y + layer.height >= image.y + image.height &&
    layer.width <= image.width * 1.25 &&
    layer.height <= image.height * 1.25
  )
}

const sharesColumn = (layer: SceneLayer, other: SceneLayer) => layer.x < other.x + other.width && layer.x + layer.width > other.x

/** Toggle key for an optional field (image slots use their layer id). */
export const fieldToggleKey = (fieldKey: string) => `field:${fieldKey}`

/** Whether a Make toggle is on: the staffer's choice, else how the template ships. */
export function isToggleOn(scene: SceneDefinition, toggles: Record<string, boolean>, key: string): boolean {
  if (key in toggles) return toggles[key]
  if (key.startsWith('field:')) return true
  return scene.layers.find((layer) => layer.id === key)?.visible ?? true
}

/**
 * The scene with Make's on/off choices applied: photo slots (by layer id) and optional fields
 * (`field:<key>`). In auto-layout templates the flow closes the gap. Elsewhere a hidden layer
 * takes any shape framing it along, and text stacked above or below it (same column) closes
 * the gap from both sides, so a centered stack stays centered.
 */
export function withVisibility(scene: SceneDefinition, toggles: Record<string, boolean>): SceneDefinition {
  const fields = makeFieldsOf(scene)
  const layerIdsOf = (key: string) =>
    key.startsWith('field:') ? (fields.find((field) => fieldToggleKey(field.key) === key)?.layerIds ?? []) : [key]
  const allowed = (layer: SceneLayer) => (layer.kind === 'image' ? Boolean(layer.swappable) : layer.kind === 'text' && Boolean(layer.optional))
  const flowItems = new Set((scene.flows ?? []).flatMap((flow) => flow.items.map((item) => item.layerId)))

  let layers = scene.layers
  let changed = false
  for (const [key, on] of Object.entries(toggles)) {
    for (const id of layerIdsOf(key)) {
      const target = layers.find((layer) => layer.id === id)
      if (!target || !allowed(target) || target.visible === on) continue
      changed = true
      if (on || flowItems.has(id)) {
        layers = layers.map((layer) => (layer.id === id ? { ...layer, visible: on } : layer))
        continue
      }
      const hideIds = new Set([id, ...layers.filter((layer) => framesImage(layer, target)).map((layer) => layer.id)])
      const stack = layers.filter((layer) => layer.kind === 'text' && layer.visible && !hideIds.has(layer.id) && sharesColumn(layer, target))
      const below = stack.filter((layer) => layer.y >= target.y + target.height)
      const above = stack.filter((layer) => layer.y + layer.height <= target.y)
      const belowTop = below.length > 0 ? Math.min(...below.map((layer) => layer.y)) : null
      const aboveBottom = above.length > 0 ? Math.max(...above.map((layer) => layer.y + layer.height)) : null
      const hole = (belowTop ?? target.y + target.height) - (aboveBottom ?? target.y)
      // With text on both sides, keep one gap between them.
      const keep = belowTop !== null && aboveBottom !== null ? Math.min(belowTop - target.y - target.height, target.y - aboveBottom) : 0
      const shift = belowTop !== null || aboveBottom !== null ? Math.max(0, hole - keep) / 2 : 0
      const belowIds = new Set(below.map((layer) => layer.id))
      const aboveIds = new Set(above.map((layer) => layer.id))
      layers = layers.map((layer) => {
        if (hideIds.has(layer.id)) return { ...layer, visible: false }
        if (belowIds.has(layer.id)) return { ...layer, y: layer.y - shift }
        if (aboveIds.has(layer.id)) return { ...layer, y: layer.y + shift }
        return layer
      })
    }
  }
  return changed ? { ...scene, layers } : scene
}

/** The scene with framing (subject point + zoom) on replaced cover photos. */
export function withImageFraming(scene: SceneDefinition, framing: Record<string, ImageFraming>): SceneDefinition {
  if (Object.keys(framing).length === 0) return scene
  return {
    ...scene,
    layers: scene.layers.map((layer) => (layer.kind === 'image' && layer.swappable && framing[layer.id] ? { ...layer, framing: framing[layer.id] } : layer)),
  }
}

/** Feed (square and 4:5), story (9:16) or wide (16:9). */
export function canvasShapeOf(scene: Pick<SceneDefinition, 'width' | 'height'>): CanvasShape {
  const ratio = scene.width / Math.max(1, scene.height)
  if (ratio > 1.2) return 'wide'
  if (ratio < 0.7) return 'story'
  return 'feed'
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** `quote-card_jane-doe.png`: the template plus the first filled field. */
export function makeFileName(template: Pick<TemplateDefinition, 'label'>, fields: MakeField[], values: Record<string, string>): string {
  const first = fields.map((field) => values[field.key]?.trim()).find(Boolean)
  const parts = [slug(template.label) || 'graphic', first ? slug(first) : ''].filter(Boolean)
  return `${parts.join('_')}.png`
}
