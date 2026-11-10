import { useEffect, useRef, useState } from 'react'
import * as api from './api'
import { AuthModal, FollowButton, Grid, HeartIcon, Media, PostModal, UploadModal, useLoad } from './components'
import { searchImages } from './openverse'
import { actions, initAuth, requireMe, supabase, toast, useStore, type Collection, type Img, type Profile, type Theme } from './store'

function useRoute() {
  const read = () => decodeURIComponent(location.hash.slice(1) || '/')
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0) }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'pastel', label: 'pastel' },
  { id: 'grunge', label: 'soft grunge' },
  { id: 'galaxy', label: 'galaxy' },
]
const POPULAR = ['vintage', 'grunge', 'pastel', 'polaroid', 'flowers', 'ocean', 'sunset', 'paris', 'coffee', 'cats', 'fashion', 'film', 'stars', 'summer']
type Open = (img: Img) => void

export default function App() {
  const s = useStore()
  const route = useRoute()
  const [open, setOpen] = useState<Img | null>(null)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => { initAuth() }, [])
  useEffect(() => { document.documentElement.dataset.theme = s.theme }, [s.theme])
  useEffect(() => { setOpen(null) }, [route])

  const [, section, arg = '', sub = ''] = route.split('/')
  let page: React.ReactNode
  if (section === 'friends') page = <Friends tab={arg} onOpen={setOpen} />
  else if (section === 'u') page = <ProfilePage key={arg} username={arg} tab={sub} onOpen={setOpen} />
  else if (section === 'c') page = <CollectionPage key={arg} id={arg} onOpen={setOpen} />
  else page = <Discover key={`${section}/${arg}`} q={section === 'tag' || section === 'search' ? arg : ''} isTag={section === 'tag'} onOpen={setOpen} />

  const meHref = s.me ? `#/u/${s.me.username}` : undefined
  const current = section === 'friends' ? 'friends' : section === 'u' && arg === s.me?.username ? 'me' : section === 'u' || section === 'c' ? '' : 'discover'

  return (
    <>
      <header className="top">
        <a className="logo" href="#/"><HeartIcon filled /> heartcore</a>
        <form className="search" role="search" onSubmit={(e) => {
          e.preventDefault()
          location.hash = query.trim() ? `#/search/${encodeURIComponent(query.trim())}` : '#/'
        }}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search for anything…" aria-label="Search images" />
        </form>
        <nav className="main-nav">
          <a href="#/" aria-current={current === 'discover' ? 'page' : undefined}>discover</a>
          <a href="#/friends" aria-current={current === 'friends' ? 'page' : undefined}>friends</a>
          {s.me
            ? <a href={meHref} aria-current={current === 'me' ? 'page' : undefined}>me</a>
            : <button className="link" onClick={() => actions.openAuth(true)}>sign in</button>}
        </nav>
        <div className="themes" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} className={`swatch ${t.id}`} title={t.label} aria-label={`${t.label} theme`}
              aria-pressed={s.theme === t.id} onClick={() => actions.setTheme(t.id)} />
          ))}
        </div>
        <button className="primary" onClick={() => requireMe() && setUploading(true)}>+ post</button>
      </header>
      <main>{page}</main>
      <footer className="foot">
        made with ♥ for the tumblr kids · photos from <a href="https://openverse.org" target="_blank" rel="noreferrer noopener">Openverse</a>, shared by their creators under Creative Commons licenses
      </footer>
      {open && <PostModal img={open} onClose={() => setOpen(null)} />}
      {uploading && <UploadModal onClose={() => setUploading(false)} />}
      {s.authOpen && <AuthModal />}
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
    </>
  )
}

function PageTitle({ title, sub, children }: { title: React.ReactNode; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      {sub && <span>{sub}</span>}
      {children}
    </div>
  )
}

function Status({ loading, error }: { loading: boolean; error?: string }) {
  if (error) return <p className="empty" role="alert">{error}</p>
  if (loading) return <p className="empty">loading…</p>
  return null
}

function Tabs({ base, tabs, current }: { base: string; tabs: [string, string][]; current: string }) {
  return (
    <nav className="tabs">
      {tabs.map(([path, label]) => (
        <a key={label} href={`${base}${path && '/' + path}`} aria-current={current === path ? 'page' : undefined}>{label}</a>
      ))}
    </nav>
  )
}

// ---------- discover: browse the outside image library ----------

