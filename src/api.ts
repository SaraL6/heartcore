import { SELECT_IMG, ensureSaved, supabase, toImg, type Collection, type Img, type Profile } from './store'

/* eslint-disable @typescript-eslint/no-explicit-any */
// All database reads and writes that aren't part of the signed-in session state.

function ok<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}
const db = () => {
  if (!supabase) throw new Error('accounts are not set up yet')
  return supabase
}
const dedupe = (imgs: Img[]) => [...new Map(imgs.map((i) => [i.key, i])).values()]

/** For library search results: find the ones people here have already hearted. */
export async function lookupExternal(items: Img[]) {
  const ids = items.filter((i) => !i.id && i.providerId).map((i) => i.providerId!)
  if (!supabase || !ids.length) return []
  const { data } = await supabase.from('images').select('id, provider_id, heart_count')
    .eq('provider', items[0].provider).in('provider_id', ids)
  return (data ?? []).map((r: any) => ({ key: `${items[0].provider}:${r.provider_id}`, id: r.id as string, heartCount: r.heart_count as number }))
}

export async function friendsFeed(following: string[]): Promise<Img[]> {
  if (!following.length) return []
  const rows = ok(await db().from('hearts')
    .select(`created_at, who:profiles(username), image:images(${SELECT_IMG})`)
    .in('user_id', following).order('created_at', { ascending: false }).limit(90)) as any[]
  const seen = new Set<string>()
  return rows.filter((r) => r.image && !seen.has(r.image.id) && seen.add(r.image.id)).map((r) => toImg(r.image, r.who?.username))
}

export async function everyoneFeed(): Promise<Img[]> {
  return (ok(await db().from('images').select(SELECT_IMG).order('created_at', { ascending: false }).limit(90)) as any[]).map((r) => toImg(r))
}

export async function findPeople(search: string): Promise<Profile[]> {
  let q = db().from('profiles').select('id, username, bio').order('created_at', { ascending: false }).limit(40)
  const clean = search.toLowerCase().replace(/[^a-z0-9_.]/g, '')
  if (clean) q = q.ilike('username', `%${clean.replace(/_/g, '\\_')}%`)
  return ok(await q) as Profile[]
}

export async function getProfile(username: string) {
  const profile = ok(await db().from('profiles').select('id, username, bio').eq('username', username).maybeSingle()) as Profile | null
  if (!profile) return null
  const [followers, following] = await Promise.all([
    db().from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    db().from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ])
  return { profile, followers: followers.count ?? 0, following: following.count ?? 0 }
}

export async function profileHearts(id: string): Promise<Img[]> {
  const rows = ok(await db().from('hearts').select(`image:images(${SELECT_IMG})`)
    .eq('user_id', id).order('created_at', { ascending: false }).limit(150)) as any[]
  return rows.filter((r) => r.image).map((r) => toImg(r.image))
}

export async function profilePosts(id: string): Promise<Img[]> {
  return (ok(await db().from('images').select(SELECT_IMG).eq('uploader_id', id)
    .order('created_at', { ascending: false }).limit(150)) as any[]).map((r) => toImg(r))
}

const SELECT_COLLECTION = `id, name, user_id, owner:profiles(username), items:collection_images(created_at, image:images(${SELECT_IMG}))`
const toCollection = (r: any): Collection & { owner?: string } => ({
  id: r.id, name: r.name, userId: r.user_id, owner: r.owner?.username,
  images: dedupe((r.items ?? [])
    .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
    .filter((i: any) => i.image).map((i: any) => toImg(i.image))),
})

export async function profileCollections(id: string) {
  return (ok(await db().from('collections').select(SELECT_COLLECTION).eq('user_id', id).order('created_at')) as any[]).map(toCollection)
}
export async function getCollection(id: string) {
  const row = ok(await db().from('collections').select(SELECT_COLLECTION).eq('id', id).maybeSingle())
  return row ? toCollection(row) : null
}

/** Your collections, each with whether it already holds this picture. */
export async function myCollectionsFor(userId: string, img: Img) {
  if (!img.id && img.providerId) {
    const found = ok(await db().from('images').select('id').eq('provider', img.provider).eq('provider_id', img.providerId).maybeSingle()) as any
    if (found) img.id = found.id
  }
  const rows = ok(await db().from('collections').select('id, name, items:collection_images(image_id)')
    .eq('user_id', userId).order('created_at')) as any[]
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, has: !!img.id && r.items.some((i: any) => i.image_id === img.id) }))
}

export async function createCollection(userId: string, name: string): Promise<string> {
  return (ok(await db().from('collections').insert({ user_id: userId, name }).select('id').single()) as any).id
}
export async function renameCollection(id: string, name: string) { ok(await db().from('collections').update({ name }).eq('id', id)) }
export async function deleteCollection(id: string) { ok(await db().from('collections').delete().eq('id', id)) }

export async function setInCollection(collectionId: string, img: Img, on: boolean) {
  const image_id = await ensureSaved(img)
  if (on) {
    const { error } = await db().from('collection_images').insert({ collection_id: collectionId, image_id })
    if (error && error.code !== '23505') throw error
  } else {
    ok(await db().from('collection_images').delete().eq('collection_id', collectionId).eq('image_id', image_id))
  }
}

export async function updateBio(id: string, bio: string) { ok(await db().from('profiles').update({ bio }).eq('id', id)) }

const BUCKET = 'images'
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }

export async function createPost(userId: string, input: {
  file?: Blob; src?: string; width?: number; height?: number; caption: string; tags: string[]
}) {
  let url = input.src
  if (input.file) {
    const path = `${userId}/${crypto.randomUUID()}.${EXT[input.file.type] ?? 'jpg'}`
    ok(await db().storage.from(BUCKET).upload(path, input.file, { contentType: input.file.type, cacheControl: '31536000' }))
    url = db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }
  const row = ok(await db().from('images').insert({
    url, width: input.width ?? null, height: input.height ?? null,
    caption: input.caption, tags: input.tags, uploader_id: userId, provider: 'upload',
  }).select('id').single()) as any
  // Posting something counts as hearting it, so it shows up for your followers.
  await db().from('hearts').insert({ user_id: userId, image_id: row.id })
  return row.id as string
}

export async function deletePost(img: Img) {
  ok(await db().from('images').delete().eq('id', img.id!))
  const marker = `/object/public/${BUCKET}/`
  const at = img.url.indexOf(marker)
  if (at >= 0) await db().storage.from(BUCKET).remove([decodeURIComponent(img.url.slice(at + marker.length))])
}

export async function signUp(email: string, password: string, username: string) {
  const taken = ok(await db().from('profiles').select('id').eq('username', username).maybeSingle())
  if (taken) throw new Error('that username is taken — try another')
  const { data, error } = await db().auth.signUp({ email, password, options: { data: { username } } })
  if (error) throw error
  return { needsEmailConfirm: !data.session }
}
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password })
  if (error) throw error
}
