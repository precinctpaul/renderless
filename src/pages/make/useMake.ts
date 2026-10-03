import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePlayoutStore } from '../../store/playoutStore'
import {
  FONT_STORAGE_KEY,
  MEDIA_LIBRARY_UPDATED_EVENT,
  invalidateMediaEntriesCache,
  isPlaceableImageEntry,
  readMediaEntriesAsync,
  registerFontEntries,
  type MediaLibraryEntry,
} from '../../lib/mediaLibrary'
import { makeFieldsOf, swappableImagesOf, withHiddenImages, withImageSwaps } from '../../lib/makeFields'
import type { DataSheet } from '../../lib/dataSheet'
import { matchSheet, readManualMapping, rowValues, withManualChoice, writeManualMapping, type ManualMapping } from '../../lib/sheetMatching'
import type { StoryState } from '../../types/scene'

const STORAGE_KEY = 'renderless.make.v1'

interface StoredMake {
  templateId?: string
  /** Typed values per template, so switching templates keeps each one's text. */
  values?: Record<string, Record<string, string>>
  /** Photo slots left out, per template. */
  hidden?: Record<string, string[]>
}

function readStored(): StoredMake {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredMake
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStored(next: StoredMake) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: Make still works, it just forgets on reload.
  }
}

/**
 * Make (the staffer fast path) keeps its own field values and image swaps. It reads templates
 * from the store but never writes to it, so filling a graphic cannot change a template or
 * whatever is live in Program.
 */
