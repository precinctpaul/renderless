import type { MediaLibraryEntry } from '../../lib/mediaLibrary'

/** Dashboard helpers: folder trees, drag payloads, sorting and formatting (no React state). */

export const DASHBOARD_FOLDER_STORAGE_KEY = 'renderless.dashboard.folders.v1'
export const FOLDER_DRAG_MIME = 'application/x-renderless-dashboard-folder'
export const ENTRY_DRAG_MIME = 'application/x-renderless-dashboard-entry'
export const ASSET_ROOT = 'Branded Assets'
export const FONT_ROOT = 'Fonts'
export const DEFAULT_ASSET_FOLDERS = [ASSET_ROOT, `${ASSET_ROOT}/BGs`, `${ASSET_ROOT}/Template Designs`]
export const DEFAULT_FONT_FOLDERS = [FONT_ROOT, `${FONT_ROOT}/Imported`]
export const DEFAULT_FONT_SPECIMEN = 'Majority Dems'
export const SYSTEM_FONT_FAMILIES = [
  'Inter, sans-serif',
  'Roboto, sans-serif',
  'JetBrains Mono, monospace',
] as const

export type DashboardMode = 'Media' | 'Typography' | 'Templates'
export type TemplateFolderFilter = 'all' | 'builtIn' | 'custom'
export type ExplorerKind = 'assets' | 'fonts'
export type MediaTypeFilter = 'all' | 'image' | 'video' | 'animation'
export type MediaViewMode = 'gridLarge' | 'gridSmall' | 'list'
export type MediaSortKey = 'name' | 'type' | 'size' | 'modifiedAt'

export interface FolderCatalog {
  assets: string[]
  fonts: string[]
}

export interface FolderRow {
  path: string
  name: string
  depth: number
  root: boolean
  hasChildren: boolean
  expanded: boolean
}

export interface FolderDragPayload {
  kind: ExplorerKind
  folderPath: string
}

export interface EntryDragPayload {
  kind: ExplorerKind
  entryId: string
}

export interface FontFamilyGroup {
  family: string
  entries: MediaLibraryEntry[]
  source: 'system' | 'custom'
}

export interface BreadcrumbItem {
  label: string
  mode: DashboardMode
  path?: string
  templateFilter?: TemplateFolderFilter
}

export interface ExplorerSectionState {
  Media: boolean
  Typography: boolean
  Templates: boolean
}

export function normalizeFolderPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

export function normalizeFolderList(paths: string[], root: string): string[] {
  const normalized = new Set<string>()
  normalized.add(root)
  paths.forEach((path) => {
    const nextPath = normalizeFolderPath(path)
    if (!nextPath) {
      return
    }
    if (nextPath === root || nextPath.startsWith(`${root}/`)) {
      normalized.add(nextPath)
      return
    }
    normalized.add(`${root}/${nextPath}`)
  })

  return Array.from(normalized).sort((left, right) => {
    const depthDiff = left.split('/').length - right.split('/').length
    if (depthDiff !== 0) {
      return depthDiff
    }
    return left.localeCompare(right)
  })
}

export function normalizeEntryFolder(folder: string, root: string): string {
  const nextPath = normalizeFolderPath(folder)
  if (!nextPath) {
    return root
  }
  if (nextPath === root || nextPath.startsWith(`${root}/`)) {
    return nextPath
  }
  return `${root}/${nextPath}`
}

export function normalizeEntriesForRoot(entries: MediaLibraryEntry[], root: string): MediaLibraryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    folder: normalizeEntryFolder(entry.folder, root),
  }))
}

export function readFolderCatalog(): FolderCatalog {
  if (typeof window === 'undefined') {
    return {
      assets: DEFAULT_ASSET_FOLDERS,
      fonts: DEFAULT_FONT_FOLDERS,
    }
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_FOLDER_STORAGE_KEY)
    if (!raw) {
      return {
        assets: DEFAULT_ASSET_FOLDERS,
        fonts: DEFAULT_FONT_FOLDERS,
      }
    }

    const parsed = JSON.parse(raw) as Partial<FolderCatalog>
    const assets = Array.isArray(parsed.assets) ? parsed.assets.filter((entry): entry is string => typeof entry === 'string') : []
    const fonts = Array.isArray(parsed.fonts) ? parsed.fonts.filter((entry): entry is string => typeof entry === 'string') : []
    return {
      assets: normalizeFolderList(assets, ASSET_ROOT),
      fonts: normalizeFolderList(fonts, FONT_ROOT),
    }
  } catch {
    return {
      assets: DEFAULT_ASSET_FOLDERS,
      fonts: DEFAULT_FONT_FOLDERS,
    }
  }
}

export function persistFolderCatalog(catalog: FolderCatalog): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DASHBOARD_FOLDER_STORAGE_KEY, JSON.stringify(catalog))
  } catch {
    // Ignore storage write failures.
  }
}

export function getParentPath(path: string): string {
  const index = path.lastIndexOf('/')
  if (index <= 0) {
    return ''
  }
  return path.slice(0, index)
}

