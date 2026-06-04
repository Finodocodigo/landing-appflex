// -----------------------------------------------------------------------------
// Per-product configuration for sales webhooks.
//
// Add your products under the sales platform you use. Each product is keyed by
// the platform's own product ID (the number that appears in the webhook payload)
// and holds the optional integration targets for that specific purchase.
//
// A product that IS NOT listed here still gets logged to `purchase_log` and
// still fires Meta CAPI + GA4 — those run off attribution data and don't need
// a per-product config. The entries here control the OPTIONAL integrations
// that fan out on each purchase (Encharge tag, ManyChat tag ID, per-product
// Google Ads conversion action) AND the dashboard's revenue split bucket
// (initial / upsell / backend / recurring).
//
// Example (Eduzz product):
//
//   eduzz: {
//     '123456': {
//       name: 'Your product name — for your own reference',
//       revenueType: 'initial',                   // 'initial' | 'upsell' | 'backend' | 'recurring'
//       enchargeTag: 'your-encharge-tag-slug',
//       manychatTagId: 12345678,
//       googleAdsConversionActionId: '9876543210',
//     },
//   },
//
// `revenueType` controls which column the sale appears in on the dashboard
// (Initial / Upsell / Backend / Recurring). Products without an entry, or
// without a `revenueType`, fall back to 'initial'. Use 'upsell' for
// order-bumps, 'backend' for high-ticket follow-up offers, and 'recurring'
// for subscriptions or installment plans.
//
// Leave any integration field empty string / 0 / null to skip that fan-out for
// that product. Leave an entire platform as {} if you don't use it — the
// corresponding webhook endpoint still works, it just won't trigger
// Encharge/ManyChat/per-product Google Ads for those sales (and revenue
// defaults to the 'initial' bucket).
//
// This file is committed to git. Product IDs and tag IDs are not secrets.
// Secrets (API keys) live in Cloudflare environment variables.
// -----------------------------------------------------------------------------

export default {
  eduzz: {},
  hotmart: {},
  kiwify: {},
  // BuyGoods: keyed by PRODUCT_CODENAME. Meta CAPI + purchase_log fire without
  // any entry here — these only control the OPTIONAL per-product fan-outs
  // (Encharge/ManyChat/Google Ads), none of which are used on this offer.
  // (Which sales reach the Meta pixel is controlled separately, by the
  // codename allowlist below, NOT by this map.)
  buygoods: {},
};

// -----------------------------------------------------------------------------
// Meta CAPI — filtro por PRODUCT_CODENAME (BuyGoods)
// -----------------------------------------------------------------------------
// Só os produtos listados aqui disparam o evento `Purchase` pro Meta. Objetivo:
// mandar pro pixel SÓ as vendas dos nossos produtos e ignorar vendas de outros
// produtos que cheguem no MESMO postback da BuyGoods (o postback é único por
// conta de afiliado, então outros produtos batem na mesma URL).
//
// Os codenames da BuyGoods seguem o padrão <produto><nº de potes>: 'neu6' =
// NeuroMindPro 6 potes, 'neu3' = 3 potes, 'neu1' = 1 pote, etc. Por isso o match
// é por PREFIXO — cada entrada é o NOME do produto e casa com qualquer quantidade
// de pote. Comparação case-insensitive, com trim. O valor vem do macro
// {PRODUCT_CODENAME} (query param `product`) e grava em purchase_log.product_codename.
//
// Mapa keyed por plataforma:
//   - plataforma AUSENTE do mapa  → SEM filtro (dispara pra todas). Eduzz/Hotmart/
//     Kiwify não têm conceito de PRODUCT_CODENAME, por isso ficam de fora.
//   - plataforma com lista NÃO-vazia → só dispara se o codename COMEÇAR com um
//     dos prefixos da lista.
//   - plataforma com lista VAZIA → ver META_EMPTY_ALLOWLIST_BEHAVIOR abaixo.
//
// Pra revisar os codenames que estão chegando (e achar prefixos novos):
//   wrangler d1 execute act08-pag01-db --remote \
//     --command "SELECT product_codename, COUNT(*) AS n FROM purchase_log GROUP BY product_codename ORDER BY n DESC"
//
// act08 vende DOIS produtos BuyGoods no MESMO postback de afiliado:
//   - BreathEase X (pulmões)    → prefixo a descobrir (ex.: 'bre')
//   - Nervaline   (neuropatia)  → prefixo a descobrir (ex.: 'ner')
// Enquanto não soubermos os codenames REAIS do macro {PRODUCT_CODENAME},
// deixar VAZIO + META_EMPTY_ALLOWLIST_BEHAVIOR='allow' (dispara pra todas, não
// perde venda). Ao descobrir via a query acima, preencher os prefixos
// (ex.: ['bre','ner']) — o filtro entra em vigor sozinho. Os mesmos prefixos
// devem ser as chaves de META_PIXEL_BY_CODENAME abaixo.
export const META_PRODUCT_CODENAME_ALLOWLIST = {
  buygoods: ['breex'],   // BreathEase X = breex2/breex4/breex6 (casa por prefixo). __REPLACE__: add o prefixo da Nervaline quando conhecido.
};

