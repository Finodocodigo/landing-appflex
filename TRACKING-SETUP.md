# Setup do tracking (Meta CAPI + D1 · BuyGoods) — act08/pag01

Dois produtos BuyGoods (**BreathEase X** / pulmões e **Nervaline** / neuropatia),
no mesmo domínio `laappflex.shop`, cada um com **seu próprio pixel do Meta**.
O código (cópia evoluída do stack do act05) já está no repo; falta preencher os
placeholders e provisionar a infra na conta Cloudflare. Página FB: Giulia Batista.

Pré-requisito de máquina: Node 18+ e wrangler (`npm i -g wrangler` → `wrangler login`).

> **Nota de deploy importante:** o repo `Finodocodigo/landing-appflex` hoje
> deploya o site AppFlex antigo **flat** (build output = raiz). Esta reestrutura
> usa `public/` + `functions/`. Antes do go-live é preciso **mudar o "Build output
> directory" do projeto Pages para `public`** no painel (ou criar um projeto Pages
> novo `act08-pag01-site`). Confirmar na hora do deploy.

---

## Passo 0 — Placeholders no código (⏳ preencher quando os dados chegarem)

**O pixel do Meta NÃO é mais hardcoded.** A cloak (`functions/breath-report.js` /
`nerve-report.js`) injeta o ID no request, lendo `env.META_PIXEL_ID_BREATH` /
`env.META_PIXEL_ID_NERVE`. Logo, basta setar a env var no Cloudflare — não se edita
HTML. Se a env var não existir, a página serve normal (pixel só fica inerte).

Estado dos marcadores:

| Item | BreathEase | Nervaline |
|---|---|---|
| Landing/advertorial | ✅ feito (modelo `@lungs`) | ⏳ placeholder em branco |
| Pixel Meta (browser, via cloak) | setar env `META_PIXEL_ID_BREATH` | setar env `META_PIXEL_ID_NERVE` |
| Pixel/token CAPI (server) | setar `META_PIXEL_ID_BREATH` + `META_ACCESS_TOKEN_BREATH` | idem `_NERVE` |
| CTAs BuyGoods (3 tiers, codename embutido) | ✅ `breex6`($294)/`breex4`($276)/`breex2`($178) | ⏳ |
| `data-bg-value` (subid2→Purchase) / `data-bg-product` (subid3) | ✅ 294/276/178 · 6b/4b/2b | ⏳ |
| Allowlist Meta (`config/products.js`) | ✅ `buygoods:['breex']` | ⏳ add prefixo |
| Mapa prefixo→pixel (`META_PIXEL_BY_CODENAME`) | ✅ `'breex'`→`META_PIXEL_ID_BREATH` | ⏳ `__PREFIX_NERVE__` |
| `database_id` (`wrangler.jsonc`) | ⏳ sai no Passo 1 (compartilhado) | — |
| Endereço/foro (privacy/terms) | ⏳ `[REPLACE: ...]` | — |

Para subir **só o BreathEase**: a Nervaline pode ficar como está (cloak inerte,
noindex, não anunciada). Não bloqueia o go-live do BreathEase.

---

## Passo 1 — Criar o D1 e aplicar as migrations (CLI)

De dentro de `clients/act08/pag01/website/`:

```bash
wrangler d1 create act08-pag01-db
# → copiar o "database_id" pro wrangler.jsonc (substitui __REPLACE_AFTER_wrangler_d1_create__)

wrangler d1 migrations apply act08-pag01-db --remote
```

Conferir as 8 tabelas:

```bash
wrangler d1 execute act08-pag01-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
# esperado: ad_spend, checkout_sessions, event_log, purchase_items,
#           purchase_log, refund_log, sessions, sync_log
```

---

## Passo 2 — Pages project + binding do D1 + secrets

Pages project `act08-pag01-site` (ou o projeto já conectado ao `laappflex.shop`,
com Build output ajustado pra `public`). 

**Binding do D1 (produção):** Settings → Bindings → add **D1 database** →
Variable name **`DB`** (exato) → selecionar `act08-pag01-db`.

