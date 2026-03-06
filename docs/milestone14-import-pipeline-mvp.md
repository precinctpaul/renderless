# Milestone 14: Import Pipeline MVP

## Goal
Enable external design ingest (`.psd`, `.lottie`, `.json` Lottie) into RenderLess as importable templates that preserve text layers and provide operator-ready binding suggestions.

## Architecture
1. Canonical target remains `renderless.template-package` (v2).
2. Source adapters convert external design files into an internal draft scene (`DesignImportDraft`).
3. Dashboard Import Wizard lets operators:
   - review draft preview,
   - edit template name,
   - map text layers to binding keys,
   - import as a native template.
4. Imported templates store `bindingHints` for future recall/export.

## Supported Inputs (MVP)
- `.psd` via `ag-psd`
- `.lottie`, `.zip` (with `.lottie` structure) via `fflate`
- `.json`:
  - `renderless.template-package` imports directly, or
  - Lottie JSON auto-detected and routed to wizard.

## Conversion Rules
### PSD
- Text layers -> RenderLess text layers with style/position approximations.
- Raster/canvas layers -> RenderLess image layers.
- Unsupported layers are skipped with warning messages.

### Lottie
- Text layers (`ty=5`) -> RenderLess text layers.
- Position/font/color are approximated from first keyframe/document style.
- Non-text animation details are intentionally not rendered in MVP.

## Binding Hints
Hints are auto-detected from:
- explicit layer tags: `[bind:Some.Key]`
- handlebars tokens in text: `{{Some.Key}}`
- common alias heuristics (`home_score`, `clock`, etc.)

Each hint stores:
- `layerId`, `layerName`, `sampleText`
- optional `sourceToken`, `suggestedBinding`
- optional `confidence`

## Store/Schema Extensions
- `TemplateDefinition` now supports optional `bindingHints`.
- Template package v2 now supports optional `bindingHints`.
- Parse/build/migrate/export/import paths preserve `bindingHints`.
- Added direct template ingest action:
  - `importTemplateDefinition(template)`
  - used by Import Wizard commits.
