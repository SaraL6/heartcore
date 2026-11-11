import { useEffect, useState } from 'react'
import * as api from './api'
import { useLoad } from './components'
import { actions, requireMe, toast, useStore, type Profile } from './store'

// The "make it yours" corner of a profile: mood, colour, visit counter,
// top friends and a guestbook.

/** Black or white, whichever reads better on the given colour. */
export function accentInk(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1a1220' : '#ffffff'
}
export const isAccent = (v?: string | null): v is string => !!v && /^#[0-9a-f]{6}$/.test(v)

/** Paints the page in a profile's own colour while it's open. */
export function useAccent(accent?: string | null) {
  useEffect(() => {
    if (!isAccent(accent)) return
    const root = document.documentElement.style
    root.setProperty('--accent', accent)
    root.setProperty('--accent-ink', accentInk(accent))
    return () => { root.removeProperty('--accent'); root.removeProperty('--accent-ink') }
  }, [accent])
}

function HitCounter({ profile, mine }: { profile: Profile; mine: boolean }) {
  const [n, setN] = useState(profile.views ?? 0)
  useEffect(() => {
    if (mine) return
    const key = `heartcore:seen:${profile.id}`
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1') } catch { /* count anyway */ }
    api.bumpViews(profile.id).then((v) => v != null && setN(v), () => {})
  }, [profile.id, mine])
  return (
    <p className="counter" aria-label={`${n} visits`}>
      {String(n).padStart(6, '0').split('').map((d, i) => <span key={i}>{d}</span>)}
      <small>visits</small>
    </p>
  )
}

export function AboutBox({ profile, mine, onChange }: { profile: Profile; mine: boolean; onChange: (patch: Partial<Profile>) => void }) {
  const [mood, setMood] = useState(profile.mood ?? '')
  const save = async (patch: Partial<Profile>) => {
    try { await api.updateProfile(profile.id, patch); onChange(patch) } catch (e) { console.error(e); toast('could not save that') }
  }
  return (
    <section className="panel">
      <h2>about {profile.username}</h2>
      <div className="panel-body about">
        <p className="mood">
          <b>mood:</b>{' '}
          {mine
            ? <input value={mood} maxLength={60} placeholder="☁ dreamy" aria-label="Your mood"
                onChange={(e) => setMood(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                onBlur={() => mood !== (profile.mood ?? '') && save({ mood: mood.trim() || null })} />
            : profile.mood || <span className="muted">a mystery</span>}
        </p>
        <HitCounter profile={profile} mine={mine} />
        {mine && (
          <p className="colour">
            <label>my colour{' '}
              <input type="color" value={isAccent(profile.accent) ? profile.accent : '#ff5c8a'} aria-label="Your profile colour"
                onChange={(e) => onChange({ accent: e.target.value.toLowerCase() })}
                onBlur={(e) => save({ accent: e.target.value.toLowerCase() })} />
            </label>
            {profile.accent && <button className="link" onClick={() => save({ accent: null })}>use theme colour</button>}
          </p>
        )}
      </div>
    </section>
  )
}

export function TopFriends({ profile, mine }: { profile: Profile; mine: boolean }) {
  const { top } = useStore()
  const mineKey = mine ? Object.keys(top).join() : ''
  const { data } = useLoad(() => api.topFriends(profile.id), [profile.id, mineKey])
  return (
    <section className="panel">
      <h2>{profile.username}'s top 8</h2>
      <div className="panel-body">
        {!data?.length
          ? <p className="muted">{mine ? 'nobody yet — open a friend\'s profile and press “add to my top 8”.' : 'nobody yet.'}</p>
          : (
            <ul className="top8">
              {data.map((f) => (
                <li key={f.id}>
                  <a href={`#/u/${f.username}`}>
                    <span className="avatar" style={f.cover_url ? { backgroundImage: `url("${encodeURI(f.cover_url)}")` } : undefined}>{!f.cover_url && f.username[0]}</span>
                    <span className="name">{f.username}</span>
                  </a>
                  {mine && <button className="link" aria-label={`Remove ${f.username} from your top 8`} onClick={() => actions.toggleTop(f.id)}>×</button>}
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}

export function TopButton({ profileId }: { profileId: string }) {
  const { top, me } = useStore()
  if (me?.id === profileId) return null
  const on = profileId in top
  return <button className="link" aria-pressed={on} onClick={() => actions.toggleTop(profileId)}>{on ? '★ in my top 8' : '☆ add to my top 8'}</button>
}

export function Guestbook({ profile, mine }: { profile: Profile; mine: boolean }) {
  const { me, isAdmin } = useStore()
  const [n, setN] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, loading, error } = useLoad(() => api.guestbook(profile.id), [profile.id, n])
  const sign = async (e: React.FormEvent) => {
    e.preventDefault()
    const who = requireMe()
    const text = body.trim()
    if (!who || !text) return
    setBusy(true)
    try { await api.signGuestbook(profile.id, who.id, text); setBody(''); setN(n + 1) } catch (err) { console.error(err); toast('could not post your note') }
    setBusy(false)
  }
  const remove = async (id: string) => {
    try { await api.deleteEntry(id); setN(n + 1) } catch (err) { console.error(err); toast('could not remove that note') }
  }
  return (
    <section className="guestbook">
      <form className="inline-form" onSubmit={sign}>
        <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} aria-label="Your note"
          placeholder={mine ? 'leave yourself a note…' : `say something nice to ${profile.username}…`} />
        <button type="submit" className="primary" disabled={busy}>sign</button>
      </form>
      {!data ? <p className="empty">{error ?? (loading ? 'loading…' : '')}</p> : !data.length ? <p className="empty">no notes yet. be the first ♡</p> : (
        <ul>
          {data.map((entry) => (
            <li key={entry.id}>
              <a className="avatar" href={`#/u/${entry.author.username}`}>{entry.author.username[0]}</a>
              <div>
                <p><a href={`#/u/${entry.author.username}`}><b>{entry.author.username}</b></a> <small>{new Date(entry.created_at).toLocaleDateString()}</small></p>
                <p>{entry.body}</p>
              </div>
              {(mine || isAdmin || me?.id === entry.author.id) && <button className="link" aria-label="Remove note" onClick={() => remove(entry.id)}>×</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** "♥ lena, mia and 3 more" under an open image. */
export function Notes({ imageId, total, onNavigate }: { imageId: string; total: number; onNavigate: () => void }) {
  const { data } = useLoad(() => api.notes(imageId), [imageId, total])
  if (!data?.length) return null
  const more = total - data.length
  return (
    <p className="notes">
      ♥ {data.map((name, i) => <span key={name}>{i > 0 && ', '}<a href={`#/u/${name}`} onClick={onNavigate}>{name}</a></span>)}
      {more > 0 && ` and ${more} more`}
    </p>
  )
}
