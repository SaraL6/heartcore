# heartcore ♥

A cozy, nostalgic place to heart and collect images — a love letter to the
image-bookmarking sites of the Tumblr era (2010–2014).

## What's in it

- **Discover** — endless scroll of real photos from [Openverse](https://openverse.org)
  (openly licensed Flickr photos, no API key needed), with search and tags
- **Hearts** — heart anything; double-click an open image for the big heart
- **Collections** — save images into as many collections as you like
- **Post** — upload a jpg/png/gif or paste an image link, with caption and tags
- **Friends** — follow people, see what they heart, browse what everyone is hearting
- **Profiles** — hearts, posts, collections, bio, follower counts
- **Themes** — pastel, soft grunge and galaxy

Without a Supabase project the site still works as a browse-only gallery.
Hearts, collections, posting and following need accounts — set them up below.

## Run it

```bash
npm install
npm run dev
```

## Set up accounts (Supabase, about 5 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard open **SQL Editor**, paste the whole of
   [`supabase/schema.sql`](supabase/schema.sql) and press **Run**. This creates
   the tables, the access rules and the storage bucket for uploads.
3. Open **Project Settings → API** and copy the **Project URL** and the
   **anon public** key.
4. Copy `.env.example` to `.env.local`, paste the two values in, and restart
   `npm run dev`.

Good to know:

- New Supabase projects ask people to confirm their email before signing in.
  While you're testing with friends you can turn that off under
  **Authentication → Sign In / Providers → Email → Confirm email**.
- The built-in Supabase email sender only allows a few emails per hour. For a
  real launch, connect your own email provider under **Authentication → SMTP**.
- When you deploy, add your site's address under
  **Authentication → URL Configuration** so confirmation links come back to it.
- The anon key is safe to ship in the site. Never put the `service_role` key
  in `.env.local` or anywhere in this repo.

## Deploy

`npm run build` makes a static site in `dist/` — host it on Vercel, Netlify,
Cloudflare Pages or GitHub Pages. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as build environment variables there.

## How it's put together

| File | What it does |
| --- | --- |
| `src/openverse.ts` | Image search. Swap or add another image API here. |
| `src/store.ts` | Signed-in state: who you are, what you've hearted, who you follow. |
| `src/api.ts` | Every other database read and write. |
| `src/App.tsx`, `src/components.tsx` | Pages and building blocks. |
| `supabase/schema.sql` | Tables, access rules, triggers and storage. |

Photos shown in Discover belong to their creators and are shared under
Creative Commons licenses; each image links back to its original and license.

Built with Vite, React, TypeScript and Supabase.
