import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { checkImageFile } from './aicheck'
import { Notes } from './profile'
import { actions, fmt, heartCount, requireMe, supabase, toast, useStore, type Img } from './store'

export const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 21C3.5 14.5 2 10.5 2 7.8A5.3 5.3 0 0 1 12 5.5a5.3 5.3 0 0 1 10 2.3c0 2.7-1.5 6.7-10 13.2Z"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
)

const errorText = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message) || 'something went wrong'

/** Loads data for a page, reloading when `deps` change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e) => { console.error(e); if (live) setState({ error: errorText(e), loading: false }) },
    )
    return () => { live = false }
  }, deps)
  return state
}

/** A post made of words, drawn as a typographic card. */
export function TextCard({ body, style }: { body: string; style?: string }) {
  const size = body.length > 160 ? 'long' : body.length > 70 ? 'medium' : 'short'
  return <div className={`textpost ${style ?? 'ink'} ${size}`}><p>{body}</p></div>
}

/** An image, sized for a card unless `full`. Falls back to the other size, then gives up. */
export function Media({ img, onDead, full }: { img: Img; onDead?: () => void; full?: boolean }) {
  // Unsplash's small size is plenty for a card and loads several times faster.
  const first = !full && img.provider !== 'upload' && img.thumb ? img.thumb : img.url
  const second = first === img.url ? img.thumb : img.url
  const [src, setSrc] = useState(first)
  if (img.kind === 'text') return <TextCard body={img.body ?? ''} style={img.style} />
  return (
    <img
      src={src} alt={img.caption || 'image'} loading="lazy" decoding="async"
      width={img.width} height={img.height}
      style={img.width && img.height ? { aspectRatio: `${img.width} / ${img.height}` } : undefined}
      onError={() => (second && src !== second ? setSrc(second) : onDead?.())}
    />
  )
}

export function HeartButton({ img, big }: { img: Img; big?: boolean }) {
  const s = useStore()
  const on = !!s.hearted[img.key]
  const n = s.quiet ? 0 : heartCount(s, img)
  return (
    <button
      className={`heart-btn${on ? ' on' : ''}${big ? ' big' : ''}`}
      aria-pressed={on} aria-label={on ? 'Unheart' : 'Heart'}
      onClick={(e) => { e.stopPropagation(); actions.toggleHeart(img) }}
    >
      <HeartIcon filled={on} />
      {s.quiet ? big && <span>{on ? 'hearted' : 'heart'}</span> : (n > 0 || big) && <span>{fmt(n)}</span>}
    </button>
  )
}

export function FollowButton({ profileId }: { profileId: string }) {
  const { me, following } = useStore()
  if (me?.id === profileId) return null
  const on = following.includes(profileId)
  return (
    <button className={on ? 'follow on' : 'follow primary'} aria-pressed={on} onClick={() => actions.toggleFollow(profileId)}>
      {on ? 'following ✓' : '+ follow'}
    </button>
  )
}

function Byline({ img }: { img: Img }) {
  if (img.via) return <a className="author" href={`#/u/${img.via}`}>♥ {img.via}</a>
  if (img.uploader) return <a className="author" href={`#/u/${img.uploader.username}`}>{img.uploader.username}</a>
  return <span className="author">{img.credit ? `by ${img.credit}` : ''}</span>
}

/** Closes a popover when you click outside it or press Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement & HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])
  return ref
}

function Card({ img, onOpen, onDead, saving, setSaving, hidden }: {
  img: Img; onOpen: (i: Img) => void; onDead: () => void; saving: boolean; setSaving: (key: string | null) => void; hidden?: boolean
}) {
  const close = useCallback(() => setSaving(null), [setSaving])
  const pop = useDismiss(saving, close)
  return (
    <article className={`card${saving ? ' saving' : ''}`} ref={pop as React.RefObject<HTMLElement>} hidden={hidden}>
      <div className="card-frame">
        <button className="card-media" onClick={() => onOpen(img)} aria-label={`Open ${img.caption || 'image'}`}>
          <Media img={img} onDead={onDead} />
        </button>
        <button className="save-btn" aria-expanded={saving} onClick={() => requireMe() && setSaving(saving ? null : img.key)}>
          {saving ? 'done' : 'save'}
        </button>
      </div>
      {/* Outside the image frame, so a short image doesn't cut it off. */}
      {saving && <div className="save-pop" role="dialog" aria-label="Save to a collection"><SaveToCollection img={img} /></div>}
      <footer><Byline img={img} /><HeartButton img={img} /></footer>
    </article>
  )
}

