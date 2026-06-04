# The Vital Years — laappflex.shop (act08/pag01)

Cloudflare Pages project for the Facebook page **Giulia Batista**. The old
**AppFlex** (Spanish joint-health, Hotmart) funnel was discontinued; the page +
domain + shell were repurposed to run **two unrelated BuyGoods supplement
offers** in English for a US audience, on the same domain, mirroring the working
tracking stack of `clients/act05/pag01`.

Production domain: **[laappflex.shop](https://laappflex.shop)**

## The two products

| Product | Theme | Landing (cloaked) | Cloak Function |
|---|---|---|---|
| **BreathEase X** (+ CardioEase X) | Lungs / COPD | `/breath-report` | `functions/breath-report.js` |
| **Nervaline** | Neuropathy | `/nerve-report` | `functions/nerve-report.js` |

Source VSLs (in the client folder): `roteiro-vsl-lungs.md`, `roteiro-vsl-neuropatia.md`.
Avatars: `avatar-lungs.md`, `avatar-neuropatia.md`. Page voice: `giulia-voice.md`.

## Structure

```
website/
├── wrangler.jsonc            # Pages config (name act08-pag01-site, D1 act08-pag01-db, build output ./public)
├── README.md
├── TRACKING-SETUP.md         # step-by-step go-live (D1, secrets, 2 pixels, BuyGoods)
├── config/products.js        # codename allowlist + per-product pixel map (META_PIXEL_BY_CODENAME)
├── migrations/               # D1 schema 0001..0019 (sessions, checkout_sessions, event_log, purchase_log, ...)
├── functions/                # Cloudflare Pages Functions (edge)
│   ├── _middleware.js        # capture session, fbp/fbc/gclid/UTMs, 400-day cookies → D1 sessions
│   ├── _bots.js              # crawler classification (BLOCK=Google/AdsBot/SEO/AI → 403; META → index)
│   ├── _pixels.js            # per-product pixel resolution BY LANDING SLUG (shared)
│   ├── breath-report.js      # cloak for /breath-report
│   ├── nerve-report.js       # cloak for /nerve-report
│   ├── tracker.js            # POST /tracker (browser conversions → Meta CAPI + GA4, per-product pixel by slug)
│   ├── checkout-session.js   # POST /checkout-session (attribution snapshot by subid → D1)
│   ├── p/checkout.js         # GET /p/checkout (server InitiateCheckout pixel, per-product by slug)
│   ├── admin/replay.js       # replay missed Meta purchases (respects allowlist)
│   └── webhook/
│       ├── _core.js          # platform-agnostic processPurchase + resolveMetaPixel (Purchase pixel BY CODENAME)
│       ├── _utils.js         # guardSlug
│       ├── _refund_core.js   # refund handling
│       └── buygoods/[slug].js# BuyGoods postback adapter (one endpoint, both products)
└── public/                   # static (Pages build output)
    ├── index.html            # institutional white page (English, product-free, indexable) — Giulia Batista
    ├── breath-report.html    # BreathEase landing placeholder (pixel + attribution wired; advertorial TBD)
    ├── nerve-report.html     # Nervaline landing placeholder
    ├── privacy-policy.html / terms.html / 404.html
    ├── robots.txt / sitemap.xml / _headers / _redirects
    ├── assets/               # favicons + (css/, images/ reserved)
    └── js/                   # checkout-tracker.js, protect.js (used by the advertorial fill)
```

## How it works (tracking)

Mirrors `act05/pag01`: BuyGoods + Meta CAPI + Cloudflare D1, with a User-Agent
cloak on the two landings (Meta crawlers → the white index; Google/AdsBot → 403;
real visitors → the landing). The `subid` is the golden thread: generated on the
landing, persisted to `checkout_sessions`, threaded into the BuyGoods checkout,
and returned by the postback so the Purchase joins it in D1.

**Two products, two Meta pixels** (client decision): one pixel per product. The
`Purchase` (webhook) is routed by `{PRODUCT_CODENAME}` prefix; PageView /
InitiateCheckout are routed by landing slug. See `TRACKING-SETUP.md` for the env
vars and the placeholders to fill before go-live.

## Conventions

The institutional `index.html` is the verifiable brand face for Meta/Google: it
**never** mentions a product, supplement, VSL, the VSL personas, or a checkout.
All selling lives on the cloaked `/breath-report` and `/nerve-report` landings.
Medical disclaimer on every page. Fonts via `fonts.bunny.net` (GDPR-friendly).

## Deploy

This `website/` is a clone of `Finodocodigo/landing-appflex`. The old AppFlex
site deployed flat (build output = root); this layout uses `public/`, so the
Pages project's **Build output directory must be set to `public`** (or a fresh
`act08-pag01-site` project created). Then `wrangler pages deploy public
--project-name=act08-pag01-site`. Full steps in `TRACKING-SETUP.md`. Do not
push/deploy without explicit authorization.
