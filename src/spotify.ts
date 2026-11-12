// "Connect Spotify": full songs for Premium listeners, played in the page
// through Spotify's Web Playback SDK. Sign-in uses Authorization Code with
// PKCE, so there is no secret anywhere. The sign-in token stays in this
// browser and is only ever sent to Spotify.
//
// Spotify only lets unapproved apps connect people the app's owner has added
// by hand in the Spotify developer dashboard. Everyone else keeps the
// embedded player with previews.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
export const spotifyConnectEnabled = !!CLIENT_ID
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state'
const TOKENS = 'heartcore:spotify'
const PENDING = 'heartcore:spotify-login'

type Tokens = { access: string; refresh: string; expires: number }

const redirectUri = () => location.origin + location.pathname

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function challengeFor(verifier: string) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
}
function randomString(length: number) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return b64url(bytes).slice(0, length)
}

function load(): Tokens | null {
  try { return JSON.parse(localStorage.getItem(TOKENS) ?? 'null') } catch { return null }
}
function save(t: Tokens) {
  try { localStorage.setItem(TOKENS, JSON.stringify(t)) } catch { /* private mode: lasts for this page only */ }
}
export const isSpotifyConnected = () => !!load()
export function disconnectSpotify() {
  try { localStorage.removeItem(TOKENS) } catch { /* nothing stored */ }
}

/** Sends the visitor to Spotify to approve heartcore, then back here. */
export async function connectSpotify() {
  const verifier = randomString(64)
  const state = randomString(16)
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state, back: location.hash }))
  const u = new URL('https://accounts.spotify.com/authorize')
  u.search = new URLSearchParams({
    client_id: CLIENT_ID!, response_type: 'code', redirect_uri: redirectUri(), scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: await challengeFor(verifier), state,
  }).toString()
  location.assign(u.toString())
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...params }),
  })
  if (!res.ok) throw new Error(`Spotify sign-in failed (${res.status})`)
  const d = await res.json()
  return { access: d.access_token, refresh: d.refresh_token ?? params.refresh_token, expires: Date.now() + (d.expires_in - 60) * 1000 }
}

/**
 * Finishes a sign-in when Spotify sends the visitor back with ?code=…
 * Returns null when this page load is not a return from Spotify.
 */
export async function finishSpotifyLogin(): Promise<'connected' | 'cancelled' | 'failed' | null> {
  const q = new URLSearchParams(location.search)
  if (!q.has('code') && !q.has('error')) return null
  let pending: { verifier: string; state: string; back: string } | null = null
  try { pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null'); sessionStorage.removeItem(PENDING) } catch { /* treat as cancelled */ }
  history.replaceState(null, '', location.pathname + (pending?.back ?? location.hash))
  if (!pending || q.get('error') || q.get('state') !== pending.state || !CLIENT_ID) return 'cancelled'
  try {
    save(await tokenRequest({ grant_type: 'authorization_code', code: q.get('code')!, redirect_uri: redirectUri(), code_verifier: pending.verifier }))
    return 'connected'
  } catch (e) {
    console.error(e)
    return 'failed'
  }
}

/** A current access token, refreshed when needed; null when not connected. */
export async function accessToken(): Promise<string | null> {
  const t = load()
  if (!t) return null
  if (Date.now() < t.expires) return t.access
  try {
    const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
    save(fresh)
    return fresh.access
  } catch {
    disconnectSpotify()
    return null
  }
}

/** What to ask Spotify to play for a "type/id" reference. */
export function playBody(ref: string): { uris: string[] } | { context_uri: string } {
  const [type, id] = ref.split('/')
  return type === 'track' || type === 'episode' ? { uris: [`spotify:${type}:${id}`] } : { context_uri: `spotify:${type}:${id}` }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type NowPlaying = { title: string; artist: string; art?: string; paused: boolean }
export type FullPlayer = { player: any; deviceId: string }

let sdk: Promise<void> | null = null
function loadSdk() {
  sdk ??= new Promise<void>((resolve, reject) => {
    ;(window as any).onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://sdk.scdn.co/spotify-player.js'
    s.async = true
    s.onerror = () => { sdk = null; reject(new Error("couldn't load Spotify — check your connection")) }
    document.head.appendChild(s)
  })
  return sdk
}

/** Starts a Spotify player inside this page. Call from a click, so the browser allows sound. */
export async function startPlayer(onState: (s: NowPlaying | null) => void, onProblem: (message: string) => void): Promise<FullPlayer> {
  await loadSdk()
  const player = new (window as any).Spotify.Player({
    name: 'heartcore',
    volume: 0.7,
    getOAuthToken: (cb: (t: string) => void) => { accessToken().then((t) => (t ? cb(t) : onProblem('connect Spotify again'))) },
  })
  player.addListener('player_state_changed', (st: any) => {
    const t = st?.track_window?.current_track
    onState(t ? { title: t.name, artist: (t.artists ?? []).map((a: any) => a.name).join(', '), art: t.album?.images?.[0]?.url, paused: !!st.paused } : null)
  })
  player.addListener('account_error', () => onProblem('full songs need Spotify Premium, so this plays previews'))
  player.addListener('initialization_error', () => onProblem("this browser can't play full songs from Spotify, so this plays previews"))
  player.addListener('authentication_error', () => { disconnectSpotify(); onProblem('your Spotify connection expired — connect again') })
  const deviceId = await new Promise<string>((resolve, reject) => {
    player.addListener('ready', ({ device_id }: { device_id: string }) => resolve(device_id))
    player.connect().then((ok: boolean) => { if (!ok) reject(new Error("couldn't start the Spotify player")) })
    setTimeout(() => reject(new Error("Spotify didn't answer — try again")), 15_000)
  })
  return { player, deviceId }
}

/** Plays a "type/id" on the in-page player. */
export async function playOn(deviceId: string, ref: string) {
  const token = await accessToken()
  if (!token) throw new Error('connect Spotify again')
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(playBody(ref)),
  })
  if (res.status === 403) throw new Error('full songs need Spotify Premium, so this plays previews')
  if (!res.ok) throw new Error(`Spotify answered with an error (${res.status})`)
}
