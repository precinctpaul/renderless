import { describe, expect, test } from 'vitest'
import { isDesignFileName, isPlaceableImageEntry } from '../mediaLibrary'

describe('media file types', () => {
  test('images can be placed on the stage', () => {
    expect(isPlaceableImageEntry({ name: 'logo.png', mime: 'image/png' })).toBe(true)
    expect(isPlaceableImageEntry({ name: 'photo.JPG', mime: '' })).toBe(true)
    expect(isPlaceableImageEntry({ name: 'mark.svg', mime: 'image/svg+xml' })).toBe(true)
  })

  test('design files are kept out of Media and pointed to the Templates importer', () => {
    expect(isPlaceableImageEntry({ name: 'talarico_1.ai', mime: 'application/postscript' })).toBe(false)
    expect(isPlaceableImageEntry({ name: 'talarico_1.ai', mime: '' })).toBe(false)
    expect(isPlaceableImageEntry({ name: 'layout.psd', mime: 'image/vnd.adobe.photoshop' })).toBe(false)
    expect(isPlaceableImageEntry({ name: 'brief.pdf', mime: 'application/pdf' })).toBe(false)
    expect(isDesignFileName('talarico_1.ai')).toBe(true)
  })
})
