import { useEffect, useRef, useState } from 'react'
import {
  connectSpotify, disconnectSpotify, isSpotifyConnected, playOn, spotifyConnectEnabled, startPlayer,
  type FullPlayer, type NowPlaying,
} from './spotify'
import { actions, supabase, toast, useStore } from './store'

// Music while you browse. By default this is Spotify's own embedded player:
// no key or approval needed, full songs only when the browser lets the embed
// see the listener's Spotify login, previews otherwise. When the site has a
// Spotify app configured, people can also connect their account and play
// full songs inside the page (see spotify.ts).
// We only ever build player addresses from a validated "type/id".
const KINDS = 'playlist|album|track|artist|show|episode'
const LINK = new RegExp(`(?:open\\.spotify\\.com/(?:intl-[a-z-]+/)?(?:embed/)?|spotify:)(${KINDS})[/:]([A-Za-z0-9]{22})`)
export const MUSIC_REF = new RegExp(`^(${KINDS})/[A-Za-z0-9]{22}$`)

/** Turns a pasted Spotify link into "type/id", or null if it isn't one. */
export function parseSpotify(text: string): string | null {
  const m = LINK.exec(text.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

// Spotify's public link lookup gives the name and cover of what's playing,
// which the embedded player won't tell the page.
type Info = { title: string; art?: string }
const known = new Map<string, Info>()
function useSpotifyInfo(ref: string | null): Info | null {
  const [info, setInfo] = useState<Info | null>(ref ? known.get(ref) ?? null : null)
  useEffect(() => {
    if (!ref) return setInfo(null)
    if (known.has(ref)) return setInfo(known.get(ref)!)
    setInfo(null)
    let live = true
    fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${ref}`)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.title) return
        const found = { title: String(d.title), art: typeof d.thumbnail_url === 'string' && d.thumbnail_url.startsWith('https://') ? d.thumbnail_url : undefined }
        known.set(ref, found)
        if (live) setInfo(found)
      })
      .catch(() => {})
    return () => { live = false }
  }, [ref])
  return info
}

const KIND_LABEL: Record<string, string> = { playlist: 'playlist', album: 'album', track: 'song', artist: 'artist', show: 'podcast', episode: 'episode' }

export function MusicPlayer() {
  const { musicOpen } = useStore()
  // Closing the player unmounts it, which also stops a connected Spotify player.
  return musicOpen ? <Player /> : null
}

function Player() {
  const { music, me } = useStore()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [small, setSmall] = useState(false)
  const [connected, setConnected] = useState(isSpotifyConnected)
  const [full, setFull] = useState<FullPlayer | null>(null)
  const [now, setNow] = useState<NowPlaying | null>(null)
  const [problem, setProblem] = useState('')
  const [starting, setStarting] = useState(false)
  const played = useRef<string | null>(null)
  const valid = music && MUSIC_REF.test(music) ? music : null
  const info = useSpotifyInfo(valid)

  useEffect(() => () => { full?.player.disconnect() }, [full])

  const fallBack = (message: string) => {
    setProblem(message)
    setFull((f) => { f?.player.disconnect(); return null })
    setNow(null)
    played.current = null
    setConnected(isSpotifyConnected())
  }

  // Play on the connected player whenever the chosen music changes.
  useEffect(() => {
    if (!full || !valid || played.current === valid) return
    played.current = valid
    playOn(full.deviceId, valid).catch((e) => fallBack((e as Error).message))
  }, [full, valid])

  const startFull = async () => {
    setStarting(true); setProblem('')
    try {
      const p = await startPlayer(setNow, fallBack)
      await p.player.activateElement?.() // lets the browser play sound after this click
      setFull(p)
    } catch (e) { fallBack((e as Error).message) }
    setStarting(false)
  }
  const disconnect = () => {
    full?.player.disconnect()
    disconnectSpotify()
    setFull(null); setNow(null); setConnected(false); played.current = null
  }

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
      {small && valid ? (
        // Tucked away: a slim bar that still says what's on.
        <div className="mini">
          {(full ? now?.art : info?.art) ? <img src={full ? now?.art : info?.art} alt="" /> : <span className="art" />}
          <button className="what" onClick={() => setSmall(false)} aria-label="Show player">
            <strong>{(full ? now?.title : info?.title) ?? 'now playing'}</strong>
            <small>
              {full && now && !now.paused && <span className="eq" aria-hidden="true"><i /><i /><i /></span>}
              {full ? now?.artist ?? 'Spotify' : `${KIND_LABEL[valid.split('/')[0]]} on Spotify`}
            </small>
          </button>
          {full && <button className="round" onClick={() => full.player.togglePlay()} aria-label={now?.paused ? 'Play' : 'Pause'}>{now?.paused ? '▶' : '⏸'}</button>}
          <button className="round" onClick={() => actions.setMusicOpen(false)} aria-label="Close player">×</button>
        </div>
      ) : (
        <header>
          <span>♫ {valid ? (full ? 'playing from your Spotify' : info?.title ?? 'now playing') : 'play something'}</span>
          {valid && <button className="link" onClick={() => setSmall(true)} aria-label="Tuck player away">tuck away</button>}
          <button className="link" onClick={() => actions.setMusicOpen(false)} aria-label="Close player">×</button>
        </header>
      )}
      {valid && full && !small && (
        <div className="now">
          {now?.art ? <img src={now.art} alt="" /> : <span className="art" />}
          <div className="what">
            <strong>{now?.title ?? 'starting…'}</strong>
            <small>{now?.artist ?? ''}</small>
          </div>
          <div className="buttons">
            <button onClick={() => full.player.previousTrack()} aria-label="Previous song">⏮</button>
            <button onClick={() => full.player.togglePlay()} aria-label={now?.paused ? 'Play' : 'Pause'}>{now?.paused ? '▶' : '⏸'}</button>
            <button onClick={() => full.player.nextTrack()} aria-label="Next song">⏭</button>
          </div>
        </div>
      )}
      {valid && !full && (
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
          {problem && <p className="error" role="status">{problem}</p>}
          {!valid && <p className="muted small">In Spotify: Share → Copy link, on any playlist, album or song.</p>}
          {valid && me && me.music !== valid && <button className="link" onClick={pin}>put this on my profile</button>}
          {valid && !full && spotifyConnectEnabled && (
            connected
              ? <button className="primary" onClick={startFull} disabled={starting}>{starting ? 'starting…' : '▶ play full songs with my Spotify'}</button>
              : <button className="primary" onClick={() => connectSpotify().catch(() => toast("couldn't open Spotify — try again"))}>connect Spotify for full songs</button>
          )}
          {valid && !full && (
            <p className="muted small">
              {spotifyConnectEnabled
                ? 'Full songs need Spotify Premium and a computer browser. '
                : <>Only hearing 30-second previews? Log in at{' '}
                  <a className="underline" href="https://open.spotify.com" target="_blank" rel="noreferrer noopener">open.spotify.com</a>{' '}
                  in this browser and let this site use Spotify's sign-in. </>}
              Or <a className="underline" href={`https://open.spotify.com/${valid}`} target="_blank" rel="noreferrer noopener">open it in Spotify</a>.
            </p>
          )}
          {connected && <button className="link" onClick={disconnect}>disconnect Spotify</button>}
        </div>
      )}
    </aside>
  )
}
