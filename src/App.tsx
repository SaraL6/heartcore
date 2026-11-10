import { useEffect, useMemo, useState } from 'react'
import { Grid, HeartIcon, Media, PostModal, UploadModal } from './components'
import { actions, allPosts, loadBlobs, useStore, type Post, type Theme } from './store'

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
const POPULAR = ['quotes', 'galaxy', 'sunset', 'moon', 'polaroid', 'pastel', 'vintage', 'summer', 'grunge']

export default function App() {
  const s = useStore()
  const route = useRoute()
  const [openId, setOpenId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => { loadBlobs() }, [])
  useEffect(() => { document.documentElement.dataset.theme = s.profile.theme }, [s.profile.theme])

  const posts = useMemo(() => allPosts(s), [s.posts])
  const byId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts])
  const resolve = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is Post => !!p)
  const open = (p: Post) => setOpenId(p.id)
  const openPost = openId ? byId.get(openId) : undefined

  const [, section, arg = ''] = route.split('/')
  let page: React.ReactNode

  if (section === 'hearts') {
    page = (
      <>
        <PageTitle title="your hearts" sub={`${s.hearts.length} hearted`} />
        <Grid posts={resolve(s.hearts)} onOpen={open} empty="nothing hearted yet — go fall in love with something ♡" />
      </>
    )
  } else if (section === 'collections') {
    page = <Collections resolve={resolve} />
  } else if (section === 'c') {
    const c = s.collections.find((x) => x.id === arg)
    page = !c ? <p className="empty">that collection doesn't exist anymore.</p> : (
      <>
        <PageTitle
          title={<input className="title-input" value={c.name} aria-label="Collection name" maxLength={40}
            onChange={(e) => actions.renameCollection(c.id, e.target.value)} />}
          sub={`${c.postIds.length} saved`}
        >
          <button className="danger" onClick={() => {
            if (confirm(`Delete "${c.name}"? The images stay, only the collection goes.`)) { actions.deleteCollection(c.id); location.hash = '#/collections' }
          }}>delete collection</button>
        </PageTitle>
        <Grid posts={resolve(c.postIds)} onOpen={open} empty="empty for now — open any image and save it here." />
      </>
    )
  } else if (section === 'me') {
    page = (
      <>
        <header className="profile">
          <span className="avatar xl">{s.profile.name[0] || '♥'}</span>
          <input className="title-input" value={s.profile.name} aria-label="Your name" maxLength={24}
            onChange={(e) => actions.setProfile({ name: e.target.value })} />
          <input className="bio-input" value={s.profile.bio} aria-label="Your bio" maxLength={120}
            onChange={(e) => actions.setProfile({ bio: e.target.value })} />
          <p className="stats">
            <span><b>{s.posts.length}</b> posts</span>
            <a href="#/hearts"><b>{s.hearts.length}</b> hearts</a>
            <a href="#/collections"><b>{s.collections.length}</b> collections</a>
          </p>
        </header>
        <Grid posts={s.posts} onOpen={open} empty="you haven't posted anything yet. hit “+ post” and add your first image." />
      </>
    )
  } else {
    const q = (section === 'tag' || section === 'search' ? arg : '').toLowerCase()
    const shown = !q ? posts : posts.filter((p) =>
      section === 'tag' ? p.tags.includes(q)
        : p.tags.some((t) => t.includes(q)) || p.caption.toLowerCase().includes(q) || p.author.toLowerCase().includes(q))
    page = (
      <>
        {q
          ? <PageTitle title={section === 'tag' ? `#${q}` : `“${q}”`} sub={`${shown.length} images`}><a href="#/">← back to everything</a></PageTitle>
          : <p className="hello">collect the things you love <HeartIcon filled /> like it's 2012 again</p>}
        <nav className="chips" aria-label="Popular tags">
          {POPULAR.map((t) => <a key={t} href={`#/tag/${t}`} className={q === t ? 'on' : ''}>#{t}</a>)}
        </nav>
        <Grid posts={shown} onOpen={open} empty="nothing here yet. try another tag?" />
      </>
    )
  }

  const nav = [['', 'discover'], ['hearts', 'hearts'], ['collections', 'collections'], ['me', 'me']]
  const current = ['hearts', 'me'].includes(section) ? section : section === 'c' || section === 'collections' ? 'collections' : ''

  return (
    <>
      <header className="top">
        <a className="logo" href="#/"><HeartIcon filled /> heartcore</a>
        <form className="search" role="search" onSubmit={(e) => {
          e.preventDefault()
          location.hash = query.trim() ? `#/search/${encodeURIComponent(query.trim())}` : '#/'
        }}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search tags, words, people…" aria-label="Search" />
        </form>
        <nav className="main-nav">
          {nav.map(([path, label]) => (
            <a key={label} href={`#/${path}`} aria-current={current === path ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
        <div className="themes" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} className={`swatch ${t.id}`} title={t.label} aria-label={`${t.label} theme`}
              aria-pressed={s.profile.theme === t.id} onClick={() => actions.setProfile({ theme: t.id })} />
          ))}
        </div>
        <button className="primary" onClick={() => setUploading(true)}>+ post</button>
      </header>
      <main>{page}</main>
      <footer className="foot">made with ♥ for the tumblr kids · everything you save stays in this browser</footer>
      {openPost && <PostModal post={openPost} onClose={() => setOpenId(null)} />}
      {uploading && <UploadModal onClose={() => setUploading(false)} />}
    </>
  )
}

function PageTitle({ title, sub, children }: { title: React.ReactNode; sub: string; children?: React.ReactNode }) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      <span>{sub}</span>
      {children}
    </div>
  )
}

function Collections({ resolve }: { resolve: (ids: string[]) => Post[] }) {
  const { collections } = useStore()
  const [name, setName] = useState('')
  return (
    <>
      <PageTitle title="your collections" sub={`${collections.length} total`}>
        <form className="inline-form" onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) { actions.addCollection(name.trim()); setName('') }
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new collection…" aria-label="New collection name" maxLength={40} />
          <button type="submit">create</button>
        </form>
      </PageTitle>
      {!collections.length && <p className="empty">no collections yet — make one above.</p>}
      <div className="coll-grid">
        {collections.map((c) => {
          const covers = resolve(c.postIds).slice(0, 3)
          return (
            <a key={c.id} className="coll-card" href={`#/c/${c.id}`}>
              <div className="mosaic">
                {[0, 1, 2].map((i) => <div key={i}>{covers[i] && <Media post={covers[i]} />}</div>)}
              </div>
              <strong>{c.name}</strong>
              <small>{c.postIds.length} saved</small>
            </a>
          )
        })}
      </div>
    </>
  )
}
