# Fase A — FIIs via CVM Dados Abertos (spike de dados)

Data: 30/09/2026 · Autor: papel "FIIs/CVM" do workflow da Análise de Ativos · Nada gravado em banco (dev só leitura).

## Veredito

A CVM sustenta **a espinha estruturada dos FIIs**: VP/cota, PL, nº de cotas, cotistas, composição do ativo
(tipo tijolo/papel/FoF), alavancagem, lista de imóveis com área/vacância/inadimplência, prazo de vencimento e
indexador dos contratos de aluguel, nº de CRIs. Tudo grátis e cobrindo ~88% dos 527 FIIs listados na B3.
Quatro problemas precisam de desenho na Fase 0:

1. **Ticker não sai do ISIN de forma confiável.** O prefixo do ISIN bate com a sigla B3 em 369/527 (70%).
   Há ISIN com código antigo (BTCI11 = `BRFEXCCTF007`), ISIN com raiz numérica (`BR0EBICTF008` = KNUQ11) e
   prefixo reaproveitado por outro CNPJ (HUSC, TRXF, RTEL). Solução: lista pública da B3 (sigla + razão social)
   → CNPJ por ISIN, depois por nome, e uma **tabela manual** para o resto (~60 fundos).
2. **O "DY do mês" da CVM não serve como rendimento.** Ele é rendimento ÷ **VP/cota** (não ÷ cotação), 40 FIIs
   (21 administrados pelo BTG) informam **0** desde a CVM 175, e em fundos como XPML11/BTLG11 o valor oscila
   sem relação com o que foi pago (XPML jan/26 = −6,52 R$/cota; o pago foi 0,92). Só 65% dos meses batem com a
   `AssetDividendHistory` dentro de 5%. **Rendimento, DY 12m e "meses seguidos" devem vir da nossa
   `AssetDividendHistory` (BRAPI). A CVM fica como segunda fonte e alarme.**
3. **Segmento e Mandato quebraram em ago/2025 (CVM 175).** `Mandato` vem vazio e `Segmento_Atuacao` trocou de
   taxonomia ("Títulos e Val. Mob." sumiu; papel virou "Multicategoria"/"Outros"; MXRF aparece como
   "Logística"). **O tipo tem que sair da composição do ativo** (informe mensal `ativo_passivo`).
4. **120 meses não existem em lugar nenhum.** O informe mensal estruturado começa, na prática, em jan/2017
   (2016 tem 368 linhas). Hoje o máximo é 116 meses e só 1 FII tem ≥ 120. A `AssetDividendHistory` do dev
   também começa em 2016–2018 para os grandes. O C_lucro da spec (120 meses → 10) fica inalcançável até 2027.

Dados que **não existem** em nenhum dataset estruturado da CVM: vacância **financeira**, padrão construtivo
(AAA/AA/A), nome e nº de inquilinos, % de contratos atípicos, LTV, indexador/taxa/duration dos CRIs, % high
yield, cap rate informado. Esses campos vão para a Fase 5 (PDF + revisão), como a spec já prevê.

## Como rodar

```bash
# 1) catálogo e proventos do banco DEV (só leitura)
npx tsx --env-file=.env scripts/analise-ativos/fiis-cvm-probe-db.ts --out=$SCRATCH/fiis-db.json
# 2) lista pública de FIIs listados na B3 (sigla + razão social)
npx tsx scripts/analise-ativos/fiis-b3-listados-fetch.ts --out=$SCRATCH/cvm/b3-fii-listados.json
# 3) spike (lê os zips da CVM; ~6 s)
NODE_OPTIONS=--max-old-space-size=6144 npx tsx scripts/analise-ativos/spike-cvm-fiis.ts \
  --dir=$SCRATCH/cvm --db=$SCRATCH/fiis-db.json --b3=$SCRATCH/cvm/b3-fii-listados.json
```

Saídas: `fiis-cvm-relatorio.json` (cobertura, sanidade, cruzamentos, amostra), `fiis-cvm-todos.json` (1 linha
por FII do universo, 464 linhas), `fiis-cvm-series-amostra.json` (24 meses de VP/cota, rendimento e cotistas).

