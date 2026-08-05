# The Cupboard — loja de act08/pag01

Camada de comércio de `laappflex.shop`, separada do journal *The Vital Years*.
Cinco itens domésticos comuns (ar, conforto, firmeza no pé). **Nenhum suplemento,
nenhum dispositivo médico** — essas duas categorias são o que reprova um catálogo
Meta em nicho de saúde.

Estado atual: **`status: "draft"`**. As páginas existem, são `noindex`, e o botão
de compra está desabilitado. Nada disso vai pro ar até os passos abaixo.

## Arquitetura

```
tools/shop-catalog.json      ← FONTE DE VERDADE (preço, specs, copy, imagens)
tools/build_shop.py          → public/shop/*.html + tools/out/facebook-catalog.tsv
tools/generate_shop_images.py→ public/images/shop/*.jpg (1024×1024, 1:1)
public/shop/shipping-returns.html   ← estático, NÃO gerado (editar à mão)
public/css/shop.v1.css       ← estilo da loja
```

Página e feed saem do **mesmo** JSON de propósito. O crawler da Meta compara o
preço do catálogo com o preço da landing antes de aprovar o item; se divergirem,
o produto é desativado. Editar preço só no Commerce Manager quebra isso.

```bash
python3 tools/build_shop.py          # rebuild páginas + feed
python3 tools/generate_shop_images.py  # regerar imagens (precisa de GEMINI_API_KEY)
```

## ⚠️ As imagens de hoje são placeholders

Os dez `*-ph.jpg` foram gerados por IA para montar o layout. Eles atendem à
especificação de catálogo (1:1, 1024×1024, JPEG, sem texto, sem logo, sem marca
d'água, fundo neutro) **mas não são fotos do produto real**, porque o produto
real ainda não foi comprado.

Publicar catálogo com foto que não corresponde ao que chega na casa do comprador
é falsear o anúncio, além de gerar reembolso. **Troque as dez pelas fotos do
fornecedor antes de subir o feed.**

Ao trocar: `/images/*` é servido `immutable` (ver `public/_headers`). Sobrescrever
o arquivo com o mesmo nome **não** chega em quem já visitou. Suba com nome novo
(`air-purifier-01.jpg`, sem o `-ph`) e atualize o caminho no JSON.

## Checklist de draft → live

Nada abaixo é opcional.

1. **Comprar / fechar o fornecedor** dos 5 itens e ter estoque ou fulfillment real.
2. **Conferir cada spec** do `shop-catalog.json` contra a unidade real. Toda
   dimensão, watt, decibel, lúmen, sq ft e prazo hoje é placeholder plausível,
   não medição.
3. **Conferir preço e frete** contra o custo real do carrier. `free_shipping_over`
   e o flat de $5.95 em `shipping-returns.html` foram escritos, não cotados.
4. **Trocar as 10 imagens** pelas do fornecedor (ver acima).
5. **Decidir o checkout.** Hoje `checkout_url` é `null` em todos. Duas rotas:
   - Loja própria (Shopify/Woco em subdomínio) → `checkout_url` aponta pra lá.
   - Shop com checkout na Meta → a Meta processa; exige returns policy publicada
     e contato funcionando (ambos já estão prontos aqui).
6. **Preencher `brand` e GTIN corretos.** Se for revenda, `brand` tem que ser o
   fabricante real, não "The Vital Years" — nome de casa só vale com private
   label. Sem GTIN o item roda, mas com menos alcance.
7. `"status": "live"` no JSON + `python3 tools/build_shop.py`.
8. **`shipping-returns.html` é estático**: trocar o `robots` pra `index, follow`
   à mão. O builder não toca nesse arquivo.
9. **Adicionar ao `public/sitemap.xml`**: `/shop`, os 5 produtos e
   `/shop/shipping-returns`. Deixados de fora enquanto é draft.
10. **Subir `tools/out/facebook-catalog.tsv`** no Commerce Manager e mapear
    `fb_product_category` na UI.

## Sobre o feed

TSV, não CSV — várias descrições têm vírgula, e vírgula sem aspas é a causa nº 1
de import quebrado na Meta. 8 linhas para 5 produtos: o chinelo expande em 4
tamanhos sob o mesmo `item_group_id`, que é o que faz a loja mostrar um chinelo
em vez de quatro.

Vestuário exige `gender`, `age_group`, `size` e `color` — por isso só as linhas
do chinelo trazem esses campos preenchidos.

## Regra de copy que não pode ser quebrada

Nenhuma página aqui pode dizer, sugerir ou insinuar que um item trata, previne,
alivia ou melhora qualquer condição — asma, DPOC, alergia, apneia, queda,
neuropatia, nada. Descrever a especificação é permitido ("H13, retém 99,97% das
partículas até 0,3 mícron"); descrever o efeito na pessoa não é.

Isso vale também para as imagens: sem inalador, sem oxigênio, sem bengala, sem
antes-e-depois, sem ninguém aparentando dificuldade.

O rodapé de toda página já carrega o disclaimer que separa o journal (opinião,
não é médica) dos produtos (bens domésticos comuns, não são dispositivos médicos).
