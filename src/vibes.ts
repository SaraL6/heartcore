// The topics Discover offers, and how each is searched in each library, tuned
// for the Tumblr / We Heart It era: tall photos, film, fairy lights, dusk.

export const TOPICS = [
  'aesthetic', 'pastel', 'soft grunge', 'fairy lights', 'polaroid', 'film', 'sunsets', 'indie', 'night city',
  'coffee', 'roadtrip', 'vintage', 'streetwear', 'sneakers', 'skate', 'cars', 'vinyl', 'architecture',
  'interiors', 'tattoos', 'y2k', 'cats',
]

/** The home feed opens on one of these each visit. */
export const HOME = ['aesthetic', 'pastel', 'soft grunge', 'fairy lights', 'film', 'polaroid', 'sunsets', 'indie', 'night city']

// Unsplash is modern stock-style photography; nudging the search toward film
// and mood words brings back the era's look.
const NEW_QUERY: Record<string, string> = {
  aesthetic: 'aesthetic film', pastel: 'pastel aesthetic', 'soft grunge': 'grunge aesthetic', 'fairy lights': 'fairy lights bokeh',
  polaroid: 'polaroid', film: '35mm film', sunsets: 'sunset film', indie: 'indie aesthetic', 'night city': 'city lights night',
  coffee: 'coffee aesthetic', roadtrip: 'road trip film', vintage: 'vintage film', skate: 'skateboarding film',
  cars: 'vintage car', vinyl: 'vinyl records', architecture: 'architecture film', interiors: 'cozy interior',
  tattoos: 'tattoo', y2k: 'y2k aesthetic', cats: 'cat aesthetic',
}

// The free Flickr library matches every word and takes words literally
// ("indie" finds Indianapolis), so some topics rotate through a few short
// searches as you scroll.
const OLD_QUERY: Record<string, string[]> = {
  aesthetic: ['dreamy', 'bokeh', 'pastel'], 'soft grunge': ['doc martens', 'plaid flannel', 'grunge'],
  indie: ['indie rock', 'concert', 'record store'], film: ['35mm', 'film'], sunsets: ['sunset'],
  'night city': ['city lights', 'neon'], skate: ['skateboarding'], roadtrip: ['road trip'],
}

export const newQuery = (q: string) => NEW_QUERY[q.toLowerCase()] ?? q

/** Which search, and which page of it, to use for page `page` of a topic. */
export function oldQuery(q: string, page: number): { q: string; page: number } {
  const list = OLD_QUERY[q.toLowerCase()] ?? [q]
  return { q: list[(page - 1) % list.length], page: Math.floor((page - 1) / list.length) + 1 }
}
