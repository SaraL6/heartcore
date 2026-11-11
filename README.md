# heartcore ♥

A cozy, nostalgic place to heart and collect images — a love letter to the
image-bookmarking sites of the Tumblr era (2010–2014).

**No ads, no tracking, no algorithm deciding what you see.** Friends' hearts
show up in the order they happened, and that's it.

## What's in it

- **Discover** — endless scroll of real photos from [Openverse](https://openverse.org)
  (openly licensed Flickr photos, no API key needed), with search and tags
- **Hearts** — heart anything; double-click an open image for the big heart
- **Collections** — save images into as many collections as you like
- **Post** — upload a jpg/png/gif or paste an image link, with caption and tags
- **Friends** — follow people, see what they heart, browse what everyone is hearting
- **Profiles** — hearts, posts, collections, bio, follower counts
- **Your canvas** — pick any image as your profile cover, and your theme is
  what visitors see when they open your page
- **Themes** — pastel, soft grunge, galaxy, vintage and daydream
- **Take it with you** — "download everything" saves all your hearts, posts
  and collections as one web page, so they can never vanish
- **Human-made only** — no AI-generated images, and a report reason for them
- **No numbers if you like** — hide heart counts everywhere with one click
- **Safety** — report button, moderation queue, takedowns, account deletion

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

## Before you open a copy to the public

The code is MIT-licensed and comes with no warranty. Running a public site
where strangers post images is a different thing from publishing code: the
person running it is responsible for what is on it. The site ships with the
basics — a report button on every image (no account needed), a moderation
page, rules, terms, privacy and copyright pages, an age-and-terms checkbox at
sign-up, and account deletion — but some things only the operator can do:

1. **Make yourself a moderator.** After signing up, run in the Supabase SQL editor:
   `insert into public.admins select id from public.profiles where username = 'yourname';`
   A "moderation" link then appears in the footer. Check it often.
2. **Set `VITE_CONTACT_EMAIL`** to an address made for the site. It appears on
   the policy pages and is how takedown requests reach you.
3. **Act on reports quickly**, especially copyright ones. If you are in the
   US, register a DMCA agent with the Copyright Office (about $6) — that is
   what gives a site legal protection for things its users post.
4. **Know the rule for the worst case.** Sexual images of minors must be
   removed at once and reported (in the US, to NCMEC's CyberTipline); do not
   keep copies.
5. **Have the policy pages reviewed** (`src/legal.tsx`). They are plain-language
   starting points, not legal advice, and privacy law differs by country.
6. **Keep it non-commercial, or set `VITE_COMMERCIAL_LICENSES_ONLY=true`.**
   Many Discover photos are licensed for non-commercial use only.
7. **Use your own name and look.** Don't present a copy as a revival of any
   existing or former site, or use another site's name, logo or domain.

## Deploy

`npm run build` makes a static site in `dist/` — host it on Vercel, Netlify,
Cloudflare Pages or GitHub Pages. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as build environment variables there.

## How it's put together

| File | What it does |
| --- | --- |
| `src/images.ts`, `src/openverse.ts`, `src/unsplash.ts` | Image search: Unsplash if `VITE_UNSPLASH_ACCESS_KEY` is set, otherwise Openverse. |
| `src/store.ts` | Signed-in state: who you are, what you've hearted, who you follow. |
| `src/api.ts` | Every other database read and write. |
| `src/App.tsx`, `src/components.tsx` | Pages and building blocks. |
| `src/legal.tsx` | Rules, terms, privacy and copyright pages. |
| `supabase/schema.sql` | Tables, access rules, triggers, storage, reports and moderation. |

Photos shown in Discover belong to their creators and are shared under
Creative Commons licenses; each image links back to its original and license.

Built with Vite, React, TypeScript and Supabase.
