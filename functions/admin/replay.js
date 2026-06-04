// -----------------------------------------------------------------------------
// Replay Meta CAPI for a purchase_log row.
//
// Use case: the env vars META_PIXEL_ID / META_ACCESS_TOKEN were missing on
// the deployment that handled the original BuyGoods postback, so the Purchase
// fanned out to D1 fine but Meta saw nothing (meta_response_body = "skipped:
// missing meta env"). After fixing the envs, this endpoint re-reads the row
// from D1 and fires CAPI using the user_data we already captured.
//
//   GET /admin/replay?slug=<BUYGOODS_WEBHOOK_SLUG>&id=<purchase_log.id>
//
// Idempotent: if meta_response_ok is already 1, returns the existing fbtrace_id
// without re-firing.
// -----------------------------------------------------------------------------

import { guardSlug } from '../webhook/_utils.js';
import { isMetaAllowed } from '../webhook/_core.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const slugFailure = guardSlug(url.searchParams.get('slug'), env.BUYGOODS_WEBHOOK_SLUG);
  if (slugFailure) return slugFailure;

  const id = parseInt(url.searchParams.get('id'), 10);
  if (!id || !env.DB) {
    return jsonResponse({ error: 'bad request' }, 400);
  }

  if (!env.META_PIXEL_ID || !env.META_ACCESS_TOKEN) {
    return jsonResponse({ error: 'missing meta env' }, 500);
  }

  const row = await env.DB.prepare(
    'SELECT * FROM purchase_log WHERE id = ?'
  ).bind(id).first();
  if (!row) {
    return jsonResponse({ error: 'not found' }, 404);
  }

  if (row.meta_response_ok === 1) {
    return jsonResponse({
      status: 'already_fired',
      id, eventId: row.event_id,
      fbtraceId: extractFbtraceId(row.meta_response_body),
    });
  }

  // Respect the same product-codename filter the webhook uses. This endpoint is
  // BuyGoods-specific (guarded by BUYGOODS_WEBHOOK_SLUG), so the platform is
  // hardcoded. Once a codename is allowlisted, this stops an operator from
  // accidentally replaying a foreign product's sale into the mindpro pixel.
  if (!isMetaAllowed('buygoods', row.product_codename)) {
    return jsonResponse({
      status: 'skipped',
      reason: 'product_codename not in Meta allowlist',
      id, productCodename: row.product_codename || '',
    });
  }

  const userData = {
    client_ip_address: row.client_ip_address || '',
    client_user_agent: row.client_user_agent || '',
  };
  if (row.hashed_em) userData.em = [row.hashed_em];
  if (row.hashed_fn) userData.fn = [row.hashed_fn];
  if (row.hashed_ln) userData.ln = [row.hashed_ln];
  if (row.hashed_ph) userData.ph = [row.hashed_ph];
  if (row.hashed_external_id) userData.external_id = [row.hashed_external_id];
  if (row.fbp) userData.fbp = row.fbp;
  if (row.fbc) userData.fbc = row.fbc;

  const value = parseFloat(row.value) || 0;
  const customData = {
    value,
    currency: row.currency || 'USD',
    content_type: 'product',
  };
  if (row.product_id) {
    customData.content_ids = [row.product_id];
    customData.contents = [{ id: row.product_id, quantity: 1, item_price: value }];
    customData.num_items = 1;
  }
  if (row.product_name) customData.content_name = row.product_name;

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: row.event_time,
      event_id: row.event_id,
      event_source_url: row.event_source_url || '',
      action_source: 'website',
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (env.META_TEST_EVENT_CODE) {
    payload.test_event_code = env.META_TEST_EVENT_CODE;
  }

  const payloadJson = JSON.stringify(payload);
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadJson,
    }
  );

  const metaStatusCode = response.status;
  const metaResponseOk = response.ok ? 1 : 0;
  let metaResponseBody = '';
  try { metaResponseBody = await response.text(); } catch (e) { metaResponseBody = `Read error: ${e.message}`; }

  try {
    await env.DB.prepare(`
      UPDATE purchase_log
      SET meta_status_code = ?, meta_response_ok = ?, meta_response_body = ?, meta_payload_sent = ?
      WHERE id = ?
    `).bind(metaStatusCode, metaResponseOk, metaResponseBody, payloadJson, id).run();
  } catch (e) {
    return jsonResponse({
      status: 'fired_but_d1_update_failed',
      id, eventId: row.event_id,
      metaStatusCode, metaResponseOk, metaResponseBody,
      d1Error: e.message,
    });
  }

  return jsonResponse({
    status: 'fired',
    id, eventId: row.event_id,
    metaStatusCode, metaResponseOk,
    fbtraceId: extractFbtraceId(metaResponseBody),
    metaResponseBody,
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: JSON_HEADERS });
}

function extractFbtraceId(body) {
  try {
    const parsed = JSON.parse(body || '{}');
    return parsed.fbtrace_id || '';
  } catch (_) {
    return '';
  }
}
