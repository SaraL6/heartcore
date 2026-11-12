import { searchOpenverse } from './openverse'
import type { Img } from './store'
import { searchUnsplash, unsplashEnabled } from './unsplash'

// Where Discover gets its pictures: Unsplash if a key is configured, otherwise
// Openverse (which needs no key).
const search = unsplashEnabled ? searchUnsplash : searchOpenverse
export const LIBRARY = unsplashEnabled
  ? { name: 'Unsplash', url: 'https://unsplash.com/?utm_source=heartcore&utm_medium=referral', note: 'shared by their photographers' }
  : { name: 'Openverse', url: 'https://openverse.org', note: 'shared by their creators under Creative Commons licenses' }

// Going back to a tag you just looked at shouldn't spend another request:
// Unsplash allows 50 an hour until an app is approved.
type Page = { items: Img[]; hasMore: boolean }
const recent = new Map<string, { at: number; page: Page }>()
const KEEP_MS = 10 * 60_000

export async function searchImages(q: string, page: number): Promise<Page> {
  const key = `${q.toLowerCase()}|${page}`
  const hit = recent.get(key)
  if (!hit || Date.now() - hit.at > KEEP_MS) {
    recent.set(key, { at: Date.now(), page: await search(q, page) })
    if (recent.size > 60) recent.delete(recent.keys().next().value!)
  }
  const { page: p } = recent.get(key)!
  // Copies, so the page can annotate its results without changing the cache.
  return { hasMore: p.hasMore, items: p.items.map((i) => ({ ...i })) }
}
