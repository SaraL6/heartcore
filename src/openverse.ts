import type { Img } from './store'

// Openverse (openverse.org) is a free, keyless search over openly licensed
// images. We ask for Flickr photos only: it is the biggest source and very much
// the right era. To add another provider, return the same Img shape.
const API = 'https://api.openverse.org/v1/images/'
const PAGE_SIZE = 20 // the most Openverse allows without an API key

type OvImage = {
  id: string; title?: string; creator?: string; url: string; thumbnail?: string
  foreign_landing_url?: string; license?: string; license_version?: string
  width?: number; height?: number; tags?: { name: string }[]
}

/**
 * Flickr's 640px version of a photo, for cards. Only for the sizes that share
 * the photo's normal secret (h, k and o sizes use their own).
 */
export function flickrCardSize(url: string): string | undefined {
  const m = /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)(?:_([mnwzcb]))?\.jpg$/.exec(url)
  return m ? `${m[1]}_z.jpg` : undefined
}

export async function searchOpenverse(q: string, page: number): Promise<{ items: Img[]; hasMore: boolean }> {
  const u = new URL(API)
  const params: Record<string, string> = { q, page: String(page), page_size: String(PAGE_SIZE), source: 'flickr' }
  // If the site ever earns money (ads, paid features), set this so Discover
  // leaves out photos whose license forbids commercial use.
  if (import.meta.env.VITE_COMMERCIAL_LICENSES_ONLY === 'true') params.license_type = 'commercial'
  u.search = new URLSearchParams(params).toString()
  // The library can be slow and times out now and then; one quiet retry usually does it.
  const attempt = () => fetch(u, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  let res = await attempt()
  if (!res || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1500))
    res = await attempt()
  }
  if (!res) throw new Error("couldn't reach the image library — check your connection")
  if (res.status === 429) throw new Error('the image library is rate-limiting us — give it a minute and try again')
  if (!res.ok) throw new Error(`the image library answered with an error (${res.status})`)
  const data: { results: OvImage[]; page_count?: number } = await res.json()
  return {
    hasMore: page < (data.page_count ?? 0),
    items: data.results.filter((r) => r.url?.startsWith('https://')).map((r) => ({
      key: `openverse:${r.id}`,
      provider: 'openverse',
      providerId: r.id,
      url: r.url,
      thumb: flickrCardSize(r.url),
      width: r.width || undefined,
      height: r.height || undefined,
      caption: r.title ?? '',
      tags: [...new Set((r.tags ?? []).map((t) => t.name.toLowerCase().trim()).filter((t) => t && t.length <= 24))].slice(0, 8),
      credit: r.creator || undefined,
      sourceUrl: r.foreign_landing_url,
      license: r.license ? `CC ${r.license.toUpperCase()}${r.license_version ? ' ' + r.license_version : ''}` : undefined,
      heartCount: 0,
    })),
  }
}