// Comportamento enquanto a allowlist da plataforma está VAZIA (= ainda não
// configurada). Quando o array `buygoods` acima ganhar ao menos 1 codename, esta
// flag deixa de valer pra buygoods — o filtro entra em vigor automaticamente.
//
//   'allow' → dispara Meta pra TODAS as vendas (nada é perdido enquanto a gente
//             descobre a codename). [janela interina escolhida pelo usuário]
//   'block' → não dispara Meta pra NINGUÉM até a allowlist ser preenchida (zero
//             contaminação; vendas ficam logadas e podem ir via /admin/replay).
export const META_EMPTY_ALLOWLIST_BEHAVIOR = 'allow';

// -----------------------------------------------------------------------------
// Meta CAPI — roteamento de pixel POR PRODUTO (act08 = 2 pixels)
// -----------------------------------------------------------------------------
// act08 roda DOIS produtos BuyGoods no mesmo domínio, cada um com SEU pixel do
// Meta (decisão do cliente: um pixel por produto). O `Purchase` do webhook é
// roteado pelo PREFIXO do {PRODUCT_CODENAME} (mesma lógica de prefixo da
// allowlist). Cada entrada aponta pras CHAVES de env (não os valores) onde o
// pixel ID e o CAPI token daquele produto ficam guardados no Cloudflare Pages.
//
// Resolução (ver resolveMetaPixel em functions/webhook/_core.js):
//   - codename casa um prefixo → usa env[pixelEnvKey] + env[tokenEnvKey]
//   - sem match (ou prefixo placeholder ainda não substituído) → cai no
//     fallback genérico env.META_PIXEL_ID + env.META_ACCESS_TOKEN (se setados)
//
// As CHAVES (prefixos) abaixo são placeholders — trocar pelos codenames reais
// junto com META_PRODUCT_CODENAME_ALLOWLIST acima (ex.: 'bre' e 'ner').
// O InitiateCheckout server-side (functions/p/checkout.js) roteia o pixel pelo
// SLUG da landing (event_source_url), não pelo codename — ver lá.
export const META_PIXEL_BY_CODENAME = {
  buygoods: {
    'breex': { pixelEnvKey: 'META_PIXEL_ID_BREATH', tokenEnvKey: 'META_ACCESS_TOKEN_BREATH' }, // BreathEase X (pulmões): breex2/breex4/breex6
    '__PREFIX_NERVE__':  { pixelEnvKey: 'META_PIXEL_ID_NERVE',  tokenEnvKey: 'META_ACCESS_TOKEN_NERVE'  }, // Nervaline (neuropatia)
  },
};
