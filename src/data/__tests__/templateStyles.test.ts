import { describe, expect, it } from 'vitest'
import { BRAND_STYLES } from '../brandStyles'
import { SMART_TEMPLATES } from '../templates'
import { layoutScene } from '../../lib/sceneLayout'
import { STORY_DEFAULTS } from '../storySchema'
import type { SceneDefinition, SceneLayer } from '../../types/scene'

/**
 * Every built-in template, in every style and layout, keeps its words readable: graphic text is
 * display-sized, so 3:1 is the floor (WCAG large text); body-size text needs 4.5:1.
 */

function luminance(color: string): number {
  const channels = color.startsWith('#')
    ? [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16))
    : (/rgba?\(([^)]+)\)/.exec(color)?.[1].split(',').slice(0, 3).map(Number) ?? [0, 0, 0])
  const [r, g, b] = channels.map((value) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The solid color behind a layer's center: a text box, the topmost shape under it (a gradient scrim counts as its strongest color), or the canvas. */
function backgroundBehind(scene: SceneDefinition, layer: SceneLayer): string | null {
  if (layer.kind === 'text' && layer.box) return layer.box.fill
  const cx = layer.x + layer.width / 2
  const cy = layer.y + layer.height / 2
  const index = scene.layers.indexOf(layer)
  for (let i = index - 1; i >= 0; i -= 1) {
    const below = scene.layers[i]
    if (!below.visible || below.kind === 'text' || below.opacity < 0.9) continue
    if (cx < below.x || cx > below.x + below.width || cy < below.y || cy > below.y + below.height) continue
    if (below.kind === 'image') return null
    const colors = below.fill.match(/#[0-9a-f]{6}|rgba?\([^)]+\)/gi) ?? []
    return colors.at(-1) ?? null
  }
  return scene.background === 'transparent' ? null : scene.background
}

const cases = SMART_TEMPLATES.flatMap((template) =>
  BRAND_STYLES.flatMap((style) =>
    (template.layouts?.map((layout) => layout.id) ?? [undefined]).flatMap((layout) =>
      [false, true].map((photoOff) => ({ template, style, layout, photoOff })),
    ),
  ),
)

describe('built-in templates in every style', () => {
  it.each(cases.map((entry) => [`${entry.template.label} / ${entry.style.name} / ${entry.layout ?? 'default'}${entry.photoOff ? ' / no photo' : ''}`, entry]))(
    '%s: text is readable',
    (_label, { template, style, layout, photoOff }) => {
      const photoIds = template.build({ style: style.id, layout }).layers.filter((layer) => layer.kind === 'image').map((layer) => layer.id)
      const built = template.build({ style: style.id, layout, off: photoOff ? new Set(photoIds) : undefined })
      const shown = photoOff ? { ...built, layers: built.layers.map((layer) => (layer.kind === 'image' ? { ...layer, visible: false } : layer)) } : built
      const scene = layoutScene(shown, STORY_DEFAULTS)
      const problems: string[] = []
      for (const layer of scene.layers) {
        if (layer.kind !== 'text' || !layer.visible) continue
        const background = backgroundBehind(scene, layer)
        if (!background) continue
        const ratio = contrast(layer.color, background)
        const need = layer.fontSize >= 24 ? 3 : 4.5
        if (ratio < need) problems.push(`${layer.name}: ${layer.color} on ${background} = ${ratio.toFixed(2)}`)
      }
      expect(problems).toEqual([])
    },
  )

  it('never sets red text on blue', () => {
    for (const { template, style, layout } of cases) {
      const scene = template.build({ style: style.id, layout })
      for (const layer of scene.layers) {
        if (layer.kind !== 'text') continue
        const background = backgroundBehind(scene, layer)
        expect(`${layer.color} on ${background}`).not.toBe('#ED2426 on #3C77BB')
      }
    }
  })

  it('every style and layout keeps the same fields and photo slots, so switching never loses work', () => {
    for (const template of SMART_TEMPLATES) {
      const signature = (scene: SceneDefinition) =>
        scene.layers
          .filter((layer) => (layer.kind === 'text' && layer.binding) || (layer.kind === 'image' && layer.swappable))
          .map((layer) => `${layer.id}:${layer.kind === 'text' ? layer.binding : 'photo'}`)
          .sort()
      const reference = signature(template.build({ style: 'acid' }))
      for (const { style, layout } of cases.filter((entry) => entry.template === template)) {
        expect(signature(template.build({ style: style.id, layout }))).toEqual(reference)
      }
    }
  })
})
