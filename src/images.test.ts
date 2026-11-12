import { describe, expect, it } from 'vitest'
import { fromFlickr } from './flickr'
import { interleave, mixed } from './images'
import { flickrCardSize } from './openverse'

describe('mixing photo libraries', () => {
  it('alternates results and keeps the leftovers', () => {
    expect(interleave<number | string>([1, 2, 3], ['a'])).toEqual([1, 'a', 2, 3])
    expect(interleave([], ['a', 'b'])).toEqual(['a', 'b'])
  })
  it('still shows one library when the other fails', async () => {
    const ok = async () => ({ items: [{ key: 'u:1' }] as never[], hasMore: true })
    const broken = async () => { throw new Error('down') }
    await expect(mixed(ok, broken, 'cars', 1)).resolves.toEqual({ items: [{ key: 'u:1' }], hasMore: true })
    await expect(mixed(broken, broken, 'cars', 1)).rejects.toThrow('down')
  })
  it("shows the fast library first and adds the slow one when it arrives", async () => {
    const fast = async () => ({ items: [{ key: 'new' }] as never[], hasMore: false })
    const slow = () => new Promise<{ items: never[]; hasMore: boolean }>((r) => setTimeout(() => r({ items: [{ key: 'old' }] as never[], hasMore: true }), 50))
    const late: unknown[] = []
    const page = await mixed(fast, slow, 'cars', 1, (p) => late.push(p), 10)
    expect(page).toEqual({ items: [{ key: 'new' }], hasMore: true })
    await new Promise((r) => setTimeout(r, 80))
    expect(late).toEqual([{ items: [{ key: 'old' }], hasMore: true }])
  })
  it('waits for the slow library when the fast one failed', async () => {
    const broken = async () => { throw new Error('down') }
    const slow = () => new Promise<{ items: never[]; hasMore: boolean }>((r) => setTimeout(() => r({ items: [{ key: 'old' }] as never[], hasMore: false }), 30))
    await expect(mixed(broken, slow, 'cars', 1, undefined, 5)).resolves.toEqual({ items: [{ key: 'old' }], hasMore: false })
  })
})

describe('fromFlickr', () => {
  const photo = {
    id: '123', owner: '12@N01', ownername: 'anna', title: 'summer 09', license: '4', tags: 'film summer  beach',
    datetaken: '2009-07-04 12:00:00', datetakenunknown: '0',
    url_z: 'https://live.staticflickr.com/1/123_z.jpg', width_z: 640, height_z: 427,
    url_l: 'https://live.staticflickr.com/1/123_b.jpg', width_l: '1024', height_l: '683',
  }
  it('credits the photographer and links back', () => {
    const img = fromFlickr(photo)!
    expect(img).toMatchObject({
      key: 'flickr:123', provider: 'flickr', url: photo.url_l, thumb: photo.url_z, width: 1024, height: 683,
      credit: 'anna', license: 'CC BY 2.0', year: '2009', tags: ['film', 'summer', 'beach'],
      sourceUrl: 'https://www.flickr.com/photos/12%40N01/123',
    })
  })
  it('leaves out unknown dates and photos without a usable image', () => {
    expect(fromFlickr({ ...photo, datetakenunknown: '1' })!.year).toBeUndefined()
    expect(fromFlickr({ id: '9', owner: 'x' })).toBeNull()
    expect(fromFlickr({ ...photo, url_l: 'http://insecure/x.jpg', url_z: undefined })).toBeNull()
  })
})

describe('flickrCardSize', () => {
  it("swaps a Flickr photo for its 640px version", () => {
    expect(flickrCardSize('https://live.staticflickr.com/2687/4393049592_63f32487cb_b.jpg')).toBe('https://live.staticflickr.com/2687/4393049592_63f32487cb_z.jpg')
    expect(flickrCardSize('https://live.staticflickr.com/2687/4393049592_63f32487cb.jpg')).toBe('https://live.staticflickr.com/2687/4393049592_63f32487cb_z.jpg')
  })
  it('leaves sizes with their own secret, and other hosts, alone', () => {
    expect(flickrCardSize('https://live.staticflickr.com/2687/4393049592_0a1b2c3d4e_o.jpg')).toBeUndefined()
    expect(flickrCardSize('https://live.staticflickr.com/2687/4393049592_0a1b2c3d4e_k.jpg')).toBeUndefined()
    expect(flickrCardSize('https://example.com/a_b.jpg')).toBeUndefined()
  })
})

import { dealColumns } from './components'

describe('dealColumns', () => {
  it('fills the shortest column first', () => {
    expect(dealColumns([1, 1, 2, 1], 2, (h) => h)).toEqual([[1, 2], [1, 1]])
  })
  it('never moves cards that were already placed when more load', () => {
    const first = Array.from({ length: 20 }, (_, i) => 0.5 + ((i * 37) % 10) / 10)
    const more = [...first, ...Array.from({ length: 20 }, (_, i) => 0.5 + ((i * 53) % 10) / 10)]
    const before = dealColumns(first.map((h, i) => ({ i, h })), 5, (x) => x.h)
    const after = dealColumns(more.map((h, i) => ({ i, h })), 5, (x) => x.h)
    before.forEach((col, c) => expect(after[c].slice(0, col.length)).toEqual(col))
  })
})
