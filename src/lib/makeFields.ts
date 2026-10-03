import { STORY_FIELD_DEFS, labelFromKey } from '../data/storySchema'
import type { ImageLayer, SceneDefinition, SceneLayer, TemplateDefinition, TextLayer } from '../types/scene'

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
}

export type CanvasShape = 'feed' | 'story' | 'wide'

const KNOWN_LABELS = new Map(STORY_FIELD_DEFS.map((field) => [field.key, field.label]))

/** Fields a template fills, top to bottom as they appear on the canvas. */
export function makeFieldsOf(scene: SceneDefinition): MakeField[] {
  const bound = scene.layers
    .filter((layer): layer is TextLayer & { binding: string } => layer.kind === 'text' && Boolean(layer.binding?.trim()))
    .sort((a, b) => a.y - b.y || a.x - b.x)
  const byKey = new Map<string, MakeField>()
  bound.forEach((layer) => {
    const lineHeightPx = layer.fontSize * (layer.lineHeight ?? 1)
    const multiline = layer.height >= lineHeightPx * 1.8 || layer.text.includes('\n')
    const existing = byKey.get(layer.binding)
    if (existing) {
      existing.layerIds.push(layer.id)
      existing.multiline ||= multiline
      return
    }
    byKey.set(layer.binding, {
      key: layer.binding,
      label: KNOWN_LABELS.get(layer.binding) ?? labelFromKey(layer.binding),
      sample: layer.text,
      multiline,
      layerIds: [layer.id],
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
function framesImage(layer: SceneLayer, image: ImageLayer): boolean {
  return (
    layer.kind === 'shape' &&
    layer.x <= image.x &&
    layer.y <= image.y &&
    layer.x + layer.width >= image.x + image.width &&
    layer.y + layer.height >= image.y + image.height &&
    layer.width <= image.width * 1.25 &&
    layer.height <= image.height * 1.25
  )
}

const sharesColumn = (layer: SceneLayer, image: ImageLayer) => layer.x < image.x + image.width && layer.x + layer.width > image.x

/**
 * The scene with some swappable images left out. The photo and any shape framing it are hidden,
 * and text stacked above or below it (sharing its column) closes the gap from both sides, so a
 * centered stack stays centered.
 */
export function withHiddenImages(scene: SceneDefinition, hiddenIds: string[]): SceneDefinition {
  const hidden = scene.layers.filter(
    (layer): layer is ImageLayer => layer.kind === 'image' && Boolean(layer.swappable) && layer.visible && hiddenIds.includes(layer.id),
  )
  if (hidden.length === 0) return scene

  let layers = scene.layers
  for (const image of hidden) {
    const hideIds = new Set([image.id, ...layers.filter((layer) => framesImage(layer, image)).map((layer) => layer.id)])
    const stack = layers.filter((layer) => layer.kind === 'text' && layer.visible && sharesColumn(layer, image))
    const below = stack.filter((layer) => layer.y >= image.y + image.height)
    const above = stack.filter((layer) => layer.y + layer.height <= image.y)
    const belowTop = below.length > 0 ? Math.min(...below.map((layer) => layer.y)) : null
    const aboveBottom = above.length > 0 ? Math.max(...above.map((layer) => layer.y + layer.height)) : null
    const hole = (belowTop ?? image.y + image.height) - (aboveBottom ?? image.y)
    // With text on both sides, keep one gap between them.
    const keep = belowTop !== null && aboveBottom !== null ? Math.min(belowTop - image.y - image.height, image.y - aboveBottom) : 0
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
  return { ...scene, layers }
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
