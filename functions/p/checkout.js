// -----------------------------------------------------------------------------
// Server-side InitiateCheckout pixel.
//
// Mounted at /p/checkout, this endpoint is meant to be embedded in the BuyGoods
// checkout (or any external checkout page) as either:
//
//   <img src="https://laappflex.shop/p/checkout?subid={SUBID}&v={SUBID2}&p={SUBID3}"
//        height="1" width="1" alt="" />
//
//   <script src="https://laappflex.shop/js/checkout-tracker.js" async></script>
//
// The visitor's browser is on a third-party domain (no _fbp/_fbc/_krob_sid
// cookies on us), so we enrich Meta CAPI from `checkout_sessions` keyed by
// subid (populated when the visitor was on the landing).
//
// Returns a 1x1 transparent gif so it works as an <img> pixel. Meta CAPI is
// fired in waitUntil so the gif ships immediately.
//
// Idempotency: a same (subid, event_name) pair will not be reported twice.
// `event_log` is the dedup source; if we already logged it, skip Meta.
//
// Per-product pixel (act08 = 2 produtos / 2 pixels): this server-side
// InitiateCheckout carries no {PRODUCT_CODENAME}, so it resolves the pixel/token
// from the ?prod= hint, else the landing slug in checkout_sessions
// .event_source_url. Shared with /tracker via _pixels.js.
// -----------------------------------------------------------------------------

import { PRODUCT_PIXELS, productKeyFromUrl, resolveProductPixel } from '../_pixels.js';

const PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Access-Control-Allow-Origin': '*',
};

