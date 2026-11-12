import type { Img } from './store'

// Unsplash image search, used for Discover when VITE_UNSPLASH_ACCESS_KEY is set.
// Their API rules, which this file follows: load images from the URLs they
// return, credit the photographer and Unsplash with links back, and tell
// Unsplash when a photo is "used" (here: hearted or saved).
const KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined
export const unsplashEnabled = !!KEY
const REF = '?utm_source=heartcore&utm_medium=referral'
const pings = new Map<string, string>() // photo id -> "download" tracking URL

export async function searchUnsplash(q: string, page: number): Promise<{ items: Img[]; hasMore: boolean }> {
  const u = new URL('https://api.unsplash.com/search/photos')
  u.search = new URLSearchParams({ query: q, page: String(page), per_page: '30', content_filter: 'high', orientation: 'portrait' }).toString()
  const res = await fetch(u, { headers: { Authorization: `Client-ID ${KEY}`, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(20_000) }).catch(() => null)
  if (!res) throw new Error("couldn't reach the image library — check your connection")
  if (res.status === 403 || res.status === 429) throw new Error('we hit the hourly limit of the image library — try again in a little while')
  if (res.status === 401) throw new Error('the Unsplash access key was not accepted')
  if (!res.ok) throw new Error(`the image library answered with an error (${res.status})`)
  const data: { results: any[]; total_pages?: number } = await res.json()
  return {
    hasMore: page < (data.total_pages ?? 0),
    items: data.results.filter((r) => r.urls?.regular).map((r) => {
      if (r.links?.download_location) pings.set(r.id, r.links.download_location)
      return {
        key: `unsplash:${r.id}`, provider: 'unsplash', providerId: r.id,
        url: r.urls.regular, thumb: r.urls.small, width: r.width || undefined, height: r.height || undefined,
        caption: r.description || r.alt_description || '',
        tags: [...new Set<string>((r.tags ?? []).map((t: any) => String(t.title ?? '').toLowerCase()).filter((t: string) => t && t.length <= 24))].slice(0, 8),
        credit: r.user?.name || undefined,
        creditUrl: r.user?.links?.html ? r.user.links.html + REF : undefined,
        sourceUrl: r.links?.html ? r.links.html + REF : undefined,
        license: 'Unsplash License',
        heartCount: 0,
      }
    }),
  }
}

/** Unsplash asks to be told when a photo is used; call when one is hearted or saved. */
export function trackUse(img: Img) {
  const ping = img.provider === 'unsplash' && img.providerId ? pings.get(img.providerId) : undefined
  if (ping && KEY) fetch(ping, { headers: { Authorization: `Client-ID ${KEY}` } }).catch(() => {})
}
