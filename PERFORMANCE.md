# Performance & custo — laappflex.shop (act08/pag01)

Auditoria e execução de **2026-08-14**, depois da compra do **plano Pro** do
domínio e do **Workers Paid**. Todos os números vêm de medição real (GraphQL
Analytics API, D1 Analytics e `curl` contra produção), não de estimativa.

Regra que guiou tudo: **o site está em produção recebendo tráfego pago, quase
todo mobile**. Nada aqui tocou no HTML da landing, no CSS do player ou na lógica
de atribuição. As mudanças foram de infraestrutura e de configuração de zona,
cada uma validada em preview antes de produção.

---

## 0. O que foi executado (2026-08-14)

| # | Ação | Estado |
|---|---|---|
| A1 | `public/_routes.json` — assets deixam de invocar Pages Functions | ✅ **em produção** (commit `35b1c5d`) |
| A3 | **Smart Tiered Cache** ligado na zona | ✅ **ligado** |
| A4 | Auditoria de page rules / cache rules | ✅ **nada sobrescrevendo** (0 page rules, 0 cache rules) |
| A5 | **Browser Cache TTL** → *Respect Existing Headers* | ✅ **corrigido** (achado durante a validação — ver §3) |
| A2 | Migration `0023_perf_indexes.sql` (índices D1) | ✅ **aplicada** (via API, **não** via wrangler — ver §3) |
| A6 | `d1_migrations` re-sincronizada (0021/0022/0023) | ✅ **armadilha desarmada** — ver §3 |

Nenhum teste de integridade falhou. A bateria de validação está em §4 e pode ser
repetida a qualquer momento.

---

## 1. Retrato medido (14 dias: 31/07 → 13/08)

| Métrica | Valor | Cota Workers Paid | Uso |
|---|---|---|---|
| Invocações Pages Functions (act08) | 223.744 / 14d ≈ **16k/dia** (pico 41.104) | — | — |
| Invocações da **conta toda** (7 projetos Pages) | 263.197 / 14d ≈ **564k/mês** | 10M/mês | **5,6%** |
| CPU por invocação | P50 **3,2ms** · P99 **10–16ms** | 30M CPU-ms/mês | ~**6–10%** |
| Erros de Function | **0** | — | — |
| Requisições na zona | **63.816/dia**, cache hit **72,4%** | — | — |
| D1 rows read (conta toda) | 368,7M / 14d ≈ **790M/mês** | 25B/mês | **3,2%** |
| D1 rows written (conta toda) | 1,46M / 14d ≈ **3,1M/mês** | 50M/mês | **6,3%** |
| D1 storage (act08) | **458 MB** | 5 GB | **9,2%** |
| Sessões/dia (act08) | ~3.700 média, 8.061 no pico | — | — |

**Leitura:** não há risco de estouro de custo. O tráfego precisaria crescer ~18×
para encostar nos 10M de requests.

### O que o Workers Paid de fato resolveu

O **P99 de CPU vive entre 10ms e 16ms, hora após hora**, contra o teto de **10ms
por invocação do plano free**. O percentil 99 do act08 estava permanentemente
acima do limite — ~1% das invocações rodava na borda de ser cortada por
`Exceeded CPU Limit`. O Paid eleva esse teto para 30s. Era o único limite que o
site realmente encostava; a cota de requests nunca esteve em jogo.

Origem provável do CPU alto: `breath-report.js` faz
`(await res.text()).split(...).join(...)` sobre 95 KB de HTML para trocar o
placeholder do pixel. Ver **B3**.

---

## 2. O que o plano Pro entrega aqui (e o que não entrega)

### Já ligado e funcionando — não mexer

| Recurso | Estado | Evidência |
|---|---|---|
| **Brotli** | on | CSS 269 KB → **42,8 KB**; HTML 95 KB → **18 KB** |
| **Early Hints (103)** | on e **emitindo de verdade** | `HTTP/2 103` + `link:` confirmado na `/breath-report` |
| **HTTP/3, 0-RTT, TLS 1.3** | on | — |
| **Rocket Loader** | **off** | correto — ligar reordena scripts e quebraria player/pixel |

O front já estava bem feito: **61 das 63 imagens com `loading="lazy"`**, scripts
com `defer` no fim do body, `Link:` de preload/preconnect rendendo Early Hints
reais. Sobra pouco a ganhar aí.

### ⚠️ Polish está ligado mas **não faz nada** neste site

`polish: lossy` está ativo na zona (feature Pro), mas **não atua sobre o
Cloudflare Pages**. Testado:

```
curl -I -H "Accept: image/webp" https://laappflex.shop/images/fda.png
→ content-type: image/png · content-length: 9243 · sem header cf-polished
```

