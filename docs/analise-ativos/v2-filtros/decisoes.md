# Análise de Ativos v2.4 — Índice MF → Filtros de Fundamentos · decisões (13/10/2026)

Origem: spec v2.4 do Pedro (`../spec-v2-pedro-out2026/`) + decisões D1–D6 do Wellington (13/10, "Pode seguir com as
recomendações"). Desenho: workflow wf_a183df45-9e9 (arquiteto + designer → revisor crítico [4 altas, 8 médias,
5 baixas, todas incorporadas] → revisão final). Saídas completas em `spec-desenho.json`; protótipo em
`prototipo.html` (https://claude.ai/artifact/UDPRNGChL8QWAgJvBu77RV).

## Decisões já tomadas (13/10)

- D1 Estrutura, textos, ordem e comportamento = HTML do Pedro; cores = paleta My Finance (brandColors.ts), fonte do app.
- D2 Fundamentos seguem da CVM/COTAHIST. "Lucro descontado" não existe na CVM → "Lucro líq. ⓘ"/"Margem líq. ⓘ" com aviso.
- D3 FII: vacância (CVM ≠ gestor), inadimplência e LTV = "— sem dado nas demonstrações" para todos; chip
  Vacância/Inadimplência desabilitado; alavancagem = "Obrigações/PL ≤ 20%".
- D4 Financeiras (bancos, seguradoras, holdings — flag ehFinanceira): EBITDA, Dív.líq/EBITDA e FCL "não se aplica" → "n de 3".
- D5 Fora: Ranking/votos/teses públicas, Stocks/REITs, Salvos/Criar lista/Salvar (escondidos, sem "em breve").
- D6 Drop do score (AssetScore, colunas indice\*/semáforo, parte do ScoringParams) = etapa separada, depois de 2 ciclos
  estáveis da R2, com backup e OK.

## Recomendações do desenho — APROVADAS pelo Wellington em 13/10 ("pode seguir")

1. Planejar na carteira reusa o **Objetivo** que já existe na Carteira (Portfolio/Watchlist.objetivo, % DENTRO da aba).
   Sem tabela nova. Tela mostra "alvo 25% de Ações · posição 20,4% · desvio −4,6 p.p."; % da carteira só informativo.
   (A spec pede % da carteira em planning_asset_targets → caso 33 muda de base; perguntar ao Pedro.)
2. Registrar operação = modal rápido sobre as rotas reais (POST /api/carteira/operacao e /resgate), com Venda só com
   posição, seção da Carteira obrigatória na 1ª compra, instituição da venda = a da última compra, link p/ o formulário completo.
3. FoF e fundo sem tipo: regra da spec (imóveis ≥ 50% do PL → tijolo; senão papel); FoF aparece como "FoF".
4. Rendimento todos os meses: âncora jan/(fim−J+1)–dez/fim; base de proventos que começa depois da janela → "sem dado".
5. Janela 10 anos em FIIs mantida com nota (informes CVM desde 2016 → quase tudo "sem dado").
6. Rodapé legal: redação única adaptada à D5, PROVISÓRIA, levada ao jurídico (TEXTOS_LITERAIS_OBRIGATORIOS).
7. Comparar não grava (há "Copiar link"); Quadro em cartões no celular; "Área (CVM)" no lugar de ABL.
8. Quadro continua filtrado/ordenado no servidor (685 linhas em memória, < 2 ms).
9. Consultor agindo por cliente pode Ver, Planejar e Registrar, com aviso (tese segue privada).

## Construção (fatias sem arquivo em comum)

0 contratos (aditiva, bloqueante) → em paralelo A motor de critérios + job 'criterios' (10:30 UTC) + testes §4.5 ·
B Quadro/busca/casca · C1 cabeçalho + modais da Carteira · C2 critérios/Essencial/Valuation/cenários em branco/pares ·
D Comparador sem destaque → F limpeza e varredura global (sequencial).
Produção: R1 (0+A, invisível: migration aditiva, seed criteria_params, job, cron) → R2 (UI inteira de uma vez; nenhuma
API com chave /indice|semaforo|destaque/) → D6.

## Cobertura medida no DEV (janela 5 / 10)

Ações não financeiras 95–98% / 75–79% por critério; FIIs 37–72% / ~0%. Limites v1 em 330 ações (janela 5): Receita 110,
Lucro 29, EBITDA 52, Margem 208, Dív/EBITDA 168, FCL 2 — ninguém tem 6 de 6.

## Perguntas para o Pedro (com recomendação)

Ver `spec-desenho.json` → arquitetura.perguntas_para_pedro (14 itens): limites (FCL crescente quase ninguém passa),
base do alvo (% da aba), financeiras n de 3, FII sem dado + lista dos 50 da curadoria, nome Obrigações/PL, FoF, lucro
líquido no lugar de descontado, janela 10 em FII, rendimento/cota = proventos pagos, âncora de anos, Dív/EBITDA com
caixa líquido, meses sem dado, Registrar operação com venda e seção, itens que divergem do HTML.
