import { usePlayoutStore } from '../store/playoutStore'
import { smartTemplate } from '../data/templates'
import { LookPicker } from './LookPicker'

/**
 * The Studio's look switch (Control Room console, Design toolbar): one click restyles Preview;
 * Program changes on the next TAKE, like any other change.
 */
export function StudioLookPicker() {
  const studioStyle = usePlayoutStore((state) => state.studioStyle)
  const studioLayouts = usePlayoutStore((state) => state.studioLayouts)
  const setStudioStyle = usePlayoutStore((state) => state.setStudioStyle)
  const setStudioLayout = usePlayoutStore((state) => state.setStudioLayout)
  const previewTemplateId = usePlayoutStore((state) => state.previewTemplateId)
  const isBuiltIn = usePlayoutStore((state) => Boolean(state.templates.find((entry) => entry.id === state.previewTemplateId)?.builtIn))
  const onAirDiffers = usePlayoutStore((state) => state.onAir && state.programScene !== state.previewScene)
  const smart = isBuiltIn ? smartTemplate(previewTemplateId) : undefined
  const layouts = smart?.layouts ?? []

  return (
    <div className="studio-look">
      <LookPicker
        compact
        styleId={studioStyle}
        onStyleChange={setStudioStyle}
        layouts={layouts}
        layoutId={studioLayouts[previewTemplateId] ?? layouts[0]?.id}
        onLayoutChange={(layout) => setStudioLayout(previewTemplateId, layout)}
        unavailable={smart ? undefined : 'Cue a built-in template to change its style.'}
      />
      {smart && onAirDiffers ? <p className="studio-look__hint">Restyles Preview. TAKE puts it on air.</p> : null}
    </div>
  )
}
