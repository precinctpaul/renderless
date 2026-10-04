import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { makeFieldsOf, swappableImagesOf, withImageFraming, withImageSwaps, withVisibility } from '../../lib/makeFields'
import { imageSize, preparePhoto, savePhotoToLibrary } from '../../lib/photoUpload'
import { buildSmartScene, smartTemplate } from '../../data/templates'
import { DEFAULT_STYLE_ID, isStyleId, type StyleId } from '../../data/brandStyles'
import type { DataSheet } from '../../lib/dataSheet'
import { matchSheet, readManualMapping, rowValues, withManualChoice, writeManualMapping, type ManualMapping } from '../../lib/sheetMatching'
import type { ImageFraming, StoryState } from '../../types/scene'

const STORAGE_KEY = 'renderless.make.v1'

interface StoredMake {
  templateId?: string
  /** Typed values per template, so switching templates keeps each one's text. */
  values?: Record<string, Record<string, string>>
  /** On/off choices per template: photo slots by layer id, optional fields as `field:<key>`. */
  toggles?: Record<string, Record<string, boolean>>
  /** Brand style and layout per template (built-in templates only). */
  looks?: Record<string, { style?: StyleId; layout?: string }>
  /** Older saves: photo slots left out. Read once into `toggles`. */
  hidden?: Record<string, string[]>
}

