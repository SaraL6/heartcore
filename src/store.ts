import { useSyncExternalStore } from 'react'
import { createClient } from '@supabase/supabase-js'
import { trackUse } from './unsplash'

export type Theme = 'pastel' | 'grunge' | 'galaxy' | 'vintage' | 'dream'

// One picture, wherever it came from. `id` is set once it exists in our
// database; `key` identifies it either way (so we know what you've hearted
// while browsing the outside image library).
export type Img = {
  id?: string
  key: string
  provider: string // 'upload' or the name of an image API
  kind?: 'text' // a post made of words; `body` and `style` are set and `url` is empty
  body?: string
  style?: string
  providerId?: string
  url: string
  thumb?: string
  width?: number
  height?: number
  caption: string
  tags: string[]
  credit?: string
  creditUrl?: string
  sourceUrl?: string
  license?: string
  uploader?: { id: string; username: string }
  heartCount: number
  via?: string // "hearted by" username, in the friends feed
}
export type Profile = { id: string; username: string; bio: string; cover_url?: string | null; theme?: Theme; music?: string | null
  mood?: string | null; accent?: string | null; views?: number
}
export const PROFILE_COLS = 'id, username, bio, cover_url, theme, music, mood, accent, views'
export type Collection = { id: string; name: string; userId: string; images: Img[] }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase = url && anon ? createClient(url, anon) : null

type State = {
  ready: boolean
  me: Profile | null
  isAdmin: boolean
  hearted: Record<string, string> // image key -> image id
  counts: Record<string, number> // heart counts changed this session
  following: string[] // profile ids
  top: Record<string, number> // my top 8: profile id -> position
  theme: Theme
  visitTheme: Theme | null // while looking at someone's profile, you see it their way
  quiet: boolean // hide heart counts
  music: string | null // Spotify "type/id" in the player
  musicOpen: boolean
  authOpen: boolean
  toast: string
  rev: number // bumped when lists should reload (after posting or deleting)
}

const savedQuiet = (() => { try { return localStorage.getItem('heartcore:quiet') === '1' } catch { return false } })()
const savedMusic = (() => { try { return localStorage.getItem('heartcore:music') } catch { return null } })()
const savedTheme = (() => { try { return localStorage.getItem('heartcore:theme') as Theme | null } catch { return null } })()
let state: State = {
  ready: !supabase, me: null, isAdmin: false, hearted: {}, counts: {}, following: [], top: {},
  theme: savedTheme ?? 'pastel', visitTheme: null, quiet: savedQuiet, music: savedMusic, musicOpen: false, authOpen: false, toast: '', rev: 0,
}
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }
export const getState = () => state
export const useStore = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getState)

let toastTimer = 0
export function toast(message: string) {
  set({ toast: message })
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => set({ toast: '' }), 4000)
}

export const SELECT_IMG = '*, uploader:profiles(id, username)'
export function toImg(r: any, via?: string): Img {
  return {
    id: r.id,
    key: r.provider === 'upload' ? r.id : `${r.provider}:${r.provider_id}`,
    provider: r.provider, providerId: r.provider_id ?? undefined,
    kind: r.kind === 'text' ? 'text' : undefined, body: r.body ?? undefined, style: r.style ?? undefined,
    url: r.url ?? '', thumb: r.thumb ?? undefined, width: r.width ?? undefined, height: r.height ?? undefined,
    caption: r.caption ?? '', tags: r.tags ?? [], credit: r.credit ?? undefined,
    sourceUrl: r.source_url ?? undefined, license: r.license ?? undefined,
    uploader: r.uploader ?? undefined, heartCount: r.heart_count ?? 0, via,
  }
}

async function loadMe(userId: string) {
  if (!supabase) return
  const [profile, hearts, follows, admin, tops] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle(),
    supabase.from('hearts').select('image_id, images(provider, provider_id)').eq('user_id', userId),
    supabase.from('follows').select('following_id').eq('follower_id', userId),
    supabase.rpc('is_admin'),
    supabase.from('top_friends').select('friend_id, position').eq('user_id', userId),
  ])
  if (profile.error || !profile.data) {
    toast('could not load your profile — has the database schema been run?')
    return set({ ready: true, me: null })
  }
  const hearted: Record<string, string> = {}
  for (const h of (hearts.data ?? []) as any[]) {
    const i = h.images
    if (i) hearted[i.provider === 'upload' ? h.image_id : `${i.provider}:${i.provider_id}`] = h.image_id
  }
  set({ theme: (profile.data.theme as Theme) ?? state.theme, ready: true, me: profile.data as Profile, isAdmin: admin.data === true, hearted, following: (follows.data ?? []).map((f: any) => f.following_id),
    top: Object.fromEntries((tops.data ?? []).map((t: any) => [t.friend_id, t.position])) })
}

export function initAuth() {
  if (!supabase) return
  let current: string | null | undefined
  const apply = (userId: string | null) => {
    if (userId === current) return
    current = userId
    if (userId) loadMe(userId)
    else set({ ready: true, me: null, isAdmin: false, hearted: {}, following: [], top: {} })
  }
  supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null))
  // Defer: Supabase calls made directly inside this callback can deadlock.
  supabase.auth.onAuthStateChange((_e, session) => { setTimeout(() => apply(session?.user.id ?? null), 0) })
}