**Variáveis/secrets:** Settings → Environment variables (Production):

| Nome | Valor | Obs |
|---|---|---|
| `META_PIXEL_ID_BREATH` | pixel do BreathEase | env var (público) |
| `META_PIXEL_ID_NERVE`  | pixel da Nervaline  | env var (público) |
| `META_ACCESS_TOKEN_BREATH` | token CAPI do pixel BreathEase | **Secret** |
| `META_ACCESS_TOKEN_NERVE`  | token CAPI do pixel Nervaline  | **Secret** (se os 2 pixels estiverem na mesma Business Manager, pode ser o mesmo token nos dois) |
| `BUYGOODS_WEBHOOK_SLUG` | um UUID v4 | gera com `python -c "import uuid;print(uuid.uuid4())"` |
| `DEFAULT_COUNTRY_CODE` | `1` | EUA |
| `META_TEST_EVENT_CODE` | (opcional) | testar sem sujar produção |
| `META_PIXEL_ID` / `META_ACCESS_TOKEN` | (opcional) | fallback genérico se um codename/slug não casar nenhum produto |

> **Por que 2 pixels (decisão do cliente):** cada produto roda no seu próprio
> pixel/conta de anúncios. O roteamento é automático:
> - **Purchase** (webhook): roteado pelo `{PRODUCT_CODENAME}` via
>   `resolveMetaPixel` em [functions/webhook/_core.js](functions/webhook/_core.js)
>   + `META_PIXEL_BY_CODENAME` em [config/products.js](config/products.js).
> - **PageView / InitiateCheckout** (browser): pixel hardcoded em cada landing.
> - **InitiateCheckout server-side** (`/p/checkout`, `/tracker`): roteado pelo
>   **slug da landing** via [functions/_pixels.js](functions/_pixels.js)
>   (`/breath-report` → breath, `/nerve-report` → nerve).

CLI alternativo:
```bash
wrangler pages secret put META_ACCESS_TOKEN_BREATH --project-name=act08-pag01-site
wrangler pages secret put META_ACCESS_TOKEN_NERVE  --project-name=act08-pag01-site
wrangler pages secret put BUYGOODS_WEBHOOK_SLUG     --project-name=act08-pag01-site
```

---

## Passo 3 — Deploy

```bash
wrangler pages deploy public --project-name=act08-pag01-site
```

Confirmar no painel que o binding `DB` aparece em Production; se não, adicionar
manualmente (Passo 2) e refazer o deploy. **Não commitar/deployar sem autorização.**

---

## Passo 4 — Configurar a BuyGoods (por produto)

Domínio: **laappflex.shop**. Um único postback atende os DOIS produtos (a
BuyGoods manda `{PRODUCT_CODENAME}` e o stack roteia).

1. **Postback de venda** (painel BuyGoods), com os macros reais:
   ```
   https://laappflex.shop/webhook/buygoods/<BUYGOODS_WEBHOOK_SLUG>?subid={SUBID}&subid2={SUBID2}&subid3={SUBID3}&orderid={ORDERID}&emailhash={EMAILHASH}&convtype={CONV_TYPE}&commission={COMMISSION_AMOUNT}&product={PRODUCT_CODENAME}
   ```
   - `{EMAILHASH}` (SHA256 do email) vai direto pro `user_data.em` do Meta.
   - `{PRODUCT_CODENAME}` grava em `purchase_log.product_codename`, **filtra** quais
     vendas chegam ao Meta E **escolhe o pixel** do produto (ver "Filtro + pixel").
   - Sem macro de valor: Purchase = `subid2` (preço do tier) → comissão (fallback).
2. ⚠️ **DTC repassa o `subid`** (no mínimo) pro checkout final — senão `{SUBID}`
   volta vazio, o lookup no D1 falha e a CAPI não dispara. `subid2`/`subid3` são
   bônus (valor correto + rótulo). Confirmar no construtor da DTC de cada produto.
3. **Pixel no checkout BuyGoods (browser):** a página de checkout de cada produto
   deve inicializar o **pixel daquele produto**. O `js/checkout-tracker.js` (se
   embutido) só chama `fbq` se ele já existir; o pixel server-side `/p/checkout` é
   roteado pelo slug da landing de origem.

