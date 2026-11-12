import { describe, expect, it } from 'vitest'
import { fromFlickr } from './flickr'
import { interleave, mixed } from './images'

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
