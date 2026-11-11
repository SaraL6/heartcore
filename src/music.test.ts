import { describe, expect, it } from 'vitest'
import { MUSIC_REF, parseSpotify } from './music'

describe('parseSpotify', () => {
  it('reads share links for playlists, albums, songs and artists', () => {
    expect(parseSpotify('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123')).toBe('playlist/37i9dQZF1DXcBWIGoYBM5M')
    expect(parseSpotify('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')).toBe('album/4aawyAB9vmqN3uQ7FjRGTy')
    expect(parseSpotify('  https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl  ')).toBe('track/11dFghVXANMlKmJXsNCbNl')
  })
  it('reads localised links, embed links and spotify: addresses', () => {
    expect(parseSpotify('https://open.spotify.com/intl-fr/track/11dFghVXANMlKmJXsNCbNl')).toBe('track/11dFghVXANMlKmJXsNCbNl')
    expect(parseSpotify('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe('playlist/37i9dQZF1DXcBWIGoYBM5M')
    expect(parseSpotify('spotify:artist:0TnOYISbd1XYRBk9myaseg')).toBe('artist/0TnOYISbd1XYRBk9myaseg')
  })
  it('refuses anything that is not a Spotify item', () => {
    for (const bad of ['', 'hello', 'https://evil.example/playlist/37i9dQZF1DXcBWIGoYBM5M', 'https://open.spotify.com/user/someone',
      'https://open.spotify.com/playlist/short', 'javascript:alert(1)']) {
      expect(parseSpotify(bad)).toBeNull()
    }
  })
  it('only ever produces values the player and database accept', () => {
    expect(MUSIC_REF.test(parseSpotify('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')!)).toBe(true)
    expect(MUSIC_REF.test('playlist/../../evil')).toBe(false)
    expect(MUSIC_REF.test('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')).toBe(false)
  })
})
