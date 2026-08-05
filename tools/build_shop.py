#!/usr/bin/env python3
"""Render The Cupboard from tools/shop-catalog.json.

    python tools/build_shop.py

Writes:
    public/shop/index.html
    public/shop/<slug>.html            (one per product)
    tools/out/facebook-catalog.tsv     (Meta catalog feed)

Both outputs read the same price, title and description, so a page can never
disagree with the catalog. Meta's crawler compares the two before approving an
item, and a mismatch disables the product.

TSV rather than CSV on purpose: several descriptions contain commas, and an
unquoted comma is the single most common cause of a broken Meta feed import.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "shop-catalog.json"
PAGES = ROOT / "public" / "shop"
FEED = ROOT / "tools" / "out" / "facebook-catalog.tsv"

FONTS = "https://fonts.bunny.net/css?family=archivo:500,600|dm-serif-display:400,400i|spectral:300,400,500,600"

E = html.escape


def head(cfg: dict, *, title: str, desc: str, path: str, og_image: str | None = None) -> str:
    robots = "index, follow" if cfg["status"] == "live" else "noindex, nofollow"
    og = ""
    if og_image:
        og = f'\n  <meta property="og:image" content="{cfg["site"]}{og_image}">'
    return f"""<!DOCTYPE html>
<html lang="en" dir="ltr">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{E(title)}</title>
  <meta name="description" content="{E(desc)}">
  <meta name="robots" content="{robots}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="canonical" href="{cfg['site']}{path}">

  <meta property="og:type" content="website">
  <meta property="og:url" content="{cfg['site']}{path}">
  <meta property="og:title" content="{E(title)}">
  <meta property="og:description" content="{E(desc)}">{og}

  <link rel="icon" href="/assets/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">

  <link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
  <link rel="stylesheet" href="{FONTS}">
  <link rel="stylesheet" href="/css/shop.v1.css">
</head>

<body>
  <a class="skip" href="#main">Skip to content</a>
"""


def masthead(current: str) -> str:
    def mark(name: str) -> str:
        return ' aria-current="page"' if name == current else ""
    return f"""
  <header class="masthead">
    <div class="wrap">
      <a class="brand" href="/" aria-label="The Vital Years, home">
        <span class="seal" aria-hidden="true">V</span>
        <span>
          <span class="wordmark">The Vital Years</span>
          <span class="kicker">Letters on aging well &middot; by Giulia Batista</span>
        </span>
      </a>
      <nav class="mast-nav" aria-label="Primary">
        <a href="/"{mark('journal')}>The Journal</a>
        <a href="/shop"{mark('shop')}>The Cupboard</a>
        <a href="/shop/shipping-returns"{mark('policy')}>Shipping &amp; Returns</a>
      </nav>
    </div>
  </header>
"""


def footer(cfg: dict) -> str:
    return f"""
  <footer>
    <div class="wrap">
      <p class="disclaimer">
        <strong>A note on what this journal is, and is not.</strong> The Vital Years is
        a personal journal of opinion and lived experience. Giulia Batista is not a
        physician, and nothing here is medical advice, diagnosis, or treatment. The
        items in The Cupboard are ordinary household goods. None of them is a medical
        device, and none of them is offered to diagnose, treat, cure or prevent any
        condition. Always talk with your own doctor before changing anything about your
        health, your medicines, or your routine.
      </p>
      <p class="disclaimer">
        <strong>About the things we sell.</strong> Every item here is described by its
        specifications and nothing more. Prices are in US dollars and include no taxes,
        which are calculated at checkout where they apply. We ship within the United
        States. Returns are accepted for {cfg['returns_days']} days, unused and in the
        original packaging. Write to
        <a href="mailto:{cfg['contact_email']}">{cfg['contact_email']}</a> and a person
        will answer.
      </p>
      <div class="colophon">
        <span>&copy; 2026 The Vital Years &middot; Giulia Batista. Written with care in the United States.</span>
        <nav aria-label="Footer">
          <a href="/shop">The Cupboard</a>
          <a href="/shop/shipping-returns">Shipping &amp; Returns</a>
          <a href="/privacy-policy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:{cfg['contact_email']}">Contact</a>
        </nav>
      </div>
    </div>
  </footer>