9243 bytes é exatamente o tamanho do arquivo em disco: a imagem sai byte a byte
como foi publicada. Polish otimiza imagens buscadas de um **origin server**; os
assets do Pages são servidos pela própria rede da Cloudflare e não passam por
esse caminho. Ligar `webp: on` não muda nada.

**Mirage** tem a mesma dependência de origin e reescreve markup de `<img>` — com
61 imagens já em lazy nativo, ganho nulo e risco real de mexer no layout.
**Não ligar.**

### 🚨 O que NÃO ligar no Pro (quebraria o funil)

Estado verificado em 2026-08-14: `sbfm_definitely_automated: allow`,
`sbfm_verified_bots: allow` — ou seja, **Super Bot Fight Mode está permissivo
hoje. Manter assim.**

- **Super Bot Fight Mode** — o cloak depende de `facebookexternalhit` **chegar
  até a Function** para receber o index branco. Qualquer bloqueio de bot na
  frente disso quebra a revisão de anúncios do Meta. A documentação não é
  explícita sobre a classificação do crawler do Meta em cada toggle, então o
  risco não é quantificável antes de ligar — e o custo de errar é reprovação de
  anúncio.
- **WAF Managed Rules** — os postbacks da BuyGoods (`/webhook/buygoods/<slug>`)
  chegam como GET de servidor com querystring cheia de parâmetros. Regra
  gerenciada é exatamente o que barra isso em silêncio, e postback perdido é
  receita não atribuída. Se um dia ligar: **Log** por uma semana antes de Block,
  e `/webhook/*` em skip.

### 💸 Não comprar

**Argo Smart Routing** ($5/mês + $0,10/GB) otimiza a rota até o **origin**. Não
há origin — o conteúdo já nasce na rede da Cloudflare. Zero ganho.

---

## 3. As mudanças aplicadas, uma a uma

### A1 · `_routes.json` — ✅ em produção

Sem `_routes.json`, o Pages roteia **toda** requisição para a Function,
incluindo `/images/*.webp` e `/css/*`. O `_middleware.js` já ignorava esses
paths pela regex `isPageRequest`, mas **ignorar depois de ser invocado não evita
a invocação, nem a cobrança, nem o salto extra de latência em cada MISS de
edge**. A doc é explícita: rotas em `exclude` "não invocam a Function e não
geram cobrança de invocação".

```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/css/*", "/js/*", "/images/*", "/assets/*",
              "/robots.txt", "/sitemap.xml", "/favicon.ico"]
}
```

`include: ["/*"]` é obrigatório: o middleware precisa continuar rodando em
**toda página HTML** (`/`, `/shop/*`, `/terms`, `/privacy-policy`) para gravar
cookie e sessão.

**Como foi validado antes de produção:** a mudança passou por (a) revisão
adversarial com 5 lentes independentes — tracking/atribuição, cloak/compliance,
semântica de roteamento do Pages, endpoints de webhook, cache/headers — que
retornaram **zero achados** em 133 leituras de arquivo; e (b) um **preview
deployment** (`perf/routes-json` → `1e470019.landing-appflex.pages.dev`) onde
foram verificados cloak nos 4 caminhos, cookies em 5 páginas, headers dos 7
paths excluídos, os redirects e todos os endpoints de Function. Só então
`main`.

O ponto que mais importava e ficou provado no preview: **o `_headers` continua
sendo aplicado a paths excluídos** — `immutable`, o `max-age=300` do
checkout-tracker e o `Access-Control-Allow-Origin` seguem intactos. E
`/_routes.json` **não fica exposto** (404).

### A3 · Smart Tiered Cache — ✅ ligado

`argo/tiered_caching` continua `off` e **não é editável** (exige o add-on Argo),
mas `tiered_cache_smart_topology_enable` era editável no Pro e foi **ligado**.
Um PoP que dá MISS passa a buscar de um PoP superior em vez de reingressar na
origem — casa com o `immutable` de 1 ano dos assets. Baseline para comparar:
**cache hit 72,4%** nos 15 dias anteriores.

### A4 · Page rules / cache rules — ✅ nada a corrigir

**0 page rules** e **0 cache rules** na zona. Nada estava limitando o TTL de
edge dos assets. O `edge_cache_ttl: 7200` que aparece nas settings é o default
legado e só teria efeito através de uma page rule, que não existe.

### A5 · Browser Cache TTL — ✅ corrigido (achado durante a validação)

Este não estava no plano original; apareceu ao comparar produção com o preview.

O `_headers` define, com comentário explícito, um cache curto para o snippet de
tracking embutido no checkout da BuyGoods:

```
/js/checkout-tracker.js
  ! Cache-Control
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300, must-revalidate
```

