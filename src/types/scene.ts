export type DataBindingKey = 'homeScore' | 'awayScore' | 'clock' | 'possession'

export interface StoryState {
  homeScore: number
  awayScore: number
  clock: string
  possession: 'home' | 'away'
}

export interface BaseLayer {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  opacity: number
  rotation?: number
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

export type SceneLayer = ShapeLayer | TextLayer

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
  updatedAt: number
}

export interface TemplateDefinition {
  id: string
  label: string
  scene: SceneDefinition
  favorite?: boolean
  builtIn?: boolean
  version?: number
  versions?: TemplateVersion[]
  updatedAt?: number
}
