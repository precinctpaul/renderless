import { persistMediaEntries, readMediaEntriesAsync, type MediaLibraryEntry } from './mediaLibrary'
import { ASSET_ROOT } from '../pages/dashboard/dashboardModel'

/** Where photos uploaded in Make are kept in the (team) library. */
export const PHOTO_FOLDER = `${ASSET_ROOT}/Photos`

/** Longest side kept for uploads: sharp for a 1920-wide graphic, small enough to sync quickly. */
const MAX_SIDE = 2000

export interface PreparedPhoto {
  dataUrl: string
  width: number
  height: number
  mime: string
  size: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file is not an image we can read.'))
    image.src = src
  })
}

export async function imageSize(src: string): Promise<{ width: number; height: number }> {
  const image = await loadImage(src)
  return { width: image.naturalWidth || 1, height: image.naturalHeight || 1 }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Reads an upload and shrinks it to at most MAX_SIDE px (PNGs stay PNG for transparency; SVGs stay as they are). */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const original = await readDataUrl(file)
  const image = await loadImage(original)
  const width = image.naturalWidth || 1
  const height = image.naturalHeight || 1
  const longest = Math.max(width, height)
  if (file.type === 'image/svg+xml' || longest <= MAX_SIDE) {
    return { dataUrl: original, width, height, mime: file.type || 'image/png', size: file.size }
  }
  const ratio = MAX_SIDE / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const context = canvas.getContext('2d')
  if (!context) return { dataUrl: original, width, height, mime: file.type, size: file.size }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const dataUrl = canvas.toDataURL(mime, 0.88)
  return { dataUrl, width: canvas.width, height: canvas.height, mime, size: Math.round((dataUrl.length * 3) / 4) }
}

/** Keeps an uploaded photo in the library (it syncs to the team when connected) and returns its entry. */
export async function savePhotoToLibrary(name: string, photo: PreparedPhoto): Promise<MediaLibraryEntry> {
  const entry: MediaLibraryEntry = {
    id: `asset-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'asset',
    name: photo.mime === 'image/jpeg' ? name.replace(/\.(png|webp|heic|heif|gif|bmp|tiff?)$/i, '.jpg') : name,
    folder: PHOTO_FOLDER,
    size: photo.size,
    mime: photo.mime,
    modifiedAt: Date.now(),
    dataUrl: photo.dataUrl,
    tags: ['make-upload'],
  }
  const existing = await readMediaEntriesAsync('asset')
  persistMediaEntries('asset', [entry, ...existing])
  return entry
}