function Discover({ q, isTag, onOpen }: { q: string; isTag: boolean; onOpen: Open }) {
  const term = q || 'vintage'
  const [items, setItems] = useState<Img[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const load = async (n: number) => {
    if (busy.current) return
    busy.current = true
    setLoading(true); setError('')
    try {
      const res = await searchImages(term, n)
      // Fill in hearts from people here before showing the batch.
      const known = await api.lookupExternal(res.items).catch(() => [])
      const ids = new Map(known.map((k) => [k.key, k.id]))
      res.items.forEach((i) => { i.id = ids.get(i.key) })
      actions.noteCounts(known)
      setItems((old) => {
        const seen = new Set(old.map((i) => i.key))
        return [...old, ...res.items.filter((i) => !seen.has(i.key))]
      })
      setPage(n); setMore(res.hasMore && res.items.length > 0)
    } catch (e) {
      console.error(e)
      setMore(false)
      setError(e instanceof TypeError ? "couldn't reach the image library — check your connection" : (e as Error).message)
    }
    busy.current = false
    setLoading(false)
  }

  useEffect(() => { load(1) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more || loading) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && load(page + 1), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  })

  return (
    <>
      {q
        ? <PageTitle title={isTag ? `#${q}` : `“${q}”`}><a href="#/">← back to discover</a></PageTitle>
        : <p className="hello">collect the things you love <HeartIcon filled /> like it's 2012 again</p>}
      <nav className="chips" aria-label="Popular tags">
        {POPULAR.map((t) => <a key={t} href={`#/tag/${t}`} className={q === t ? 'on' : ''}>#{t}</a>)}
      </nav>
      {(items.length > 0 || (!loading && !error)) && <Grid images={items} onOpen={onOpen} empty="nothing found for that — try another word?" />}
      {error && (
        <p className="empty" role="alert">{error}<br /><button onClick={() => load(items.length ? page + 1 : 1)}>try again</button></p>
      )}
      {loading && <p className="empty">loading pretty things…</p>}
      <div ref={sentinel} />
    </>
  )
}

// ---------- friends ----------

function NeedAccounts({ what }: { what: string }) {
  return (
    <p className="empty">
      {supabase ? <>sign in to {what}.<br /><button className="primary" onClick={() => actions.openAuth(true)}>sign in or join</button></>
        : <>accounts aren't switched on for this copy of heartcore yet, so there's nobody to follow.</>}
    </p>
  )
}

function Friends({ tab, onOpen }: { tab: string; onOpen: Open }) {
  const { me, following, ready, rev } = useStore()
  const tabs: [string, string][] = [['', 'following'], ['everyone', 'everyone'], ['people', 'find people']]
  return (
    <>
      <PageTitle title="friends" />
      <Tabs base="#/friends" tabs={tabs} current={tab} />
      {!supabase ? <NeedAccounts what="" />
        : tab === 'people' ? <People />
        : tab === 'everyone' ? <Feed key={`all${rev}`} load={api.everyoneFeed} onOpen={onOpen} empty="nobody has hearted anything yet. be the first ♡" />
        : !ready ? <Status loading />
        : !me ? <NeedAccounts what="see what your friends are hearting" />
        : !following.length ? <p className="empty">you're not following anyone yet.<br /><a className="underline" href="#/friends/people">find people to follow →</a></p>
        : <Feed key={following.length} load={() => api.friendsFeed(following)} onOpen={onOpen} empty="your friends haven't hearted anything yet." />}
    </>
  )
}

function Feed({ load, onOpen, empty }: { load: () => Promise<Img[]>; onOpen: Open; empty: string }) {
  const { data, loading, error } = useLoad(load, [])
  return data ? <Grid images={data} onOpen={onOpen} empty={empty} /> : <Status loading={loading} error={error} />
}

function People() {
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = setTimeout(() => setTerm(search), 250); return () => clearTimeout(t) }, [search])
  const { me } = useStore()
  const found = useLoad(() => api.findPeople(term), [term])
  const { loading, error } = found
  const data = found.data?.filter((p) => p.id !== me?.id)
  return (
    <>
      <input className="people-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search usernames…" aria-label="Search usernames" />
      {!data ? <Status loading={loading} error={error} /> : !data.length ? <p className="empty">nobody by that name.</p> : (
        <ul className="people">
          {data.map((p) => <PersonRow key={p.id} p={p} />)}
        </ul>
      )}
    </>
  )
}

function PersonRow({ p }: { p: Profile }) {
  return (
    <li>
      <a className="avatar" href={`#/u/${p.username}`}>{p.username[0]}</a>
      <a className="who" href={`#/u/${p.username}`}><strong>{p.username}</strong><small>{p.bio}</small></a>
      <FollowButton profileId={p.id} />
    </li>
  )
}

// ---------- profiles and collections ----------

function ProfilePage({ username, tab, onOpen }: { username: string; tab: string; onOpen: Open }) {
  const { me, following, rev } = useStore()
  const iFollow = following.length
  const head = useLoad(() => api.getProfile(username), [username, iFollow])
  const p = head.data?.profile
  const mine = !!p && me?.id === p.id
  const [bio, setBio] = useState('')
  useEffect(() => { if (p) setBio(p.bio) }, [p?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!supabase) return <NeedAccounts what="" />
  if (!head.data) return head.loading || head.error ? <Status loading={head.loading} error={head.error} /> : <p className="empty">there's nobody called “{username}” here.</p>
  const { profile, followers, following: followingCount } = head.data

  const saveBio = async () => {
    if (bio === profile.bio) return
    try { await api.updateBio(profile.id, bio); profile.bio = bio; actions.setMe({ ...me!, bio }) } catch (e) { console.error(e); toast('could not save your bio') }
  }

  return (
    <>
      <header className="profile">
        <span className="avatar xl">{profile.username[0]}</span>
        <h1>{profile.username}</h1>
        {mine
          ? <input className="bio-input" value={bio} placeholder="write a little bio…" aria-label="Your bio" maxLength={160}
              onChange={(e) => setBio(e.target.value)} onBlur={saveBio} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : profile.bio && <p className="bio">{profile.bio}</p>}
        <p className="stats"><span><b>{followers}</b> followers</span><span><b>{followingCount}</b> following</span></p>
        {mine ? <button className="danger" onClick={() => { actions.signOut(); location.hash = '#/' }}>sign out</button> : <FollowButton profileId={profile.id} />}
      </header>
      <Tabs base={`#/u/${profile.username}`} tabs={[['', 'hearts'], ['posts', 'posts'], ['collections', 'collections']]} current={tab} />
      {tab === 'collections' ? <CollectionList key={rev} profile={profile} mine={mine} />
        : tab === 'posts' ? <Feed key={`p${rev}`} load={() => api.profilePosts(profile.id)} onOpen={onOpen} empty={mine ? 'you haven’t posted anything yet. hit “+ post”.' : 'no posts yet.'} />
        : <Feed key={`h${rev}`} load={() => api.profileHearts(profile.id)} onOpen={onOpen} empty={mine ? 'nothing hearted yet — go fall in love with something ♡' : 'no hearts yet.'} />}
    </>
  )
}

function CollectionList({ profile, mine }: { profile: Profile; mine: boolean }) {
  const [name, setName] = useState('')
  const [n, setN] = useState(0)
  const { data, loading, error } = useLoad(() => api.profileCollections(profile.id), [profile.id, n])
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try { await api.createCollection(profile.id, name.trim()); setName(''); setN(n + 1) } catch (err) { console.error(err); toast('could not create that collection') }
  }
  return (
    <>
      {mine && (
        <form className="inline-form narrow" onSubmit={create}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new collection…" aria-label="New collection name" maxLength={40} />
          <button type="submit">create</button>
        </form>
      )}
      {!data ? <Status loading={loading} error={error} /> : !data.length ? <p className="empty">no collections yet.</p> : (
        <div className="coll-grid">
          {data.map((c: Collection) => (
            <a key={c.id} className="coll-card" href={`#/c/${c.id}`}>
              <div className="mosaic">{[0, 1, 2].map((i) => <div key={i}>{c.images[i] && <Media img={c.images[i]} />}</div>)}</div>
              <strong>{c.name}</strong>
              <small>{c.images.length} saved</small>
            </a>
          ))}
        </div>
      )}
    </>
  )
}

function CollectionPage({ id, onOpen }: { id: string; onOpen: Open }) {
  const { me } = useStore()
  const { data: c, loading, error } = useLoad(() => api.getCollection(id), [id])
  const [name, setName] = useState('')
  useEffect(() => { if (c) setName(c.name) }, [c])
  if (!supabase) return <NeedAccounts what="" />
  if (!c) return loading || error ? <Status loading={loading} error={error} /> : <p className="empty">that collection doesn't exist anymore.</p>
  const mine = me?.id === c.userId
  const rename = async () => {
    const n = name.trim()
    if (!n) return setName(c.name)
    if (n !== c.name) try { await api.renameCollection(c.id, n); c.name = n } catch (e) { console.error(e); toast('could not rename that collection') }
  }
  const remove = async () => {
    if (!confirm(`Delete "${c.name}"? The images stay, only the collection goes.`)) return
    try { await api.deleteCollection(c.id); location.hash = `#/u/${c.owner}/collections` } catch (e) { console.error(e); toast('could not delete that collection') }
  }
  return (
    <>
      <PageTitle
        title={mine
          ? <input className="title-input" value={name} aria-label="Collection name" maxLength={40}
              onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : c.name}
        sub={`${c.images.length} saved`}
      >
        <span>by <a className="underline" href={`#/u/${c.owner}/collections`}>{c.owner}</a>{mine && <> · <button className="danger" onClick={remove}>delete collection</button></>}</span>
      </PageTitle>
      <Grid images={c.images} onOpen={onOpen} empty="empty for now — open any image and save it here." />
    </>
  )
}