</body>

</html>
"""


def jsonld(cfg: dict, p: dict) -> str:
    """Schema.org Product. Meta's crawler reads this for price/availability parity."""
    data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p["name"],
        "sku": p["id"],
        "description": p["description"],
        "brand": {"@type": "Brand", "name": cfg["brand"]},
        "image": [cfg["site"] + i for i in p["images"]],
        "offers": {
            "@type": "Offer",
            "url": f"{cfg['site']}/shop/{p['slug']}",
            "price": p["price"],
            "priceCurrency": cfg["currency"],
            "itemCondition": "https://schema.org/NewCondition",
            "availability": "https://schema.org/InStock"
            if p["availability"] == "in stock"
            else "https://schema.org/OutOfStock",
        },
    }
    return (
        '  <script type="application/ld+json">\n'
        + json.dumps(data, indent=2, ensure_ascii=False)
        + "\n  </script>\n"
    )


def gallery(p: dict) -> str:
    thumbs = "".join(
        f"""
        <button type="button" data-src="{img}" data-alt="{E(alt)}"
                aria-current="{'true' if i == 0 else 'false'}"
                aria-label="Show image {i + 1} of {len(p['images'])}">
          <img src="{img}" alt="" width="1024" height="1024" loading="lazy" decoding="async">
        </button>"""
        for i, (img, alt) in enumerate(zip(p["images"], p["alt"]))
    )
    return f"""
      <div class="gallery reveal d1">
        <div class="frame">
          <img id="shot" src="{p['images'][0]}" alt="{E(p['alt'][0])}"
               width="1024" height="1024" fetchpriority="high" decoding="async">
        </div>
        <div class="thumbs" role="group" aria-label="Product images">{thumbs}
        </div>
      </div>
"""


def buybox(cfg: dict, p: dict) -> str:
    v = p.get("variants")
    opts = ""
    if v:
        radios = "".join(
            f"""
            <label><input type="radio" name="size" value="{E(o['value'])}"
                   data-id="{o['id']}"{' checked' if i == 0 else ''}><span>{E(o['label'])}</span></label>"""
            for i, o in enumerate(v["options"])
        )
        opts = f"""
        <fieldset class="opts">
          <legend>{E(v['attribute'])}</legend>
          <div class="sizes">{radios}
          </div>
        </fieldset>
"""

    live = cfg["status"] == "live" and p.get("checkout_url")
    if live:
        btn = f'<a class="btn-buy" href="{p["checkout_url"]}" style="text-align:center;text-decoration:none">Add to cart &mdash; ${p["price"]}</a>'
    else:
        btn = (
            '<button class="btn-buy" type="button" disabled>Not yet available</button>\n'
            '        <p style="font-size:.86rem;color:var(--ink-mute);margin:12px 0 0;text-align:center">'
            "This item is still being sourced. Write to us if you would like a note when it lands.</p>"
        )

    ship_free = float(p["price"]) >= float(cfg["free_shipping_over"])
    ship = (
        "<strong>Free shipping.</strong> Within the United States, 3 to 6 business days."
        if ship_free
        else f"<strong>Flat $5.95 shipping,</strong> free over ${cfg['free_shipping_over']}. Within the United States, 3 to 6 business days."
    )

    return f"""
      <div class="buybox reveal d2">
        <p class="eyebrow">{E(p['category_label'])}</p>
        <h1>{E(p['name'])}</h1>
        <p class="deck">{E(p['deck'])}</p>

        <div class="price-tag">
          <span class="amount">${p['price']}</span>
          <span class="cur">{cfg['currency']}</span>
        </div>
        <p class="stock">In stock &middot; ships from the United States</p>
{opts}        {btn}

        <ul class="assurance">
          <li><span class="mark">&#8212;</span><span>{ship}</span></li>
          <li><span class="mark">&#8212;</span><span><strong>{cfg['returns_days']}-day returns.</strong> Unused and in the original packaging, no explanation needed.</span></li>
          <li><span class="mark">&#8212;</span><span><strong>A person answers.</strong> Write to <a href="mailto:{cfg['contact_email']}">{cfg['contact_email']}</a> and you will hear back.</span></li>
        </ul>
      </div>
"""


