/**
 * Majority Democrats brand colors (source of truth: brand/guidelines/majordems_brand_colors.md).
 * "Ye Its Yellow Pocari" has no hex value in the guidelines yet, so it is not listed.
 */
export const BRAND_COLORS = [
  { name: 'Not Quite Black', hex: '#111111' },
  { name: 'Acid Green', hex: '#E7EB94' },
  { name: 'Blue', hex: '#3C77BB' },
  { name: 'Not Republican Red', hex: '#ED2426' },
  { name: 'Corporate Green', hex: '#345F54' },
  { name: 'Orange You Glad', hex: '#F06238' },
  { name: 'Orange Bell Pepper', hex: '#F57E21' },
  { name: 'Spilled Milk', hex: '#F9FBED' },
  { name: 'White', hex: '#FFFFFF' },
] as const

export interface BrandColorMatch {
  name: string
  hex: string
  distance: number
}

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) {
    return null
  }
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Nearest brand color by RGB distance (0 = exact match), or null for unparseable input. */
export function nearestBrandColor(hex: string): BrandColorMatch | null {
  const rgb = parseHex(hex)
  if (!rgb) {
    return null
  }

  let best: BrandColorMatch | null = null
  for (const color of BRAND_COLORS) {
    const [r, g, b] = parseHex(color.hex)!
    const distance = Math.round(Math.hypot(rgb[0] - r, rgb[1] - g, rgb[2] - b))
    if (!best || distance < best.distance) {
      best = { name: color.name, hex: color.hex, distance }
    }
  }
  return best
}

/**
 * A short warning when a color is near, but not exactly, a brand color (e.g. after an
 * Illustrator color-profile conversion). Colors far from every brand color are left alone:
 * photos and one-off accents are not brand violations by themselves.
 */
export function describeOffBrandColor(hex: string, usage: string): string | null {
  const match = nearestBrandColor(hex)
  if (!match || match.distance === 0 || match.distance > 28) {
    return null
  }
  return `${usage} ${hex.toUpperCase()} is close to brand ${match.name} ${match.hex} but not exact. Check the color in the source file.`
}
