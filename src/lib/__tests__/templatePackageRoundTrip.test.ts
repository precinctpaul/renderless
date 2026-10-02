import { describe, expect, test } from 'vitest'
import { buildTemplatePackage, parseTemplatePackage, templateFromPackage } from '../templatePackages'
import type { TemplateDefinition } from '../../types/scene'

const HASH = 'a'.repeat(64)

const importedTemplate: TemplateDefinition = {
  id: 'template-import-test',
  label: 'Imported',
  builtIn: false,
  version: 1,
  versions: [],
  bindings: [],
  bindingHints: [],
  updatedAt: 1_700_000_000_000,
  scene: {
    id: 'scene-import-test',
    name: 'Imported',
    width: 1080,
    height: 1350,
    background: 'transparent',
    layers: [
      { id: 'img', kind: 'image', name: 'Photo', x: -12, y: 0, width: 1100, height: 1350, src: `rlasset:${HASH}`, fit: 'stretch', opacity: 1, visible: true, blendMode: 'soft-light' },
      {
        id: 'txt',
        kind: 'text',
        name: 'Headline',
        x: -4,
        y: 700,
        width: 900,
        height: 280,
        text: 'BIGGER,\nBOLDER. ',
        color: '#E7EB94',
        fontSize: 87.5,
        fontFamily: 'DrukWide Super Trial',
        fontWeight: 400,
        align: 'center',
        lineHeight: 1.15,
        letterSpacing: -1.5,
        box: { fill: '#111111', paddingTop: 36.4, paddingRight: 44, paddingBottom: 35.2, paddingLeft: 44, radius: 0 },
        opacity: 1,
        visible: true,
      },
    ],
  },
}

describe('template packages round-trip imported designs exactly', () => {
  test('fractional sizes, negative positions and new layer styles survive save and reload', () => {
    const parsed = parseTemplatePackage(JSON.parse(JSON.stringify(buildTemplatePackage(importedTemplate))))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const [image, text] = templateFromPackage(parsed.value).scene.layers
    expect(image).toMatchObject({ x: -12, blendMode: 'soft-light', src: `rlasset:${HASH}` })
    expect(text).toMatchObject({ x: -4, fontSize: 87.5, lineHeight: 1.15, letterSpacing: -1.5, align: 'center' })
    expect(text.kind === 'text' && text.box).toEqual(importedTemplate.scene.layers[1].kind === 'text' ? importedTemplate.scene.layers[1].box : null)
  })

  test('exported packages carry their images and still pass the checksum', () => {
    const dataUrl = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA='
    const exported = JSON.parse(JSON.stringify(buildTemplatePackage(importedTemplate, null, { [HASH]: dataUrl })))
    const parsed = parseTemplatePackage(exported)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.assets).toEqual({ [HASH]: dataUrl })

    exported.assets[HASH] = 'data:image/webp;base64,TAMPERED'
    expect(parseTemplatePackage(exported).ok).toBe(false)
  })
})