export function getDirectChildFolderPaths(paths: string[], parentPath: string): string[] {
  return paths
    .filter((path) => getParentPath(path) === parentPath)
    .sort((left, right) => {
      const leftName = left.split('/').pop() ?? left
      const rightName = right.split('/').pop() ?? right
      return leftName.localeCompare(rightName)
    })
}

export function ancestorPaths(path: string): string[] {
  const segments = normalizeFolderPath(path).split('/')
  const ancestors: string[] = []
  for (let index = 1; index <= segments.length; index += 1) {
    ancestors.push(segments.slice(0, index).join('/'))
  }
  return ancestors
}

export function buildFolderRows(paths: string[], root: string, expandedPaths: string[]): FolderRow[] {
  const normalized = normalizeFolderList(paths, root)
  const expandedSet = new Set(expandedPaths)
  const rows: FolderRow[] = []

  const walk = (path: string, depth: number) => {
    const children = getDirectChildFolderPaths(normalized, path)
    const row: FolderRow = {
      path,
      name: path.split('/').pop() ?? path,
      depth,
      root: path === root,
      hasChildren: children.length > 0,
      expanded: path === root || expandedSet.has(path),
    }
    rows.push(row)

    if (!row.expanded) {
      return
    }

    children.forEach((childPath) => {
      walk(childPath, depth + 1)
    })
  }

  walk(root, 0)
  return rows
}

export function parseFolderDragPayload(raw: string): FolderDragPayload | null {
  if (!raw) {
    return null
  }
  const normalized = raw.startsWith('renderless-folder:') ? raw.slice('renderless-folder:'.length) : raw

  try {
    const parsed = JSON.parse(normalized) as Partial<FolderDragPayload>
    if (!parsed || (parsed.kind !== 'assets' && parsed.kind !== 'fonts') || typeof parsed.folderPath !== 'string') {
      return null
    }

    return {
      kind: parsed.kind,
      folderPath: parsed.folderPath,
    }
  } catch {
    return null
  }
}

export function parseEntryDragPayload(raw: string): EntryDragPayload | null {
  if (!raw) {
    return null
  }
  const normalized = raw.startsWith('renderless-entry:') ? raw.slice('renderless-entry:'.length) : raw

  try {
    const parsed = JSON.parse(normalized) as Partial<EntryDragPayload>
    if (!parsed || (parsed.kind !== 'assets' && parsed.kind !== 'fonts') || typeof parsed.entryId !== 'string') {
      return null
    }

    return {
      kind: parsed.kind,
      entryId: parsed.entryId,
    }
  } catch {
    return null
  }
}

export function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export function formatTemplateDate(updatedAt?: number): string {
  if (!updatedAt || !Number.isFinite(updatedAt)) {
    return '03/04/2026'
  }

  return new Date(updatedAt).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

export function formatDate(value: number): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function parseBatchTags(rawValue: string): string[] {
  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export function mediaTypeForEntry(entry: MediaLibraryEntry): MediaTypeFilter {
  const mime = entry.mime.toLowerCase()
  const name = entry.name.toLowerCase()
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(name)) {
    return 'video'
  }
  if (mime.includes('json') || name.endsWith('.json') || name.endsWith('.lottie')) {
    return 'animation'
  }
  return 'image'
}

export function sortMediaEntries(
  entries: MediaLibraryEntry[],
  sortKey: MediaSortKey,
  sortDirection: 'asc' | 'desc',
): MediaLibraryEntry[] {
  const direction = sortDirection === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    let comparison = 0
    if (sortKey === 'name') {
      comparison = left.name.localeCompare(right.name)
    } else if (sortKey === 'type') {
      comparison = mediaTypeForEntry(left).localeCompare(mediaTypeForEntry(right))
      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name)
      }
    } else if (sortKey === 'size') {
      comparison = left.size - right.size
      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name)
      }
    } else {
      comparison = left.modifiedAt - right.modifiedAt
      if (comparison === 0) {
        comparison = left.name.localeCompare(right.name)
      }
    }

    return comparison * direction
  })
}

export function formatUploadResult({
  kind,
  imported,
  rejected,
  failedFonts,
}: {
  kind: 'assets' | 'fonts'
  imported: number
  rejected: number
  failedFonts?: number
}): string {
  if (imported === 0 && rejected === 0 && (failedFonts ?? 0) === 0) {
    return `No ${kind} selected.`
  }

  const parts: string[] = []
  if (imported > 0) {
    parts.push(`uploaded ${imported}`)
  }
  if (rejected > 0) {
    parts.push(`rejected ${rejected}`)
  }
  if ((failedFonts ?? 0) > 0) {
    parts.push(`font load failed ${failedFonts ?? 0}`)
  }

  return `${kind === 'fonts' ? 'Font' : 'Asset'} ingest: ${parts.join(', ')}.`
}

export function looksLikeTemplatePackagePayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  return record.kind === 'renderless.template-package'
}
