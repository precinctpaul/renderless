import { zipSync } from 'fflate'
import type { DataSheet } from './dataSheet'
import { fieldToggleKey, makeFileName, withVisibility, type MakeField } from './makeFields'
import { rowValues } from './sheetMatching'
import { textThatWontFit } from './sceneLayout'
import type { SceneDefinition, StoryState, TemplateDefinition } from '../types/scene'

/** Above this many rows, ask first: every graphic is drawn in the browser's memory. */
export const BATCH_SOFT_LIMIT = 50

export interface BatchItem {
  /** 1-based, as people count spreadsheet rows (after the header). */
  row: number
  fileName: string
  scene: SceneDefinition
  story: StoryState
  /** Plain words: missing fields, text that can't fit. */
  problems: string[]
}

interface PlanInput {
  template: Pick<TemplateDefinition, 'label'>
  /** The graphic as set up in Make (style, layout, photos, on/off switches). */
  scene: SceneDefinition
  fields: MakeField[]
  /** What the staffer typed; used for fields the sheet doesn't fill. */
  values: Record<string, string>
  sheet: DataSheet
  /** Sheet column key -> field key. */
  mapping: Record<string, string>
}

/**
 * One graphic per row. A filled cell wins; an empty cell falls back to what was typed; an
 * optional field with neither is turned off (no sample text in a real graphic). Files are named
 * from the row's own words, with -2, -3 for repeats.
 */
export function planBatch({ template, scene, fields, values, sheet, mapping }: PlanInput): BatchItem[] {
  const used = new Map<string, number>()
  const mappedFields = new Set(Object.values(mapping))
  return sheet.rows.map((row, index) => {
    const fromRow = rowValues(row, mapping)
    const merged: Record<string, string> = { ...values }
    const toggles: Record<string, boolean> = {}
    const problems: string[] = []
    for (const field of fields) {
      const cell = mappedFields.has(field.key) ? (fromRow[field.key] ?? '').trim() : ''
      const typed = (values[field.key] ?? '').trim()
      if (cell) merged[field.key] = cell
      else if (!typed && field.optional) toggles[fieldToggleKey(field.key)] = false
      else if (!typed) problems.push(`missing ${field.label}`)
    }
    const rowScene = Object.keys(toggles).length > 0 ? withVisibility(scene, toggles) : scene
    const story: StoryState = { bindings: merged }
    const tooLong = new Set(textThatWontFit(rowScene, story))
    fields.filter((field) => field.layerIds.some((id) => tooLong.has(id))).forEach((field) => problems.push(`${field.label} too long to fit`))

    const base = makeFileName(template, fields, merged).replace(/\.png$/, '')
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    return { row: index + 1, fileName: `${base}${count > 1 ? `-${count}` : ''}.png`, scene: rowScene, story, problems }
  })
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Draws every item (one at a time, to keep memory steady) and packs the PNGs into one ZIP. */
export async function renderBatchZip(
  items: BatchItem[],
  render: (scene: SceneDefinition, story: StoryState) => Promise<string>,
  onProgress: (done: number) => void,
  cancelled: () => boolean,
): Promise<Blob | null> {
  const files: Record<string, Uint8Array> = {}
  for (const [index, item] of items.entries()) {
    if (cancelled()) return null
    files[item.fileName] = dataUrlBytes(await render(item.scene, item.story))
    onProgress(index + 1)
  }
  // PNGs are already compressed: store them as they are.
  const zipped = zipSync(files, { level: 0 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
}
