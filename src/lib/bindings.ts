import type { DataBindingKey, SceneDefinition, StoryState } from '../types/scene'
import { BINDING_KEY_SET } from '../data/storySchema'

export function isDataBindingKey(value: unknown): value is DataBindingKey {
  return typeof value === 'string' && BINDING_KEY_SET.has(value as DataBindingKey)
}

export function resolveBindingValue(binding: DataBindingKey | undefined, story: StoryState): string {
  if (!binding) {
    return ''
  }

  switch (binding) {
    case 'homeScore':
      return String(story.homeScore)
    case 'awayScore':
      return String(story.awayScore)
    case 'clock':
      return story.clock
    case 'possession':
      return story.possession === 'home' ? 'HOME' : 'AWAY'
    case 'period':
      return `Q${story.period}`
    case 'shotClock':
      return String(story.shotClock)
    case 'homeFouls':
      return String(story.homeFouls)
    case 'awayFouls':
      return String(story.awayFouls)
    case 'headline':
      return story.headline
    default:
      return ''
  }
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
