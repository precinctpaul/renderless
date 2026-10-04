export type DataBindingKey = string
export type BindingPrimitive = string | number | boolean | null

/** Live data for templates: field values keyed by field name (e.g. `name`, `quote`). */
export interface StoryState {
  bindings: Record<string, BindingPrimitive>
}

/** CSS mix-blend-mode values a layer can use (e.g. Illustrator "Soft Light" texture layers). */
export const LAYER_BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
] as const
export type LayerBlendMode = (typeof LAYER_BLEND_MODES)[number]

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
  blendMode?: LayerBlendMode
}

/**
 * A background box drawn behind a text layer that sizes itself to the text plus padding,
 * so it grows and shrinks as the words change. The layer frame anchors the box: it is
 * centered in the frame and may extend past it when the text gets longer.
 */
export interface TextBoxStyle {
  fill: string
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  radius?: number
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
  /** Where the text sits vertically in its frame. Default: top (plain text), middle (boxed text). */
  verticalAlign?: 'top' | 'middle' | 'bottom'
  /** Line spacing as a multiple of the font size (default 1). */
  lineHeight?: number
  box?: TextBoxStyle
  binding?: DataBindingKey
  /** Shrink-to-fit: the largest size (up to fontSize) that fits in maxLines and the frame. */
  fit?: TextFit
  /** Staffers may turn this text off in Make (e.g. a subhead); the layout closes up. */
  optional?: boolean
}

export interface TextFit {
  maxLines: number
  minFontSize: number
}

export interface ImageLayer extends BaseLayer {
  kind: 'image'
  src: string
  fit?: 'contain' | 'cover' | 'stretch'
  /** Corner radius in px; half the size makes a circle (e.g. a round headshot). */
  radius?: number
  /** Staffers may replace this image in Make (e.g. a headshot); the layout stays put. */
  swappable?: boolean
  /** Duotone: the photo in two colors, dark for shadows and light for highlights. */
  tone?: { dark: string; light: string }
  /** Framing for cover-fit photos: what to keep centered, and how far to zoom in. */
  framing?: ImageFraming
}

/**
 * Where a photo's subject is (x, y as 0-1 of the image) and the zoom (1 = just fills the slot).
 * The photo's pixel size lets every slot shape keep that point centered as far as it can
 * without showing past the photo's edge, so one framing works in every layout.
 */
export interface ImageFraming {
  x: number
  y: number
  zoom: number
  imageWidth: number
  imageHeight: number
}

export type SceneLayer = ShapeLayer | TextLayer | ImageLayer

export interface SceneDefinition {
  id: string
  name: string
  width: number
  height: number
  background: string
  layers: SceneLayer[]
  /** Auto layout: layers that stack along one axis and close up when one is hidden or resizes. */
  flows?: SceneFlow[]
}

/**
 * A stack of layers along x or y between `start` and `end`. Each item takes its real size
 * (text measured with its current words), hidden items take no room, and the stack sits at
 * the start, center or end. Layers in `with` move along with their item and hide with it.
 */
export interface SceneFlow {
  id: string
  axis: 'x' | 'y'
  start: number
  end: number
  justify: 'start' | 'center' | 'end'
  items: SceneFlowItem[]
}

export interface SceneFlowItem {
  layerId: string
  /** Space before this item (ignored for the first visible item). */
  gap: number
  with?: string[]
}

export type TemplateVersionReason = 'save' | 'autosave' | 'restore'

export interface TemplateVersion {
  version: number
  scene: SceneDefinition
  label: string
  bindings: DataBindingKey[]
  updatedAt: number
  /** Who made this version (team library name), when known. */
  updatedBy?: string
  reason?: TemplateVersionReason
}

export interface TemplateBindingHint {
  layerId: string
  layerName: string
  sampleText: string
  sourceToken?: string
  suggestedBinding?: DataBindingKey
  confidence?: number
}

export interface TemplateDefinition {
  id: string
  label: string
  scene: SceneDefinition
  bindings?: DataBindingKey[]
  bindingHints?: TemplateBindingHint[]
  favorite?: boolean
  builtIn?: boolean
  version?: number
  versions?: TemplateVersion[]
  updatedAt?: number
  /** Who last changed it (team library name). */
  updatedBy?: string
  /** How the current content was made, and when its checkpoint started (drives autosave history). */
  versionReason?: TemplateVersionReason
  checkpointAt?: number
}