Correções feitas no script do orquestrador: layout 2016–2020 usa `CNPJ_Fundo`/`Nome_Fundo` (o script lia só
`CNPJ_Fundo_Classe` e perdia 5 anos); regex `_imovel_` casava primeiro `alienacao_imovel` (zerava imóveis);
nº de CRIs contava linhas (o mesmo CRI aparece em vários lotes: 131.508 linhas → 104.397 CRIs distintos; KNCR
147 → 96); tipo por segmento não funciona depois de ago/2025; ticker por ISIN precisava de desempate e da
lista B3; `Valor_Justo` do informe anual é flag S/N, não valor.

## Cobertura medida (universo = 464 FIIs com sigla B3 casada e informe nos últimos 6 meses)

| Item | Valor |
| --- | --- |
| FIIs listados na B3 (lista pública) | 527 |
| Casados com CNPJ da CVM | 467 (369 pelo ISIN, 98 pelo nome); 4 ambíguos; 56 sem casamento |
| Universo com informe recente (até ago/2026) | 464 |
| Com VP/cota / cotistas / passivo | 462 / 461 / 463 |
| Histórico ≥ 12 / 60 / 96 / 120 meses | 421 / 282 / 143 / 1 |
| DY do mês > 0 no último informe (ago/26) | 257 (55%) |
| "Pagava e passou a informar DY = 0" (últimos 6 meses) | 40 (21 BTG, 4 Vórtx, 3 Intrag…) |
| Tipo por composição | tijolo 268 · papel 85 · FoF 59 · híbrido 7 · outro 43 · sem dado 2 |
| Tipo p/ critérios (híbrido → regra da spec) | tijolo 268 · papel 92 · FoF 59 · outro 43 |
| Tijolo com trimestral recente (2T26/1T26) | 201 de 268 |
| Tijolo com nº de imóveis / área / vacância física | 200 / 196 / 196 |
| Tijolo com inadimplência (ponderada pela receita) | 153 |
| Tijolo com vencimento dos contratos (prazo médio aprox.) | 142 |
| Tijolo com indexador dos aluguéis (IPCA/IGP-M) | 136 |
| Papel com lista de CRIs (nº distintos; mediana) | 86 de 92 (mediana 27) |
| Papel com inadimplência | 5 de 92 (a CVM só pede inadimplência de imóvel, não de CRI) |
| Top 100 por PL: tijolo com vacância / prazo / inadimplência | 59 / 49 / 53 de 63 |
| Top 100 por PL: papel com lista de CRIs | 26 de 27 |

Os 67 tijolos sem trimestral recente: 57 entregam o trimestral mas sem nenhuma linha de imóvel — são fundos de
desenvolvimento ou que têm os imóveis via SPE (`Acoes_Sociedades_Atividades_FII`). Neles vacância/nº de imóveis
não se aplicam → "dados incompletos".

## Amostra (informe mensal ago/2026; trimestral 2T26)

