// -----------------------------------------------------------------------------
// Refund core — platform-agnostic refund / chargeback persistence.
//
// Each adapter normalizes its platform-specific refund payload into the shape
// below, then calls processRefund(). The shared logic looks up the matching
// purchase by transaction_id (so the dashboard can decrement the right row)
// and inserts into refund_log. Idempotent via UNIQUE INDEX on
// (platform, transaction_id) — webhook retries are safe.
//
// Normalized refund object:
//
//   {
//     platform:      'eduzz' | 'hotmart' | 'kiwify',
//     transactionId: string,    // platform transaction id, links back to purchase_log
//     value:         number,    // refunded amount, positive
//     currency:      string,    // ISO code
//     reason:        string,    // free-text from the platform, may be ''
//     rawPayload:    object,    // full payload dump for debugging
//   }
//
// Refund fan-out to Meta CAPI as a custom event is deliberately deferred to
// v1.1 — Meta's "Refund" event uses a different schema and not all recipients
// need it. The webhook today only persists to D1, which is what the dashboard
// reads.
// -----------------------------------------------------------------------------

export async function processRefund({ parsed, env, context }) {
  if (!env.DB) {
    return { ok: false, error: 'no DB binding' };
  }

  const { platform, transactionId, value, currency, reason, rawPayload } = parsed;

  if (!platform || !transactionId) {
    return { ok: false, error: 'missing platform or transactionId' };
  }

  context.waitUntil(
    persistRefund({
      platform,
      transactionId,
      value: parseFloat(value) || 0,
      currency: currency || 'BRL',
      reason: reason || '',
      rawPayload: rawPayload ? JSON.stringify(rawPayload) : '',
      env,
    })
  );

  return { ok: true };
}

async function persistRefund({ platform, transactionId, value, currency, reason, rawPayload, env }) {
  try {
    // Resolve purchase_id by transaction_id when the original purchase exists
    // in our D1. Refunds for purchases that pre-date the integration (or were
    // never received) get purchase_id = null and still log.
    let purchaseId = null;
    try {
      const purchaseRow = await env.DB.prepare(
        'SELECT id FROM purchase_log WHERE transaction_id = ? LIMIT 1'
      ).bind(transactionId).first();
      if (purchaseRow?.id) purchaseId = purchaseRow.id;
    } catch (e) {
      console.error('refund: purchase lookup error', { transactionId, error: e.message });
    }

    const createdAt = Math.floor(Date.now() / 1000);

    // INSERT OR IGNORE for idempotency — UNIQUE INDEX on (platform, transaction_id)
    // makes retries from the platform a no-op.
    await env.DB.prepare(`
      INSERT OR IGNORE INTO refund_log (
        purchase_id, platform, transaction_id,
        value, currency, reason, raw_payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      purchaseId,
      platform,
      transactionId,
      value,
      currency,
      reason,
      rawPayload,
      createdAt,
    ).run();
  } catch (e) {
    console.error('refund: persist error', { platform, transactionId, error: e.message });
  }
}