/** Height for width of a card's picture, as best we know before it loads. */
function shape(img: Img): number {
  if (img.kind === 'text') return (img.body?.length ?? 0) > 160 ? 1 : 0.75
  return img.width && img.height ? Math.min(img.height / img.width, 2.5) : 1
}

/**
 * Deals cards into columns, each to the currently shortest one. Cards are only
 * ever added, never moved: loading more at the bottom leaves everything above
 * where it was.
 */
export function dealColumns<T>(items: T[], columns: number, heightOf: (item: T) => number): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => [])
  const heights = new Array(columns).fill(0)
  for (const item of items) {
    const i = heights.indexOf(Math.min(...heights))
    cols[i].push(item)
    heights[i] += heightOf(item) + 0.18 // the byline under each card
  }
  return cols
}

const COLUMN_MIN = 230
const columnsFor = (width: number) => (width < 720 ? 2 : Math.max(2, Math.min(6, Math.floor((width + 16) / (COLUMN_MIN + 16)))))

export function Grid({ images, onOpen, empty }: { images: Img[]; onOpen: (i: Img) => void; empty: string }) {
  const [dead, setDead] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(() => columnsFor(Math.min(window.innerWidth, 1400) - 40))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setColumns(columnsFor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [images.length > 0])
  if (!images.length) return <p className="empty">{empty}</p>
  // Broken images are hidden in place rather than removed, so nothing below them moves.
  const cols = dealColumns(images, columns, shape)
  return (
    <div className="grid" ref={ref}>
      {cols.map((col, i) => (
        <div className="grid-col" key={i}>
          {col.map((img) => (
            <Card key={img.key} img={img} onOpen={onOpen} saving={saving === img.key} setSaving={setSaving}
              hidden={dead.has(img.key)} onDead={() => setDead((d) => new Set(d).add(img.key))} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function Modal({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
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

function SaveToCollection({ img }: { img: Img }) {
  const { me } = useStore()
  const [list, setList] = useState<{ id: string; name: string; has: boolean }[] | null>(null)
  const [name, setName] = useState('')
  useEffect(() => {
    setList(null)
    if (me) api.myCollectionsFor(me.id, img).then(setList, () => setList([]))
  }, [me, img])

  const toggle = async (id: string, on: boolean) => {
    setList((l) => l && l.map((c) => (c.id === id ? { ...c, has: on } : c)))
    try { await api.setInCollection(id, img, on) } catch (e) {
      console.error(e)
      setList((l) => l && l.map((c) => (c.id === id ? { ...c, has: !on } : c)))
      toast('could not update that collection — try again')
    }
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    const who = requireMe()
    if (!n || !who) return
    try {
      const id = await api.createCollection(who.id, n)
      setList((l) => [...(l ?? []), { id, name: n, has: false }])
      setName('')
      await toggle(id, true)
    } catch (err) { console.error(err); toast('could not create that collection') }
  }

  return (
    <>
      <h4>save to a collection</h4>
      {!me && <button onClick={() => actions.openAuth(true)}>sign in to save this</button>}
      {me && !list && <p className="muted">loading…</p>}
      {me && list && (
        <>
          <ul className="coll-list">
            {list.map((c) => (
              <li key={c.id}>
                <button className={c.has ? 'on' : ''} aria-pressed={c.has} onClick={() => toggle(c.id, !c.has)}>
                  <span>{c.name}</span><span>{c.has ? '✓ saved' : '+ add'}</span>
                </button>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="new collection…" aria-label="New collection name" maxLength={40} />
            <button type="submit">create</button>
          </form>
        </>
      )}
    </>
  )
}

function ReportForm({ img, onDone }: { img: Img; onDone: () => void }) {
  const { me } = useStore()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return toast('reporting is not switched on for this copy of heartcore')
    setBusy(true)
    try {
      await api.fileReport(img, reason, details.trim(), contact.trim(), me?.id)
      toast('thank you — your report was sent and will be reviewed')
      onDone()
    } catch (err) { console.error(err); toast('could not send that report — try again'); setBusy(false) }
  }
  return (
    <form className="report" onSubmit={submit}>
      <h4>report this image</h4>
      <select value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Reason">
        <option value="" disabled>what's wrong with it?</option>
        {api.REASONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={3} aria-label="Details"
        placeholder={reason === 'copyright' ? 'where can we see your original? (link)' : 'anything we should know? (optional)'}
        required={reason === 'copyright'} />
      {(!me || reason === 'copyright') && (
        <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200}
          placeholder={reason === 'copyright' ? 'your email' : 'your email (optional)'} aria-label="Your email" required={reason === 'copyright'} />
      )}
      <div className="inline-form">
        <button type="submit" className="primary" disabled={busy}>{busy ? 'sending…' : 'send report'}</button>
        <button type="button" onClick={onDone}>cancel</button>
      </div>
    </form>
  )
}

export function PostModal({ img, onClose }: { img: Img; onClose: () => void }) {
  const s = useStore()
  const { me, hearted } = s
  const [burst, setBurst] = useState(0)
  const [reporting, setReporting] = useState(false)
  const love = () => {
    if (!hearted[img.key]) actions.toggleHeart(img)
    if (me) setBurst((b) => b + 1)
  }
  const mine = !!me && img.uploader?.id === me.id
  const remove = async () => {
    if (!confirm('Delete this post for good?')) return
    try { await api.deletePost(img); actions.refresh(); onClose() } catch (e) { console.error(e); toast('could not delete that post') }
  }
  return (
    <Modal onClose={onClose} label="Image">
      <div className="post-modal">
        <div className="post-media" onDoubleClick={love} title="double-click to heart">
          <Media img={img} full />
          {burst > 0 && <span key={burst} className="burst"><HeartIcon filled /></span>}
        </div>
        <aside>
          {img.uploader ? (
            <div className="post-head">
              <a className="avatar" href={`#/u/${img.uploader.username}`} onClick={onClose}>{img.uploader.username[0]}</a>
              <div><a href={`#/u/${img.uploader.username}`} onClick={onClose}><strong>{img.uploader.username}</strong></a><small>posted this</small></div>
            </div>
          ) : (
            <p className="credit">
              photo{img.credit ? <> by {img.creditUrl
                ? <a href={img.creditUrl} target="_blank" rel="noreferrer noopener"><strong>{img.credit}</strong></a>
                : <strong>{img.credit}</strong>}</> : ''}
              {img.provider === 'unsplash' && <> on <a className="underline" href="https://unsplash.com/?utm_source=heartcore&utm_medium=referral" target="_blank" rel="noreferrer noopener">Unsplash</a></>}
              {(img.provider === 'flickr' || img.provider === 'openverse') && <> on <a className="underline" href="https://www.flickr.com" target="_blank" rel="noreferrer noopener">Flickr</a></>}
              {img.year && <> · {img.year}</>}
              {img.provider !== 'unsplash' && img.license && <> · {img.license}</>}
              {img.sourceUrl && <> · <a href={img.sourceUrl} target="_blank" rel="noreferrer noopener">view original ↗</a></>}
            </p>
          )}
          {img.caption && <p className="caption">{img.caption}</p>}
          {img.tags.length > 0 && (
            <div className="tags">
              {img.tags.map((t) => <a key={t} href={`#/tag/${encodeURIComponent(t)}`} onClick={onClose}>#{t}</a>)}
            </div>
          )}
          <HeartButton img={img} big />
          {img.id && <Notes imageId={img.id} total={heartCount(s, img)} onNavigate={onClose} />}
          <SaveToCollection img={img} />
          {me && img.kind !== 'text' && (
            <button className="danger cover-link" onClick={async () => {
              try { await api.setCover(me.id, img.url); actions.setMe({ ...me, cover_url: img.url }); actions.refresh(); toast('this is now your profile cover ♥') } catch (e) { console.error(e); toast('could not set your cover') }
            }}>use as my profile cover</button>
          )}
          {mine && <button className="danger" onClick={remove}>delete post</button>}
          {reporting
            ? <ReportForm img={img} onDone={() => setReporting(false)} />
            : !mine && <button className="danger report-link" onClick={() => setReporting(true)}>report</button>}
        </aside>
      </div>
    </Modal>
  )
}

// Shrink big photos before uploading; GIFs are kept as-is so they still animate.
async function prepare(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  if (file.type === 'image/gif' || (scale === 1 && file.size < 700_000)) return { blob: file, width: bmp.width, height: bmp.height }
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.86))
  return blob ? { blob, width: c.width, height: c.height } : { blob: file, width: bmp.width, height: bmp.height }
}

const aiRefusal = (marker: string) => `this image's file shows it was made or edited with AI (${marker}). heartcore is for human-made images only.`

const OK_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function UploadModal({ onClose }: { onClose: () => void }) {
  const { me } = useStore()
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState('')
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const previewEl = useRef<HTMLImageElement>(null)
  const [mode, setMode] = useState<'image' | 'words'>('image')
  const [words, setWords] = useState('')
  const [style, setStyle] = useState<string>('ink')
  const [human, setHuman] = useState(false)

  useEffect(() => {
    if (!file) { setPreview(url.trim()); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file, url])

  const choose = async (f?: File | null) => {
    if (!f) return
    if (!OK_TYPES.includes(f.type)) return setError('please pick a jpg, png, gif or webp image')
    if (f.size > 15_000_000) return setError('that image is over 15 MB — try a smaller one')
    // Before resizing, which would wipe the file's own record of how it was made.
    const marker = await checkImageFile(f).catch(() => null)
    if (marker) { setFile(null); return setError(aiRefusal(marker)) }
    setError(''); setUrl(''); setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const src = url.trim()
    if (!me) return
    if (mode === 'words') {
      const body = words.trim()
      if (!body) return setError('write a few words first')
      setBusy(true)
      try {
        await api.createTextPost(me.id, { body, style, tags: [...new Set(tags.toLowerCase().split(/[\s,#]+/).filter(Boolean))].slice(0, 8) })
        actions.refresh(); onClose(); location.hash = `#/u/${me.username}/posts`
      } catch (err) { console.error(err); setError(`could not post that: ${errorText(err)}`); setBusy(false) }
      return
    }
    if (!human) return setError("please confirm the image isn't AI-made or AI-edited")
    if (!file && !/^https:\/\//i.test(src)) return setError('pick an image or paste a link starting with https://')
    setBusy(true)
    try {
      const common = { caption: caption.trim(), tags: [...new Set(tags.toLowerCase().split(/[\s,#]+/).filter(Boolean))].slice(0, 8) }
      if (file) {
        const p = await prepare(file)
        await api.createPost(me.id, { ...common, file: p.blob, width: p.width, height: p.height })
      } else {
        // Check the linked file too, when its host lets us read it.
        const linked = await fetch(src, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.blob() : null)).catch(() => null)
        const marker = linked && await checkImageFile(linked).catch(() => null)
        if (marker) { setBusy(false); return setError(aiRefusal(marker)) }
        const el = previewEl.current
        await api.createPost(me.id, { ...common, src, width: el?.naturalWidth || undefined, height: el?.naturalHeight || undefined })
      }
      actions.refresh()
      onClose()
      location.hash = `#/u/${me.username}/posts`
    } catch (err) {
      console.error(err)
      setError(`could not post that: ${errorText(err)}`)
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} label="New post">
      <form className="upload" onSubmit={submit}>
        <h2>post something you love</h2>
        <div className="mode" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'image'} onClick={() => { setMode('image'); setError('') }}>an image</button>
          <button type="button" role="tab" aria-selected={mode === 'words'} onClick={() => { setMode('words'); setError('') }}>some words</button>
        </div>
        {mode === 'words' ? (
          <>
            <TextCard body={words || 'stay weird'} style={style} />
            <label>your words
              <textarea value={words} onChange={(e) => setWords(e.target.value)} maxLength={280} rows={3} placeholder="a quote, a thought, a lyric you wrote…" />
            </label>
            <div className="styles" role="group" aria-label="Card style">
              {api.TEXT_STYLES.map((t) => (
                <button key={t} type="button" className={`textpost ${t}`} aria-pressed={style === t} aria-label={`${t} style`} onClick={() => setStyle(t)}>Aa</button>
              ))}
            </div>
          </>
        ) : (
          <>
        <div
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]) }}
        >
          {preview
            ? <img ref={previewEl} src={preview} alt="preview" onError={() => setError('that link does not load as an image')} onLoad={() => setError('')} />
            : <p>drag an image here<br /><small>jpg, png or gif</small></p>}
          <button type="button" onClick={() => input.current?.click()}>{file ? 'choose another' : 'choose a file'}</button>
          <input ref={input} type="file" accept={OK_TYPES.join(',')} hidden onChange={(e) => choose(e.target.files?.[0])} />
        </div>
        <label>or paste an image link
          <input type="url" value={url} placeholder="https://…" onChange={(e) => { setFile(null); setError(''); setUrl(e.target.value) }} />
        </label>
        <label>caption
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} placeholder="optional" />
        </label>
          </>
        )}
        <label>tags
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="grunge, pastel, summer" />
        </label>
        {mode === 'image' && (
          <label className="check">
            <input type="checkbox" checked={human} onChange={(e) => setHuman(e.target.checked)} />
            <span>This image isn't AI-generated, AI-edited or manipulated to look real.</span>
          </label>
        )}
        <p className="muted small">heartcore is human-made only. AI images are refused when their file gives them away and removed when reported. Credit words that aren't yours, and see the <a className="underline" href="#/about/rules" target="_blank" rel="noreferrer">rules</a>.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'posting…' : 'post it ♥'}</button>
      </form>
    </Modal>
  )
}

export function AuthModal() {
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => actions.openAuth(false)

  if (!supabase) {
    return (
      <Modal onClose={close} label="Accounts">
        <div className="upload">
          <h2>accounts aren't switched on yet</h2>
          <p>This copy of heartcore isn't connected to a Supabase project, so you can browse but not heart, save or follow.</p>
          <p className="muted">If you run this site: follow “Set up accounts” in the README, then restart.</p>
        </div>
      </Modal>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const name = username.trim().toLowerCase()
    if (mode === 'up' && !/^[a-z0-9_.]{3,24}$/.test(name)) return setError('usernames are 3–24 characters: letters, numbers, dots and underscores')
    if (password.length < 8) return setError('passwords need at least 8 characters')
    setBusy(true)
    try {
      if (mode === 'up') {
        const { needsEmailConfirm } = await api.signUp(email.trim(), password, name)
        if (needsEmailConfirm) { setNotice(`almost there — we sent a confirmation link to ${email.trim()}. click it, then sign in.`); setMode('in') }
        else close()
      } else {
        await api.signIn(email.trim(), password)
        close()
      }
    } catch (err) { setError(errorText(err).toLowerCase()) }
    setBusy(false)
  }

  return (
    <Modal onClose={close} label={mode === 'up' ? 'Join' : 'Sign in'}>
      <form className="upload" onSubmit={submit}>
        <h2>{mode === 'up' ? 'join heartcore ♥' : 'welcome back ♥'}</h2>
        {notice && <p className="notice" role="status">{notice}</p>}
        {mode === 'up' && (
          <label>username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="moonchild_" maxLength={24} required />
          </label>
        )}
        <label>email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required />
        </label>
        {mode === 'up' && (
          <label className="check">
            <input type="checkbox" required />
            <span>I'm 13 or older and I agree to the <a className="underline" href="#/about/terms" target="_blank" rel="noreferrer">terms</a>, <a className="underline" href="#/about/rules" target="_blank" rel="noreferrer">rules</a> and <a className="underline" href="#/about/privacy" target="_blank" rel="noreferrer">privacy policy</a></span>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'one sec…' : mode === 'up' ? 'create my account' : 'sign in'}</button>
        <button type="button" className="danger" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError('') }}>
          {mode === 'up' ? 'already have an account? sign in' : 'new here? create an account'}
        </button>
      </form>
    </Modal>
  )
}
