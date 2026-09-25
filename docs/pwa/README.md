# My Finance no celular (PWA) — plano e histórico

Pedido do Pedro (23/09/2026): o site é ruim de usar no celular. Decisão do Wellington: **PWA feito por nós, sem terceiro, cobrindo o sistema inteiro** — a mesma base fica responsiva (nada de área `/m` separada); o desktop (>= 1024px / `lg`) não muda.

## Estratégia de branch e teste (decisão de 25/09/2026)

- **Nada vai para a `main` (= produção) até as fases 0–3 estarem completas.** `feat/pwa-fase0` é o
  branch de integração do PWA (PR #244, em rascunho, "não mergear até completo").
- Cada fase = um branch próprio (`feat/pwa-fase1-carteira`, …) com **PR apontando para
  `feat/pwa-fase0`**, revisado e mergeado fase a fase. No fim, um único merge leva tudo para a `main`.
- Trazer a `main` para o branch do PWA com frequência (`git merge origin/main`) para não divergir.
- A migração `20260924120000_user_session_version` existe só no banco de dev até o merge final.
- Teste do Wellington/Pedro: **visão de celular do navegador** (DevTools → modo dispositivo) no dev
  server do branch do PWA — sem instalar e sem túnel. Instalação/aparelho real fica para o fim.

## Fases

| Fase                  | Conteúdo                                                                                                                                                                                                                                                                                           | Status                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0 · Base              | App instalável (manifest, ícones, service worker, offline), casca mobile (cabeçalho, barra de abas Carteira · Fluxo · ＋ Lançar · Planejar · Mais), primitivos (Modal→sheet, BottomSheet, ResponsiveTable), sessão de 30 dias + "Sair de todos os dispositivos", testes de transbordo e de desktop | **PR #244** (24/09) — base do branch do PWA |
| 1 · Carteira          | Resumo, 12 abas de classes (tabelas → cartões), página/edição do ativo, wizard de cadastro, aporte/resgate, reservas, Caixa para Investir, proventos, Análises; medir performance no 4G (carteira > 9 s em dev)                                                                                    | próxima                                     |
| 2 · Fluxo de caixa    | "Visão do mês" com **edição completa** via sheet (grade de 12 meses em "ver ano inteiro"), Orçamento, **lançamento rápido real** no ＋ (reaproveitar `services/assistente/lancamento.ts` + `recordChange`/Desfazer)                                                                                | —                                           |
| 3 · Demais módulos    | Planejamento, Saúde, Dívidas, Agenda (lista no celular), Relatórios/PDF, Histórico, Perfil, Educação, Comunidade, Conexões bancárias                                                                                                                                                               | —                                           |
| 5 · Push + acabamento | Web push (PushSubscription + VAPID + `web-push`, ligado às notificações existentes), teste com testers, Lighthouse, dark mode                                                                                                                                                                      | —                                           |
| (depois)              | Consultor e Admin (ficaram FORA desta rodada); Capacitor para lojas (+1–2 sem)                                                                                                                                                                                                                     | —                                           |

Rotas ainda transbordando a 390px (exceções no teste `KNOWN_OVERFLOW`): `/carteira` (fase 1), `/calendario` e `/historico-alteracoes` (fase 3) — tirar da lista quando consertar.

## Como cada fase é executada (formato combinado com o Wellington)

1. **Workflow de desenho** (~5 agentes): arquiteto + designer UI/UX em paralelo → revisor crítico → os dois revisam. Designer usa a skill `artifact-design` e gera protótipo HTML navegável (celular + miniatura desktop). Script modelo: `workflow-desenho.js`.
2. Publico o protótipo como artifact e apresento resumo + perguntas (com recomendação). **Pausa para aprovação do Wellington** (ele pediu a pausa).
3. **Workflow de construção e QA** (~12 agentes): fatia 0 de contratos na branch → devs em `isolation: 'worktree'` com arquivos disjuntos → integrador (cherry-pick, tsc, lint, vitest dos tocados, build) → QA mobile (skill `verify`, build de produção, 390/320px, cliente e consultor) + QA desktop (antes/depois vs main) + revisor de código (skill `code-review`) + segurança (skill `security-review`) em paralelo → corretor (confirma antes de corrigir) → reverificação. Script modelo: `workflow-construcao.js`.
4. Eu confiro (tsc, lint, suíte, navegador), commito ajustes, faço push e abro o PR. **Merge é do Wellington.**

Arquivos da fase 0 nesta pasta: `fase0-spec-desenho.json` (spec final do arquiteto + design + revisão), `fase0-decisoes.md` (decisões do Wellington), `fase0-prototipo.html` (publicado em https://claude.ai/artifact/MiXvWqRUHvUtJbk8UHhs9f).

## Gotchas aprendidos na fase 0

- Worktree dos agentes: `ln -s /home/huske/dev/front/node_modules node_modules` + copiar `.env`/`.env.local`; cada dev server numa porta própria (32xx/33xx).
- Playwright no WSL: chromium em `~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` + libs extraídas sem sudo (`apt-get download` + `dpkg -x`, `LD_LIBRARY_PATH`) — receita na skill `verify`.
- React Query Devtools (só dev) cobre a aba Mais: esconder com `.tsqd-parent-container{display:none!important}` nos testes.
- O service worker só registra em build de produção (`npm run build && npx next start`).
- Overlay novo nas próximas fases: usar `Modal`/`BottomSheet` ou marcar `data-mf-overlay` (senão a barra de abas fica por cima).
- Vitest: 3 arquivos `Step4{TesouroDireto,MoedasCriptos,FundoDebenturePrevidencia}Fields.test.tsx` travam (também na main) — excluir ao rodar a suíte.

## Pendências registradas

- Teste em aparelho real (Android/iPhone: instalar, splash, rotação, barra some com teclado).
- ~20 achados leves de a11y/testes da fase 0 (no relatório do workflow; ex.: Modal sem nome acessível, ThemeToggle sem label no Mais, texto "Manter conectado por 30 dias" para admin/consultor que ganham 1 dia, revogação do token iCal).
- Logout não revoga o JWT no servidor (só "Sair de todos") — revogar por aparelho exige tabela de sessões.
- PR separado: `brand-500` #465fff fora da paleta (muda desktop).
