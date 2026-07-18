// -----------------------------------------------------------------------------
// BuyGoods postback PROBE — parallel, observational only.
//
// URL shape: /webhook/buygoods-probe/<slug>
//   The slug gates the endpoint exactly like the production webhook. It defaults
//   to the SAME secret (env.BUYGOODS_WEBHOOK_SLUG) so no new secret is required;
//   set env.BUYGOODS_PROBE_SLUG to use a dedicated one.
//
// Why this exists:
//   A different BuyGoods postback location exposes MORE macros than the one wired
//   to /webhook/buygoods — notably {NAME} and {PHONE} (both SHA256), on top of
//   {EMAILHASH}. Before trusting that richer feed for Meta matching, we want to
//   receive it IN PARALLEL and verify it carries the same sale identity
//   ({ORDERID}/{SUBID}/{EMAILHASH}) as the production webhook, plus the extras.
//
// What it does (and deliberately does NOT do):
//   - Logs every hit to buygoods_postback_probe (migration 0020). Duplicates are
//     kept on purpose — we're comparing raw feeds.
//   - Does NOT write purchase_log, does NOT fire Meta CAPI / GA4, does NOT touch
//     attribution. It cannot affect the live conversion pipeline.
//   - Always answers `OK` 200 so BuyGoods doesn't retry for days.
//
// All PII arrives pre-hashed (SHA256) from BuyGoods, so nothing here is raw PII.
//
// Postback URL to register in the BuyGoods dashboard (this affiliate's macros):
//   https://laappflex.shop/webhook/buygoods-probe/<slug>?subid={SUBID}
//     &subid2={SUBID2}&subid3={SUBID3}&subid4={SUBID4}&subid5={SUBID5}
//     &orderid={ORDERID}&commission={COMMISSION_AMOUNT}&convtype={CONV_TYPE}
//     &emailhash={EMAILHASH}&name={NAME}&phone={PHONE}&product={PRODUCT_CODENAME}
// -----------------------------------------------------------------------------

import { guardSlug } from '../_utils.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const expectedSlug = env.BUYGOODS_PROBE_SLUG || env.BUYGOODS_WEBHOOK_SLUG;
  const slugFailure = guardSlug(params.slug, expectedSlug);
  if (slugFailure) return slugFailure;

  try {
    const url = new URL(request.url);
    const qs = url.searchParams;
    const g = (k) => (qs.get(k) || '').trim();

    if (env.DB) {
      await env.DB.prepare(`
        INSERT INTO buygoods_postback_probe (
          received_at,
          subid, subid2, subid3, subid4, subid5,
          orderid, commission_amount, conv_type, product_codename,
          email_hash, name_hash, phone_hash,
          raw_query, client_ip, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        Math.floor(Date.now() / 1000),
        g('subid'), g('subid2'), g('subid3'), g('subid4'), g('subid5'),
        g('orderid'), g('commission'), g('convtype'), g('product'),
        // Hashes are lowercased for a clean compare against purchase_log.hashed_em.
        g('emailhash').toLowerCase(), g('name').toLowerCase(), g('phone').toLowerCase(),
        url.search || '', request.headers.get('cf-connecting-ip') || '', request.headers.get('user-agent') || '',
      ).run();
    }

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (err) {
    // Never make BuyGoods retry: log and answer 200. The probe is non-critical.
    console.error('BuyGoods probe error:', err.message);
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
}

// BuyGoods postbacks are GET; accept POST too in case this location is configured
// to POST (all macros still arrive as URL query params).
export const onRequestPost = onRequestGet;
