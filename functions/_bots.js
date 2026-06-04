/**
 * Shared crawler classification for this project.
 *
 * Single source of truth used by BOTH the cloak (memory-clarity-report.js)
 * and the tracking middleware (_middleware.js). The cloak decides what each
 * crawler is served; the middleware uses the same regexes to skip cookie/
 * session writes for crawlers so the `sessions` table stays clean of bot rows.
 */

// Search/ads crawlers that must NEVER see the landing -> 403.
// AdsBot-Google (and variants) are included on purpose — Google traffic must
// point at the index, never at the slug.
export const BLOCK = /(Googlebot|AdsBot-Google|Storebot-Google|Google-InspectionTool|Mediapartners-Google|APIs-Google|bingbot|BingPreview|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|ia_archiver|Bytespider|GPTBot|ChatGPT-User|CCBot|ClaudeBot|anthropic-ai|PerplexityBot|Amazonbot|Applebot|SemrushBot|AhrefsBot|DotBot|MJ12bot|DataForSeoBot|PetalBot)/i;

// Meta crawlers (link preview / ad review). Allowed, but served the index
// content. Deliberately does NOT include in-app browser UAs (FBAN/FBAV/
// Instagram/etc.) — those are real people and must see the landing.
export const META = /(facebookexternalhit|facebookcatalog|Facebot|meta-externalagent|meta-externalfetcher|WhatsApp)/i;

export const NOINDEX = 'noindex, nofollow, noarchive';