def product_page(cfg: dict, p: dict) -> str:
    specs = "".join(
        f"          <tr><th scope=\"row\">{E(k)}</th><td>{E(val)}</td></tr>\n"
        for k, val in p["specs"]
    )
    inbox = "".join(f"            <li>{E(i)}</li>\n" for i in p["in_box"])
    note = "".join(f"          <p>{E(par)}</p>\n" for par in p["note"])
    faq = "".join(
        f"""        <details>
          <summary>{E(q)}</summary>
          <p>{E(a)}</p>
        </details>
"""
        for q, a in p["faq"]
    )

    title = f"{p['name']} — The Cupboard | The Vital Years"
    return (
        head(cfg, title=title, desc=p["deck"], path=f"/shop/{p['slug']}", og_image=p["images"][0])
        + jsonld(cfg, p)
        + masthead("shop")
        + f"""
  <main id="main">
    <div class="wrap">
      <p class="crumbs">
        <a href="/">The Vital Years</a><span>/</span><a href="/shop">The Cupboard</a><span>/</span>{E(p['name'])}
      </p>
    </div>

    <section class="product">
      <div class="wrap">
{gallery(p)}{buybox(cfg, p)}      </div>
    </section>

    <div class="wrap"><div class="rule-dot"><span>Why it is in the cupboard</span></div></div>

    <section class="note">
      <div class="wrap">
        <div class="aside">
          <p class="eyebrow">From Giulia</p>
          <p style="margin-top:12px">I only put a thing on this shelf after I have lived
          with it long enough to know what annoys me about it.</p>
        </div>
        <div class="body">
{note}          <p class="sign">Giulia<small>Giulia Batista, editor</small></p>
        </div>
      </div>
    </section>

    <div class="wrap"><div class="rule-dot"><span>The plain details</span></div></div>

    <section class="specs">
      <div class="wrap grid">
        <table class="spec-table">
          <caption>Specifications</caption>
          <tbody>
{specs}          </tbody>
        </table>
        <div class="inbox">
          <h3>In the box</h3>
          <ul>
{inbox}          </ul>
          <p style="font-size:.88rem;color:var(--ink-mute);margin:16px 0 0">
            Item {E(p['id'])} &middot; Condition: new &middot; Sold and shipped by The Vital Years.
          </p>
        </div>
      </div>
    </section>

    <div class="wrap"><div class="rule-dot"><span>Questions readers ask</span></div></div>

    <section class="faq">
      <div class="wrap">
{faq}      </div>
    </section>
  </main>
"""
        + footer(cfg)
        + """
  <script>
    (function () {
      var shot = document.getElementById('shot');
      var thumbs = document.querySelectorAll('.thumbs button');
      if (!shot || !thumbs.length) return;
      thumbs.forEach(function (b) {
        b.addEventListener('click', function () {
          shot.src = b.dataset.src;
          shot.alt = b.dataset.alt;
          thumbs.forEach(function (o) { o.setAttribute('aria-current', o === b ? 'true' : 'false'); });
        });
      });
    })();
  </script>
"""
    )


