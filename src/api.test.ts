import { describe, expect, it } from 'vitest'
import { esc, safeUrl } from './api'

describe('export page escaping', () => {
  it('neutralises markup in captions and names', () => {
    expect(esc('<img src=x onerror="alert(1)">')).not.toMatch(/[<>"]/)
    expect(esc("it's & fine")).toBe('it&#39;s &#38; fine')
  })
  it('only lets web addresses through as links', () => {
    expect(safeUrl('https://example.com/a?b=1&c=2')).toBe('https://example.com/a?b=1&#38;c=2')
    expect(safeUrl('javascript:alert(1)')).toBe('#')
    expect(safeUrl(undefined)).toBe('#')
  })
})
