import { describe, expect, it } from 'vitest'
import { challengeFor, playBody } from './spotify'

describe('Spotify sign-in', () => {
  it('builds the PKCE challenge from the verifier (RFC 7636 example)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('playBody', () => {
  it('plays songs and episodes directly', () => {
    expect(playBody('track/11dFghVXANMlKmJXsNCbNl')).toEqual({ uris: ['spotify:track:11dFghVXANMlKmJXsNCbNl'] })
    expect(playBody('episode/512ojhOuo1ktJprKbVcKyQ')).toEqual({ uris: ['spotify:episode:512ojhOuo1ktJprKbVcKyQ'] })
  })
  it('plays playlists, albums and artists as a whole', () => {
    expect(playBody('playlist/37i9dQZF1DXcBWIGoYBM5M')).toEqual({ context_uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' })
    expect(playBody('artist/0TnOYISbd1XYRBk9myaseg')).toEqual({ context_uri: 'spotify:artist:0TnOYISbd1XYRBk9myaseg' })
  })
})
