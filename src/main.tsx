import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { finishSpotifyLogin } from './spotify'
import { toast } from './store'
import './styles.css'

const render = () => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

// When Spotify sends someone back after connecting, finish that first.
finishSpotifyLogin().then((result) => {
  render()
  if (result === 'connected') toast('Spotify connected ♫ open the player and press play')
  if (result === 'failed') toast("couldn't connect Spotify — try again")
}, render)
