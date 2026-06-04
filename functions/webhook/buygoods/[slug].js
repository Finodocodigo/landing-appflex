// -----------------------------------------------------------------------------
// BuyGoods postback adapter.
//
// URL shape: /webhook/buygoods/<BUYGOODS_WEBHOOK_SLUG>
// The per-recipient UUID stored in env.BUYGOODS_WEBHOOK_SLUG gates the endpoint;
// scanners hitting /webhook/buygoods without the right slug get a 404.
//
// Platform specifics (differs from the JSON-POST adapters Eduzz/Hotmart/Kiwify):
//   - BuyGoods fires a server-to-server postback as a GET with query params,
//     not a JSON POST. We read everything from the URL search params.
//   - BuyGoods's available macros: {SUBID}..{SUBID5}, {ORDERID},
//     {COMMISSION_AMOUNT}, {EMAILHASH} (SHA256 of the buyer email), {CONV_TYPE}
//     ("frontend" | "upsell"), {PRODUCT_CODENAME} (the product's code). There is
//     NO buyer name/phone and NO order-total macro — only the commission.
//   - {PRODUCT_CODENAME} is what we filter on: this affiliate's single postback
//     URL fires for EVERY product they promote, but only OUR products (act08 runs
//     two: BreathEase X / lungs and Nervaline / neuropathy) should reach the Meta
//     pixel. The codename is captured here, persisted to purchase_log
//     .product_codename, matched against the allowlist in config/products.js, AND
//     used to route the Purchase to the right per-product pixel (resolveMetaPixel
//     in _core.js). Every sale is still logged; the filter only gates the Meta
//     Purchase fan-out. See config/products.js for how to fill the codenames.
//   - {EMAILHASH} is gold: it goes straight into Meta user_data.em (already
//     SHA256), so the Purchase matches on email even when fbp/fbc are absent.
//     Combined with fbp/fbc/IP/UA from the checkout_sessions lookup (by subid),
//     this is a strong match.
//   - Value: since there is no order-total macro, we use subid2 (the tier price
//     the landing forwarded) and fall back to {COMMISSION_AMOUNT} only if subid2
//     did not survive the DTC hop.
//   - BuyGoods RETRIES the postback for up to 3 days unless the endpoint
//     replies 200 with a body. We always answer `OK` 200, which is also what
//     prevents a duplicate conversion fire.
//
// Postback URL to register in the BuyGoods dashboard (real BuyGoods macros):
//   https://laappflex.shop/webhook/buygoods/<slug>?subid={SUBID}&subid2={SUBID2}
//     &subid3={SUBID3}&orderid={ORDERID}&emailhash={EMAILHASH}
//     &convtype={CONV_TYPE}&commission={COMMISSION_AMOUNT}&product={PRODUCT_CODENAME}
//
// Identifier mapping:
//   subid            <- subid       (the UUID the landing threaded into the order link)
//   emailHash        <- emailhash   ({EMAILHASH} → Meta user_data.em, no re-hash)
//   value            <- subid2 (tier price) | commission (fallback)
//   transactionId    <- orderid
//   productId        <- subid3 (tier label) ; productName <- convtype (frontend/upsell)
//   productCodename  <- product     ({PRODUCT_CODENAME} → Meta filter + purchase_log)
// -----------------------------------------------------------------------------

import { processPurchase } from '../_core.js';
import { guardSlug } from '../_utils.js';

// Currency for this offer. BuyGoods does not echo a currency macro; the offer
// is billed in USD.
const CURRENCY = 'USD';

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const slugFailure = guardSlug(params.slug, env.BUYGOODS_WEBHOOK_SLUG);
  if (slugFailure) return slugFailure;

  try {
    const qs = new URL(request.url).searchParams;

    const subid = qs.get('subid') || '';
    const transactionId = qs.get('orderid') || '';
    const subid2 = qs.get('subid2') || '';
    const subid3 = qs.get('subid3') || '';
    const commission = qs.get('commission') || '';
    const convType = qs.get('convtype') || '';

    // {PRODUCT_CODENAME} — the product's code on BuyGoods. Used to filter which
    // sales reach the Meta pixel (see config/products.js). Trimmed but case is
    // preserved for logging; the allowlist match itself is case-insensitive.
    const productCodename = (qs.get('product') || '').trim();

    // {EMAILHASH} is already a SHA256 hex digest of the buyer email — pass it
    // straight to Meta as user_data.em (lowercased hex). Never re-hash it.
    const emailHashRaw = (qs.get('emailhash') || '').trim().toLowerCase();
    const emailHash = /^[a-f0-9]{64}$/.test(emailHashRaw) ? emailHashRaw : '';

    // Value: no order-total macro exists on BuyGoods, so subid2 (the tier price
    // the landing forwarded) is the estimate; commission is the last resort.
    // The buyer re-picks the package on the DTC page, so subid2 only survives
    // if the DTC forwards it — otherwise we fall back to commission.
    const subid2Value = parseFloat(subid2);
    const commissionValue = parseFloat(commission);
    const value =
      (Number.isFinite(subid2Value) && subid2Value > 0) ? subid2Value :
      (Number.isFinite(commissionValue) ? commissionValue : 0);

    // Idempotency: BuyGoods may re-fire a postback. The Meta Purchase fires
    // before the purchase_log insert, so a unique-index collision alone would
    // not stop a duplicate conversion. Short-circuit on a transaction we have
    // already processed. (Answering 200 below also stops BuyGoods retrying.)
    if (env.DB && transactionId) {
      try {
        const existing = await env.DB.prepare(
          'SELECT 1 FROM purchase_log WHERE transaction_id = ? LIMIT 1'
        ).bind(transactionId).first();
        if (existing) {
          return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
      } catch (e) {
        console.error('BuyGoods dedup lookup error:', e.message);
      }
    }

    const parsed = {
      platform: 'buygoods',
      subid,
      email: '',
      emailHash,          // pre-hashed (SHA256) email from BuyGoods → Meta em
      name: '',
      phone: '',
      value,
      currency: CURRENCY,
      transactionId,
      productId: String(subid3 || ''),
      productName: convType ? `buygoods ${convType}` : 'buygoods',
      productCodename,    // {PRODUCT_CODENAME} → Meta allowlist filter + purchase_log
      items: [],
      platformUtm: {
        utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '',
      },
    };

    await processPurchase({ parsed, env, context });

    // BuyGoods requires a body on success — plain "OK" is enough.
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });

  } catch (err) {
    console.error('BuyGoods webhook error:', err.message);
    // Return 200 anyway: a 5xx makes BuyGoods retry for days, and the failure
    // is already logged. The purchase, if real, can be reconciled manually.
    return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Some BuyGoods setups can be configured to POST the postback. Accept it too
// and reuse the GET handler (params come from the URL either way).
export const onRequestPost = onRequestGet;
