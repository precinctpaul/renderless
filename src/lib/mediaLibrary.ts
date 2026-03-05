export type MediaLibraryKind = 'asset' | 'font'

export interface MediaLibraryEntry {
  id: string
  kind: MediaLibraryKind
  name: string
  folder: string
  size: number
  mime: string
  modifiedAt: number
  dataUrl: string
  fontFamily?: string
}

export const ASSET_STORAGE_KEY = 'renderless.dashboard.assets.v1'
export const FONT_STORAGE_KEY = 'renderless.dashboard.fonts.v1'
export const MEDIA_LIBRARY_UPDATED_EVENT = 'renderless-media-library-updated'

const REGISTERED_FONT_FAMILIES = new Set<string>()

function storageKeyFor(kind: MediaLibraryKind): string {
  return kind === 'font' ? FONT_STORAGE_KEY : ASSET_STORAGE_KEY
}

function createEntryId(kind: MediaLibraryKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function inferMime(file: File, kind: MediaLibraryKind): string {
  if (file.type) {
    return file.type
  }

  if (kind !== 'font') {
    return 'application/octet-stream'
  }

  if (/\.woff2$/i.test(file.name)) return 'font/woff2'
  if (/\.woff$/i.test(file.name)) return 'font/woff'
  if (/\.otf$/i.test(file.name)) return 'font/otf'
  if (/\.ttf$/i.test(file.name)) return 'font/ttf'
  return 'font/ttf'
}

function toFontFamily(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const cleaned = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'Custom Font'
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('File read failed'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('File read failed'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function isFontFileName(fileName: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(fileName)
}

function normalizeEntry(rawEntry: unknown, kind: MediaLibraryKind): MediaLibraryEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null
  }

  const record = rawEntry as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : null
  const name = typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : null
  const folder = typeof record.folder === 'string' && record.folder.trim().length > 0 ? record.folder.trim() : null
  const size = Number(record.size)
  const modifiedAt = Number(record.modifiedAt)

  if (!id || !name || !folder || !Number.isFinite(size) || !Number.isFinite(modifiedAt)) {
    return null
  }

  return {
    id,
    kind,
    name,
    folder,
    size: Math.max(0, Math.round(size)),
    mime: typeof record.mime === 'string' && record.mime.trim().length > 0 ? record.mime.trim() : 'application/octet-stream',
    modifiedAt: Math.max(0, Math.round(modifiedAt)),
    dataUrl: typeof record.dataUrl === 'string' ? record.dataUrl : '',
    fontFamily: typeof record.fontFamily === 'string' && record.fontFamily.trim().length > 0 ? record.fontFamily.trim() : undefined,
  }
}

export function readMediaEntries(kind: MediaLibraryKind): MediaLibraryEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKeyFor(kind))
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => normalizeEntry(entry, kind))
      .filter((entry): entry is MediaLibraryEntry => entry !== null)
  } catch {
    return []
  }
}

export function persistMediaEntries(kind: MediaLibraryKind, entries: MediaLibraryEntry[]): { ok: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { ok: true }
  }

  try {
    window.localStorage.setItem(storageKeyFor(kind), JSON.stringify(entries))
    window.dispatchEvent(
      new CustomEvent(MEDIA_LIBRARY_UPDATED_EVENT, {
        detail: { kind },
      }),
    )
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to persist files (storage quota exceeded).' }
  }
}

export async function buildEntriesFromFiles(
  files: File[],
  kind: MediaLibraryKind,
  folder: string,
): Promise<{ entries: MediaLibraryEntry[]; rejectedFiles: string[] }> {
  const entries: MediaLibraryEntry[] = []
  const rejectedFiles: string[] = []

  for (const file of files) {
    if (kind === 'font' && !isFontFileName(file.name)) {
      rejectedFiles.push(file.name)
      continue
    }

    try {
      const dataUrl = await readDataUrl(file)
      const nextEntry: MediaLibraryEntry = {
        id: createEntryId(kind),
        kind,
        name: file.name,
        folder,
        size: file.size,
        mime: inferMime(file, kind),
        modifiedAt: Date.now(),
        dataUrl,
        fontFamily: kind === 'font' ? toFontFamily(file.name) : undefined,
      }
      entries.push(nextEntry)
    } catch {
      rejectedFiles.push(file.name)
    }
  }

  return { entries, rejectedFiles }
}

async function registerFont(entry: MediaLibraryEntry): Promise<{ ok: boolean; family?: string; error?: string }> {
  if (entry.kind !== 'font') {
    return { ok: false, error: 'Not a font entry.' }
  }

  const family = entry.fontFamily?.trim() || toFontFamily(entry.name)
  if (REGISTERED_FONT_FAMILIES.has(family)) {
    return { ok: true, family }
  }

  if (typeof window === 'undefined' || typeof FontFace === 'undefined') {
    return { ok: false, error: 'FontFace API not available.' }
  }

  if (!entry.dataUrl) {
    return { ok: false, error: `Missing font data for ${entry.name}` }
  }

  try {
    const face = new FontFace(family, `url(${entry.dataUrl})`)
    const loadedFace = await face.load()
    document.fonts.add(loadedFace)
    REGISTERED_FONT_FAMILIES.add(family)
    return { ok: true, family }
  } catch {
    return { ok: false, error: `Failed to load font ${entry.name}` }
  }
}

export async function registerFontEntries(entries: MediaLibraryEntry[]): Promise<{
  entries: MediaLibraryEntry[]
  loaded: number
  failed: number
  errors: string[]
  changed: boolean
}> {
  let loaded = 0
  let failed = 0
  const errors: string[] = []
  let changed = false

  const nextEntries: MediaLibraryEntry[] = []
  for (const entry of entries) {
    if (entry.kind !== 'font') {
      nextEntries.push(entry)
      continue
    }

    const result = await registerFont(entry)
    if (result.ok && result.family) {
      loaded += 1
      if (entry.fontFamily !== result.family) {
        changed = true
        nextEntries.push({
          ...entry,
          fontFamily: result.family,
        })
      } else {
        nextEntries.push(entry)
      }
      continue
    }

    failed += 1
    if (result.error) {
      errors.push(result.error)
    }
    nextEntries.push(entry)
  }

  return {
    entries: nextEntries,
    loaded,
    failed,
    errors,
    changed,
  }
}
