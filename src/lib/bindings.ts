import type { DataBindingKey, SceneDefinition, StoryState } from '../types/scene'

export function isDataBindingKey(value: unknown): value is DataBindingKey {
  return typeof value === 'string' && value.trim().length > 0
}

function toBindingString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  return ''
}

export function resolveBindingValue(binding: DataBindingKey | undefined, story: StoryState): string {
  if (!binding) {
    return ''
  }

  if (story.bindings && Object.prototype.hasOwnProperty.call(story.bindings, binding)) {
    return toBindingString(story.bindings[binding])
  }

  return ''
}

export function extractBindingKeys(scene: SceneDefinition): DataBindingKey[] {
  const unique = new Set<DataBindingKey>()

  scene.layers.forEach((layer) => {
    if (layer.kind === 'text' && layer.binding && isDataBindingKey(layer.binding)) {
      unique.add(layer.binding)
    }
  })

  return [...unique].sort()
}