function readStored(): StoredMake {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredMake
    if (!parsed || typeof parsed !== 'object') return {}
    if (parsed.hidden) {
      const toggles = { ...parsed.toggles }
      Object.entries(parsed.hidden).forEach(([templateId, ids]) => {
        toggles[templateId] = { ...Object.fromEntries(ids.map((id) => [id, false])), ...toggles[templateId] }
      })
      delete parsed.hidden
      return { ...parsed, toggles }
    }
    return parsed
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
  // How each replaced photo is framed (subject point + zoom), per template, for this visit.
  const [framing, setFramingState] = useState<Record<string, Record<string, ImageFraming>>>({})
  const [photoError, setPhotoError] = useState('')
  // A photo remembers where its subject is: placed again (another template or slot), it starts framed the same.
  const subjectBySrc = useRef(new Map<string, Pick<ImageFraming, 'x' | 'y' | 'zoom'>>())
  const [libraryImages, setLibraryImages] = useState<MediaLibraryEntry[]>([])
  // A pasted sheet lasts for this visit and carries across templates; each template matches it on its own.
  const [sheet, setSheet] = useState<DataSheet | null>(null)
  const [rowIndex, setRowIndex] = useState<number | null>(null)
  const [manualByTemplate, setManualByTemplate] = useState<Record<string, ManualMapping>>({})

  const template = templates.find((entry) => entry.id === stored.templateId) ?? templates[0] ?? null
  const templateId = template?.id ?? ''
  const values = useMemo(() => stored.values?.[templateId] ?? {}, [stored.values, templateId])
  const templateSwaps = useMemo(() => swaps[templateId] ?? {}, [swaps, templateId])
  const templateFraming = useMemo(() => framing[templateId] ?? {}, [framing, templateId])
  const toggles = useMemo(() => stored.toggles?.[templateId] ?? {}, [stored.toggles, templateId])
  const smart = template?.builtIn ? smartTemplate(templateId) : undefined
  const layouts = useMemo(() => smart?.layouts ?? [], [smart])
  const storedLook = stored.looks?.[templateId]
  const styleId: StyleId = isStyleId(storedLook?.style) ? storedLook.style : DEFAULT_STYLE_ID
  const layoutId = layouts.some((option) => option.id === storedLook?.layout) ? storedLook!.layout! : (layouts[0]?.id ?? '')

  // The chosen layout as it ships (no on/off choices): its fields, photo slots and defaults.
  // Layouts can add fields (e.g. the lower third's second person).
  const baseScene = useMemo(
    () => (template ? (smart && buildSmartScene(templateId, { style: styleId, layout: layoutId })) || template.scene : null),
    [template, smart, templateId, styleId, layoutId],
  )
  const fields = useMemo(() => (baseScene ? makeFieldsOf(baseScene) : []), [baseScene])
  const imageSlots = useMemo(() => (baseScene ? swappableImagesOf(baseScene) : []), [baseScene])
  /** The graphic for a layout: built in the chosen style, with photos swapped and the on/off choices applied. */
  const sceneFor = useCallback(
    (layout: string) => {
      if (!template) return null
      const chosen = (on: boolean) => new Set(Object.entries(toggles).filter(([key, value]) => value === on && !key.startsWith('field:')).map(([key]) => key))
      const base = (smart && buildSmartScene(templateId, { style: styleId, layout, off: chosen(false), on: chosen(true) })) || template.scene
      return withVisibility(withImageFraming(withImageSwaps(base, templateSwaps), templateFraming), toggles)
    },
    [template, smart, templateId, styleId, toggles, templateSwaps, templateFraming],
  )
  const scene = useMemo(() => sceneFor(layoutId), [sceneFor, layoutId])
  const layoutScenes = useMemo(
    () => layouts.map((option) => ({ ...option, scene: sceneFor(option.id)! })),
    [layouts, sceneFor],
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
      const nextToggles = { ...current.toggles }
      delete nextToggles[templateId]
      return { ...current, values: rest, toggles: nextToggles }
    })
    setSwaps((current) => {
      const rest = { ...current }
      delete rest[templateId]
      return rest
    })
    setFramingState((current) => {
      const rest = { ...current }
      delete rest[templateId]
      return rest
    })
  }, [templateId, update])

  /** Puts a photo in a slot (null: back to the template's own), starting it framed on the middle. */
  const swapImage = useCallback(
    (layerId: string, src: string | null, size?: { width: number; height: number }) => {
      setSwaps((current) => {
        const forTemplate = { ...current[templateId] }
        if (src) forTemplate[layerId] = src
        else delete forTemplate[layerId]
        return { ...current, [templateId]: forTemplate }
      })
      setFramingState((current) => {
        const forTemplate = { ...current[templateId] }
        if (src && size) {
          const subject = subjectBySrc.current.get(src) ?? { x: 0.5, y: 0.45, zoom: 1 }
          forTemplate[layerId] = { ...subject, imageWidth: size.width, imageHeight: size.height }
        }
        else delete forTemplate[layerId]
        return { ...current, [templateId]: forTemplate }
      })
      setPhotoError('')
    },
    [templateId],
  )

  const setFraming = useCallback(
    (layerId: string, patch: Partial<Pick<ImageFraming, 'x' | 'y' | 'zoom'>>) =>
      setFramingState((current) => {
        const existing = current[templateId]?.[layerId]
        if (!existing) return current
        const next = { ...existing, ...patch }
        const src = swaps[templateId]?.[layerId]
        if (src) subjectBySrc.current.set(src, { x: next.x, y: next.y, zoom: next.zoom })
        return { ...current, [templateId]: { ...current[templateId], [layerId]: next } }
      }),
    [templateId, swaps],
  )

  /** An uploaded photo: shrunk if huge, kept in the team library (so it shows in recents), and placed. */
  const uploadPhoto = useCallback(
    async (layerId: string, file: File) => {
      try {
        const photo = await preparePhoto(file)
        swapImage(layerId, photo.dataUrl, photo)
        await savePhotoToLibrary(file.name, photo).catch(() => undefined)
      } catch (error) {
        setPhotoError(error instanceof Error ? error.message : 'Could not read that photo.')
      }
    },
    [swapImage],
  )

  /** A library image (recents or the full list), placed once its size is known. */
  const pickLibraryPhoto = useCallback(
    async (layerId: string, entry: MediaLibraryEntry) => {
      try {
        swapImage(layerId, entry.dataUrl, await imageSize(entry.dataUrl))
      } catch {
        setPhotoError(`Could not load ${entry.name}.`)
      }
    },
    [swapImage],
  )

  const setToggle = useCallback(
    (key: string, on: boolean) =>
      update((current) => ({
        ...current,
        toggles: { ...current.toggles, [templateId]: { ...current.toggles?.[templateId], [key]: on } },
      })),
    [templateId, update],
  )

  const setLook = useCallback(
    (patch: { style?: StyleId; layout?: string }) =>
      update((current) => ({
        ...current,
        looks: { ...current.looks, [templateId]: { ...current.looks?.[templateId], ...patch } },
      })),
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
    toggles,
    baseScene,
    isSmart: Boolean(smart),
    styleId,
    layoutId,
    layoutScenes,
    libraryImages,
    recentImages: [...libraryImages].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 12),
    framing: templateFraming,
    setFraming,
    uploadPhoto,
    pickLibraryPhoto,
    photoError,
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
    setToggle,
    setLook,
  }
}

export type MakeState = ReturnType<typeof useMake>
