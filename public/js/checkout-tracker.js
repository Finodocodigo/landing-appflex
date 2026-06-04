// -----------------------------------------------------------------------------
// Checkout-side tracker. Paste this as a <script> on the BuyGoods (or any
// affiliate) checkout page. It fires InitiateCheckout to Meta on BOTH legs:
//
//   1) Browser-side Meta Pixel (fbq), if the page already loaded the Pixel,
//      with eventID for dedup.
//   2) Server-side via /p/checkout, which looks up the subid in our D1
//      `checkout_sessions` table and rebuilds user_data (fbp/fbc/IP/UA/
//      external_id) that we captured when the visitor was on the landing.
//
// Cross-site cookies are NOT available here (the checkout is on a different
// domain), so EVERY enrichment field comes from the subid lookup.
//
// Embed options:
//
//   <!-- A. Hosted script (recommended). Cache-bust by versioning the path. -->
//   <script src="https://laappflex.shop/js/checkout-tracker.js" async></script>
//
//   <!-- B. Pure pixel (works without JS, e.g. inside a payment iframe). -->
//   <img src="https://laappflex.shop/p/checkout?subid={SUBID}&v={SUBID2}&p={SUBID3}&ref=InitiateCheckout"
//        height="1" width="1" alt="" style="position:absolute;left:-9999px" />
//
// Replace `laappflex.shop` with your Pages hostname if it differs.
// -----------------------------------------------------------------------------

(function () {
  if (window.__krobCheckoutTrackerFired) return;
  window.__krobCheckoutTrackerFired = true;

  var TRACKER_ORIGIN = 'https://laappflex.shop';

  function readSubid() {
    var qs = new URLSearchParams(window.location.search);
    // BuyGoods preserves subid/subid2/subid3 through the order flow.
    var subid = qs.get('subid') || qs.get('vid') || '';
    if (!subid) {
      // Some processors strip query during redirect to a payment page; persist
      // it on first hit so a refresh still attributes correctly.
      try { subid = sessionStorage.getItem('krob_subid') || ''; } catch (_) {}
    } else {
      try { sessionStorage.setItem('krob_subid', subid); } catch (_) {}
    }
    return subid;
  }

  var subid = readSubid();
  if (!subid) return;

  var qs = new URLSearchParams(window.location.search);
  var tierValue = qs.get('subid2') || '';
  var tierProduct = qs.get('subid3') || '';
  // Optional product hint ('breath' | 'nerve') for per-product pixel routing on
  // the server side. If BuyGoods forwards it, pass it through; otherwise the
  // server resolves the product from the landing slug in checkout_sessions.
  var prod = qs.get('prod') || '';

  // Deterministic eventID per subid so a checkout refresh (or both /p/checkout
  // and fbq firing) collapses to a single InitiateCheckout in Meta. Matches
  // the default fallback in /p/checkout.js.
  var eventId = 'bg-checkout-' + subid;

  var customData = {
    currency: 'USD',
    content_category: 'supplement',
    content_type: 'product',
    num_items: 1,
  };
  var numericValue = parseFloat(tierValue);
  if (isFinite(numericValue) && numericValue > 0) {
    customData.value = numericValue;
  }
  if (tierProduct) {
    customData.content_ids = [tierProduct];
    customData.content_name = (prod || 'checkout') + '-' + tierProduct;
    customData.contents = [{
      id: tierProduct,
      quantity: 1,
      item_price: isFinite(numericValue) && numericValue > 0 ? numericValue : 0,
    }];
  }

  // 1) Browser-side fbq. No-op if the checkout page does not have Meta Pixel
  //    initialized. eventID dedupes against the server fire below.
  try {
    if (window.fbq) {
      window.fbq('track', 'InitiateCheckout', customData, { eventID: eventId });
    }
  } catch (_) {}

  // 2) Server-side via /p/checkout pixel. Image load is fire-and-forget;
  //    the response is a 1x1 gif while CAPI runs in waitUntil on our side.
  try {
    var params = new URLSearchParams();
    params.set('subid', subid);
    params.set('eid', eventId);
    params.set('ref', 'InitiateCheckout');
    if (tierValue)   params.set('v', tierValue);
    if (tierProduct) params.set('p', tierProduct);
    if (prod)        params.set('prod', prod);

    var img = new Image(1, 1);
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.src = TRACKER_ORIGIN + '/p/checkout?' + params.toString();
  } catch (_) {}
})();
