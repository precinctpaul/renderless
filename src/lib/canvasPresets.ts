/** Canvas sizes the team uses most: broadcast, YouTube and social formats. */
export const CANVAS_PRESETS = [
  { id: 'broadcast', label: 'Broadcast / OBS 16:9', width: 1920, height: 1080 },
  { id: 'youtube-thumbnail', label: 'YouTube Thumbnail', width: 1280, height: 720 },
  { id: 'square', label: 'Square Post 1:1', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Portrait Post 4:5', width: 1080, height: 1350 },
  { id: 'story', label: 'Story / Reel 9:16', width: 1080, height: 1920 },
  { id: 'uhd', label: '4K 16:9', width: 3840, height: 2160 },
] as const

export type CanvasPresetId = (typeof CANVAS_PRESETS)[number]['id']

export function presetForSize(width: number, height: number) {
  return CANVAS_PRESETS.find((preset) => preset.width === width && preset.height === height) ?? null
}

/** Accepts "1080x1350", "1080 × 1350" or "1080,1350". */
export function parseCanvasSize(text: string): { width: number; height: number } | null {
  const match = text.trim().match(/^(\d{2,5})\s*[x×,*]\s*(\d{2,5})$/i)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width >= 16 && height >= 16 && width <= 8192 && height <= 8192 ? { width, height } : null
}