Mas a zona entregava outra coisa:

| | Cache-Control entregue |
|---|---|
| Preview (`*.pages.dev`, **fora** da zona) | `max-age=300, must-revalidate` ✅ |
| Produção (`laappflex.shop`, **dentro** da zona) | `max-age=14400, must-revalidate` ❌ |

Causa: `browser_cache_ttl: 14400` (4h) na zona **sobrescreve o Cache-Control do
origin quando o valor do origin é menor**. Valores maiores passam intactos — por
isso o `immutable` de 1 ano nunca deu sinal do problema e ele passou despercebido
na primeira auditoria.

Efeito prático: o script de tracking do checkout ficava **até 4 horas** em cache
no navegador, contra os 5 minutos pretendidos. Uma correção nesse arquivo levaria
4h para alcançar quem já o tinha carregado.

**Correção:** `browser_cache_ttl → 0` (*Respect Existing Headers*). Resultado
medido antes/depois:

| Path | Antes | Depois |
|---|---|---|
| `/js/checkout-tracker.js` | `max-age=14400` | **`max-age=300`** ✅ |
| `/robots.txt` | `max-age=14400` | `max-age=0, must-revalidate` |
| `/css/*.css`, `/images/*` | `max-age=31536000, immutable` | **inalterado** ✅ |
| `/js/bootstrap.bundle.min.js` | `max-age=86400` | **inalterado** ✅ |

Nenhum asset de performance perdeu cache: os únicos afetados são os que o
`_headers` queria com TTL curto de propósito.

### A2 · Índices de D1 — ✅ aplicada

Quatro queries **da central-dash** respondiam por **112,7M rows read em 14 dias**
por fazerem SCAN onde faltava índice. O índice
`idx_sync_log_platform_run_at(platform, run_at)` que já existia **não servia**
para nenhuma delas: as três de `sync_log` filtram/ordenam sem `platform`, e
índice composto só é aproveitado a partir do prefixo.

Efeito medido, mesma query antes e depois:

| Query | rows/exec antes | depois | Plano depois |
|---|---|---|---|
| `sync_log ORDER BY run_at DESC LIMIT` | 4.629 | **5** | `SCAN USING INDEX idx_sync_log_run_at` |
| `MAX(run_at) WHERE status='ok'` | 2.306 | **1** | `SEARCH USING COVERING INDEX` |
| `COUNT(*) WHERE status='error' AND run_at>=?` | 2.328 | **2** | `SEARCH USING COVERING INDEX` |
| `event_log WHERE event_name=? AND timestamp BETWEEN` | ~4.400 | **1.569** | `SEARCH USING INDEX idx_event_log_name_ts (event_name=? AND timestamp>? AND <?)` |
| `sessions` por janela + `utm_campaign` | 66.446 (**68ms**) | **1** (**0,18ms**) | `SEARCH USING COVERING INDEX` |

O índice em `sessions` levou 2,7s para construir e escreveu 316.498 rows (0,6%
da cota mensal de escrita, uma vez só).

### A6 · ⚠️ `d1_migrations` estava dessincronizada — armadilha desarmada

**Não aplicar migrations neste banco com `wrangler d1 migrations apply` sem antes
conferir o estado.** Ao preparar a A2, a tabela `d1_migrations` registrava a
última migration como **0020**, mas o schema real já continha tudo de 0021 e 0022
(todas as colunas e índices presentes) — foram aplicadas à mão, sem registro.

Se o wrangler tivesse rodado, ele reexecutaria a `0021_ad_spend_ad_level.sql`,
que contém:

```sql
DELETE FROM ad_spend;
```

Isso apagaria as **22.524 linhas de gasto de anúncio** que alimentam CPA/ROAS na
central-dash. (Os `ALTER TABLE` no topo do arquivo provavelmente abortariam a
migration antes do `DELETE`, mas isso é sorte de ordenação, não garantia.)

**O que foi feito:** os índices da 0023 foram aplicados **um a um via API D1**
(todos `CREATE INDEX IF NOT EXISTS`, idempotentes), e depois `0021`, `0022` e
`0023` foram registradas em `d1_migrations` para refletir a realidade do schema.
`ad_spend` conferido antes e depois: **22.524 linhas, intacto**.

Os demais bancos foram auditados e estão **em sincronia** (act04 22/22,
act05 18/18, goodneighborjournal 23/23, act06 23/23) — o desalinhamento era
isolado no act08.

---

## 4. Bateria de validação (repetir após qualquer mudança de zona)

