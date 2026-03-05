export type DataBindingKey = string
export type CoreStoryBindingKey =
  | 'homeScore'
  | 'awayScore'
  | 'clock'
  | 'possession'
  | 'period'
  | 'shotClock'
  | 'homeFouls'
  | 'awayFouls'
  | 'headline'

export type BindingPrimitive = string | number | boolean | null

export interface BindingHierarchyNode {
  key: string
  label: string
  group: string
  kind: 'number' | 'string' | 'enum'
}

export interface StoryState {
  homeScore: number
  awayScore: number
  clock: string
  possession: 'home' | 'away'
  period: number
  shotClock: number
  homeFouls: number
  awayFouls: number
  headline: string
  bindings: Record<string, BindingPrimitive>
}

export interface BaseLayer {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  locked?: boolean
  opacity: number
  rotation?: number
  anchorX?: number
  anchorY?: number
  scaleX?: number
  scaleY?: number
}

export interface ShapeLayer extends BaseLayer {
  kind: 'shape'
  fill: string
  radius?: number
}

export interface TextLayer extends BaseLayer {
  kind: 'text'
  text: string
  color: string
  fontSize: number
  fontFamily: string
  fontWeight: number
  align?: 'left' | 'center' | 'right'
  binding?: DataBindingKey
}

export interface ImageLayer extends BaseLayer {
  kind: 'image'
  src: string
  fit?: 'contain' | 'cover' | 'stretch'
}

export type SceneLayer = ShapeLayer | TextLayer | ImageLayer

export interface SceneDefinition {
  id: string
  name: string
  width: number
  height: number
  background: string
  layers: SceneLayer[]
}

export interface TemplateVersion {
  version: number
  scene: SceneDefinition
  label: string
  bindings: DataBindingKey[]
  updatedAt: number
}

export interface TemplateDefinition {
  id: string
  label: string
  scene: SceneDefinition
  bindings?: DataBindingKey[]
  favorite?: boolean
  builtIn?: boolean
  version?: number
  versions?: TemplateVersion[]
  updatedAt?: number
}
