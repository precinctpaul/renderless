import { describe, expect, test } from 'vitest'
import {
  acceptRemoteAsset,
  assetHashFromRef,
  collectAssetHashes,
  getCachedAsset,
  isAssetRef,
  onAssetAvailable,
  storeAsset,
} from '../assetStore'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('asset store', () => {
  test('stores an image once under its content hash and resolves the reference', async () => {
    const ref = await storeAsset(PIXEL)
    expect(isAssetRef(ref)).toBe(true)
    expect(assetHashFromRef(ref)).toMatch(/^[0-9a-f]{64}$/)
    expect(await storeAsset(PIXEL)).toBe(ref)
    expect(getCachedAsset(ref)).toBe(PIXEL)
    expect(await storeAsset(ref)).toBe(ref)
  })

  test('plain URLs pass through untouched', () => {
    expect(getCachedAsset('https://example.com/a.png')).toBe('https://example.com/a.png')
  })

  test('remote images are accepted only when they match their hash', async () => {
    const other = `${PIXEL}#second`
    const ref = await storeAsset(other)
    const hash = assetHashFromRef(ref)

    expect(await acceptRemoteAsset('0'.repeat(64), PIXEL)).toBe(false)
    expect(await acceptRemoteAsset(hash, other)).toBe(true)
  })

  test('notifies listeners when a new image becomes available', async () => {
    const seen: string[] = []
    const stop = onAssetAvailable((hash) => seen.push(hash))
    const ref = await storeAsset(`${PIXEL}#third`)
    stop()
    expect(seen).toContain(assetHashFromRef(ref))
  })

  test('collects every referenced hash in nested scene data', async () => {
    const ref = await storeAsset(PIXEL)
    const scene = { layers: [{ kind: 'image', src: ref }, { kind: 'text', text: 'rlasset: is not a ref' }, { kind: 'image', src: PIXEL }] }
    expect([...collectAssetHashes({ programScene: scene, previewScene: scene })]).toEqual([assetHashFromRef(ref)])
  })
})
