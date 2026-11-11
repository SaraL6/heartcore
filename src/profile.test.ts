import { describe, expect, it } from 'vitest'
import { accentInk, isAccent } from './profile'

describe('profile colour', () => {
  it('picks readable text for light and dark colours', () => {
    expect(accentInk('#ffffff')).toBe('#1a1220')
    expect(accentInk('#ffe066')).toBe('#1a1220')
    expect(accentInk('#000000')).toBe('#ffffff')
    expect(accentInk('#7b5cff')).toBe('#ffffff')
  })
  it('accepts only plain hex colours', () => {
    expect(isAccent('#ff5c8a')).toBe(true)
    for (const bad of [null, undefined, '', 'red', '#fff', '#FF5C8A', '#ff5c8a; background: url(x)']) expect(isAccent(bad)).toBe(false)
  })
})
