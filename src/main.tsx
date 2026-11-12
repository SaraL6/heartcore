import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { finishSpotifyLogin } from './spotify'
import { toast } from './store'
import './styles.css'

// Sign-in emails send people back with the outcome after the #. Supabase
// reads the successful ones itself; a failed one (an expired or reused link)
// is ours to explain.
const authReturn = new URLSearchParams(location.hash.slice(1))
if (authReturn.has('error_description') || authReturn.has('error_code')) {
  const expired = authReturn.get('error_code') === 'otp_expired'
  history.replaceState(null, '', location.pathname + '#/')
  setTimeout(() => toast(expired ? 'that email link has expired or was already used — ask for a new one' : `that email link didn't work: ${authReturn.get('error_description') ?? 'try again'}`), 300)
}

const render = () => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// When Spotify sends someone back after connecting, finish that first.
finishSpotifyLogin().then((result) => {
  render()
  if (result === 'connected') toast('Spotify connected ♫ open the player and press play')
  if (result === 'failed') toast("couldn't connect Spotify — try again")
}, render)
