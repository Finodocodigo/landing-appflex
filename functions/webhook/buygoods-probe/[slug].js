// -----------------------------------------------------------------------------
// BuyGoods postback — RICH location (name + phone), now PRODUCTION.
//
// URL shape: /webhook/buygoods-probe/<slug>
//   (the path keeps the historical "-probe" name because that is where the
//   affiliate's rich BuyGoods postback is already registered; renaming it would
//   break that live config. It gates on BUYGOODS_PROBE_SLUG, falling back to the
//   same BUYGOODS_WEBHOOK_SLUG as the plain endpoint.)
//
// This BuyGoods postback location exposes MORE macros than /webhook/buygoods —
// notably {NAME} and {PHONE} (both SHA256) on top of {EMAILHASH}. It now runs
// the FULL production pipeline (Meta CAPI / GA4 / purchase_log via
// processPurchase), sending the extra name/phone to Meta for a higher match
// quality — and it still records the raw feed to buygoods_postback_probe for
// audit continuity.
//
// Idempotency: two layers. (1) A SELECT on purchase_log.transaction_id skips an
// order already logged — this catches BuyGoods retries that arrive after the
// first hit's background insert lands. (2) The real guard for the concurrent
// cutover case (both /buygoods and /buygoods-probe registered, same {ORDERID}
// delivered to both at once, before either's waitUntil insert commits) is the
// DETERMINISTIC Meta event_id in _core.js (platform-transactionId): Meta dedups
// on event_name + event_id, so duplicate Purchase fires collapse into ONE
// conversion. Safe to run alongside /webhook/buygoods.
//
// Postback URL registered in BuyGoods (this affiliate's macros):
//   https://laappflex.shop/webhook/buygoods-probe/<slug>?subid={SUBID}
//     &subid2={SUBID2}&subid3={SUBID3}&subid4={SUBID4}&subid5={SUBID5}
//     &orderid={ORDERID}&commission={COMMISSION_AMOUNT}&convtype={CONV_TYPE}
//     &emailhash={EMAILHASH}&name={NAME}&phone={PHONE}&product={PRODUCT_CODENAME}
//
// Identifier mapping is identical to functions/webhook/buygoods/[slug].js, plus:
//   nameHash  <- name   ({NAME}  → Meta user_data.fn)
//   phoneHash <- phone  ({PHONE} → Meta user_data.ph)
// -----------------------------------------------------------------------------

import { processPurchase } from '../_core.js';
import { guardSlug } from '../_utils.js';

// BuyGoods bills this offer in USD; there is no currency macro.
const CURRENCY = 'USD';

// SHA256 hex guard: BuyGoods ships {EMAILHASH}/{NAME}/{PHONE} pre-hashed. Keep
// only a clean 64-hex digest so a stray/literal macro never poisons user_data.
function asHash(raw) {
  const h = (raw || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(h) ? h : '';
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const expectedSlug = env.BUYGOODS_PROBE_SLUG || env.BUYGOODS_WEBHOOK_SLUG;
  const slugFailure = guardSlug(params.slug, expectedSlug);
  if (slugFailure) return slugFailure;

  try {
    const url = new URL(request.url);
    const qs = url.searchParams;
    const g = (k) => (qs.get(k) || '').trim();

    const subid = g('subid');
    const transactionId = g('orderid');
    const subid2 = g('subid2');
    const subid3 = g('subid3');
    const commission = g('commission');
    const convType = g('convtype');
    const productCodename = g('product');

    const emailHash = asHash(qs.get('emailhash'));
    const nameHash = asHash(qs.get('name'));
    const phoneHash = asHash(qs.get('phone'));

    // Audit log of the raw feed (kept from the probe era — one row per hit).
    if (env.DB) {
      try {
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
          subid, subid2, subid3, g('subid4'), g('subid5'),
          transactionId, commission, convType, productCodename,
          emailHash, nameHash, phoneHash,
          url.search || '', request.headers.get('cf-connecting-ip') || '', request.headers.get('user-agent') || '',
        ).run();
      } catch (e) {
        console.error('BuyGoods probe audit log error:', e.message);
      }
    }

    // Value: no order-total macro exists, so subid2 (the tier price the landing
    // forwarded) is the estimate; commission is the last resort. Kept identical
    // to /webhook/buygoods so both endpoints agree.
    const subid2Value = parseFloat(subid2);
    const commissionValue = parseFloat(commission);
    const value =
      (Number.isFinite(subid2Value) && subid2Value > 0) ? subid2Value :
      (Number.isFinite(commissionValue) ? commissionValue : 0);

    // Idempotency: short-circuit a transaction already processed (by either
    // endpoint). Answering 200 below also stops BuyGoods retrying for days.
    if (env.DB && transactionId) {
      try {
        const existing = await env.DB.prepare(
          'SELECT 1 FROM purchase_log WHERE transaction_id = ? LIMIT 1'
        ).bind(transactionId).first();
        if (existing) {
          return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
      } catch (e) {
        console.error('BuyGoods probe dedup lookup error:', e.message);
      }
    }

    const parsed = {
      platform: 'buygoods',
      subid,
      email: '',
      emailHash,          // {EMAILHASH} → Meta em
      name: '',
      nameHash,           // {NAME}  → Meta fn
      phone: '',
      phoneHash,          // {PHONE} → Meta ph
      value,
      currency: CURRENCY,
      transactionId,
      productId: String(subid3 || ''),
      productName: convType ? `buygoods ${convType}` : 'buygoods',
      productCodename,
      items: [],
      platformUtm: {
        utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '',
      },
    };

    await processPurchase({ parsed, env, context });

    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (err) {
    // Never make BuyGoods retry: log and answer 200. A real purchase can be
    // reconciled from the audit log / meta_response_body.
    console.error('BuyGoods (rich) webhook error:', err.message);
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
}

// BuyGoods postbacks are GET; accept POST too (macros still arrive as query params).
export const onRequestPost = onRequestGet;