| Ticker | Tipo (composição) | Tipo legado | Meses | VP/cota | Cotistas | PL R$ mi | Rend. 12m/cota (CVM) | Meses seguidos (CVM) | Obrig./PL % | Imóveis | Área m² | Vac. física % | Inadimpl. % | Prazo contratos (anos, aprox.) | IPCA % receita | nº CRIs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HGLG11 | tijolo | tijolo | 116 | 165,95 | 608.345 | 7.568 | 13,19 | 116 | 16,2 | 37 | 2.066.028 | 2,4 | 0,00 | 3,4 | 78,9 | 0 |
| KNRI11 | tijolo | hibrido | 116 | 163,56 | 313.382 | 4.613 | 13,11 | 116 | 8,4 | 18 | 685.937 | 0,1 | 0,40 | 2,5 | 58,4 | 3 |
| XPML11 | tijolo | tijolo | 105 | 110,11 | 733.101 | 7.081 | 3,24 ⚠ | 7 ⚠ | 14,3 | 17 | 679.658 | 5,2 | 2,77 | — | 0,0 | 2 |
| VISC11 | tijolo | tijolo | 116 | 115,45 | 345.414 | 3.328 | 9,94 | 52 ⚠ | 32,7 | 32 | 1.244.517 | 5,8 | 1,75 | 3,1 | 10,8 | 2 |
| BTLG11 | tijolo | hibrido | 116 | 106,69 | 525.374 | 7.568 | 9,26 | 82 | 4,4 | 30 | 1.404.289 | 2,2 | 0,37 | 3,5 | 58,8 | 3 |
| XPLG11 | tijolo | tijolo | 99 | 104,65 | 366.494 | 5.378 | 9,80 | 79 | 14,6 | 29 | 1.455.768 | 18,3 | — | — | — | 0 |
| HGRU11 | tijolo | hibrido | 101 | 128,11 | 232.516 | 3.182 | 11,91 | 100 | 10,5 | 98 | 598.745 | 0,8 | 0,00 | 4,7 | 73,1 | 3 |
| TRXF11 | tijolo | hibrido | 83 | 96,62 | 351.702 | 6.032 | 12,47 | 53 | 70,3 ⚠ | 91 | 1.600.657 | 0,0 | — | — | — | 19 |
| MXRF11 | papel | hibrido | 116 | 9,26 | 1.529.305 | 5.252 | 1,15 | 88 | 1,4 | 0 | — | — | — | — | — | 77 |
| KNCR11 | papel | papel | 116 | 102,64 | 586.131 | 10.991 | 14,02 | 116 | 0,1 | 0 | — | — | — | — | — | 96 |
| KNIP11 | papel | papel | 116 | 93,38 | 72.683 | 7.478 | 10,11 | 116 | 3,0 | 0 | — | — | — | — | — | 119 |
| CPTS11 | **fof** | papel | 117 | 8,48 | 398.543 | 3.082 | 1,11 | 102 | 23,2 | 0 | — | — | — | — | — | 11 |
| IRDM11 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| RECR11 | papel | papel | 107 | 87,70 | 173.041 | 2.319 | 10,83 | 92 | 5,2 | 1 | 11.867 | 100 ⚠ | — | — | — | 100 |
| HFOF11 | fof | papel | 103 | 7,56 | 87.636 | 1.646 | 0,71 | 102 | 0,0 | — | — | — | — | — | — | — |

Leituras:
- **IRDM11** não tem informe desde out/2025 (CNPJ 28.830.325/0001-10). A B3 lista hoje **IRIM11** (Iridium,
  CNPJ 41.076.564/0001-95), que por sua vez informa DY = 0. Caso real de mudança de ticker que o mapa precisa
  tratar (e IRDM11 não está no nosso catálogo dev).
- **XPML11 e VISC11**: "meses seguidos" pela CVM dá 7 e 52 porque o administrador informou DY ≤ 0 em algum mês
  (XPML jan/26 = −6,52). Os dois pagaram todo mês (a `AssetDividendHistory` confirma). Prova de que C_lucro não
  pode vir do campo da CVM.
- **CPTS11** vira FoF pela regra de composição (cotas de FII = 94% do PL, CRIs 28%, alavancado). O legado CVM
  dizia "Títulos e Val. Mob.". Precisa de decisão de produto (ver perguntas).
- **TRXF11** obrigações/PL de 70%: é o passivo informado (obrigações por aquisição e securitização). Não é LTV
  de CRI. Checar com o relatório gerencial antes de usar no C_dívida.
- **RECR11** tem 1 imóvel 100% vago (imóvel retomado de CRI): em fundo de papel, vacância não entra nos critérios.
- **Área** ≈ ABL declarada por imóvel (HGLG 2,07 mi m²). Não há campo "ABL" separado; em alguns fundos `Area` é
  a área do terreno. Tratar como "área informada".

## (a) ISIN → ticker × catálogo dev (`Asset type='fii'`)

- O catálogo dev tem 1.756 linhas `type='fii'`: **379 com ticker** (source brapi) e **1.377 `CVM-<cnpj>`** (fundos
  sem ticker vindos do cadastro da CVM; 1.350 casam por CNPJ com o informe).
- Dos 379 com ticker: **16 não são FII** (PLPL3, LAVV3, HBRE3, MULT3, MELK3, CCTY3, FIEI3, BMOB3 e as
  versões fracionárias `…3F`). É erro de classificação no catálogo.
- 6 são **recibos/direitos** (RTEL16, TRPL15, SPG215, SPGM15/16, AVUR15): resolver pela raiz `XXXX11`.
- Com a lista B3, **314 tickers "11" casam e estão no universo** (331 casariam só pelo ISIN, mas com erros:
  o ISIN leva, por exemplo, TRXF para um CNPJ de ações).
