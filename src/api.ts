import { PROFILE_COLS, SELECT_IMG, ensureSaved, supabase, toImg, type Collection, type Img, type Profile } from './store'

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

/** For library search results: hearts from people here, and anything taken down here. */
export async function lookupExternal(items: Img[]) {
  const ids = items.filter((i) => i.providerId).map((i) => i.providerId!)
  if (!supabase || !ids.length) return []
  const { data } = await supabase.rpc('external_status', { p_provider: items[0].provider, p_ids: ids })
  return ((data ?? []) as any[]).map((r) => ({
    key: `${items[0].provider}:${r.provider_id}`, id: r.id as string, heartCount: r.heart_count as number, removed: !!r.removed,
  }))
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
  const profile = ok(await db().from('profiles').select(PROFILE_COLS).eq('username', username).maybeSingle()) as Profile | null
  if (!profile) return null
  const [followers, following] = await Promise.all([
    db().from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    db().from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ])
  return { profile, followers: followers.count ?? 0, following: following.count ?? 0 }
}

export async function profileHearts(id: string, from = 0, count = 150): Promise<Img[]> {
  const rows = ok(await db().from('hearts').select(`image:images(${SELECT_IMG})`)
    .eq('user_id', id).order('created_at', { ascending: false }).range(from, from + count - 1)) as any[]
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
export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'bio' | 'mood' | 'accent' | 'cover_url'>>) {
  ok(await db().from('profiles').update(patch).eq('id', id))
}

// ---------- profile extras ----------

export type Friend = { id: string; username: string; cover_url: string | null }
export async function topFriends(profileId: string): Promise<Friend[]> {
  const rows = ok(await db().from('top_friends')
    .select('position, friend:profiles!top_friends_friend_id_fkey(id, username, cover_url)')
    .eq('user_id', profileId).order('position')) as any[]
  return rows.map((r) => r.friend).filter(Boolean)
}

export type Entry = { id: string; body: string; created_at: string; author: { id: string; username: string } }
export async function guestbook(profileId: string): Promise<Entry[]> {
  const rows = ok(await db().from('guestbook')
    .select('id, body, created_at, author:profiles!guestbook_author_id_fkey(id, username)')
    .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(60)) as any[]
  return rows.filter((r) => r.author)
}
export async function signGuestbook(profileId: string, authorId: string, body: string) {
  ok(await db().from('guestbook').insert({ profile_id: profileId, author_id: authorId, body }))
}
export async function deleteEntry(id: string) { ok(await db().from('guestbook').delete().eq('id', id)) }

export async function bumpViews(profileId: string): Promise<number | null> {
  return ok(await db().rpc('bump_profile_views', { p_profile: profileId })) as number | null
}

/** Usernames of the latest people to heart an image. */
export async function notes(imageId: string): Promise<string[]> {
  const rows = ok(await db().from('hearts').select('who:profiles(username)')
    .eq('image_id', imageId).order('created_at', { ascending: false }).limit(6)) as any[]
  return rows.map((r) => r.who?.username).filter(Boolean)
}
export async function setCover(id: string, url: string | null) { ok(await db().from('profiles').update({ cover_url: url }).eq('id', id)) }

// ---------- take your things with you ----------

export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
export const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? esc(u) : '#')

