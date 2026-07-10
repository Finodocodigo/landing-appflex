/**
 * Protection layer for the /breath-report-c landing (Cloudflare Pages Function).
 * BreathEase X (lungs) — A/B VSL test variant C. Identical cloak/tracking/pixel
 * as /breath-report; only the VSL video on the page differs. Same product, same
 * Meta pixel (META_PIXEL_ID_BREATH) so both variants attribute to one campaign.
 *
 * The project's index page is the compliant "white" page and is NOT touched.
 * This function runs ONLY on the slug (file-based routing maps it to
 * /breath-report-c) and decides what each visitor receives:
 *
 *   - Meta crawlers (facebookexternalhit, meta-externalagent, ...) -> the INDEX content (cloak)
 *   - Search + Google Ads crawlers (Googlebot, AdsBot-Google, ...)  -> 403
 *   - Real visitor                                                  -> the landing itself,
 *       with a CSP loose enough for the video player + Tailwind, and X-Robots-Tag noindex.
 *
 * Project specifics:
 *   - AdsBot-Google is BLOCKED on purpose: Google traffic must point at the
 *     index, never at this slug.
 *   - Tracking flow (Meta pixel + /tracker + /checkout-session) ships now;
 *     the SLUG_CSP below also whitelists the Meta pixel origins.
 *
 * Crawler regexes (BLOCK / META) and NOINDEX live in ./_bots.js so the
 * tracking middleware can reuse the exact same classification and skip
 * cookie/session writes for crawlers.
 */

import { BLOCK, META, NOINDEX } from "./_bots.js";

// CSP relaxed for THIS landing only — the vturb/ConverteAI player, the
// Tailwind CDN, and the Meta pixel need eval/inline plus their vendor
// origins. The institutional pages keep the strict CSP from public/_headers
// (this function never runs on them).
const SLUG_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://scripts.converteai.net https://*.converteai.net https://*.vturb.net https://*.vturb.com https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.converteai.net https://*.converteai.net https://*.vturb.net https://*.vturb.com https://www.facebook.com",
  "media-src 'self' blob: https://*.vturb.net https://*.vturb.com https://*.converteai.net",
  "connect-src 'self' https://scripts.converteai.net https://*.converteai.net https://*.vturb.net https://*.vturb.com https://api.vturb.com.br https://m3u8.vturb.net https://www.facebook.com",
  "frame-src 'self' https://*.converteai.net https://*.vturb.net https://*.vturb.com",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const ua = request.headers.get("user-agent") || "";

  // 1) Meta first — otherwise a Meta UA could be caught by a broader rule.
  if (META.test(ua)) {
    const index = await fetch(new URL("/", request.url));
    return new Response(index.body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": NOINDEX,
        "cache-control": "no-store",
      },
    });
  }

  // 2) Search + Google Ads crawlers -> hard block.
  if (BLOCK.test(ua)) {
    return new Response("Forbidden", {
      status: 403,
      headers: { "x-robots-tag": NOINDEX, "cache-control": "no-store" },
    });
  }

  // 3) Real visitor -> the static landing, with the player CSP and noindex.
  const res = await ctx.next();
  const headers = new Headers(res.headers);
  headers.delete("content-security-policy");
  headers.set("content-security-policy", SLUG_CSP);
  headers.set("x-robots-tag", NOINDEX);

  // Early Hints / Link header: o browser inicia o fetch do CSS e o handshake
  // com o CDN do player assim que os headers chegam, antes de parsear o HTML.
  // O hash no nome do CSS acompanha o href em breath-report*.html.
  headers.set(
    "link",
    '</css/breath.cc860b73.min.css>; rel=preload; as=style, ' +
    '<https://scripts.converteai.net>; rel=preconnect, ' +
    '<https://cdn.converteai.net>; rel=preconnect'
  );

  // Inject the Meta pixel ID from env (set in Cloudflare → not committed to git).
  // Static HTML can't read env vars, so the cloak swaps the placeholder at the
  // edge. If the env var is unset, the page still serves (pixel just inert).
  const pixelId = env && env.META_PIXEL_ID_BREATH;
  if (pixelId) {
    const html = (await res.text()).split("__REPLACE_META_PIXEL_ID_BREATH__").join(pixelId);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(html, { status: res.status, statusText: res.statusText, headers });
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