/** Make sure a picture from the outside library has a row in our database. */
export async function ensureSaved(img: Img): Promise<string> {
  if (img.id) return img.id
  const { data, error } = await supabase!.rpc('save_external_image', {
    p_provider: img.provider, p_provider_id: img.providerId, p_url: img.url, p_thumb: img.thumb ?? null,
    p_width: img.width ?? null, p_height: img.height ?? null, p_caption: img.caption, p_tags: img.tags,
    p_credit: img.credit ?? null, p_source_url: img.sourceUrl ?? null, p_license: img.license ?? null,
  })
  if (error) throw error
  trackUse(img)
  img.id = data as string
  return img.id
}

/** Returns the signed-in profile, or opens the sign-in dialog and returns null. */
export function requireMe(): Profile | null {
  if (!state.me) set({ authOpen: true })
  return state.me
}

export const heartCount = (s: State, img: Img) => s.counts[img.key] ?? img.heartCount

export const actions = {
  setTheme(theme: Theme) {
    try { localStorage.setItem('heartcore:theme', theme) } catch { /* private mode */ }
    set({ theme, visitTheme: null })
    // Your theme is part of your profile: visitors see your page dressed this way.
    if (state.me && supabase) {
      set({ me: { ...state.me, theme } })
      supabase.from('profiles').update({ theme }).eq('id', state.me.id).then(({ error }) => error && console.error(error))
    }
  },
  setVisitTheme: (visitTheme: Theme | null) => set({ visitTheme }),
  setMusicOpen: (musicOpen: boolean) => set({ musicOpen }),
  setMusic(music: string) {
    try { localStorage.setItem('heartcore:music', music) } catch { /* private mode */ }
    set({ music, musicOpen: true })
  },
  toggleQuiet() {
    try { localStorage.setItem('heartcore:quiet', state.quiet ? '0' : '1') } catch { /* private mode */ }
    set({ quiet: !state.quiet })
  },
  openAuth: (open: boolean) => set({ authOpen: open }),
  refresh: () => set({ rev: state.rev + 1 }),
  setMe: (me: Profile) => set({ me }),
  noteCounts(found: { key: string; id: string; heartCount: number }[]) {
    // Called after looking up which library results people here already hearted.
    const counts = { ...state.counts }
    for (const f of found) if (!(f.key in counts)) counts[f.key] = f.heartCount
    set({ counts })
  },
  async toggleHeart(img: Img) {
    const me = requireMe()
    if (!me || !supabase) return
    const was = state.hearted[img.key]
    if (was === 'pending') return // the previous tap is still saving
    const before = { hearted: state.hearted, counts: state.counts }
    const n = heartCount(state, img)
    // Show the change right away; undo it if the server says no.
    const hearted = { ...state.hearted }
    if (was) delete hearted[img.key]; else hearted[img.key] = img.id ?? 'pending'
    set({ hearted, counts: { ...state.counts, [img.key]: Math.max(0, n + (was ? -1 : 1)) } })
    try {
      if (was) {
        const { error } = await supabase.from('hearts').delete().eq('user_id', me.id).eq('image_id', was)
        if (error) throw error
      } else {
        const id = await ensureSaved(img)
        const { error } = await supabase.from('hearts').insert({ user_id: me.id, image_id: id })
        if (error && error.code !== '23505') throw error // already hearted is fine
        if (state.hearted[img.key]) set({ hearted: { ...state.hearted, [img.key]: id } })
      }
    } catch (e) {
      console.error(e)
      set(before)
      toast('that heart did not save — check your connection and try again')
    }
  },
  async toggleFollow(profileId: string) {
    const me = requireMe()
    if (!me || !supabase) return
    const was = state.following.includes(profileId)
    const before = state.following
    set({ following: was ? before.filter((f) => f !== profileId) : [...before, profileId] })
    const q = was
      ? supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', profileId)
      : supabase.from('follows').insert({ follower_id: me.id, following_id: profileId })
    const { error } = await q
    if (error && error.code !== '23505') { set({ following: before }); toast('could not update follow — try again') }
  },
  async toggleTop(profileId: string) {
    const me = requireMe()
    if (!me || !supabase) return
    const before = state.top
    if (profileId in before) {
      const { [profileId]: _gone, ...rest } = before
      set({ top: rest })
      const { error } = await supabase.from('top_friends').delete().eq('user_id', me.id).eq('friend_id', profileId)
      if (error) { set({ top: before }); toast('could not update your top 8') }
      return
    }
    const taken = new Set(Object.values(before))
    const position = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !taken.has(n))
    if (!position) return toast('your top 8 is full — remove someone first')
    set({ top: { ...before, [profileId]: position } })
    const { error } = await supabase.from('top_friends').insert({ user_id: me.id, friend_id: profileId, position })
    if (error && error.code !== '23505') { set({ top: before }); toast('could not update your top 8') }
  },
  async signOut() { await supabase?.auth.signOut() },
}

export const fmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n))
