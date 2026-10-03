import { SceneRenderer } from './SceneRenderer'
import { BRAND_STYLES, type StyleId } from '../data/brandStyles'
import type { SceneDefinition, StoryState } from '../types/scene'

export interface LayoutChoice {
  id: string
  label: string
  /** The graphic in this layout, for the quick-view thumbnail (live words and photo). */
  scene?: SceneDefinition
}

interface LookPickerProps {
  styleId: StyleId
  onStyleChange: (style: StyleId) => void
  layouts?: LayoutChoice[]
  layoutId?: string
  onLayoutChange?: (layout: string) => void
  story?: StoryState
  /** Shown instead of the swatches when the graphic can't change style (templates people made). */
  unavailable?: string
  compact?: boolean
}

/**
 * One-click brand looks: the three Majority Democrats styles, plus a quick view of a template's
 * layouts. Used by Make (above the preview) and the Studio (Design, Control Room).
 */
export function LookPicker({ styleId, onStyleChange, layouts = [], layoutId, onLayoutChange, story, unavailable, compact = false }: LookPickerProps) {
  return (
    <div className={`look-picker ${compact ? 'look-picker--compact' : ''}`.trim()}>
      <div className="look-picker__group" role="group" aria-label="Style">
        <span className="look-picker__label">Style</span>
        {unavailable ? (
          <span className="look-picker__note">{unavailable}</span>
        ) : (
          <div className="look-picker__options">
            {BRAND_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`look-style ${style.id === styleId ? 'look-style--active' : ''}`.trim()}
                aria-pressed={style.id === styleId}
                title={style.blurb}
                onClick={() => onStyleChange(style.id)}
              >
                <span className="look-style__swatch" aria-hidden="true">
                  {style.swatches.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                {style.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {layouts.length > 1 && onLayoutChange ? (
        <div className="look-picker__group" role="group" aria-label="Layout">
          <span className="look-picker__label">Layout</span>
          <div className="look-picker__options">
            {layouts.map((layout) => (
              <button
                key={layout.id}
                type="button"
                className={`look-layout ${layout.id === layoutId ? 'look-layout--active' : ''}`.trim()}
                aria-pressed={layout.id === layoutId}
                onClick={() => onLayoutChange(layout.id)}
              >
                {layout.scene && story && !compact ? (
                  <span className="look-layout__thumb" style={{ aspectRatio: `${layout.scene.width} / ${layout.scene.height}` }} aria-hidden="true">
                    <SceneRenderer scene={layout.scene} story={story} />
                  </span>
                ) : null}
                <span className="look-layout__label">{layout.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
