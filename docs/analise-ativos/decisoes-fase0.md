# Análise de Ativos — decisões para a Fase 0 (30/09/2026)

**Origem:** o Wellington adotou em bloco as recomendações do plano (`plano-execucao-set2026.md` §4) e do
relatório da Fase A (`fase-a/RELATORIO-FASE-A.md` §6 e §7), em 30/09/2026. Essas decisões **prevalecem** sobre a
spec v1.3 e o protótipo onde houver conflito. Todo limiar é parâmetro de `ScoringParams` (versão 1): o Pedro pode
recalibrar depois sem mudar código.

## Escopo e fontes
- Classes da Fase 0: **Ações B3 e FIIs**. Stocks/REITs ficam na Fase 4, mas `AssetFundamentalsPeriod` e
  `AssetStatementLine` já nascem com `source`, `sourceConcept` e `accession` para receber a SEC depois.
- Fontes: **CVM Dados Abertos** (DFP, ITR, FRE, FCA, IPE, Informe Mensal/Trimestral de FII), **COTAHIST da B3**
  (preço cru + volume), **listas públicas da B3** (ClassifSetorial, FIIs listados). BRAPI só para cotação do dia e
  proventos. Nada de Bolsai/Fintz. O app **nunca** chama fonte externa na renderização.
- Visual (Fase 1+): paleta e componentes do My Finance; o protótipo é referência de conteúdo, não de cor.
- Comunidade da análise (voto, ranking, teses): Fase 3, atrás de flag, ligada só após parecer jurídico.

## Respostas às 28 perguntas (relatório §7) — todas pela recomendação
1. Vale a **fórmula** da §4.1. As notas do protótipo não são alvo; gerar a tabela de notas reais dos ~50 ativos
   do protótipo para o Pedro recalibrar, se quiser.
2. Bancos e seguradoras: critérios sem sentido = **"não se aplica"**, com peso redistribuído entre os demais e
   leitura "n de 4 critérios". Indicadores próprios de banco ficam para depois.
3. Bancos: usar o **individual BR GAAP** e exibir o padrão contábil.
4. FII de papel no MVP: critérios provisórios com dado CVM (**concentração do maior CRI** e **nº de CRIs**) no
   lugar de LTV/inadimplência, com nota "critérios provisórios".
5. FII tijolo, 5º critério até existir padrão construtivo: **Obrigações/PL**.
6. Vacância e nº de imóveis da CVM: exibir como "fonte CVM · pode diferir do relatório do gestor"; **fora do
   critério** até validar ~20 fundos contra os gerenciais (tarefa de curadoria, fora da Fase 0).
7. "Alavancagem" de FII = **Obrigações/PL**, com esse nome (nunca "LTV" nem "alavancagem").
8. **FoF fora do Índice** no MVP (página e dados sim).
9. Tipo de FII **pela composição**, com histerese de 3 meses e override manual documentado.
10. "Preço vs. histórico" do semáforo = **P/L contra a média de 10 anos** (coerente com Índice e Valuation).
11. Payout = **proventos declarados no ano (DMPL) ÷ lucro do ano**; selo acima de 150%.
12. Extraordinários: sem ajuste, com nota automática.
13. Units e duas classes: **Índice MF por empresa**; múltiplos e voto por ticker.
14. Universo de FIIs no Quadro: **negociados nos últimos 30 pregões**; demais só na busca. Fiagro fora.
15. Top FIIs por liquidez: **média de volume financeiro dos últimos 21 pregões**.
16. Pares do setor: **segmento B3**, completando com o subsetor até 5.
17. Data de resultado **"estimada"** até sair a oficial, com esse rótulo.
18. Campos só em PDF: **esconder** a linha no MVP (sem "em breve").
19. Múltiplo histórico = **cotação crua do último pregão do ano × ações ÷ métrica**.
20. Ranking: **m = 20** no início, C por classe.
21. Variação mensal: subir de 5º para 3º = **▲2**.
22. Conta com < 30 dias que tem o ativo: **peso 0,5**.
23. Selo "convergem" compara com a **nota bayesiana**.
24. Badge: **"Índice acima da comunidade"** (nunca "nota").
25. EUA/Premium: decidir junto com o preço do Premium (fora da Fase 0).
26. Perguntar à BRAPI sobre licença de exibição de cotação EUA (ação do Wellington, fora da Fase 0).
27. Escopo EUA: S&P 500 + MSCI US REIT, sem REITs hipotecários (Fase 4).
28. REIT: ocupação, Dív/EBITDA e FFO payout "em revisão" até a extração; FFO = Nareit reportado (Fase 4).

## Ajustes na spec (relatório §6)
Todos adotados conforme a proposta de cada item do relatório §6 (inclui: sinal da variação do ranking, barra de
posição com média negativa, regra de híbrido corrigida, ⌈⌉ da Meta de renda com arredondamento, três estados
ausente/zero/não se aplica).

## Achados em produção (30/09, só leitura) que afetam a Fase 0
- **Preço D-1 gravado como D:** a BRAPI devolve `regularMarketTime` = hora da consulta; o cron roda às 07:11 UTC,
  então `asset_price_history` (fonte BRAPI) guarda o fechamento do pregão anterior com a data do dia, inclusive em
  sábados e domingos (~15% das linhas BRAPI desde out/2025). O COTAHIST em prod parou em 2026-06-12. **A Fase 0
  não usa `asset_price_history` para múltiplos** — usa `AssetQuoteDaily` do COTAHIST (preço cru). A correção do
  bug no app atual é ticket separado.
- **`dataCom` = data EX:** `extractExDate` prefere `exDate` a `lastDatePrior`; em prod 100% das linhas BRAPI
  guardam a data ex no campo `dataCom` (PETR4: data-com real 02/05/2024, gravado 03/05/2024). A Fase 0 deve usar a
  data-com verdadeira (`lastDatePrior`) em DPA por data-com. Correção do app atual = ticket separado.
- **Tranches colapsadas:** NÃO confirmado em prod (PETR4 2024 soma R$ 7,79 ≈ real). O caso −R$ 1,40 era do banco
  dev. Risco a vigiar: a BRAPI às vezes repete o mesmo provento com outra data-com (PETR4 set/2024 aparece 2×) e a
  política atual de SOMAR duplicaria no próximo refresh — a auditoria de proventos da Fase 0 deve tratar isso.
