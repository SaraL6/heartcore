import { looksAiByWords } from './aicheck'
import { flickrEnabled, searchFlickr } from './flickr'
import { searchOpenverse } from './openverse'
import type { Img } from './store'
import { searchUnsplash, unsplashEnabled } from './unsplash'
import { newQuery, oldQuery } from './vibes'

// Where Discover gets its pictures.
// - New photos: Unsplash (needs a key).
// - Old photos: Flickr. Directly with a Flickr API key (Flickr Pro only),
//   otherwise Flickr's openly licensed photos through Openverse (no key).
// With Unsplash set up, Discover mixes new and old unless someone picks one.
export type Source = 'mix' | 'new' | 'old'
export const canChooseSource = unsplashEnabled
const searchOld = flickrEnabled ? searchFlickr : searchOpenverse

export const LIBRARIES = [
  ...(unsplashEnabled ? [{ name: 'Unsplash', url: 'https://unsplash.com/?utm_source=heartcore&utm_medium=referral' }] : []),
  flickrEnabled
    ? { name: 'Flickr', url: 'https://www.flickr.com' }
    : { name: 'Flickr via Openverse', url: 'https://openverse.org' },
]

export type Page = { items: Img[]; hasMore: boolean }
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

// How long the mixed feed waits for the slower library before showing what it has.
export const MIX_WAIT_MS = 2500
const settle = <T,>(p: Promise<T>) => p.then((value) => ({ ok: true as const, value }), (error) => ({ ok: false as const, error }))

/**
 * Searches two libraries at once and alternates their results. If the second
 * is slow, the first is shown right away and the second arrives through
 * `onLate`. One failing never blanks the page.
 */
export async function mixed(first: Search, second: Search, q: string, page: number, onLate?: (p: Page) => void, waitMs = MIX_WAIT_MS): Promise<Page> {
  const a = first(q, page)
  const b = second(q, page)
  const late = new Promise<'late'>((r) => setTimeout(() => r('late'), waitMs))
  const [x, y] = await Promise.all([settle(a), Promise.race([settle(b), late])])
  if (y === 'late') {
    if (!x.ok) return b // nothing to show yet; wait for the slow one after all
    b.then((p) => onLate?.(p), () => {})
    return { items: x.value.items, hasMore: true }
  }
  if (!x.ok && !y.ok) throw x.error
  const none: Page = { items: [], hasMore: false }
  const left = x.ok ? x.value : none
  const right = y.ok ? y.value : none
  return { items: interleave(left.items, right.items), hasMore: left.hasMore || right.hasMore }
}

// Flickr's open library is full of Photoshop texture packs, and photostreams
// come in long runs of near-identical shots.
const NOT_PHOTOS = /\b(textures?|backgrounds?|brush(es)?|overlays?|psd|freebies?|stock)\b/i
const PER_PERSON = 3
export function tidyOld(items: Img[]): Img[] {
  const seen = new Map<string, number>()
  return items.filter((i) => {
    if (NOT_PHOTOS.test([i.caption, ...i.tags].join(' '))) return false
    const who = i.credit ?? ''
    seen.set(who, (seen.get(who) ?? 0) + 1)
    return !who || seen.get(who)! <= PER_PERSON
  })
}

// Going back to a tag you just looked at shouldn't spend another request:
// Unsplash allows 50 an hour until an app is approved.
const recent = new Map<string, { at: number; page: Promise<Page> }>()
const KEEP_MS = 10 * 60_000
const copy = (p: Page): Page => ({ hasMore: p.hasMore, items: p.items.map((i) => ({ ...i })) })

function remembered(name: string, search: Search): Search {
  return (q, page) => {
    const key = `${name}|${q.toLowerCase()}|${page}`
    const hit = recent.get(key)
    if (hit && Date.now() - hit.at < KEEP_MS) return hit.page.then(copy)
    // Library photos that describe themselves as AI never reach the page.
    const p = search(q, page).then((r) => ({ hasMore: r.hasMore, items: r.items.filter((i) => !looksAiByWords(i)) }))
    recent.set(key, { at: Date.now(), page: p })
    p.catch(() => recent.delete(key))
    if (recent.size > 80) recent.delete(recent.keys().next().value!)
    return p.then(copy)
  }
}
const newPhotos = remembered('new', (q, page) => searchUnsplash(newQuery(q), page))
const oldPhotos = remembered('old', async (q, page) => {
  const pick = oldQuery(q, page)
  const res = await searchOld(pick.q, pick.page)
  return { hasMore: res.hasMore || page < 3, items: tidyOld(res.items) }
})

export function searchImages(q: string, page: number, source: Source = 'mix', onLate?: (p: Page) => void): Promise<Page> {
  if (!unsplashEnabled || source === 'old') return oldPhotos(q, page)
  if (source === 'new') return newPhotos(q, page)
  return mixed(newPhotos, oldPhotos, q, page, onLate)
}