```bash
UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"

curl -sS -A "facebookexternalhit/1.1" -o /tmp/m.html -w "%{http_code}\n" https://laappflex.shop/breath-report
grep -c "mullein\|COPD" /tmp/m.html          # 0 — crawler do Meta NÃO pode ver a landing
curl -sS -A "AdsBot-Google" -o /dev/null -w "%{http_code}\n" https://laappflex.shop/breath-report   # 403
curl -sS -A "Googlebot/2.1"  -o /dev/null -w "%{http_code}\n" https://laappflex.shop/breath-report  # 403
curl -sS -A "$UA" -o /tmp/r.html -w "%{http_code}\n" https://laappflex.shop/breath-report           # 200

grep -c "__REPLACE_META_PIXEL_ID_BREATH__" /tmp/r.html   # 0 — placeholder substituído
grep -c "fbq('init', '3479220312227431')"  /tmp/r.html   # 1 — pixel correto
curl -sSI -A "$UA" https://laappflex.shop/breath-report | grep -ci "^set-cookie"   # 3
curl -sv --http2 -A "$UA" -o /dev/null https://laappflex.shop/breath-report 2>&1 | grep -c "HTTP/2 103"  # 1
curl -sSI https://laappflex.shop/js/checkout-tracker.js | grep -c "max-age=300"    # 1
curl -sS -o /dev/null -w "%{http_code}\n" https://laappflex.shop/_routes.json      # 404
```

Estado em 2026-08-14, após todas as mudanças: **todos passam**.

Cuidado ao escrever esses testes no shell: `path` é variável especial do zsh —
usá-la como variável de loop destrói o `PATH` da sessão.

---

## 5. Como medir o efeito do `_routes.json`

O efeito só aparece com horas cheias de tráfego pós-deploy (o deploy saiu
2026-08-14 ~01:31Z, madrugada nos EUA). Comparar a série horária:

```bash
set -a; . /workspaces/gringa-post/.env; set +a
# GraphQL: pagesFunctionsInvocationsAdaptiveGroups
#   scriptName = "pages-worker--13631408-production"  (act08)
```

Baseline pré-deploy, invocações por hora em 13/08: **393 – 814/h**, média ~16k/dia.
Baseline de zona: **63.816 req/dia, cache hit 72,4%**.

Espera-se queda nas invocações (os MISSes de asset saem da conta) e alta no cache
hit (Smart Tiered Cache). Se as invocações **não** caírem, o `_routes.json` não
está sendo aplicado — conferir se o arquivo sobreviveu ao build em
`public/_routes.json`.

---

## 6. Pendências

### B1 · Retenção de dados no D1

458 MB para ~450k linhas, crescendo ~4 MB/dia; chega nos 5 GB em ~3 anos. Um
purge de `sessions` com mais de 180 dias reduziria o banco e baratearia os
`COUNT(*)` por janela. **Não podar `checkout_sessions`** — é o que sustenta a
trava por subid.

### B2 · Cron de 1 minuto da central-dash

O comentário em `central-dash/src/index.js` diz que a rotação de 1 conta por tick
existe "para manter cada invocação sob os 10ms de CPU do plano free" — **essa
restrição não existe mais**. Com o Paid (30s de CPU, **1.000 subrequests** por
invocação contra 50 no free), o sync do Meta pode processar várias contas por
tick: dados de gasto mais frescos e menos invocações. Mudança na central-dash,
não neste site.

### B3 · `HTMLRewriter` no cloak

`breath-report.js` faz `await res.text()` — **bufferiza os 95 KB do HTML inteiro
no Worker antes do primeiro byte** — só para trocar
`__REPLACE_META_PIXEL_ID_BREATH__`. `HTMLRewriter` transformaria isso em
streaming e derrubaria o CPU (atacando o P99 de 12–16ms).

**Deliberadamente não feito.** Mexe no arquivo que serve a página de dinheiro, e
tem uma armadilha: o placeholder aparece **duas vezes** (no `fbq('init')` e no
`<noscript><img>`), e `HTMLRewriter` opera em nós, não em texto solto — o handler
precisa cobrir os dois ou o pixel quebra em silêncio. O ganho de TTFB é de poucos
milissegundos; o risco é o rastreamento. Só vale com preview + validação no
Events Manager.

---

## 7. Credenciais

Desde 2026-08-14 há **um único token** Cloudflare para toda a conta, em
`/.env` na raiz do workspace. Os `.env` por cliente foram apagados.

```bash
set -a; . /workspaces/gringa-post/.env; set +a
```

Escopo verificado: zone settings / rulesets / page rules / analytics / bot
management (todas as zonas), Cloudflare Pages, Workers Scripts, Account
Analytics e **D1 (Edit)**.

⚠️ Os três tokens antigos foram removidos do disco, mas **continuam válidos no
Cloudflare até serem revogados** em My Profile → API Tokens.
