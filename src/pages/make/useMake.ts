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
import { makeFieldsOf, swappableImagesOf, withImageSwaps } from '../../lib/makeFields'
import type { StoryState } from '../../types/scene'

const STORAGE_KEY = 'renderless.make.v1'

interface StoredMake {
  templateId?: string
  /** Typed values per template, so switching templates keeps each one's text. */
  values?: Record<string, Record<string, string>>
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

  const template = templates.find((entry) => entry.id === stored.templateId) ?? templates[0] ?? null
  const templateId = template?.id ?? ''
  const values = useMemo(() => stored.values?.[templateId] ?? {}, [stored.values, templateId])
  const templateSwaps = useMemo(() => swaps[templateId] ?? {}, [swaps, templateId])

  const fields = useMemo(() => (template ? makeFieldsOf(template.scene) : []), [template])
  const imageSlots = useMemo(() => (template ? swappableImagesOf(template.scene) : []), [template])
  const scene = useMemo(() => (template ? withImageSwaps(template.scene, templateSwaps) : null), [template, templateSwaps])
  const story = useMemo<StoryState>(() => ({ bindings: { ...values } }), [values])

  const update = useCallback((recipe: (current: StoredMake) => StoredMake) => {
    setStored((current) => {
      const next = recipe(current)
      writeStored(next)
      return next
    })
  }, [])

  const selectTemplate = useCallback((id: string) => update((current) => ({ ...current, templateId: id })), [update])

  const setValue = useCallback(
    (key: string, value: string) =>
      update((current) => ({
        ...current,
        values: { ...current.values, [templateId]: { ...current.values?.[templateId], [key]: value } },
      })),
    [templateId, update],
  )

  const clearValues = useCallback(() => {
    update((current) => {
      const rest = { ...current.values }
      delete rest[templateId]
      return { ...current, values: rest }
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
    libraryImages,
    selectTemplate,
    setValue,
    clearValues,
    swapImage,
  }
}

export type MakeState = ReturnType<typeof useMake>
