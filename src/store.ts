import { useSyncExternalStore } from 'react'
import type { ArtKind, ArtSpec } from './art'

export type Theme = 'pastel' | 'grunge' | 'galaxy'
export type Post = {
  id: string
  author: string
  caption: string
  tags: string[]
  baseHearts: number
  createdAt: number
  art?: ArtSpec // built-in procedural artwork
  src?: string // remote image URL
  // otherwise: an uploaded file stored in IndexedDB under the post id
}
export type Collection = { id: string; name: string; postIds: string[] }
type Saved = {
  profile: { name: string; bio: string; theme: Theme }
  posts: Post[] // only the user's own posts; the starter feed is generated
  hearts: string[] // newest first
  collections: Collection[]
}
type State = Saved & { blobs: Record<string, string> } // post id -> object URL

// ---------- starter feed ----------

const AUTHORS = ['moonchild_', 'tea.and.rain', 'xo-lena', 'paperplanes', 'wildflwr', 'indigo.kid', 'stardustt', 'coffee.and.converse']
const QUOTES = [
  'stay weird', 'good vibes only', 'but first, coffee', 'normal people scare me', 'made of stardust',
  'too rad to be sad', 'lost in the right direction', 'the moon made me do it', 'reality called so i hung up',
  'five more minutes', 'idk. idc.', 'meet me at midnight', 'pizza is my soulmate', 'forever young',
]
const WORDS = ['wanderlust', 'infinity', 'dreamer', 'young', 'wild', 'nope', 'hipster', '']
const NOTES = ["summer '12", 'best day ever', 'road trip', 'us ♥', 'take me back', 'the lake']
const MOONS = ['goodnight', 'sweet dreams', 'la lune', 'night owl', '']
const TAGS: Record<ArtKind, string[]> = {
  galaxy: ['galaxy', 'space', 'hipster', 'grunge'],
  quote: ['quotes', 'typography', 'words', 'text'],
  sunset: ['sunset', 'sky', 'travel', 'summer'],
  pattern: ['pattern', 'wallpaper', 'cute', 'pastel'],
  polaroid: ['polaroid', 'vintage', 'memories', 'summer'],
  moon: ['moon', 'night', 'stars', 'dreamy'],
}
const ORDER: ArtKind[] = ['galaxy', 'quote', 'sunset', 'quote', 'pattern', 'polaroid', 'moon', 'quote']

export const SEEDS: Post[] = Array.from({ length: 56 }, (_, i) => {
  const kind = ORDER[i % ORDER.length]
  const n = Math.floor(i / ORDER.length) + i
  const text =
    kind === 'quote' ? QUOTES[n % QUOTES.length]
    : kind === 'galaxy' ? WORDS[n % WORDS.length]
    : kind === 'polaroid' ? NOTES[n % NOTES.length]
    : kind === 'moon' ? MOONS[n % MOONS.length]
    : undefined
  const tags = TAGS[kind]
  return {
    id: `seed-${i}`,
    author: AUTHORS[(i * 5 + 3) % AUTHORS.length],
    caption: text ?? '',
    tags: [tags[0], tags[1 + (i % (tags.length - 1))]],
    baseHearts: 12 + ((i * 2654435761) >>> 0) % 4800,
    createdAt: 0,
    art: { kind, seed: 1000 + i * 77, text: text || undefined, h: kind === 'quote' ? 200 + (i % 3) * 50 : 260 + ((i * 53) % 200) },
  }
})

// ---------- persistence ----------

const KEY = 'heartcore:v1'
const DEFAULT: Saved = {
  profile: { name: 'you', bio: 'collecting pretty things since forever ♡', theme: 'pastel' },
  posts: [], hearts: [], collections: [{ id: 'c-first', name: 'things i love', postIds: [] }],
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) }
  } catch { /* corrupted or unavailable storage: start fresh */ }
  return DEFAULT
}

let state: State = { ...load(), blobs: {} }
const listeners = new Set<() => void>()

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  const { blobs: _blobs, ...saved } = state
  try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* quota/private mode */ }
  listeners.forEach((l) => l())
}

export function useStore(): State {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)
}

// Uploaded files live in IndexedDB (localStorage is far too small for images).
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('heartcore', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('images')
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const req = fn(d.transaction('images', mode).objectStore('images'))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

export async function loadBlobs() {
  try {
    const [keys, vals] = await Promise.all([
      idb('readonly', (s) => s.getAllKeys()),
      idb<Blob[]>('readonly', (s) => s.getAll()),
    ])
    const blobs: Record<string, string> = {}
    keys.forEach((k, i) => (blobs[String(k)] = URL.createObjectURL(vals[i])))
    set({ blobs })
  } catch (e) { console.warn('could not load uploads', e) }
}

// ---------- actions ----------

const uid = () => Math.random().toString(36).slice(2, 10)

export const actions = {
  toggleHeart(id: string) {
    const has = state.hearts.includes(id)
    set({ hearts: has ? state.hearts.filter((h) => h !== id) : [id, ...state.hearts] })
  },
  setProfile(p: Partial<Saved['profile']>) { set({ profile: { ...state.profile, ...p } }) },
  async addPost(input: { caption: string; tags: string[]; src?: string; file?: Blob }) {
    const id = 'p-' + uid()
    if (input.file) await idb('readwrite', (s) => s.put(input.file!, id))
    const post: Post = {
      id, author: state.profile.name, caption: input.caption, tags: input.tags,
      baseHearts: 0, createdAt: Date.now(), src: input.src,
    }
    set({
      posts: [post, ...state.posts],
      blobs: input.file ? { ...state.blobs, [id]: URL.createObjectURL(input.file) } : state.blobs,
    })
    return id
  },
  deletePost(id: string) {
    idb('readwrite', (s) => s.delete(id)).catch(() => {})
    if (state.blobs[id]) URL.revokeObjectURL(state.blobs[id])
    const { [id]: _gone, ...blobs } = state.blobs
    set({
      posts: state.posts.filter((p) => p.id !== id),
      hearts: state.hearts.filter((h) => h !== id),
      collections: state.collections.map((c) => ({ ...c, postIds: c.postIds.filter((p) => p !== id) })),
      blobs,
    })
  },
  addCollection(name: string) {
    const c = { id: 'c-' + uid(), name, postIds: [] }
    set({ collections: [...state.collections, c] })
    return c.id
  },
  renameCollection(id: string, name: string) {
    set({ collections: state.collections.map((c) => (c.id === id ? { ...c, name } : c)) })
  },
  deleteCollection(id: string) { set({ collections: state.collections.filter((c) => c.id !== id) }) },
  toggleInCollection(cid: string, pid: string) {
    set({
      collections: state.collections.map((c) =>
        c.id !== cid ? c : { ...c, postIds: c.postIds.includes(pid) ? c.postIds.filter((p) => p !== pid) : [pid, ...c.postIds] }),
    })
  },
}

export const allPosts = (s: State) => [...s.posts, ...SEEDS]
export const isMine = (p: Post) => p.id.startsWith('p-')
export const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n))
