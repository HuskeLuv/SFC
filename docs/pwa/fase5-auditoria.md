# Fase 5 — Auditoria Lighthouse + dark mode (fatia E, 29/09/2026)

Build de produção (`npm run build && npx next start -p 3205`) no worktree da fatia,
usuário demo autenticado, Lighthouse **11.7.1** (a categoria PWA foi removida no 12 e a
meta de instalabilidade precisa dela), emulação mobile 390×844 @3x. Script reprodutível:
`scripts/lighthouse-mobile.mjs` (ver cabeçalho para uso e rotas).

## Notas por rota — antes → depois

| Rota                     | Perf    | A11y         | Best Practices | PWA       | Instalável |
| ------------------------ | ------- | ------------ | -------------- | --------- | ---------- |
| /signin                  | 88 → 87 | 85 → 85      | 96 → 96        | 100 → 100 | sim        |
| /carteira                | 35 → 36 | 92 → **96**  | 100 → 100      | 100 → 100 | sim        |
| /fluxodecaixa            | 72 → 72 | 96 → **100** | 100 → 100      | 100 → 100 | sim        |
| /planejamento-financeiro | 49 → 57 | 97 → **100** | 100 → 100      | 100 → 100 | sim        |

Variações de ±1–8 em Performance entre execuções são ruído normal do Lighthouse; a única
mudança de código entre "antes" e "depois" foi a correção de `<title>` abaixo.

## Correção aplicada (arquivo da fatia E)

- **`src/app/layout.tsx`** — o app inteiro renderizava **sem `<title>`** (o layout raiz não
  definia `title` e as páginas do produto tampouco), falhando o audit `document-title` em
  TODAS as rotas. Adicionado `title: 'My Finance'` como padrão, sem `template` para não
  alterar as páginas que já definem o próprio título (legais, agenda, admin…). Zero efeito
  visual (só a aba do navegador); guardas de desktop inalterados.

`next.config.ts` e `public/*` não precisaram de mudança: instalabilidade 100 em todas as
rotas, manifest/ícones OK.

## Metas × resultado

- **PWA >= 90 (instalável):** ✅ 100 nas 4 rotas.
- **Best Practices >= 95:** ✅ 96–100 (o 96 do /signin vem de erros de console ambientais
  do harness: tentativa https, prefetch de rota autenticada e o 401 esperado de
  `/api/auth/me` deslogado).
- **A11y >= 95:** ✅ /carteira 96, /fluxodecaixa 100, /planejamento 100. ❌ **/signin 85** —
  os 3 audits restantes estão em arquivos de outras fatias (tabela abaixo).
- **Performance >= 70 (>= 55 na /carteira):** ✅ /signin 87, /fluxodecaixa 72.
  ❌ /planejamento-financeiro 57 (LCP 6,6 s — a tela pinta esperando as APIs de
  premissas/projeção; TBT 1,3 s de hidratação dos charts). ❌ /carteira 36 (LCP 4,8 s —
  API `/api/carteira/resumo` de 2,5–5,0 s documentada na fase 1, fora do escopo; TBT
  2,97 s / bootup 5,5 s de hidratação). Desvio justificado pelo gargalo de back-end; a
  parcela de front-end (TBT) fica registrada como pendência.

## Pendências para o corretor (nenhum arquivo de outra fatia foi editado)