---

## Passo 5 — Verificação end-to-end

1. **Sessão + cloak:**
   ```bash
   curl -A "facebookexternalhit/1.1" https://laappflex.shop/breath-report   # → conteúdo do index
   curl -A "AdsBot-Google"           https://laappflex.shop/breath-report   # → 403
   curl -A "facebookexternalhit/1.1" https://laappflex.shop/nerve-report    # → conteúdo do index
   curl -A "AdsBot-Google"           https://laappflex.shop/nerve-report    # → 403
   ```
2. Abrir `https://laappflex.shop/breath-report?fbclid=teste&utm_source=fb` →
   cookies `_krob_sid`/`_fbp`/`_fbc`; 1 linha em `sessions`.
3. No load da landing → 1 linha em `checkout_sessions` (`subid` = `sessionStorage.krob_subid`).
4. Clicar o CTA → URL BuyGoods com `subid/subid2/subid3` (+ `prod`); InitiateCheckout
   dispara no **pixel do produto** (Events Manager / Test Events).
5. **Postback simulado por produto** (trocar `<slug>` e os codenames reais):
   ```bash
   curl "https://laappflex.shop/webhook/buygoods/<slug>?subid=<id>&subid2=294&subid3=6pack&orderid=TEST_BRE&emailhash=&convtype=frontend&product=bre6"
   curl "https://laappflex.shop/webhook/buygoods/<slug>?subid=<id>&subid2=294&subid3=6pack&orderid=TEST_NER&emailhash=&convtype=frontend&product=ner6"
   wrangler d1 execute act08-pag01-db --remote \
     --command "SELECT transaction_id,product_codename,meta_response_ok,substr(meta_response_body,1,120) FROM purchase_log ORDER BY created_at DESC LIMIT 2"
   ```
6. **Meta:** evento `Purchase` (USD) no Events Manager de **cada** pixel, com fbp/fbc
   casados (use `META_TEST_EVENT_CODE`).

---

## Filtro por produto + escolha do pixel ({PRODUCT_CODENAME})

O postback é único da conta de afiliado: dispara pra **todo** produto promovido.

**Estado atual:** `META_PRODUCT_CODENAME_ALLOWLIST.buygoods = []` +
`META_EMPTY_ALLOWLIST_BEHAVIOR = 'allow'` → enquanto não soubermos os codenames
reais, **toda** venda dispara (fail-open, não perde venda), mas como os prefixos
de `META_PIXEL_BY_CODENAME` ainda são placeholders, o `Purchase` cai no **pixel
fallback genérico** (`META_PIXEL_ID`/`META_ACCESS_TOKEN`) — se este não estiver
setado, fica `skipped: missing meta env` (esperado até preencher os dados).

**Ao descobrir os codenames reais:**
1. Ver os que estão chegando:
   ```bash
   wrangler d1 execute act08-pag01-db --remote \
     --command "SELECT product_codename, COUNT(*) AS n FROM purchase_log GROUP BY product_codename ORDER BY n DESC"
   ```
2. Em `config/products.js`: preencher `META_PRODUCT_CODENAME_ALLOWLIST.buygoods`
   (ex.: `['bre','ner']`) **e** trocar as chaves `__PREFIX_BREATH__`/`__PREFIX_NERVE__`
   de `META_PIXEL_BY_CODENAME` pelos mesmos prefixos. Commit + deploy.
3. A partir daí: só BreathEase/Nervaline disparam, cada um no seu pixel; outros
   produtos ficam só logados (`skipped: ... not in Meta allowlist`).

---

## Ordem de dependência (resumo)

Passo 0 (placeholders) ⟶ Passo 1 (D1) ⟶ Passo 2 (binding + secrets + 2 pixels) ⟶
Passo 3 (deploy, build output `public`) ⟶ Passo 4 (BuyGoods, por produto) ⟶
Passo 5 (verificar). As landings VSL em branco já cloakeiam e rastreiam; o
advertorial + player VTurb + os tiers reais entram numa etapa posterior.
