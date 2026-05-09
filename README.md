# AppFlex — Landing Pages

Conjunto de páginas estáticas para o funil direct response do produto **AppFlex** (saúde articular para adulto mayor hispanohablante, vendido na Hotmart).

Domínio de produção: **[laappflex.shop](https://laappflex.shop)**

## Estrutura

```
landing-page/
├── index.html                  # Home institucional + blog (esta é a página raiz)
├── v1.html                     # VSL principal (rota: /v1)
├── laappalivio.html            # VSL alternativa (variação A/B)
├── movimientos-esenciales.html # VSL alternativa
├── recuperacion-nocturna.html  # VSL alternativa
│
├── guia.html                   # Lectura ensaísta longa — "10 capítulos"
├── lo-que-no-cuentan.html      # Artigo: sistema médico → CTA test-pensamiento
├── movilidad-cotidiana.html    # Artigo: rigidez → CTA test-movilidad
├── raiz-dorada.html            # Artigo: cúrcuma → CTA test-ritual
│
├── test-pensamiento.html       # Quiz 1 (90 s) — vai para v1
├── test-movilidad.html         # Quiz 2 (90 s) — vai para v1
├── test-ritual.html            # Quiz 3 (90 s) — vai para v1
│
├── bridge.html                 # Bridge pré-checkout (injeta UTMs no Hotmart)
├── split.html                  # Split A/B redirect 50/50
├── gracias.html                # Página pós-compra
│
├── privacidad.html             # Política de privacidade
├── terminos.html               # Termos de uso
│
├── assets/                     # Favicons + imagens (Dr. Salazar, testimonios)
├── _headers                    # Regras Cloudflare Pages (cache + security)
└── .gitignore
```

## Funil

```
ad/orgânico
  └─ artigo (lo-que-no-cuentan / movilidad-cotidiana / raiz-dorada)
        └─ teste correspondente (test-pensamiento / test-movilidad / test-ritual)
              └─ v1.html (VSL com VTurb player)
                    └─ checkout Hotmart (via bridge.html para enriquecer UTMs)
                          └─ gracias.html
```

`index.html` é a home institucional/blog — entrada orgânica/SEO. Os artigos podem entrar diretamente via tráfego pago.

## URLs limpas (sem .html)

Cloudflare Pages resolve automaticamente:

- `laappflex.shop/test-pensamiento` → serve `test-pensamiento.html`
- `laappflex.shop/privacidad` → serve `privacidad.html`
- `laappflex.shop/v1` → serve `v1.html`

**Não é preciso `_redirects`** — todos os links internos já usam URLs sem `.html`.

## Deploy via Cloudflare Pages (passo a passo)

Pré-requisitos: conta GitHub e conta Cloudflare com domínio `laappflex.shop`.

### 1. Subir para o GitHub

```bash
cd /workspaces/cliente-appflex/direct/appflex/landing-page
git init
git add .
git commit -m "Initial commit — landing pages AppFlex"
gh repo create Finodocodigo/landing-appflex --public --source=. --push
```

### 2. Conectar ao Cloudflare Pages

1. Acesse [dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git](https://dash.cloudflare.com).
2. Selecione o repo `Finodocodigo/landing-appflex`.
3. Configurações de build:
   - **Framework preset**: None
   - **Build command**: *(vazio)*
   - **Build output directory**: `/` (raiz do repo)
   - **Root directory**: *(vazio)*
4. Clique em "Save and Deploy".

### 3. Configurar domínio custom

Em **Pages → seu projeto → Custom domains**:

- Adicionar `laappflex.shop` (root) e `www.laappflex.shop`.

> **Atenção:** o subdomínio `app.laappflex.shop` (PWA Next.js no Vercel) deve continuar apontando para o Vercel via DNS — só o root e `www` vão para o Cloudflare Pages.

### 4. Deploy contínuo

Cada `git push origin main` dispara novo deploy automático.

## Stack / observações técnicas

- HTML estático puro — sem build step, sem framework.
- CSS inline em cada página (paleta sage/cream + Inter + Lora).
- **GTM**: container `GTM-TKK8VFJK` carregado via `load.zurf.laappflex.shop` (CNAME stealth).
- **VTurb**: SmartPlayer Web Component em `v1.html` e variantes — IDs de player são distintos por variação.
- **UTMify**: captura UTMs e injeta nos links de saída da VSL.
- **Hotmart**: checkout final em `pay.hotmart.com/V104915667K?off=wodtzxg2`.
- **Tracking**: `xcod` (UUID gerado client-side) + `sck` (montado a partir das UTMs) propagados em todos os links → bridge → checkout.

## Notas de copy

Idioma: **Espanhol** (ES) — voseo (vos/tenés) consistente em todos os textos. Linguagem simples (≈ 3ª série / B1) — público-alvo é adulto mayor de 60-80 anos hispano-hablante com pouca familiaridade tecnológica.

Persona/voz: tom ensaísta-conversacional, sem hype, sem promessas de cura. Autoridade do **Dr. Ramírez Salazar** (médico cirujano, formação em medicina deportiva).

## Pendências conhecidas

- **Inconsistência garantia**: `bridge.html` menciona "Garantía de 30 días", mas `terminos.html §08` diz "7 días corridos". Harmonizar antes do go-live.
- Trocar avatar genérico do Dr. Salazar (`<div class="doc-avatar">RS</div>` no `index.html`) por foto real (`assets/img/dr-salazar.webp`) quando aprovado.
