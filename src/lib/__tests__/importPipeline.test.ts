import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readPsd } from 'ag-psd'
import { createDesignImportDraft } from '../importPipeline'

vi.mock('ag-psd', () => ({
  readPsd: vi.fn(),
}))

function createPsdFile(name = 'import_test.psd'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, {
    type: 'image/vnd.adobe.photoshop',
  })
}

describe('importPipeline PSD adapter', () => {
  beforeEach(() => {
    vi.mocked(readPsd).mockReset()
  })

  test('preserves PSD stacking order so background stays behind text layers', async () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 1920,
      height: 1080,
      children: [
        {
          name: 'TEAM 1',
          left: 180,
          top: 72,
          right: 510,
          bottom: 142,
          opacity: 255,
          text: {
            text: 'TEAM 1',
            style: {
              fontSize: 56,
              fillColor: { r: 255, g: 150, b: 80 },
            },
          },
        },
        {
          name: 'BG',
          left: 0,
          top: 0,
          right: 1920,
          bottom: 1080,
          opacity: 255,
          canvas: {
            width: 1920,
            height: 1080,
            toDataURL: () => 'data:image/png;base64,bg',
          },
        },
      ],
    } as never)

    const draft = await createDesignImportDraft(createPsdFile())

    expect(draft.scene.layers).toHaveLength(2)
    expect(draft.scene.layers[0]?.name).toBe('TEAM 1')
    expect(draft.scene.layers[0]?.kind).toBe('text')
    expect(draft.scene.layers[1]?.name).toBe('BG')
    expect(draft.scene.layers[1]?.kind).toBe('image')
  })

  test('extracts PSD text from alternate keys and strips null characters', async () => {
    vi.mocked(readPsd).mockReturnValue({
      width: 1920,
      height: 1080,
      children: [
        {
          name: 'TEAM 2 SCORE',
          left: 1320,
          top: 200,
          right: 1760,
          bottom: 280,
          opacity: 255,
          text: {
            'Txt ': '\u0000TEAM 2 SCORE\u0000',
            styleRuns: [
              {
                style: {
                  fontSize: 64,
                  fillColor: { r: 255, g: 150, b: 80 },
                },
              },
            ],
          },
        },
      ],
    } as never)

    const draft = await createDesignImportDraft(createPsdFile('import_test_alt.psd'))
    const importedText = draft.scene.layers.find((layer) => layer.kind === 'text')

    expect(importedText).toBeTruthy()
    expect(importedText?.kind).toBe('text')
    if (importedText?.kind === 'text') {
      expect(importedText.text).toBe('TEAM 2 SCORE')
    }
  })
})

