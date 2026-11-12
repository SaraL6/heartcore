import { flickrEnabled, searchFlickr } from './flickr'
import { searchOpenverse } from './openverse'
import type { Img } from './store'
import { searchUnsplash, unsplashEnabled } from './unsplash'

// Where Discover gets its pictures. Unsplash brings new photos, Flickr brings
// older ones; with both configured, Discover mixes them unless someone picks
// one. With neither, it uses Openverse (no key needed).
export type Source = 'mix' | 'new' | 'old'
export const canChooseSource = unsplashEnabled && flickrEnabled

export const LIBRARIES = [
  ...(unsplashEnabled ? [{ name: 'Unsplash', url: 'https://unsplash.com/?utm_source=heartcore&utm_medium=referral' }] : []),
  ...(flickrEnabled ? [{ name: 'Flickr', url: 'https://www.flickr.com' }] : []),
  ...(!unsplashEnabled && !flickrEnabled ? [{ name: 'Openverse', url: 'https://openverse.org' }] : []),
]

type Page = { items: Img[]; hasMore: boolean }
type Search = (q: string, page: number) => Promise<Page>

/** Alternates two lists: one from each side, in turn, until both run out. */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}

/** Searches two sources at once; one failing doesn't blank the page. */
export async function mixed(a: Search, b: Search, q: string, page: number): Promise<Page> {
  const [x, y] = await Promise.allSettled([a(q, page), b(q, page)])
  if (x.status === 'rejected' && y.status === 'rejected') throw x.reason
  const none: Page = { items: [], hasMore: false }
  const left = x.status === 'fulfilled' ? x.value : none
  const right = y.status === 'fulfilled' ? y.value : none
  return { items: interleave(left.items, right.items), hasMore: left.hasMore || right.hasMore }
}

function search(q: string, page: number, source: Source): Promise<Page> {
  if (!unsplashEnabled && !flickrEnabled) return searchOpenverse(q, page)
  if (!flickrEnabled) return searchUnsplash(q, page)
  if (!unsplashEnabled) return searchFlickr(q, page)
  if (source === 'new') return searchUnsplash(q, page)
  if (source === 'old') return searchFlickr(q, page)
  return mixed(searchUnsplash, searchFlickr, q, page)
}

// Going back to a tag you just looked at shouldn't spend another request:
// Unsplash allows 50 an hour until an app is approved.
const recent = new Map<string, { at: number; page: Page }>()
const KEEP_MS = 10 * 60_000

export async function searchImages(q: string, page: number, source: Source = 'mix'): Promise<Page> {
  const key = `${source}|${q.toLowerCase()}|${page}`
  const hit = recent.get(key)
  if (!hit || Date.now() - hit.at > KEEP_MS) {
    recent.set(key, { at: Date.now(), page: await search(q, page, source) })
    if (recent.size > 60) recent.delete(recent.keys().next().value!)
  }
  const { page: p } = recent.get(key)!
  // Copies, so the page can annotate its results without changing the cache.
  return { hasMore: p.hasMore, items: p.items.map((i) => ({ ...i })) }
}
