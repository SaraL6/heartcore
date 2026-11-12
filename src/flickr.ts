import type { Img } from './store'

// Flickr: openly licensed and public-domain photos, many from the 2000s and
// early 2010s. Needs a free, non-commercial API key (VITE_FLICKR_API_KEY).
// Only photos whose owners chose an open license, or archives with no known
// copyright restrictions, are ever searched; each is credited and linked.
const KEY = import.meta.env.VITE_FLICKR_API_KEY as string | undefined
export const flickrEnabled = !!KEY

// Flickr's license ids.
export const FLICKR_LICENSES: Record<string, string> = {
  '1': 'CC BY-NC-SA 2.0', '2': 'CC BY-NC 2.0', '3': 'CC BY-NC-ND 2.0', '4': 'CC BY 2.0', '5': 'CC BY-SA 2.0',
  '6': 'CC BY-ND 2.0', '7': 'No known copyright restrictions', '8': 'United States Government Work', '9': 'CC0', '10': 'Public Domain Mark',
}
const COMMERCIAL_OK = ['4', '5', '6', '7', '8', '9', '10']
// Keeps the Flickr side of Discover in its golden era.
const UPLOADED_BEFORE = String(Date.UTC(2016, 0, 1) / 1000)

/* eslint-disable @typescript-eslint/no-explicit-any */
export function fromFlickr(p: any): Img | null {
  const big = p.url_l ?? p.url_c ?? p.url_z
  if (typeof big !== 'string' || !big.startsWith('https://')) return null
  const size = p.url_l ? 'l' : p.url_c ? 'c' : 'z'
  const year = p.datetaken && p.datetakenunknown !== '1' && p.datetakenunknown !== 1 ? String(p.datetaken).slice(0, 4) : undefined
  return {
    key: `flickr:${p.id}`, provider: 'flickr', providerId: String(p.id),
    url: big, thumb: typeof p.url_z === 'string' && p.url_z.startsWith('https://') ? p.url_z : big,
    width: Number(p[`width_${size}`]) || undefined, height: Number(p[`height_${size}`]) || undefined,
    caption: p.title ?? '',
    tags: [...new Set(String(p.tags ?? '').split(' ').filter((t) => t && t.length <= 24))].slice(0, 8),
    credit: p.ownername || undefined,
    creditUrl: `https://www.flickr.com/people/${encodeURIComponent(p.owner)}/`,
    sourceUrl: `https://www.flickr.com/photos/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.id)}`,
    license: FLICKR_LICENSES[String(p.license)],
    year,
    heartCount: 0,
  }
}

export async function searchFlickr(q: string, page: number): Promise<{ items: Img[]; hasMore: boolean }> {
  const u = new URL('https://api.flickr.com/services/rest/')
  const commercial = import.meta.env.VITE_COMMERCIAL_LICENSES_ONLY === 'true'
  u.search = new URLSearchParams({
    method: 'flickr.photos.search', api_key: KEY!, text: q, sort: 'relevance',
    license: (commercial ? COMMERCIAL_OK : Object.keys(FLICKR_LICENSES)).join(','),
    safe_search: '1', content_type: '1', media: 'photos', max_upload_date: UPLOADED_BEFORE,
    extras: 'owner_name,url_z,url_c,url_l,tags,license,date_taken',
    per_page: '24', page: String(page), format: 'json', nojsoncallback: '1',
  }).toString()
  const attempt = () => fetch(u, { signal: AbortSignal.timeout(20_000) }).catch(() => null)
  let res = await attempt()
  if (!res || res.status >= 500) res = await attempt()
  if (!res) throw new Error("couldn't reach Flickr — check your connection")
  if (!res.ok) throw new Error(`Flickr answered with an error (${res.status})`)
  const data = await res.json()
  if (data.stat !== 'ok') throw new Error(data.code === 100 ? 'the Flickr key was not accepted' : `Flickr said: ${data.message ?? 'something went wrong'}`)
  return {
    hasMore: page < Number(data.photos?.pages ?? 0),
    items: (data.photos?.photo ?? []).map(fromFlickr).filter((i: Img | null): i is Img => !!i),
  }
}