export function useMake() {
  const templates = usePlayoutStore((state) => state.templates)
  const [stored, setStored] = useState<StoredMake>(readStored)
  // Replaced images live for this visit only (photos are too big for local storage).
  const [swaps, setSwaps] = useState<Record<string, Record<string, string>>>({})
  const [libraryImages, setLibraryImages] = useState<MediaLibraryEntry[]>([])
  // A pasted sheet lasts for this visit and carries across templates; each template matches it on its own.
  const [sheet, setSheet] = useState<DataSheet | null>(null)
  const [rowIndex, setRowIndex] = useState<number | null>(null)
  const [manualByTemplate, setManualByTemplate] = useState<Record<string, ManualMapping>>({})

  const template = templates.find((entry) => entry.id === stored.templateId) ?? templates[0] ?? null
  const templateId = template?.id ?? ''
  const values = useMemo(() => stored.values?.[templateId] ?? {}, [stored.values, templateId])
  const templateSwaps = useMemo(() => swaps[templateId] ?? {}, [swaps, templateId])
  const hiddenImages = useMemo(() => stored.hidden?.[templateId] ?? [], [stored.hidden, templateId])

  const fields = useMemo(() => (template ? makeFieldsOf(template.scene) : []), [template])
  const imageSlots = useMemo(() => (template ? swappableImagesOf(template.scene) : []), [template])
  const scene = useMemo(
    () => (template ? withHiddenImages(withImageSwaps(template.scene, templateSwaps), hiddenImages) : null),
    [template, templateSwaps, hiddenImages],
  )
  const story = useMemo<StoryState>(() => ({ bindings: { ...values } }), [values])
  const manual = useMemo(() => manualByTemplate[templateId] ?? readManualMapping(templateId), [manualByTemplate, templateId])
  const match = useMemo(() => (sheet ? matchSheet(sheet, fields, manual) : null), [sheet, fields, manual])

  const update = useCallback((recipe: (current: StoredMake) => StoredMake) => {
    setStored((current) => {
      const next = recipe(current)
      writeStored(next)
      return next
    })
  }, [])

  const mergeValues = useCallback(
    (id: string, filled: Record<string, string>) =>
      update((current) => ({ ...current, values: { ...current.values, [id]: { ...current.values?.[id], ...filled } } })),
    [update],
  )

  const setValue = useCallback(
    (key: string, value: string) =>
      update((current) => ({
        ...current,
        values: { ...current.values, [templateId]: { ...current.values?.[templateId], [key]: value } },
      })),
    [templateId, update],
  )

  const fillFromRow = useCallback(
    (index: number | null, mapping: Record<string, string>) => {
      const row = index === null ? null : sheet?.rows[index]
      setRowIndex(row ? index : null)
      if (row) mergeValues(templateId, rowValues(row, mapping))
    },
    [sheet, templateId, mergeValues],
  )

  const selectRow = useCallback((index: number | null) => fillFromRow(index, match?.mapping ?? {}), [fillFromRow, match])

  const loadSheet = useCallback(
    (next: DataSheet) => {
      setSheet(next)
      setRowIndex(null)
      // Fill from the first row straight away, so the preview shows the sheet working.
      if (next.rows.length > 0) {
        setRowIndex(0)
        mergeValues(templateId, rowValues(next.rows[0], matchSheet(next, fields, manual).mapping))
      }
    },
    [fields, manual, templateId, mergeValues],
  )

  // With a sheet loaded, a newly picked template fills from the same row.
  const selectTemplate = useCallback(
    (id: string) => {
      update((current) => ({ ...current, templateId: id }))
      const next = templates.find((entry) => entry.id === id)
      const row = sheet && rowIndex !== null ? sheet.rows[rowIndex] : null
      if (next && sheet && row) {
        const mapping = matchSheet(sheet, makeFieldsOf(next.scene), manualByTemplate[id] ?? readManualMapping(id)).mapping
        mergeValues(id, rowValues(row, mapping))
      }
    },
    [update, templates, sheet, rowIndex, manualByTemplate, mergeValues],
  )

  const clearSheet = useCallback(() => {
    setSheet(null)
    setRowIndex(null)
  }, [])

  const chooseColumn = useCallback(
    (columnKey: string, choice: string | null) => {
      const nextManual = withManualChoice(manual, columnKey, choice)
      writeManualMapping(templateId, nextManual)
      setManualByTemplate((current) => ({ ...current, [templateId]: nextManual }))
      if (sheet) fillFromRow(rowIndex, matchSheet(sheet, fields, nextManual).mapping)
    },
    [manual, templateId, sheet, fields, rowIndex, fillFromRow],
  )

  const clearValues = useCallback(() => {
    update((current) => {
      const rest = { ...current.values }
      delete rest[templateId]
      const hidden = { ...current.hidden }
      delete hidden[templateId]
      return { ...current, values: rest, hidden }
    })
    setSwaps((current) => {
      const rest = { ...current }
      delete rest[templateId]
      return rest
    })
  }, [templateId, update])

  const swapImage = useCallback(
    (layerId: string, src: string | null) =>
      setSwaps((current) => {
        const forTemplate = { ...current[templateId] }
        if (src) forTemplate[layerId] = src
        else delete forTemplate[layerId]
        return { ...current, [templateId]: forTemplate }
      }),
    [templateId],
  )

  const setImageHidden = useCallback(
    (layerId: string, hide: boolean) =>
      update((current) => {
        const others = (current.hidden?.[templateId] ?? []).filter((id) => id !== layerId)
        return { ...current, hidden: { ...current.hidden, [templateId]: hide ? [...others, layerId] : others } }
      }),
    [templateId, update],
  )

  // Team images (for the "choose from library" picker) and uploaded fonts, which templates may use.
  useEffect(() => {
    let cancelled = false
    const loadImages = async () => {
      const entries = await readMediaEntriesAsync('asset')
      if (!cancelled) setLibraryImages(entries.filter((entry) => entry.dataUrl && isPlaceableImageEntry(entry)))
    }
    const loadFonts = async () => {
      const entries = await readMediaEntriesAsync('font')
      if (!cancelled) await registerFontEntries(entries)
    }
    const onUpdated = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: 'asset' | 'font' }>).detail?.kind
      if (!kind || kind === 'asset') {
        invalidateMediaEntriesCache('asset')
        void loadImages()
      }
      if (!kind || kind === 'font') {
        invalidateMediaEntriesCache('font')
        void loadFonts()
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === FONT_STORAGE_KEY) onUpdated(new CustomEvent('x', { detail: { kind: 'font' } }))
    }
    void loadImages()
    void loadFonts()
    window.addEventListener(MEDIA_LIBRARY_UPDATED_EVENT, onUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true
      window.removeEventListener(MEDIA_LIBRARY_UPDATED_EVENT, onUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return {
    templates,
    template,
    scene,
    story,
    fields,
    values,
    imageSlots,
    swaps: templateSwaps,
    hiddenImages,
    libraryImages,
    sheet,
    rowIndex,
    match,
    loadSheet,
    selectRow,
    clearSheet,
    chooseColumn,
    selectTemplate,
    setValue,
    clearValues,
    swapImage,
    setImageHidden,
  }
}

export type MakeState = ReturnType<typeof useMake>