- 26 tickers do catálogo não achamos na CVM (ex.: BTHF11, FYTO11, PLAG11, TRUE11, PCIP11, CPSH11, SHOP11).
  São fundos que existem na B3, mas a razão social diverge do nome na CVM e o ISIN tem código diferente → tabela
  manual.
- 17 casam mas a CVM diz `Mercado_Negociacao_Bolsa=N` (ex.: PDBM11, DVLP11, GSFI11, KOPA11 sem informe desde
  mai/25).
- **150 FIIs do universo não estão no nosso catálogo** (ANCR11, VERE11, SAIC11…).
- Colisões de prefixo de ISIN (mais de um CNPJ com o mesmo código): 25 (HUSC, RTEL, VTPA…).
- 298 fundos têm `Mercado_Negociacao_Bolsa=S` e ISIN CTF mas **não estão na lista da B3** (245 com raiz numérica,
  quase todos com 1 a 10 cotistas: fundos "listados" que nunca negociam). O `=S` da CVM não serve para montar o
  universo.
- Fundos com classes (CVM 175): no informe, `Tipo_Fundo_Classe` é "Classe" em 99% das linhas. Cada classe tem o
  próprio CNPJ e ISIN. Não achamos um fundo listado com duas classes negociadas.

## (b) Rendimento CVM × `AssetDividendHistory`

Comparação: rendimento CVM = `Percentual_Dividend_Yield_Mes × Valor_Patrimonial_Cotas` do mês M, contra a soma
dos proventos da nossa base com data-com em M (sem data-com: mês do pagamento − 1). Período jan/25–mai/26.

| FII | Meses | ≤ 1% | ≤ 5% | Leitura |
| --- | --- | --- | --- | --- |
| HGLG11 | 17 | 15 | 16 | bate (1,10/mês) |
| KNRI11 | 17 | 17 | 17 | bate, inclusive o 1,25 de dez/25 |
| KNCR11 | 17 | 16 | 16 | bate (out/25: CVM 1,1976 × base 1,33) |
| VISC11 | 17 | 16 | 16 | bate |
| MXRF11 | 17 | 5 | 16 | arredondamento (base 0,10; CVM 0,0975–0,1033) |
| HFOF11 | 17 | 4 | 16 | desdobramento 1:10 em mai/25 bagunça o mês |
| CPTS11 | 17 | 2 | 12 | CVM oscila em torno do pago |
| RECR11 | 17 | 1 | 6 (16 com ±1 mês) | CVM informa com **1 mês de defasagem** |
| BTLG11 | 17 | 1 | 4 | CVM oscila (0,31 a 1,33) sem relação com o pago (0,78–0,81) |
| XPML11 | 17 | 0 | 3 | CVM oscila; jan/26 = −6,52 |

Geral (213 FIIs, 3.515 meses): 48% dos meses dentro de 1%, 65% dentro de 5%, 70% aceitando ±1 mês. Em 14% dos
meses a CVM traz 0 e a base traz provento. Só 119 de 213 FIIs têm ≥ 80% dos meses dentro de 5%.
**Conclusão:** a fonte de rendimento é a `AssetDividendHistory` (já é BRAPI paga). Hoje ela cobre 253 FIIs no dev
e a última data é jun/2026 (o dev está parado). A CVM serve de alarme: divergência > 5% por 3 meses → revisar.

## (c) Vacância financeira

**Não existe** em nenhum dataset estruturado. O informe trimestral (`imovel`) tem `Percentual_Vacancia`
(sem dizer se é física ou financeira; pelos valores e pela instrução, é **física/por área**), `Percentual_Inadimplencia`,
`Percentual_Receitas_FII` e `Percentual_Locado`. Receita por imóvel ÷ receita potencial não é informada, então
não dá para derivar a financeira. O informe anual também não tem. Vacância financeira vai para a extração de PDF
(Fase 5) ou sai da tela no MVP.

## (d) Campos da spec: estruturado × só PDF

