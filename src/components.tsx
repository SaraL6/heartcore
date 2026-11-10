import { useEffect, useRef, useState } from 'react'
import { Art } from './art'
import { actions, fmt, isMine, useStore, type Post } from './store'

export const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 21C3.5 14.5 2 10.5 2 7.8A5.3 5.3 0 0 1 12 5.5a5.3 5.3 0 0 1 10 2.3c0 2.7-1.5 6.7-10 13.2Z"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
)

export function Media({ post }: { post: Post }) {
  const { blobs } = useStore()
  if (post.art) return <Art spec={post.art} />
  const src = post.src ?? blobs[post.id]
  if (!src) return <div className="media-missing">image unavailable</div>
  return <img src={src} alt={post.caption || 'image'} loading="lazy" />
}

export function HeartButton({ post, big }: { post: Post; big?: boolean }) {
  const { hearts } = useStore()
  const on = hearts.includes(post.id)
  return (
    <button
      className={`heart-btn${on ? ' on' : ''}${big ? ' big' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Unheart' : 'Heart'}
      onClick={(e) => { e.stopPropagation(); actions.toggleHeart(post.id) }}
    >
      <HeartIcon filled={on} />
      <span>{fmt(post.baseHearts + (on ? 1 : 0))}</span>
    </button>
  )
}

export function Grid({ posts, onOpen, empty }: { posts: Post[]; onOpen: (p: Post) => void; empty: string }) {
  if (!posts.length) return <p className="empty">{empty}</p>
  return (
    <div className="grid">
      {posts.map((p) => (
        <article key={p.id} className="card">
          <button className="card-media" onClick={() => onOpen(p)} aria-label={`Open ${p.caption || 'image'} by ${p.author}`}>
            <Media post={p} />
          </button>
          <footer>
            <span className="author">{p.author}</span>
            <HeartButton post={p} />
          </footer>
        </article>
      ))}
    </div>
  )
}

function Modal({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  )
}

export function PostModal({ post, onClose }: { post: Post; onClose: () => void }) {
  const { collections, hearts } = useStore()
  const [burst, setBurst] = useState(0)
  const [newName, setNewName] = useState('')
  const love = () => {
    if (!hearts.includes(post.id)) actions.toggleHeart(post.id)
    setBurst((b) => b + 1)
  }
  return (
    <Modal onClose={onClose} label="Post">
      <div className="post-modal">
        <div className="post-media" onDoubleClick={love} title="double-click to heart">
          <Media post={post} />
          {burst > 0 && <span key={burst} className="burst"><HeartIcon filled /></span>}
        </div>
        <aside>
          <div className="post-head">
            <span className="avatar">{post.author[0]}</span>
            <div><strong>{post.author}</strong><small>{isMine(post) ? 'posted by you' : 'from the starter feed'}</small></div>
          </div>
          {post.caption && <p className="caption">{post.caption}</p>}
          <div className="tags">
            {post.tags.map((t) => <a key={t} href={`#/tag/${encodeURIComponent(t)}`} onClick={onClose}>#{t}</a>)}
          </div>
          <HeartButton post={post} big />
          <h4>save to a collection</h4>
          <ul className="coll-list">
            {collections.map((c) => {
              const inIt = c.postIds.includes(post.id)
              return (
                <li key={c.id}>
                  <button className={inIt ? 'on' : ''} aria-pressed={inIt} onClick={() => actions.toggleInCollection(c.id, post.id)}>
                    <span>{c.name}</span><span>{inIt ? '✓ saved' : '+ add'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <form className="inline-form" onSubmit={(e) => {
            e.preventDefault()
            const name = newName.trim()
            if (!name) return
            actions.toggleInCollection(actions.addCollection(name), post.id)
            setNewName('')
          }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new collection…" aria-label="New collection name" maxLength={40} />
            <button type="submit">create</button>
          </form>
          {isMine(post) && (
            <button className="danger" onClick={() => { if (confirm('Delete this post for good?')) { actions.deletePost(post.id); onClose() } }}>
              delete post
            </button>
          )}
        </aside>
      </div>
    </Modal>
  )
}

// Shrink big photos so they don't eat browser storage; GIFs are kept as-is so they still animate.
async function prepare(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
  if (scale === 1 && file.size < 600_000) return file
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.86))
}

export function UploadModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) { setPreview(url.trim()); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file, url])

  const choose = (f?: File | null) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('that file is not an image')
    if (f.size > 15_000_000) return setError('that image is over 15 MB — try a smaller one')
    setError(''); setUrl(''); setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const src = url.trim()
    if (!file && !/^https?:\/\//i.test(src)) return setError('pick an image or paste a link starting with http')
    setBusy(true)
    try {
      await actions.addPost({
        caption: caption.trim(),
        tags: [...new Set(tags.toLowerCase().split(/[\s,#]+/).filter(Boolean))].slice(0, 8),
        ...(file ? { file: await prepare(file) } : { src }),
      })
      onClose()
      location.hash = '#/me'
    } catch (err) {
      console.error(err)
      setError('could not save that image — your browser storage may be full')
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} label="New post">
      <form className="upload" onSubmit={submit}>
        <h2>post something you love</h2>
        <div
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]) }}
        >
          {preview
            ? <img src={preview} alt="preview" onError={() => setError('that link does not load as an image')} onLoad={() => setError('')} />
            : <p>drag an image here<br /><small>jpg, png or gif</small></p>}
          <button type="button" onClick={() => input.current?.click()}>{file ? 'choose another' : 'choose a file'}</button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
        </div>
        <label>or paste an image link
          <input type="url" value={url} placeholder="https://…" onChange={(e) => { setFile(null); setError(''); setUrl(e.target.value) }} />
        </label>
        <label>caption
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="optional" />
        </label>
        <label>tags
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="grunge, pastel, summer" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'saving…' : 'post it ♥'}</button>
      </form>
    </Modal>
  )
}
