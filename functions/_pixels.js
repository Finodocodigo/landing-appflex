// -----------------------------------------------------------------------------
// Per-product Meta pixel resolution by LANDING SLUG (act08 = 2 produtos / 2 pixels).
//
// act08 roda dois produtos BuyGoods no mesmo domínio, cada um na sua landing e
// com SEU pixel do Meta. Os eventos client-originated (InitiateCheckout via
// /tracker e o pixel server-side /p/checkout) não carregam o {PRODUCT_CODENAME},
// então resolvem qual pixel/token usar pelo SLUG da landing de origem:
//   /breath-report  → breath  (BreathEase X, pulmões)
//   /nerve-report   → nerve   (Nervaline, neuropatia)
//
// O `Purchase` do webhook NÃO usa este módulo: ele roteia pelo {PRODUCT_CODENAME}
// (resolveMetaPixel em webhook/_core.js). As CHAVES de env aqui são as mesmas
// de config/products.js → META_PIXEL_BY_CODENAME, pra os dois lados baterem.
//
// Underscore-prefixed → o Cloudflare Pages não trata este arquivo como rota.
// -----------------------------------------------------------------------------

export const PRODUCT_PIXELS = {
  breath: { pixelEnvKey: 'META_PIXEL_ID_BREATH', tokenEnvKey: 'META_ACCESS_TOKEN_BREATH' },
  nerve:  { pixelEnvKey: 'META_PIXEL_ID_NERVE',  tokenEnvKey: 'META_ACCESS_TOKEN_NERVE'  },
};

// Returns 'breath' | 'nerve' | '' from the first URL-ish string that matches a
// known landing slug. Pass any candidates (event_source_url, referer, ...).
export function productKeyFromUrl(...candidates) {
  for (const c of candidates) {
    const s = String(c || '').toLowerCase();
    if (s.includes('/breath-report')) return 'breath';
    if (s.includes('/nerve-report')) return 'nerve';
  }
  return '';
}

// Resolves { pixelId, accessToken } for a product key, reading the values from
// `env`. Falls back to the generic META_PIXEL_ID / META_ACCESS_TOKEN when the
// product is unknown (single-pixel setups or placeholders not yet replaced).
export function resolveProductPixel(productKey, env) {
  const cfg = PRODUCT_PIXELS[productKey];
  const pixelId = (cfg && env?.[cfg.pixelEnvKey]) || env?.META_PIXEL_ID || '';
  const accessToken = (cfg && env?.[cfg.tokenEnvKey]) || env?.META_ACCESS_TOKEN || '';
  return { pixelId, accessToken };
}
