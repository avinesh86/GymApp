import type React from 'react'
import type { TimetableEvent, TimetableTileStyle } from '../../types'

/**
 * Colours for a class's tile on the week view.
 *
 * Before attendance is recorded the tile shows the class's own colour (from
 * Settings → Classes) as strongly as the gym's tile style asks: a stripe, a
 * light tint, or solid. Once a count is recorded the background becomes a
 * pastel of its viability colour instead, so recorded classes stand out; the
 * class colour stays as the stripe so classes can still be told apart.
 */

export const DEFAULT_TILE_STYLE: TimetableTileStyle = 'tint'

const FALLBACK_CLASS_COLOUR = '#6b7280'

/** Pastel backgrounds for recorded classes (Tailwind's -100 stops). */
export const VIABILITY_PASTEL: Record<string, string> = {
  red: '#fee2e2',
  amber: '#fef3c7',
  green: '#dcfce7',
  purple: '#f3e8ff',
}

export interface TileColours {
  style: React.CSSProperties
  /** True when the tile is dark enough to need light text. */
  onDark: boolean
}

/** Whether white text reads better than dark text on this colour. */
function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  // Relative luminance (sRGB weights); below ~0.55 takes white text.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55
}

export function tileColours(event: TimetableEvent, tileStyle: TimetableTileStyle): TileColours {
  const classColour = /^#[0-9a-f]{6}$/i.test(event.class_type_color ?? '')
    ? event.class_type_color!
    : FALLBACK_CLASS_COLOUR
  const stripe = { borderLeftColor: classColour }

  const pastel = VIABILITY_PASTEL[event.viability_color ?? '']
  if (pastel) {
    return { style: { ...stripe, backgroundColor: pastel }, onDark: false }
  }

  if (tileStyle === 'solid') {
    return {
      style: { ...stripe, backgroundColor: classColour, borderColor: classColour },
      onDark: isDark(classColour),
    }
  }
  if (tileStyle === 'tint') {
    // ~15% of the class colour over white.
    return { style: { ...stripe, backgroundColor: `${classColour}26` }, onDark: false }
  }
  return { style: { ...stripe, backgroundColor: '#ffffff' }, onDark: false }
}