function gifResponse() {
  return new Response(PIXEL_GIF, { status: 200, headers: PIXEL_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const subid = (url.searchParams.get('subid') || '').trim();
  if (!subid) return gifResponse();

  // ref defines the Meta event name. Default is InitiateCheckout (the moment
  // someone lands on the checkout). The endpoint is generic enough to accept
  // other names if a future page wants to reuse it.
  const refRaw = (url.searchParams.get('ref') || 'InitiateCheckout').trim();
  const eventName = refRaw.toLowerCase() === 'checkout' ? 'InitiateCheckout' : refRaw;

  // event_id from caller takes priority (allows browser-pixel dedup); fall
  // back to a deterministic id so a refresh of the same checkout doesn't
  // double-count and so we can dedupe in event_log.
  const eventIdParam = (url.searchParams.get('eid') || '').trim();
  const deterministicId = `bg-checkout-${subid}`;
  const eventId = eventIdParam || deterministicId;

  // Optional tier value/product from the checkout URL (BuyGoods forwards
  // subid2/subid3 from the landing). Sanitize to avoid garbage in CAPI.
  const queryValue = parseFloat(url.searchParams.get('v') || '');
  const tierProduct = (url.searchParams.get('p') || '').slice(0, 64);

  // Optional product hint ('breath' | 'nerve') for per-product pixel routing.
  const prodParam = (url.searchParams.get('prod') || '').slice(0, 16);

  const callerIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const callerUa = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';

  // Bot filter: same logic as /tracker. We still return the gif (don't break
  // the page) but skip Meta CAPI for crawlers/automation UAs.
  const { isBot, botReason } = detectBot(callerUa);

  context.waitUntil(
    fireCheckoutCapi({
      env,
      subid,
      eventId,
      eventName,
      tierValue: queryValue,
      tierProduct,
      prod: prodParam,
      callerIp,
      callerUa,
      referer,
      isBot,
      botReason,
    })
  );

  return gifResponse();
}

// HEAD is sometimes sent by privacy-aware browsers / link previewers before
// loading the image. Treat it as a no-op pixel.
export async function onRequestHead() {
  return new Response(null, { status: 200, headers: PIXEL_HEADERS });
}

async function fireCheckoutCapi({
  env, subid, eventId, eventName,
  tierValue, tierProduct, prod,
  callerIp, callerUa, referer,
  isBot, botReason,
}) {
  let sessionData = {};
  if (env.DB) {
    try {
      sessionData = (await env.DB.prepare(
        'SELECT * FROM checkout_sessions WHERE subid = ?'
      ).bind(subid).first()) || {};
    } catch (e) {
      console.error('checkout_sessions lookup error:', e.message);
    }
  }

  // Per-product pixel: ?prod= hint first, else the landing slug.
  const productKey = (prod && PRODUCT_PIXELS[prod]) ? prod
    : productKeyFromUrl(sessionData.event_source_url, referer);
  const { pixelId, accessToken } = resolveProductPixel(productKey, env);

  // Dedup: if event_log already has this (event_id, event_name), skip Meta.
  // Prevents a checkout refresh from firing CAPI twice and burning quality.
  if (env.DB) {
    try {
      const existing = await env.DB.prepare(
        'SELECT 1 FROM event_log WHERE event_id = ? AND event_name = ? LIMIT 1'
      ).bind(eventId, eventName).first();
      if (existing) return;
    } catch (e) {
      console.error('event_log dedup lookup error:', e.message);
    }
  }

  // Server-stored IP/UA from the landing visit are more reliable than the
  // pixel-call IP/UA (which would be the checkout-page browser). Meta CAPI
  // expects the IP/UA that originated the conversion intent, so we prefer
  // the landing's. Caller IP/UA is the fallback when the lookup misses.
  const clientIp = sessionData.ip_address || callerIp || '';
  const userAgent = sessionData.user_agent || callerUa || '';

  const fbp = sessionData.fbp || '';
  const fbc = sessionData.fbc || '';
  const externalIdRaw = sessionData.external_id || '';
  const externalIdHash = externalIdRaw ? await sha256(externalIdRaw) : '';

  // --- Source gate: only report Meta-attributable checkouts to Meta CAPI ---
  // This endpoint fires for every subid that hits the BuyGoods checkout, but
  // the offer also runs Google Ads. Two flavors of non-Meta traffic were
  // flooding the pixel with identity-less InitiateCheckout events and crushing
  // the event's identifier coverage (fbp/fbc/external_id EMQ):
  //
  //   1) Direct-to-checkout Google/organic traffic that never passed our
  //      landing → no `checkout_sessions` row → sessionData is empty → no
  //      fbp/fbc/external_id at all.
  //   2) Google-sourced traffic that DID pass the landing → carries a Google
  //      click id (gclid/gbraid/wbraid) and only a synthetic _fbp, with no real
  //      Meta click (fbc). Meta can't attribute these; their Purchase is
  //      reported to Google Ads via the webhook, not to Meta.
  //
  // We send to Meta only when there is a genuine Meta signal. Google-attributed
  // checkouts are still logged to event_log (sent_to_meta = 0) so the dashboard
  // sees them; they're just not pushed to the Pixel.
  const hasMetaIdentity = !!(fbp || fbc || externalIdRaw);
  const hasMetaClick = !!fbc;
  const hasGoogleClick = !!(sessionData.gclid || sessionData.gbraid || sessionData.wbraid);
  let metaSkipReason = '';
  if (!hasMetaIdentity) {
    metaSkipReason = 'no meta identity (direct/unmatched checkout)';
  } else if (hasGoogleClick && !hasMetaClick) {
    metaSkipReason = 'google-sourced checkout (gclid, no meta click)';
  }

  const userData = {
    client_ip_address: clientIp,
    client_user_agent: userAgent,
  };
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (externalIdHash) userData.external_id = [externalIdHash];

  const customData = { currency: 'USD' };
  if (Number.isFinite(tierValue) && tierValue > 0) {
    customData.value = tierValue;
  }
  if (tierProduct) {
    customData.content_ids = [tierProduct];
    customData.content_name = `${productKey || 'checkout'}-${tierProduct}`;
    customData.content_type = 'product';
  }
  customData.content_category = 'supplement';

  const eventTime = Math.floor(Date.now() / 1000);
  const eventSourceUrl = referer || sessionData.event_source_url || '';

  let metaStatusCode = 0;
  let metaResponseOk = 0;
  let metaResponseBody = '';
  let metaPayloadSent = null;
  let sentToMeta = 0;

  if (isBot) {
    metaResponseBody = `skipped: bot (${botReason})`;
  } else if (metaSkipReason) {
    metaResponseBody = `skipped: ${metaSkipReason}`;
  } else if (!pixelId || !accessToken) {
    metaResponseBody = 'skipped: missing meta env';
  } else {
    const payload = {
      data: [{
        event_name: eventName,
        event_time: eventTime,
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: customData,
      }],
    };
    if (env.META_TEST_EVENT_CODE) {
      payload.test_event_code = env.META_TEST_EVENT_CODE;
    }

    metaPayloadSent = JSON.stringify(payload);
    sentToMeta = 1;

    try {
      const response = await fetch(
        `https://graph.facebook.com/v25.0/${pixelId}/events?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: metaPayloadSent,
        }
      );
      metaStatusCode = response.status;
      metaResponseOk = response.ok ? 1 : 0;
      try { metaResponseBody = await response.text(); } catch (e) { metaResponseBody = `Read error: ${e.message}`; }
    } catch (e) {
      metaResponseBody = `Fetch error: ${e.message}`;
    }
  }

  if (env.DB) {
    try {
      const browserInfo = parseBrowser(userAgent);
      await env.DB.prepare(`
        INSERT INTO event_log (
          session_id, event_name, event_id, timestamp,
          browser, browser_version, os, is_mobile,
          pixel_was_blocked, fbp_source, fbc_source, fbclid_source,
          ga_cookie_present, ga_client_id_fallback, itp_cookie_extended,
          is_bot, bot_reason, consent_status,
          sent_to_meta, meta_status_code, meta_response_ok, meta_response_body, meta_payload_sent,
          sent_to_ga4, ga4_status_code, ga4_response_ok, ga4_response_body, ga4_payload_sent,
          has_email, has_phone, has_name,
          raw_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sessionData.session_id || '', eventName, eventId, eventTime,
        browserInfo.browser, browserInfo.version, browserInfo.os, browserInfo.isMobile ? 1 : 0,
        // Server-only event: no browser pixel attempted here, so the "blocked"
        // signal is not meaningful. Sources are all "checkout_pixel" to make
        // the dashboard breakdown explicit.
        0, 'checkout_pixel', 'checkout_pixel', 'checkout_pixel',
        0, 0, 0,
        isBot ? 1 : 0, botReason, 'unknown',
        sentToMeta, metaStatusCode, metaResponseOk, metaResponseBody, metaPayloadSent,
        0, 0, 0, '', null,
        0, 0, 0,
        ''
      ).run();
    } catch (e) {
      console.error('checkout pixel D1 log error:', e.message);
    }
  }
}

async function sha256(value) {
  if (!value) return '';
  const normalized = String(value).toLowerCase().trim();
  const encoded = new TextEncoder().encode(normalized);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function detectBot(userAgent) {
  if (!userAgent || userAgent.length < 10) {
    return { isBot: true, botReason: 'Missing or short user-agent' };
  }
  const patterns = [
    { p: /googlebot|google-inspectiontool/i, r: 'Googlebot' },
    { p: /bingbot|msnbot/i, r: 'Bingbot' },
    { p: /facebookexternalhit|facebot/i, r: 'Facebook crawler' },
    { p: /twitterbot/i, r: 'Twitter crawler' },
    { p: /linkedinbot/i, r: 'LinkedIn crawler' },
    { p: /slackbot/i, r: 'Slackbot' },
    { p: /whatsapp/i, r: 'WhatsApp preview' },
    { p: /bot|crawler|spider|scraper|headless/i, r: 'Generic bot' },
    { p: /python-requests|axios|node-fetch|curl|wget|httpie/i, r: 'HTTP library' },
    { p: /phantomjs|selenium|puppeteer|playwright/i, r: 'Automation tool' },
  ];
  for (const { p, r } of patterns) {
    if (p.test(userAgent)) return { isBot: true, botReason: r };
  }
  return { isBot: false, botReason: '' };
}

function parseBrowser(ua) {
  const r = { browser: 'Unknown', version: '', os: 'Unknown', isMobile: false };
  if (!ua) return r;
  r.isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  if (/Edg\//i.test(ua)) { r.browser = 'Edge'; r.version = ua.match(/Edg\/([\d.]+)/)?.[1] || ''; }
  else if (/OPR\//i.test(ua)) { r.browser = 'Opera'; r.version = ua.match(/OPR\/([\d.]+)/)?.[1] || ''; }
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) { r.browser = 'Chrome'; r.version = ua.match(/Chrome\/([\d.]+)/)?.[1] || ''; }
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) { r.browser = 'Safari'; r.version = ua.match(/Version\/([\d.]+)/)?.[1] || ''; }
  else if (/Firefox\//i.test(ua)) { r.browser = 'Firefox'; r.version = ua.match(/Firefox\/([\d.]+)/)?.[1] || ''; }
  if (/Windows/i.test(ua)) r.os = 'Windows';
  else if (/Mac OS X/i.test(ua)) r.os = 'macOS';
  else if (/iPhone|iPad/i.test(ua)) r.os = 'iOS';
  else if (/Android/i.test(ua)) r.os = 'Android';
  else if (/Linux/i.test(ua)) r.os = 'Linux';
  return r;
}