/** Everything you've hearted, posted and collected, as one web page you can keep. */
export async function exportEverything(me: Profile): Promise<Blob> {
  const hearts: Img[] = []
  for (let from = 0; ; from += 500) {
    const page = await profileHearts(me.id, from, 500)
    hearts.push(...page)
    if (page.length < 500) break
  }
  const [posts, collections] = await Promise.all([profilePosts(me.id), profileCollections(me.id)])
  const slim = (i: Img) => ({ url: i.url, caption: i.caption, tags: i.tags, credit: i.credit, source: i.sourceUrl, license: i.license })
  const data = {
    exported_at: new Date().toISOString(), username: me.username, bio: me.bio,
    hearts: hearts.map(slim), posts: posts.map(slim),
    collections: collections.map((c) => ({ name: c.name, images: c.images.map(slim) })),
  }
  const grid = (imgs: Img[]) => `<div class="g">${imgs.map((i) => `<figure><a href="${safeUrl(i.sourceUrl ?? i.url)}"><img loading="lazy" src="${safeUrl(i.url)}" alt="${esc(i.caption)}"></a>${i.credit ? `<figcaption>by ${esc(i.credit)}${i.license ? ' · ' + esc(i.license) : ''}</figcaption>` : ''}</figure>`).join('')}</div>`
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(me.username)} ♥ heartcore</title>
<style>body{margin:0;padding:24px;background:#fdf6f4;color:#3a3238;font:15px/1.5 Helvetica,Arial,sans-serif}h1,h2{font:italic 28px Georgia,serif}h2{font-size:22px;margin-top:40px}.g{columns:5 200px;column-gap:12px}figure{break-inside:avoid;margin:0 0 12px;background:#fff;border:1px solid #f0dfe2}img{display:block;width:100%}figcaption{padding:6px 8px;font-size:12px;color:#9a8c94}</style>
<h1>${esc(me.username)} ♥</h1><p>${esc(me.bio)}</p><p>Saved from heartcore on ${new Date().toDateString()}. The same list is inside this file as data, for importing elsewhere.</p>
<h2>hearts (${hearts.length})</h2>${grid(hearts)}
${posts.length ? `<h2>posts (${posts.length})</h2>${grid(posts)}` : ''}
${collections.map((c) => `<h2>${esc(c.name)} (${c.images.length})</h2>${grid(c.images)}`).join('')}
<script type="application/json" id="heartcore-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script></html>`
  return new Blob([html], { type: 'text/html' })
}

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
  const { data, error } = await db().auth.signUp({
    email, password, options: { data: { username, accepted_terms_at: new Date().toISOString() } },
  })
  if (error) throw error
  return { needsEmailConfirm: !data.session }
}
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password })
  if (error) throw error
}

// ---------- reports and moderation ----------

export const REASONS: [string, string][] = [
  ['copyright', "it's mine and was posted without permission"],
  ['nudity', 'nudity or sexual content'],
  ['minor', 'it sexualises or endangers a child'],
  ['harassment', 'harassment, hate or a private person'],
  ['violence', 'violence or self-harm'],
  ['ai', "it's AI-generated"],
  ['spam', 'spam or scam'],
  ['other', 'something else'],
]

export async function fileReport(img: Img, reason: string, details: string, contact: string, reporterId?: string) {
  ok(await db().from('reports').insert({
    image_id: img.id ?? null, provider: img.provider, provider_id: img.providerId ?? null, url: img.url,
    reason, details, contact: contact || null, reporter_id: reporterId ?? null,
  }))
}

export type Report = { id: string; url: string; reason: string; details: string; contact: string | null; created_at: string; provider: string | null }
export async function openReports(): Promise<Report[]> {
  return ok(await db().from('reports').select('id, url, reason, details, contact, created_at, provider')
    .eq('status', 'open').order('created_at').limit(100)) as Report[]
}
export async function resolveReport(r: Report, remove: boolean) {
  ok(await db().rpc('admin_resolve_report', { p_report: r.id, p_remove: remove }))
  const marker = `/object/public/${BUCKET}/`
  const at = r.url.indexOf(marker)
  if (remove && at >= 0) await db().storage.from(BUCKET).remove([decodeURIComponent(r.url.slice(at + marker.length))])
}

export async function deleteAccount(userId: string) {
  // Remove the uploaded files first; the database function erases everything else.
  const { data } = await db().storage.from(BUCKET).list(userId, { limit: 1000 })
  if (data?.length) await db().storage.from(BUCKET).remove(data.map((f) => `${userId}/${f.name}`))
  ok(await db().rpc('delete_my_account'))
  await db().auth.signOut()
}
