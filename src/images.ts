import { searchOpenverse } from './openverse'
import { searchUnsplash, unsplashEnabled } from './unsplash'

// Where Discover gets its pictures: Unsplash if a key is configured, otherwise
// Openverse (which needs no key).
export const searchImages = unsplashEnabled ? searchUnsplash : searchOpenverse
export const LIBRARY = unsplashEnabled
  ? { name: 'Unsplash', url: 'https://unsplash.com/?utm_source=heartcore&utm_medium=referral', note: 'shared by their photographers' }
  : { name: 'Openverse', url: 'https://openverse.org', note: 'shared by their creators under Creative Commons licenses' }
