# User Website

The customer-facing storefront. Plain HTML/CSS/JS, no build step, no
framework — every page loads `assets/css/style.css`,
`assets/css/responsive.css`, and `assets/js/app.js`, and talks to
`cloudflare-api` for every piece of real data.

> **Status: Phase 1 of 2.** Browsing, search, and accounts (login,
> signup, forgot password) are fully working. Cart, checkout,
> payment, order tracking, profile, and writing reviews are coming
> next, alongside the Cart/Order/Payment APIs they depend on. "Add to
> cart" and "Buy now" currently show a friendly "coming soon" message
> once you're logged in (and send you to `/login/` first if you're
> not — that part already works).

## The only thing you need to edit

Open `assets/js/font.js` and set:

```js
export const API_BASE_URL = 'https://your-worker-name.your-subdomain.workers.dev';
```

to whatever URL your deployed `cloudflare-api` gives you. Nothing
else in this project needs to change to connect the two.

## Running it locally

No build step, so any static file server works:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed URL. Because pages live in folders (e.g.
`/category/index.html` served at `/category/`), a plain "open the
HTML file" double-click won't route correctly — use a local server.

## Deploying it

Since this is just static files, host it anywhere: Cloudflare Pages,
GitHub Pages, Netlify, Vercel, or your own server. A few options,
roughly ordered from simplest to most flexible:

- **Cloudflare Pages** — connect the same GitHub repo, set the
  **Build output directory** to `user-website` (or wherever this
  folder lives in your repo), no build command needed.
- **GitHub Pages** — enable Pages on the repo, point it at this
  folder.
- Any static host that can serve a folder of files.

## Folder structure

```
user-website/
├── index.html          # Home
├── category/index.html # Category browse + product grid
├── product/index.html  # Product detail (?slug=...)
├── search/index.html   # Live search
├── login/index.html
├── signup/index.html
├── forget/index.html   # Forgot password
├── about/index.html
├── contact/index.html
├── robots.txt
├── sitemap.xml
└── assets/
    ├── css/
    │   ├── style.css        # All component + page styles
    │   └── responsive.css   # Tablet (768px+) and desktop (1024px+) overrides
    └── js/
        ├── font.js  # Configuration only — API_BASE_URL, site name, currency
        └── app.js   # All logic for every page (only 2 JS files, per spec)
```

## Design notes worth knowing

- **Dark/light mode** is automatic on first visit (follows your
  device setting) and toggleable via the 🌓 button in the header;
  the choice is remembered in `localStorage`.
- **Pages are plain multi-page HTML**, not a single-page app — each
  folder's `index.html` is a real page a browser (and a search
  engine) can load directly. `app.js` figures out which page it's on
  via `<body data-page="...">` and runs only that page's logic.
- **Images use native `loading="lazy"`** — no extra library needed.
- **The sample products/categories** you'll see after running
  `seed.sql` (see the `cloudflare-api` README) are placeholders —
  swap them for your real catalog once the Admin Panel is built.
