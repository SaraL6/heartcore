import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { AuthModal, FollowButton, Grid, HeartIcon, Media, PostModal, UploadModal, useDismiss, useLoad } from './components'
import { LEGAL_LINKS, LegalPage } from './legal'
import { MUSIC_REF, MusicPlayer } from './music'
import { AboutBox, Guestbook, TopButton, TopFriends, useAccent } from './profile'
import { flickrEnabled } from './flickr'
import { LIBRARIES, canChooseSource, searchImages, type Source } from './images'
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

const THEMES: { id: Theme; label: string; note: string }[] = [
  { id: 'pastel', label: 'pastel', note: 'light, airy, a little pink' },
  { id: 'darkroom', label: 'darkroom', note: 'moody, minimal, film grain' },
  { id: 'y2k', label: 'y2k chrome', note: 'glossy, icy, a bit extra' },
  { id: 'grunge', label: 'soft grunge', note: '2013 tumblr, after dark' },
  { id: 'galaxy', label: 'galaxy', note: 'nebula wallpaper glow' },
  { id: 'vintage', label: 'vintage', note: 'faded paper and film' },
  { id: 'dream', label: 'daydream', note: 'lilac haze' },
]
// Topics for everyone who curates, not just one kind of moodboard.
const VIBES = ['vintage', 'streetwear', 'sneakers', 'cars', 'architecture', 'interiors', 'film photography', 'tattoos',
  'skateboarding', 'vinyl', 'y2k', 'grunge', 'pastel', 'nature', 'travel', 'coffee', 'art', 'cats']
// The home feed opens on a different vibe each visit.
const HOME = ['aesthetic', 'vintage', 'film photography', 'architecture', 'streetwear', 'interiors', 'nature', 'cars']
const homeVibe = HOME[Math.floor(Math.random() * HOME.length)]
type Open = (img: Img) => void