| Campo da spec | Fonte estruturada | Status |
| --- | --- | --- |
| VP/cota, PL, nº cotas, cotistas | mensal `complemento` | ✅ 99% |
| P/VP | VP/cota (CVM) + cotação (BRAPI) | ✅ |
| Rendimento/cota, DY 12m, meses seguidos | `AssetDividendHistory` (CVM só de alarme) | ⚠ ver (b) |
| Tipo tijolo/papel/FoF/híbrido | mensal `ativo_passivo` (composição ÷ PL) | ✅ (segmento/mandato não servem) |
| Segmento (logística, shopping…) | mensal `geral.Segmento_Atuacao` | ⚠ taxonomia nova, "Multicategoria" em 42% |
| Obrigações/PL (alavancagem) | `Total_Passivo − Rendimentos_Distribuir` ÷ PL | ✅ |
| Taxa de administração | mensal `% despesas taxa adm` / trimestral `Taxa_Administracao` | ✅ |
| Taxa de performance | trimestral `Taxa_Desempenho` | ✅ (valor R$, não % contratual) |
| Receita, resultado, rendimento declarado, payout | trimestral `resultado_contabil_financeiro` | ✅ (acumulado no semestre no 2º tri) |
| Nº imóveis | trimestral `imovel` (classe "renda acabados") | ✅ 200/268 tijolo |
| ABL (m²) | trimestral `imovel.Area` | ⚠ área informada, às vezes terreno |
| Vacância física | trimestral `imovel.Percentual_Vacancia` ponderada pela área | ✅ 196/268 |
| Vacância financeira | — | ❌ PDF |
| Inadimplência (tijolo) | `imovel.Percentual_Inadimplencia` ponderada pela receita | ✅ 153/268 |
| Prazo médio dos contratos (WALE) | trimestral `complemento` (faixas de vencimento em % da receita) | ⚠ aproximado (faixa "> 36 meses" sem teto; usei 5 anos) |
| Indexador dos aluguéis (IPCA/IGP-M) | trimestral `complemento` | ✅ 136/268 |
| Contratos atípicos (%) | só texto livre (`Caracteristicas_Contratuais`; 31 fundos citam "atípico") | ❌ PDF |
| Nº de inquilinos, maior inquilino | `inquilino` só traz **setor** por imóvel (com rótulos "Setor1…SetorN"), sem nome | ❌ PDF (proxy: maior setor % receita) |
| Padrão construtivo AAA/AA/A | — | ❌ PDF |
| Cap rate | receita de aluguel (trimestral) ÷ valor dos imóveis (mensal) | ⚠ derivável (proxy contábil), não informado |
| Preço/m² | valor de mercado ÷ área | ⚠ derivável com a mesma ressalva da área |
| Nº de CRIs | trimestral `ativo` (tipo CRI/CRA), distintos por código | ✅ 86/92 papel |
| Concentração (maior CRI % da carteira) | trimestral `ativo.Valor` | ✅ |
| Indexador, taxa média, duration, LTV, high yield, inadimplência dos CRIs | — (o `ativo` não traz vencimento, taxa nem indexador; `Data_Vencimento` vazio em 100% das 7.023 linhas de CRI do 2T26) | ❌ PDF |
| Valor contábil/justo por ativo | anual `ativo_valor_contabil` | ✅ 1.010 fundos em 2025 |
| Distribuição de cotistas por faixa | anual `distribuicao_cotistas` | ✅ (extra) |

## Regras de sanidade (medidas)

| Regra | Ocorrências no universo (histórico) | Ação proposta |
| --- | --- | --- |
| Última versão por (CNPJ, data) | há reenvios (Versao 2, 3) | sempre ficar com a maior `Versao` |
| DY do mês < 0 | 1.025 fundo-meses | não usar como rendimento; marcar |
| DY do mês > 5% | 191 (CARE11 15%/mês, ANCR11 15%) | evento ou erro de escala → ignorar/alertar |
| DY = 0 em fundo que pagava | 40 FIIs nos últimos 6 meses | usar provento da base; alertar |
| PL ≤ 0 | 147 (PABY11 2019–20) | excluir do Índice MF ("dados incompletos") |
| Passivo > PL | 1.527 | alavancagem > 100%: exibir, mas conferir |
| VP/cota salta > 30% m/m sem mudar nº de cotas | 236 | provável erro de digitação ou reavaliação; alerta |
| Nº de cotas × 5 m/m | 137 | desdobramento → ajustar séries por cota |
| Cotistas ±50% m/m (base > 1.000) | 162 | alerta (RBRD11 7.519 → 62) |
| PL/cotas ≠ VP/cota (> 1%) | 56 | recomputar VP/cota = PL/cotas |
| Σ % receita dos imóveis > 105% | 4 (CXCO11 Σ = 10; ADSH11 1,98) | escala errada → descartar inadimplência do fundo |
| Vacância em 100% / 0% | 7 tijolos com 100%; 83 com 0% | 0% é comum (monoinquilino); 100% em papel = imóvel retomado |
| Área por imóvel > 500 mil m² | 3 | área de terreno → não usar como ABL |
| Ticker: mais de um CNPJ com o mesmo prefixo de ISIN | 25 | a lista B3 decide; senão tabela manual |
| Mudança de ticker | IRDM11 → IRIM11 | tabela de-para com vigência |