def index_page(cfg: dict) -> str:
    # The shelf is three across, so the first row is above the fold on desktop —
    # lazy-loading those only delays LCP.
    cards = "".join(
        f"""
        <a class="shelf-item reveal d{min(i + 1, 5)}" href="/shop/{p['slug']}">
          <div class="shot">
            <img src="{p['images'][0]}" alt="{E(p['alt'][0])}" width="1024" height="1024"
                 loading="{'eager' if i < 3 else 'lazy'}"{' fetchpriority="high"' if i == 0 else ''} decoding="async">
          </div>
          <div class="body">
            <div class="no">{E(p['shelf_no'])}</div>
            <h2>{E(p['name'])}</h2>
            <p>{E(p['short'])}</p>
            <div class="foot">
              <span class="amount">${p['price']}</span>
              <span class="go">See the details &rarr;</span>
            </div>
          </div>
        </a>"""
        for i, p in enumerate(cfg["products"])
    )

    desc = (
        "A short shelf of ordinary household things Giulia Batista keeps in her own "
        "home: air, comfort and footing. No supplements, no medical devices, no hype."
    )
    return (
        head(cfg, title="The Cupboard — The Vital Years", desc=desc, path="/shop")
        + masthead("shop")
        + f"""
  <main id="main">
    <div class="wrap">
      <p class="crumbs"><a href="/">The Vital Years</a><span>/</span>The Cupboard</p>
    </div>

    <section class="shop-hero">
      <div class="wrap">
        <p class="eyebrow reveal d1">The cupboard</p>
        <h1 class="reveal d2">A short shelf of <em>ordinary things</em>.</h1>
        <p class="deck reveal d3">
          Readers kept asking what I actually keep in my own house, so here it is.
          Five plain household items, chosen for how they are built and nothing else.
          No supplements. No medical devices. No promises about anybody's health,
          because a slipper cannot make one and I will not pretend otherwise.
        </p>
      </div>
    </section>

    <div class="wrap"><div class="rule-dot"><span>On the shelf</span></div></div>

    <section>
      <div class="wrap">
        <div class="shelf">{cards}
        </div>
      </div>
    </section>

    <div class="wrap"><div class="rule-dot"><span>How this shelf works</span></div></div>

    <section>
      <div class="wrap">
        <div class="inbox" style="border-left-color:var(--clay)">
          <h3>Three plain rules</h3>
          <ul>
            <li>Everything is described by its specifications. If a number is on this
            site, it came off the unit itself.</li>
            <li>Nothing here treats, prevents or improves any medical condition, and
            nothing on these pages will ever suggest otherwise.</li>
            <li>{cfg['returns_days']} days to send anything back, unused and in its box,
            without writing an explanation.</li>
          </ul>
        </div>
      </div>
    </section>
  </main>
"""
        + footer(cfg)
    )


FEED_COLUMNS = [
    "id", "title", "description", "availability", "condition", "price", "link",
    "image_link", "additional_image_link", "brand", "google_product_category",
    "item_group_id", "size", "color", "gender", "age_group", "custom_label_0",
]


def feed_rows(cfg: dict) -> list[list[str]]:
    rows = []
    for p in cfg["products"]:
        base = {
            "title": p["name"],
            "description": p["description"],
            "availability": p["availability"],
            "condition": p["condition"],
            "price": f"{p['price']} {cfg['currency']}",
            "link": f"{cfg['site']}/shop/{p['slug']}",
            "image_link": cfg["site"] + p["images"][0],
            "additional_image_link": cfg["site"] + p["images"][1],
            "brand": cfg["brand"],
            "google_product_category": p["google_product_category"],
            "custom_label_0": p["category_label"],
        }
        v = p.get("variants")
        if not v:
            rows.append([{**base, "id": p["id"]}.get(c, "") for c in FEED_COLUMNS])
            continue
        # Apparel variants: one row per size, collapsed under item_group_id so the
        # shop shows one slipper instead of four.
        for o in v["options"]:
            row = {
                **base,
                "id": o["id"],
                "item_group_id": v["item_group_id"],
                "size": o["value"],
                "color": "Oatmeal",
                "gender": "unisex",
                "age_group": "adult",
            }
            rows.append([row.get(c, "") for c in FEED_COLUMNS])
    return rows


def main() -> int:
    cfg = json.loads(SRC.read_text(encoding="utf-8"))
    PAGES.mkdir(parents=True, exist_ok=True)
    FEED.parent.mkdir(parents=True, exist_ok=True)

    (PAGES / "index.html").write_text(index_page(cfg), encoding="utf-8")
    print("wrote public/shop/index.html")
    for p in cfg["products"]:
        (PAGES / f"{p['slug']}.html").write_text(product_page(cfg, p), encoding="utf-8")
        print(f"wrote public/shop/{p['slug']}.html")

    lines = ["\t".join(FEED_COLUMNS)]
    for row in feed_rows(cfg):
        assert not any("\t" in c or "\n" in c for c in row), "tab/newline in a field"
        lines.append("\t".join(row))
    FEED.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote tools/out/facebook-catalog.tsv ({len(lines) - 1} items)")

    if cfg["status"] != "live":
        print("\nstatus=draft: pages are noindex and the buy button is disabled.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