| #   | Achado (audit/medida)                                                                                                                         | Onde                              | Arquivo / dono                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | `title: ""` (vazio) derruba o `document-title` mesmo com o padrão do layout                                                                   | /signin, /signup, /reset-password | `src/app/(full-width-pages)/(auth)/*/page.tsx` — dar títulos reais ("Entrar", "Criar conta", "Redefinir senha") |
| 2   | Contraste 2,57: "Ou" `#98a2b3` sobre branco                                                                                                   | /signin                           | `src/components/auth/SignInForm.tsx` (fatia D já toca o arquivo)                                                |
| 3   | `link-in-text-block`: "Registre-se" distinguível só pela cor                                                                                  | /signin                           | `src/components/auth/SignInForm.tsx`                                                                            |
| 4   | `label-content-name-mismatch`: item "Planejar" da barra de abas e botão do avatar "UD" — texto visível fora do nome acessível                 | todas                             | `src/layout/mobile/MobileTabBar.tsx` + `src/layout/mobile/MobileHeader.tsx` — casca da fase 0                   |
| 5   | Contraste no claro 3,74–4,23: "Editar" `#396caa`/`#dce5ef`, %-variação `#e7000b`/`#008236` sobre azul claro, "em dívidas" `#667085`/`#e0edfa` | /carteira (cards do resumo)       | componentes do resumo da carteira (fase 1)                                                                      |
| 6   | Perf: TBT 2,97 s e bootup 5,5 s na /carteira; LCP 6,6 s no /planejamento (espera de API)                                                      | /carteira, /planejamento          | arquitetura fase 1 / back-end — follow-up, fora da fase 5                                                       |

## Auditoria visual de dark mode (telas mobile das fases 1–3)

Método: Playwright a 390px, build de produção, capturas claro/escuro das 13 telas
(carteira, fluxo, orçamento, planejamento, saúde, dívidas, agenda, relatórios, histórico,
perfil, educação, comunidade, conexões) + varredura de contraste WCAG computada no DOM
(texto × fundo efetivo) + julgamento visual das capturas. Execução de 29/09 arquivada em
`scratchpad/pwa-fase5/qa/dev-E-dark-*.png` (+ `dark-contraste.json`) do workflow.

**Sem achados:** fluxo (mês), dívidas, histórico, perfil. **Falsos positivos:** `tspan`
pretos ocultos do ApexCharts em carteira/planejamento — os eixos visíveis estão em cinza
claro legível nas capturas.

| #   | Tela                 | Achado no escuro (razão de contraste)                                                                                                                                                        | Arquivo / dono                                                                                           |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D1  | Agenda (/calendario) | **Pior da auditoria**: cabeçalho do dia da lista FullCalendar ("1 de setembro de 2026" / "terça-feira") e título do evento em **preto sobre fundo escuro** (1,28–1,54) — ilegível na captura | `src/components/calendar/mobile/agenda-mobile.css` / AgendaFullCalendar (fase 3)                         |
| D2  | Relatórios           | Faixas de classe da Posição Consolidada: branco sobre azul claro `#6E9DC4` (2,88) — lavado também no claro                                                                                   | `src/components/relatorios/PosicaoConsolidada.tsx` (fase 3)                                              |
| D3  | Saúde                | Rótulos `text-gray-400 dark:text-gray-500` (3,56) — o dark usa cinza MAIS escuro que o claro; trocar para `dark:text-gray-400`                                                               | `src/components/saude-financeira/StatusHero.tsx`, `MetasPatrimoniais.tsx` e demais (fase 3)              |
| D4  | Orçamento            | Legenda/eixos do gráfico "Orçado × real" com texto SVG preto (1,19) — dim na captura                                                                                                         | `src/components/cashflow/orcamento/OrcamentoChart.tsx` (fase 2)                                          |
| D5  | Comunidade           | Selo "Consultor" 1,34 (ilegível); "Fixado pela equipe"/"Conquistas" `#396caa` (3,29)                                                                                                         | `src/components/comunidade/PostCard.tsx` — **já no escopo da fatia D** ("selos da Comunidade no escuro") |
| D6  | Educação             | "My Finance · Área de membros" gray-500 (3,56); CTA branco sobre `#0079F2` (4,19, limítrofe)                                                                                                 | `src/components/educacao/EducacaoRoot.tsx` (fase 3)                                                      |
| D7  | Conexões             | Link `privacidade@…` `text-brand-500` `#465fff` (3,66)                                                                                                                                       | pendência antiga do brand-500 — PR separado já registrado, não mexer aqui                                |
| D8  | Comunidade/Educação  | Selos/CTA de texto branco sobre `#0079F2` (4,19)                                                                                                                                             | limítrofe; avaliar junto com D5/D6                                                                       |

Nenhum desses arquivos pertence à fatia E — **nenhuma edição cruzada foi feita**; a tabela
é o insumo do corretor/fatias donas.
