import { describe, expect, it } from 'vitest'
import { SELECT_IMG, fmt, toImg } from './store'

describe('fmt', () => {
  it('shortens big heart counts', () => {
    expect(fmt(0)).toBe('0')
    expect(fmt(999)).toBe('999')
    expect(fmt(1000)).toBe('1k')
    expect(fmt(4321)).toBe('4.3k')
  })
})

describe('toImg', () => {
  it('identifies library images by where they came from, so hearts carry across searches', () => {
    const img = toImg({ id: 'uuid-1', provider: 'openverse', provider_id: 'abc', url: 'https://x/y.jpg', heart_count: 3, tags: ['a'] })
    expect(img.key).toBe('openverse:abc')
    expect(img.heartCount).toBe(3)
  })
  it('identifies uploads by their own id and keeps who posted them', () => {
    const img = toImg({ id: 'uuid-2', provider: 'upload', url: 'https://x/z.jpg', uploader: { id: 'u1', username: 'lena' } }, 'mia')
    expect(img.key).toBe('uuid-2')
    expect(img.uploader?.username).toBe('lena')
    expect(img.via).toBe('mia')
    expect(img.tags).toEqual([])
  })
})

describe('SELECT_IMG', () => {
  it("names which link to profiles means the poster (hearts link them too)", () => {
    expect(SELECT_IMG).toContain('profiles!images_uploader_id_fkey(')
  })
})
