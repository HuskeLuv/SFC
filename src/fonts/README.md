# Fontes self-hosted

Servidas via `next/font/local` para o build não depender do Google Fonts (o
fetch do `next/font/google` derrubou o build no CI por flake de rede).

| Arquivo                         | Fonte             | Pesos   | Subset |
| ------------------------------- | ----------------- | ------- | ------ |
| `outfit-latin-variable.woff2`   | Outfit (variável) | 100–900 | latin  |
| `titillium-web-600-latin.woff2` | Titillium Web     | 600     | latin  |
| `titillium-web-700-latin.woff2` | Titillium Web     | 700     | latin  |

Origem: fonts.gstatic.com (Outfit v15, Titillium Web v19), baixadas em
2026-09-29. Licença de ambas: SIL Open Font License 1.1. O subset latin cobre
U+0000–00FF (inclui os acentos do português).