## Recomendações para a Fase 0

1. **Tabelas:** `fii_monthly` (cnpj, ref_month, versao, vp_cota, pl, cotas, cotistas, dy_mes_cvm, taxa_adm,
   ativo, passivo, rend_distribuir, imoveis, spe, recebiveis, cotas_fii, renda_fixa + proveniência) e
   `fii_quarterly` (cnpj, ref_quarter, n_imoveis, area, vacancia_fisica, inadimplencia, prazo_medio_aprox,
   venc_ate_12m, idx_ipca, idx_igpm, n_cri, maior_cri_pct, receita_aluguel, resultado, rendimentos_declarados).
   Ambas point-in-time por (cnpj, período, versão). `fii_property_quality` fica para o que vem de PDF.
2. **Chave = CNPJ, não ticker.** Nova `fii_ticker_map` (ticker, cnpj, valid_from, valid_to, origem:
   b3_isin | b3_nome | manual). Preencher `Asset.cnpj` dos 379 FIIs com ticker e corrigir os 16 que não são FII.
3. **Jobs (cron Lightsail):** (i) mensal: baixar `inf_mensal_fii_AAAA.zip` do ano corrente todo dia 20 (o
   informe sai até o dia 15 do mês seguinte) e reprocessar os últimos 3 meses (reenvios); (ii) trimestral:
   `inf_trimestral_fii_AAAA.zip` semanal nos 60 dias após o fim de cada trimestre; (iii) anual: 1× por ano;
   (iv) lista B3 de FIIs: semanal, gerando alerta de sigla nova, sumida ou mudada.
4. **Ordem:** mapa ticker↔CNPJ → mensal (backfill 2017+) → composição/tipo → trimestral → derivados (P/VP,
   DY 12m pela `AssetDividendHistory`, meses seguidos pela base de proventos) → sanidade.
5. **Tipo:** regra única pela composição do último mês (imóveis diretos + SPE ≥ 50% do PL → tijolo; recebíveis ≥ 50%
   → papel; cotas de FII ≥ 50% → FoF; senão híbrido/outro) com histerese (mudar só depois de 3 meses seguidos)
   e override manual.
6. **Rendimento:** fonte primária `AssetDividendHistory`. Completar a cobertura: hoje só 253 FIIs têm provento no
   dev, contra 464 no universo. A CVM entra como checagem.
7. **Índice MF:** o C_lucro (120 meses) precisa de ajuste. O teto real hoje é 116 meses pela CVM e ~100–120 pela
   base de proventos.

## Riscos

- O layout da CVM mudou 2× (2021: `CNPJ_Fundo` → `CNPJ_Fundo_Classe`; ago/2025: Mandato/Segmento). Vai mudar de
  novo: o parser precisa validar o cabeçalho e alertar.
- O preenchimento varia por administrador (BTG informa DY = 0; XPLG não preenche % de receita; a área às vezes é
  o terreno). O mesmo campo tem qualidade diferente por fundo.
- O endpoint da B3 é público mas não documentado (payload base64); pode mudar sem aviso.
- A defasagem natural dos dados: mensal de 15 a 45 dias, trimestral até 60 dias. O 2T26 só fica completo no fim
  de agosto.
- Vacância física "ponderada por área" depende de a área ser ABL. Em fundo de shopping ou misto isso pode
  distorcer.
- O prazo médio dos contratos é aproximado (faixas de 3 meses e um balde aberto "> 36 meses").
