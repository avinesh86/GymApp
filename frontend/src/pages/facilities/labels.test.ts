import { describe, it, expect } from 'vitest'
import { LICENCE_KIND, options } from './labels'

describe('licence types', () => {
  it('include Group Fitness and Operations, with Other last', () => {
    const labels = options(LICENCE_KIND).map((o) => o.label)
    expect(labels).toContain('Group Fitness')
    expect(labels).toContain('Operations')
    expect(labels[labels.length - 1]).toBe('Other')
  })
})
