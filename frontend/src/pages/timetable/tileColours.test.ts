import { describe, it, expect } from 'vitest'
import { tileColours } from './tileColours'
import type { TimetableEvent } from '../../types'

function event(overrides: Partial<TimetableEvent> = {}): TimetableEvent {
  return {
    id: 1,
    class_type_name: 'Sprint',
    class_type_color: '#0d9488',
    status: 'scheduled',
    attendance_count: null,
    viability_color: 'pending',
    ...overrides,
  } as TimetableEvent
}

describe('tileColours', () => {
  it('Stripe: white tile, class colour down the side', () => {
    expect(tileColours(event(), 'stripe').style).toEqual({
      borderLeftColor: '#0d9488',
      backgroundColor: '#ffffff',
    })
  })

  it('Tint: a light wash of the class colour', () => {
    expect(tileColours(event(), 'tint').style.backgroundColor).toBe('#0d948826')
  })

  it('Solid: the full class colour, with light text on a dark colour', () => {
    const { style, onDark } = tileColours(event(), 'solid')
    expect(style.backgroundColor).toBe('#0d9488')
    expect(onDark).toBe(true)
  })

  it('Solid: keeps dark text on a light class colour', () => {
    expect(tileColours(event({ class_type_color: '#fde047' }), 'solid').onDark).toBe(false)
  })

  it.each(['stripe', 'tint', 'solid'] as const)(
    'once recorded, %s tiles turn the viability pastel and keep the class stripe',
    (style) => {
      const colours = tileColours(event({ attendance_count: 10, viability_color: 'amber' }), style)
      expect(colours.style).toEqual({ borderLeftColor: '#0d9488', backgroundColor: '#fef3c7' })
      expect(colours.onDark).toBe(false)
    },
  )

  it('falls back to grey when a class has no usable colour', () => {
    expect(tileColours(event({ class_type_color: undefined }), 'stripe').style.borderLeftColor).toBe('#6b7280')
  })
})
