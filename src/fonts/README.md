# Fontes self-hosted

Servidas via `next/font/local` para o build não depender do Google Fonts (o
fetch do `next/font/google` derrubou o build no CI por flake de rede).

| Arquivo                            | Fonte                  | Pesos   | Subset |
| ---------------------------------- | ---------------------- | ------- | ------ |
| `albert-sans-latin-variable.woff2` | Albert Sans (variável) | 100–900 | latin  |
| `outfit-latin-variable.woff2`      | Outfit (variável)      | 100–900 | latin  |
| `titillium-web-600-latin.woff2`    | Titillium Web          | 600     | latin  |
| `titillium-web-700-latin.woff2`    | Titillium Web          | 700     | latin  |

Origem: fonts.gstatic.com (Outfit v15, Titillium Web v19), baixadas em
2026-09-29; Albert Sans v4 em 2026-10-23. Desde 23/10 a fonte do app é a Albert Sans (a do HTML de
referência do Pedro); a Outfit fica no site institucional (`components/landing`) e no PDF. A Albert
Sans não tem setas (→ ← ↑ ↓), ⇒ nem ✓: o navegador busca esses glifos na fonte de reserva. Licença de ambas: SIL Open Font License 1.1. O subset latin cobre
U+0000–00FF (inclui os acentos do português).

## `pdf/` — fontes do PDF do Comparador (servidor)

Lidas pelo pdfkit no servidor (`src/services/analiseAtivos/pdf/renderizarPdfComparacao.ts`,
caminho a partir de `process.cwd()`), NÃO pelo `next/font`. O pdfkit precisa de TTF estático
(o variável não serve).

| Arquivo                   | Fonte  | Peso | Formato      |
| ------------------------- | ------ | ---- | ------------ |
| `pdf/Outfit-Regular.ttf`  | Outfit | 400  | TTF estático |
| `pdf/Outfit-SemiBold.ttf` | Outfit | 600  | TTF estático |

Origem: instâncias estáticas da Outfit v15 servidas por fonts.gstatic.com (CSS da API do
Google Fonts pedido com user-agent antigo, que devolve `format('truetype')`), baixadas em
2026-10-16. Licença: SIL Open Font License 1.1. A Outfit não tem `≤ ≥ ≈ ≠ ⇒`: o
renderizador troca por texto equivalente (`glifoParaFonte`). O deploy leva o fonte inteiro
(tar do repositório), então os TTF chegam a `/opt/myfinance/current/src/fonts/pdf/`.
