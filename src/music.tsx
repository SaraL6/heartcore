import { useState } from 'react'
import { actions, supabase, toast, useStore } from './store'

// Music while you browse, using Spotify's own embedded player: no API key and
// no approval needed. People signed in to Spotify in their browser hear full
// songs; everyone else gets previews. We only ever build the player address
// from a validated "type/id", never from raw pasted text.
const KINDS = 'playlist|album|track|artist|show|episode'
const LINK = new RegExp(`(?:open\\.spotify\\.com/(?:intl-[a-z-]+/)?(?:embed/)?|spotify:)(${KINDS})[/:]([A-Za-z0-9]{22})`)
export const MUSIC_REF = new RegExp(`^(${KINDS})/[A-Za-z0-9]{22}$`)

/** Turns a pasted Spotify link into "type/id", or null if it isn't one. */
export function parseSpotify(text: string): string | null {
  const m = LINK.exec(text.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

export function MusicPlayer() {
  const { music, musicOpen, me } = useStore()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [small, setSmall] = useState(false)
  if (!musicOpen) return null
  const valid = music && MUSIC_REF.test(music) ? music : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const ref = parseSpotify(link)
    if (!ref) return setError('paste a Spotify link to a playlist, album, song or artist')
    setError(''); setLink('')
    actions.setMusic(ref)
  }
  const pin = async () => {
    if (!me || !supabase || !valid) return
    const { error: err } = await supabase.from('profiles').update({ music: valid }).eq('id', me.id)
    if (err) return toast('could not add that to your profile')
    actions.setMe({ ...me, music: valid })
    actions.refresh()
    toast('visitors can now play this from your profile ♫')
  }

  return (
    <aside className={`music${small ? ' small' : ''}`} aria-label="Music player">
      <header>
        <span>♫ {valid ? 'now playing' : 'play something'}</span>
        {valid && <button className="link" onClick={() => setSmall(!small)} aria-label={small ? 'Show player' : 'Tuck player away'}>{small ? 'show' : 'tuck away'}</button>}
        <button className="link" onClick={() => actions.setMusicOpen(false)} aria-label="Close player">×</button>
      </header>
      {valid && (
        // Kept in the page while tucked away so the music doesn't stop.
        <iframe
          key={valid} title="Spotify player" src={`https://open.spotify.com/embed/${valid}?utm_source=heartcore`}
          height={valid.startsWith('track') || valid.startsWith('episode') ? 152 : 352} loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      )}
      {!small && (
        <div className="music-controls">
          <form className="inline-form" onSubmit={submit}>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="paste a Spotify link…" aria-label="Spotify link" />
            <button type="submit">{valid ? 'change' : 'play'}</button>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
          {!valid && <p className="muted small">In Spotify: Share → Copy link, on any playlist, album or song.</p>}
          {valid && me && me.music !== valid && <button className="link" onClick={pin}>put this on my profile</button>}
          {valid && (
            <p className="muted small">
              Only hearing 30-second previews? Spotify plays full songs here only if you're logged in at{' '}
              <a className="underline" href="https://open.spotify.com" target="_blank" rel="noreferrer noopener">open.spotify.com</a>{' '}
              in this browser and the browser lets this site use Spotify's sign-in. Or{' '}
              <a className="underline" href={`https://open.spotify.com/${valid}`} target="_blank" rel="noreferrer noopener">open it in Spotify</a>.
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
