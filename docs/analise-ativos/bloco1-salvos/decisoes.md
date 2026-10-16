# Bloco 1 — Salvos, filtros salvos, comparações + PDF e avisos das listas

Fonte da verdade: `desenho.json` (`arquitetura`). Este registro fecha as decisões do Wellington de
16/10/2026 (todas = recomendação do desenho) e os desvios em relação à spec v2.4 do Pedro e ao
protótipo do designer. Prevalece sobre o protótipo.

> Registro feito aqui (e não em `docs/analise-ativos/v2-filtros/decisoes.md`, como pedia o
> desenho) porque a regra da construção do bloco 1 proíbe mexer em docs fora desta pasta. O
> integrador pode linkar esta seção a partir do `decisoes.md` da v2.

## Decisões do Wellington (16/10)

1. **Listas, filtros, comparações e avisos são PESSOAIS** (molde: tese e cenários,
   `teses/[ticker]/route.ts` e `cenarios/[ticker]/route.ts`). Consultor agindo pelo cliente: GET
   vazio com `podeSalvar=false` e `motivoSemSalvar='consultor'`; mutações 403
   (`MENSAGEM_LISTAS_PESSOAIS` = "As listas são pessoais"); botões desabilitados com o title de
   `TEXTOS_SALVOS.consultor`. O PDF continua liberado (não leva dado pessoal). Os avisos chegam
   sempre ao DONO da lista; o consultor não lê nem marca como lido.
2. **PDF gerado no servidor (pdfkit), sem opções**: nunca posição na Carteira, nome ou e-mail;
   aviso legal em toda página; 10 por hora por usuário em balde próprio (`/api/analise-ativos/
comparacao-pdf`, fora de `/comparador/`); no iOS, `NotAllowedError` vira o botão "Compartilhar
   PDF" (2º toque). Sem mini-gráficos no bloco 1 (o PDF diz "séries anuais disponíveis no app").
3. **Avisos = 3 tipos neutros**: resultado entregue à CVM e provento anunciado (ligados por padrão)
   e mudança no "n de 6" em janela FIXA de 5 anos (desligado por padrão). Sem aviso de preço (spec
   §2), sem "provento pago" (a Agenda já avisa), sem override por ativo, sem chave "juntar" (o
   resumo acima de 5 no dia é fixo). Aba Alertas lê as Notification (`GET /alertas`,
   `POST /alertas/lidos`), retenção ÚNICA de 90 dias (job, export, lgpd-retention). Horário:
   11:10 UTC; a cópia diz "por volta das 8h".
4. **A 1ª lista se chama "Salvos"**; toasts com os literais do Pedro ("WEGE3 salvo em Salvos ·
   você recebe aviso de resultado e data-com" — a 2ª parte só com o recurso alertas — e "WEGE3
   removido de Salvos").
5. **Regra do clique em Salvar**: 0 listas → cria "Salvos"; 1 → alterna nela; 2+ → "Salvar em…"
   (`acaoDoSalvar` / `resolverSentinelaPadrao` no contrato; o sentinela `['padrao']` do PUT só
   resolve com 0 ou 1 lista e dá 400 com 2+). Sem reordenar listas (ordem de criação), sem
   tabelas personalizadas.

## Desvios registrados

- **"Abrir comparador" do modal Comparar continua sem gravar** (desvio da spec §3.2, por causa da
  rec. 7). Só o botão "Salvar comparação" grava.
- **Pílula Ranking reservada SEM rótulo**: 'ranking' está em `PALAVRAS_PROIBIDAS_BLOCO_D`; o nome
  sai no bloco 3 com o jurídico (literal registrado). A casca fica pronta para 4 pílulas.
- **Listas na ordem de criação** (reordenar sai do bloco 1; se pedirem, a coluna é aditiva).
- **PDF sem opções** (o protótipo tinha posição opcional e mini-gráficos).
- **Cortes nos avisos**: provento pago, override por ativo, chave "juntar", limite de 200 ativos
  com aviso e aviso de preço.
- **Texto fixo dos avisos** sem 'compra' nem 'recomendação' (o protótipo dizia "Não constituem
  recomendação de investimento"): literal `aviso-salvos-alertas` = "Os avisos trazem só fatos
  publicados (entregas à CVM e proventos anunciados). Não são análise nem indicação de
  investimento." — provisório, aguarda o jurídico.

## Contratos da fatia 0 (para as fatias A–D)

- Schema: `AnaliseLista`, `AnaliseListaItem`, `AnaliseFiltroSalvo`, `AnaliseComparacao`,
  `AnaliseAlertaEnvio`, `AnaliseAlertaMarco` (`@@map analise_*`; nada de Watchlist) +
  `PushPreferencia.analise`. Migration aditiva `20261017000000_analise_ativos_salvos`.
- Flags (desligadas; só com a área liberada): `ANALISE_ATIVOS_SALVOS_HABILITADO`,
  `ANALISE_ATIVOS_ALERTAS_HABILITADO` (exige SALVOS), `ANALISE_ATIVOS_PDF_HABILITADO` (exige
  COMPARADOR). `/config` devolve `recursos.salvos/alertas/pdfComparador` já com as dependências;
  `exigirRecursosAnalise(req, [...])` exige todos. "Salvar comparação" = salvos && comparador.
- Tipos: `src/types/analiseAtivosSalvos.ts`. Contrato: `src/services/analiseAtivos/salvos/
contrato.ts` (LIMITES_SALVOS, ROTAS_SALVOS, schemas strict, TICKER_RE_POR_CLASSE, chaveComparacao,
  nomeArquivoPdf, hrefComparacao). Hooks: `src/hooks/useAnaliseAtivosSalvos.ts`. Cópia:
  `textosSalvos.ts` e `textosAlertas.ts`. Compartilhados: `ModalNomeLista`,
  `ListaComparacoesSalvas`, `mostrarToastSalvo`, `formatosSalvos`. Stubs da D: `AlertasDaLista`,
  `AbaAlertas`. Tabela/cartões do Quadro: `acaoLinha`, `rotuloColunaAcao`, `colunasExtras`,
  `complementoCriterios`, `rodapeCartao`. URL do Quadro: `?filtro=<id>` (`EstadoQuadro.filtro`).
- Acréscimos ao desenho decididos na fatia 0: `POST /listas` aceita `alertas?` (a opção "Avisar
  resultado e provento anunciado" do Criar lista); `AlertasResposta` traz `podeSalvar` e
  `motivoSemSalvar`; mensagens das rotas em `TEXTOS_SALVOS.servidor`; texto do documento PDF em
  `TEXTOS_SALVOS.pdf.documento`.