export default function App() {
  const s = useStore()
  const route = useRoute()
  const [open, setOpen] = useState<Img | null>(null)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [source, setSourceState] = useState<Source>(() => {
    try { const v = localStorage.getItem('heartcore:source'); return v === 'new' || v === 'old' ? v : 'mix' } catch { return 'mix' }
  })
  const setSource = (v: Source) => { try { localStorage.setItem('heartcore:source', v) } catch { /* private mode */ } setSourceState(v) }

  useEffect(() => { initAuth() }, [])
  const shownTheme = s.visitTheme ?? s.theme
  useEffect(() => { document.documentElement.dataset.theme = shownTheme }, [shownTheme])
  useEffect(() => { setOpen(null) }, [route])

  const [, section, arg = '', sub = ''] = route.split('/')
  let page: React.ReactNode
  if (section === 'friends') page = <Friends tab={arg} onOpen={setOpen} />
  else if (section === 'u') page = <ProfilePage key={arg} username={arg} tab={sub} onOpen={setOpen} />
  else if (section === 'about') page = <LegalPage page={arg} />
  else if (section === 'admin') page = <AdminPage />
  else if (section === 'c') page = <CollectionPage key={arg} id={arg} onOpen={setOpen} />
  else page = <Discover key={`${section}/${arg}/${source}`} q={section === 'tag' || section === 'search' ? arg : ''} isTag={section === 'tag'} onOpen={setOpen} source={source} setSource={setSource} />

  const meHref = s.me ? `#/u/${s.me.username}` : undefined
  const current = section === 'friends' ? 'friends' : section === 'u' && arg === s.me?.username ? 'me' : ['u', 'c', 'about', 'admin'].includes(section) ? '' : 'discover'

  return (
    <>
      <header className="top">
        <a className="logo" href="#/"><span className="logo-mark"><HeartIcon filled /></span>heartcore</a>
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
        <button className="icon-btn music-btn" aria-pressed={s.musicOpen} aria-label="Music player" title="music"
          onClick={() => actions.setMusicOpen(!s.musicOpen)}>♫</button>
        <VibePicker shown={shownTheme} mine={s.theme} />
        <button className="primary" onClick={() => requireMe() && setUploading(true)}>+ post</button>
      </header>
      <main>{page}</main>
      <footer className="foot">
        made with ♥ for the tumblr kids · no ads, no tracking, ever · photos from{' '}
        {LIBRARIES.map((l, i) => <span key={l.name}>{i > 0 && ' and '}<a href={l.url} target="_blank" rel="noreferrer noopener">{l.name}</a></span>)}, shared by their creators
        {flickrEnabled && <><br />This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc.</>}
        <nav>
          {LEGAL_LINKS.map(([path, label]) => <a key={path} href={`#/about/${path}`}>{label}</a>)}
          <button className="link" aria-pressed={s.quiet} onClick={actions.toggleQuiet}>{s.quiet ? 'show heart counts' : 'hide heart counts'}</button>
          {s.isAdmin && <a href="#/admin">moderation</a>}
        </nav>
      </footer>
      {open && <PostModal img={open} onClose={() => setOpen(null)} />}
      {uploading && <UploadModal onClose={() => setUploading(false)} />}
      {s.authOpen && <AuthModal />}
      <MusicPlayer />
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

function Discover({ q, isTag, onOpen, source, setSource }: { q: string; isTag: boolean; onOpen: Open; source: Source; setSource: (s: Source) => void }) {
  const term = q || homeVibe
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
      const res = await searchImages(term, n, source)
      // Fill in hearts from people here before showing the batch.
      const known = await api.lookupExternal(res.items).catch(() => [])
      const ids = new Map(known.map((k) => [k.key, k.id]))
      const gone = new Set(known.filter((k) => k.removed).map((k) => k.key)) // taken down here
      res.items = res.items.filter((i) => !gone.has(i.key))
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
      setError((e as Error).message)
    }
    busy.current = false
    setLoading(false)
  }

  useEffect(() => { load(1) }, [])
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
        : (
          <section className="hero">
            <p className="kicker">no ads · no algorithm · no AI images</p>
            <h1>collect what <em>you love</em>.</h1>
            <p>Your own corner of the internet, like it's 2012 again. Heart it, save it to a board, share it with friends.</p>
          </section>
        )}
      {canChooseSource && (
        <div className="source" role="group" aria-label="Which photos">
          {([['mix', 'everything'], ['new', 'new photos'], ['old', 'old photos · Flickr']] as const).map(([v, label]) => (
            <button key={v} aria-pressed={source === v} onClick={() => setSource(v)}>{label}</button>
          ))}
        </div>
      )}
      <nav className="chips" aria-label="Topics">
        {!q && <span className="chip-label">today's vibe: <b>#{homeVibe}</b></span>}
        {VIBES.map((t) => <a key={t} href={`#/tag/${encodeURIComponent(t)}`} className={q === t ? 'on' : ''}>#{t}</a>)}
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
  const head = useLoad(() => api.getProfile(username), [username, iFollow, rev])
  const p = head.data?.profile
  // Dress the page in its owner's theme while you're visiting (your own choice wins on your own page).
  const theirTheme = p && me?.id !== p.id ? p.theme ?? null : null
  useEffect(() => { actions.setVisitTheme(theirTheme); return () => actions.setVisitTheme(null) }, [theirTheme])
  const [exporting, setExporting] = useState(false)
  const mine = !!p && me?.id === p.id
  const [patch, setPatch] = useState<Partial<Profile>>({})
  useEffect(() => { setPatch({}) }, [p?.id])
  useAccent('accent' in patch ? patch.accent : p?.accent)
  const [bio, setBio] = useState('')
  useEffect(() => { if (p) setBio(p.bio) }, [p?.id])

  if (!supabase) return <NeedAccounts what="" />
  if (!head.data) return head.loading || head.error ? <Status loading={head.loading} error={head.error} /> : <p className="empty">there's nobody called “{username}” here.</p>
  const { followers, following: followingCount } = head.data
  const profile = { ...head.data.profile, ...patch }

  const saveBio = async () => {
    if (bio === profile.bio) return
    try { await api.updateBio(profile.id, bio); profile.bio = bio; actions.setMe({ ...me!, bio }) } catch (e) { console.error(e); toast('could not save your bio') }
  }

  const download = async () => {
    setExporting(true)
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(await api.exportEverything(profile))
      a.download = `heartcore-${profile.username}.html`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch (e) { console.error(e); toast('could not build your download — try again') }
    setExporting(false)
  }
  const eraseAccount = async () => {
    if (prompt('This permanently erases your profile, posts, hearts, collections and follows.\nType your username to confirm:') !== profile.username) return
    try { await api.deleteAccount(profile.id); location.hash = '#/'; toast('your account has been deleted') } catch (e) { console.error(e); toast('could not delete your account — try again') }
  }

  return (
    <>
      <header className={`profile${profile.cover_url ? ' has-cover' : ''}`}>
        {profile.cover_url && <div className="cover" style={{ backgroundImage: `url("${encodeURI(profile.cover_url)}")` }} />}
        <span className="avatar xl">{profile.username[0]}</span>
        <h1>{profile.username}</h1>
        {mine
          ? <input className="bio-input" value={bio} placeholder="write a little bio…" aria-label="Your bio" maxLength={160}
              onChange={(e) => setBio(e.target.value)} onBlur={saveBio} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : profile.bio && <p className="bio">{profile.bio}</p>}
        <p className="stats"><span><b>{followers}</b> followers</span><span><b>{followingCount}</b> following</span></p>
        {profile.music && MUSIC_REF.test(profile.music) && (
          <button className="follow" onClick={() => actions.setMusic(profile.music!)}>♫ play {mine ? 'my' : `${profile.username}'s`} music</button>
        )}
        {mine && !profile.cover_url && <p className="muted small">tip: open any image and choose “use as my profile cover” · your theme is what visitors see</p>}
        {mine ? (
          <p className="account-links">
            <button className="danger" onClick={() => { actions.signOut(); location.hash = '#/' }}>sign out</button>
            <button className="danger" onClick={download} disabled={exporting}>{exporting ? 'packing…' : 'download everything'}</button>
            {profile.cover_url && <button className="danger" onClick={async () => { try { await api.setCover(profile.id, null); actions.setMe({ ...me!, cover_url: null }); actions.refresh() } catch (e) { console.error(e); toast('could not remove your cover') } }}>remove cover</button>}
            <button className="danger" onClick={eraseAccount}>delete my account</button>
          </p>
        ) : <p className="account-links"><FollowButton profileId={profile.id} /><TopButton profileId={profile.id} /></p>}
      </header>
      <div className="panels">
        <AboutBox key={profile.id} profile={profile} mine={mine} onChange={(change) => setPatch((old) => ({ ...old, ...change }))} />
        <TopFriends profile={profile} mine={mine} />
      </div>
      <Tabs base={`#/u/${profile.username}`} tabs={[['', 'hearts'], ['posts', 'posts'], ['collections', 'collections'], ['guestbook', 'guestbook']]} current={tab} />
      {tab === 'guestbook' ? <Guestbook profile={profile} mine={mine} />
        : tab === 'collections' ? <CollectionList key={rev} profile={profile} mine={mine} />
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

// ---------- moderation (admins only) ----------

function AdminPage() {
  const { isAdmin, ready } = useStore()
  const [n, setN] = useState(0)
  const { data, loading, error } = useLoad(() => (isAdmin ? api.openReports() : Promise.resolve([])), [isAdmin, n])
  if (!ready) return <Status loading />
  if (!isAdmin) return <p className="empty">this page is for the site's moderators.</p>
  const resolve = async (r: api.Report, remove: boolean) => {
    if (remove && !confirm('Take this image down for everyone?')) return
    try { await api.resolveReport(r, remove); setN(n + 1) } catch (e) { console.error(e); toast('that did not work — try again') }
  }
  const label = (reason: string) => api.REASONS.find(([v]) => v === reason)?.[1] ?? reason
  return (
    <>
      <PageTitle title="reports" sub={data ? `${data.length} open` : undefined} />
      {!data ? <Status loading={loading} error={error} /> : !data.length ? <p className="empty">nothing to review ♡</p> : (
        <ul className="reports">
          {data.map((r) => (
            <li key={r.id}>
              {r.url
                ? <a href={r.url} target="_blank" rel="noreferrer noopener"><img src={r.url} alt="reported" loading="lazy" /></a>
                : <blockquote>{r.excerpt}</blockquote>}
              <div>
                <strong>{label(r.reason)}</strong>
                {r.details && <p>{r.details}</p>}
                <small>{new Date(r.created_at).toLocaleString()}{r.contact && <> · <a className="underline" href={`mailto:${r.contact}`}>{r.contact}</a></>}</small>
                <div className="inline-form">
                  <button className="primary" onClick={() => resolve(r, true)}>take it down</button>
                  <button onClick={() => resolve(r, false)}>dismiss</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ---------- vibe (theme) picker ----------

function VibePicker({ shown, mine }: { shown: Theme; mine: Theme }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  const visiting = shown !== mine
  return (
    <div className="vibe" ref={ref}>
      <button className="icon-btn vibe-btn" aria-expanded={open} aria-label="Change your vibe" title="vibe" onClick={() => setOpen(!open)}>
        <span className={`swatch ${mine}`} />
      </button>
      {open && (
        <div className="vibe-pop" role="dialog" aria-label="Vibes">
          <p className="pop-title">pick your vibe{visiting && <small>you're seeing this page in its owner's vibe</small>}</p>
          {THEMES.map((t) => (
            <button key={t.id} aria-pressed={mine === t.id} onClick={() => { actions.setTheme(t.id); setOpen(false) }}>
              <span className={`swatch ${t.id}`} />
              <span><b>{t.label}</b><small>{t.note}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
