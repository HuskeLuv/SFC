# Fase A · papel "analista de regras" — spec v1.3 × protótipo × schema

30/09/2026. Sem dados externos, exceto uma medição de apoio no Informe Mensal/Trimestral de FII da CVM
(zips já baixados). Nada gravado em banco; banco dev só lido (contagens de `Asset`/`Portfolio`/`AlocacaoConfig`).

Scripts (rodar da raiz do repo):

- `scripts/analise-ativos/spike-regras-valuation.ts` carrega o protótipo num sandbox `vm` e executa as funções
  **reais** do Pedro (`checksFor`, `bayes`, `rangeBar`, `simRows`, `fmtN`, `fmtV`) com os dados dele. Faz o
  mesmo com uma implementação "spec" escrita a partir do texto das §4.1–4.5. Saída:
  `fase-a/regras-spec-resultados.json`.
- `scripts/analise-ativos/spike-regras-fii-classificacao.ts --dir=<cvm> --ref=2025-06` mede a regra de tipo de
  FII (§4.2) e o C_lucro de FII no Informe Mensal. Saída: `fase-a/regras-fii-classificacao.json`.

## 0. Veredito

As **fórmulas do Valuation estão corretas**: os casos 1–20 da §4.6 batem, tanto na implementação da spec quanto
no protótipo. Os três casos que falham têm causa fora da conta:

- **caso 21**: o protótipo desenha a barra com 4 anos de dados;
- **caso 22**: não há persistência para testar;
- **caso 23**: o protótipo tem 7 ocorrências de palavras proibidas, e 2 delas estão no rodapé que a própria spec obriga.

O problema grande está no **Índice MF**. O protótipo **não calcula nada**: o valor está digitado nos dados.
Recalculado pela §4.1, **69 de 166 ativos (42%)** ficam fora da faixa possível. Nos ativos em que todos os dados
existem, a diferença é clara:

| Ativo | Índice pela fórmula | Protótipo |
| --- | --- | --- |
| WEGE3 | 8,02 | 9,1 |
| O | 9,15 | 9,0 |
| MGLU3 | 1,38 | 3,2 |
| AZUL4 | 0 | 1,8 |

As telas que o Pedro aprovou mostram notas que a fórmula não gera. Isso precisa ser alinhado com ele antes da Fase 0.

Além disso, a spec deixa lacunas que travam a construção: financeiras, FoF, unidades, P/L negativo, sinal da média
negativa, peso de voto em conflito, sinal da variação do ranking, e a dependência de PDFs no FII de papel. Há também
colisões de nome no schema (`assets`, `watchlists`, `Asset.type='stock'`, `/api/analises`, `/ativos/[id]`).

## 1. Os 23 casos da §4.6

| # | Caso | Esperado | Spec | Protótipo | Nota |
| --- | --- | --- | --- | --- | --- |
| 1 | Bazin | R$ 14,00 | ✅ 14,00 | ✅ | |
| 2 | Graham | R$ 14,36 | ✅ | ✅ | √206,2710 = 14,3621 |
| 3 | Múltiplo alvo | R$ 36,57 | ✅ | ✅ | exato 36,572 |
| 4 | Gordon | R$ 18,14 | ✅ | ✅ | exato 18,144 |
| 5 | Gordon k=g | — | ✅ | ✅ | |
| 6 | Yield 0 | — | ✅ | ✅ | |
| 7 | Graham LPA<0 | — | ✅ | ✅ | |
| 8 | vs. cotação + margem | −73% · 11,20 | ✅ | ✅ | −73,23% |
| 9 | Renda desejada | 165,00 | ✅ | ✅ | |
| 10 | P/VP alvo | 163,10 | ✅ | ✅ | |
| 11 | Meta de renda | 910 · 143.962,00 · 870 | ✅ | ✅ | a tela mostra o custo com 0 casas; a spec pede 2 |
| 12 | Posição ação | P/L 23,5 · 2,2% | ✅ | ✅ | 23,5366 · 2,1762% |
| 13 | Posição FII | 0,93 · 8,7% | ✅ | ✅ | |
| 14 | P/FFO alvo | 73,74 | ✅ | ✅ | exato 73,744 |
| 15 | Bazin REIT | 57,45 | ✅ | ✅ | exato 57,4545: **erro de 0,0045, no limite da tolerância de 0,005** |
| 16 | Gordon REIT | 65,10 | ✅ | ✅ | exato 65,096 |
| 17 | Barra múltiplo | 13,4 · 22,3 · 35,1 · +40% | ✅ | ✅ | média exata 22,26; +40,16% |
| 18 | Barra % | 25,1 · +4,3 p.p. | ✅ | ✅ | |
| 19 | Média ~0 | abaixo · menor em 10 anos | ✅ | ✅ | a **entrada da spec é insuficiente**: sem o mín. não dá para afirmar "menor em 10 anos". Usei o histórico do próprio protótipo |
| 20 | Na média | na média de 10 anos | ✅ | ✅ | a spec não traz os 10 pontos; usei um histórico sintético |
| 21 | Histórico de 4 anos | barra oculta | ✅ | ❌ | `rangeBar` só testa `if(!it.h)` e não confere `h.length < 5` |
| 22 | Salvar cenário | persiste / restaura | n/a | ❌ | o botão não tem handler. Vira teste de integração de `user_scenarios` |
| 23 | Varredura de linguagem | 0 ocorrências | — | ❌ 7 | L411, L473, L713 e L924 "desconto"; L678 "barato"; L1150 "preço justo" e "preço-alvo". **As duas da L1150 estão no rodapé obrigatório da §3.2.** O teste precisa de uma lista de exceções para o aviso fixo |

Ajustes propostos para os testes:

- **Comparar monetários por igualdade depois de arredondar para 2 casas**, e não com tolerância de 0,005 sobre o
  valor bruto. O caso 15 passa por 0,0005.
- Os casos 19 e 20 precisam do histórico completo nos dados de teste.

### Casos-limite medidos, fora da §4.6

1. **Média negativa: o sinal se inverte (bug na spec e no protótipo).**
   - Situação: quando a média de 10 anos é menor que −0,5, a conta `v/média − 1` troca o sentido.
   - Exemplo (Net debt/EBITDA do MSFT no protótipo): atual −0,25; média −0,908.
   - Resultado: as duas implementações escrevem **"−72% vs. média 10a"**, mas o valor está **acima** da média.
   - Correção: usar `(v − média) / |média|`.
2. **`Math.ceil` com ponto flutuante na Meta de renda.**
   - Testei rendas de R$ 100 a 10.000 e rendimentos de R$ 0,01 a 30,00, só as 8.754 combinações em que a conta dá
     inteiro exato.
   - **Em 106 delas o `Math.ceil(renda*12/rend)` sai com 1 cota a mais.** Exemplo: renda 1.700 com rendimento
     2,55 dá exatamente 8.000, e o JS devolve 8.001.
   - Correção: `Math.ceil(round(x, 9))`, ou fazer a conta em centavos.
3. **Múltiplo alvo com LPA negativo.**
   - O protótipo devolve **R$ −11,15** ("−121%"), com LPA −0,50 e P/L 22,3.
   - A spec não cobre esse caso. Proposta: mostrar "—" quando a base ≤ 0, como no Graham.
4. **Yield de 0,05%**, abaixo do limite de 0,1%, dá Bazin de R$ 1.680.
   - A spec não diz se o valor é travado no limite ou se mostra "—".
   - Proposta: o input trava em 0,1–30, e o cálculo mostra "—" fora da faixa.
5. **Meta de renda com rendimento 0**: o protótipo calcula `Math.ceil(∞)`. A tela mostraria "Infinity".

## 2. Spec × protótipo: divergências

### 2.1 Índice MF (§4.1)

- **O protótipo não calcula o índice.** `score` é um número fixo em `DATA.*.rows`, e o anel, o ranking e o
  comparador leem esse número.
- Implementei a §4.1 (dado ausente vale 0; componente sem dado no protótipo, como a média de P/L de 10 anos,
  entra como faixa de 0 a 10). Resultado: **69 de 166** scores fixos ficam **fora de qualquer valor possível**.

| Classe | Fora da faixa |
| --- | --- |
| Ações | 31/50 |
| FIIs | 6/41 |
| Stocks | 10/40 |
| REITs | 22/35 |

Casos concretos:

- **WEGE3** (todos os dados existem):
  - Componentes: C_lucro 10, C_dívida 10, C_rent 10, C_div 2,0 (DY 1,6%), C_preço 2,23 (P/L 31,2 contra média de
    22,3, ou seja, +40%).
  - **Resultado: 8,02, e a tela mostra 9,1.**
- **BBAS3 e PSSA3** (financeiras):
  - Dív.líq/EBITDA é nulo, então vale 0 pela regra "dado ausente".
  - Teto possível: 7,58 e 7,31. A tela mostra 8,2 e 7,6.
- **O**: 9,15 pela fórmula, 9,0 na tela.
- **MGLU3**: 1,38 pela fórmula, 3,2 na tela.
- **AZUL4**: 0 pela fórmula, 1,8 na tela.
- **Stocks**: o C_dívida da §4.1 usa Dív.líq/EBITDA, mas a coluna `div` do protótipo é **D/E**, a métrica do
  semáforo de stocks. A spec usa métricas diferentes para a mesma classe.
- **REITs**: C_lucro pede "anos de FFO/ação positivo", o semáforo pede "FFO/ação ≥ 5 anos **crescendo**", e o
  protótipo usa `streak`, que em REITs é a coluna **"Div. crescendo"**. São três métricas diferentes.

### 2.2 Semáforo (§4.2 × `checksFor`)

Comparação com as linhas do próprio protótipo (166 ativos, 830 critérios):

| Divergência | Onde | Efeito |
| --- | --- | --- |
| Rótulo "Preço vs. histórico" em FIIs; a spec diz "Preço vs. VP" | 41/41 FIIs | só o texto (o status é igual) |
| `div == null → 'ok'` (Endividamento atende sem dado) | BBAS3, PSSA3, BA | financeira ganha "Atende" sem métrica |
| `roe == null → -1 → 'bad'` | AZUL4, BA | ausente vira "Não atende" |
| **null ≤ x é `true` em JS**: papel com `inad`/`ltv` nulos → Inadimplência e LTV "ok"; REIT com `pay`/`div` nulos → "ok" | teste sintético: 5/5 "ok" nos dois | FII papel sem relatório atenderia 5/5 |
| **P/L negativo numérico → "ok"** (`r.pl <= 15`) | teste sintético | a spec manda "não atende". O protótipo só escapa porque grava `null` |
| Vacância nula → "ok" (tijolo) | código | dado ausente vira atende |
| Padrão construtivo ausente → "warn" | código | a spec não define |
| Tipo de FII só por `r.tipo === 'Papel'` | código | a regra do híbrido ("imóveis ≥ 50% do PL") não está implementada |
| REIT "FFO por ação" usa `streak` (dividendo crescendo) | 35 REITs | métrica errada |
| `thr.pvp:3` (ações) e `thr.pffo:16` (REITs) | código | limiares mortos |

Os checks do **detalhe** (frases digitadas) também contradizem o `checksFor` do mesmo ativo:

| Ativo | Detalhe | `checksFor` / spec |
| --- | --- | --- |
| WEGE3 | Dividendos = Atende (DY 1,6%) | Parcial (DY < 4%) |
| MSFT | Dividendos = Atende (DY 0,7%) | Não atende (DY < 1%) |
| O | Endividamento = Parcial (5,4×) | Atende (≤ 6×) |
| HGLG11 | critério 5 = "Alavancagem" (9% do PL) | "Padrão construtivo" (spec) |

No caso do HGLG11, o próprio Pedro trocou padrão construtivo por alavancagem no detalhe.

A spec também é incoerente consigo mesma: o critério "**Preço vs. histórico**" de ações usa **P/L absoluto ≤ 15**,
não o histórico. Já o C_preço do índice usa "P/L vs. média de 10 anos". A frase do WEGE3 cita as médias de 10 anos,
mas o status sai do valor absoluto.

### 2.3 Comparador (§4.3 × `best()`)

- As direções de maior/menor-é-melhor batem com a spec, e `ativo/preço/indexador/taxa/duration/pat/liq` não
  recebem destaque. O protótipo também destaca a linha **Índice MF**, que a lista da §4.3 não cita (a §3.3 cita).
  Proposta: incluir na regra.
- **O ramo P/VP de papel pula as regras de empate e de "< 2 valores".** Medido:
  - P/VP 0,95 × 1,05 (mesma distância de 1,00): o protótipo destaca o primeiro; a spec manda não destacar.
  - Misto com 1 papel e 1 tijolo: destaca o papel sozinho.
- O empate usa `===` em ponto flutuante: `0,1+0,2` contra `0,3` dá destaque, mas na tela os dois aparecem como
  "0,3%". Proposta: comparar na precisão exibida.
- No misto, o protótipo mostra só um subconjunto das linhas de qualidade (pad/vac/inq/atip e ncri/ltv/inad/hy).
  A §4.3 diz "os dois grupos". Decidir.
- O "Resumo numérico" pega `sort(...)[0]`: em empate de Índice MF, o texto "X tem o maior" é arbitrário.
  Proposta: "X e Y têm o maior…".

### 2.4 Ranking (§4.4 × `bayes`)

| Regra | Spec | Protótipo | Medido |
| --- | --- | --- | --- |
| C | média geral da classe | **fixo 4,1** | a média real dos dados é 2,9–3,4. **Trocar C muda a posição de 28/50 ações, 17/41 FIIs, 23/40 stocks e 18/35 REITs** |
| n | soma dos pesos | nº de votos | — |
| n ≥ 200 fora da ordenação | sim | só na tela Ranking. **A ordenação "Comunidade" do Quadro usa bayes em todos** | nos dados atuais todos têm ≥ 200, por isso ainda não aparece |
| "convergem" | "nota_comunidade" (bruta ou bayes?) | bruta | usar a bayes muda o selo de 2–4 ativos por classe |
| Variação mensal | "posição atual − anterior" | `d > 0 → ▲` | **sinal invertido**: quem sobe de 5º para 3º dá −2 pela spec e apareceria ▼ |

### 2.5 Quadro

- O filtro "Lucro consistente (5+ anos)" usa `(r.streak ?? 10) >= 5`. Em FIIs, que não têm `streak`, **todos
  passam no filtro**. A spec não define o filtro para FIIs.
- A barra "Lucro 10 anos" pinta `v > 0` de verde e o resto de vermelho: ano sem dado ou com lucro zero aparece
  como prejuízo.
- As direções de ordenação batem com a §3.1 (o protótipo acrescenta P/S e o ticker em ordem crescente).
- **P/L negativo em ordem crescente viria primeiro.** O protótipo escapa porque grava `null`.

## 3. Ambiguidades e lacunas que travam a Fase 0, com propostas

1. **Financeiras (bancos, seguradoras, holdings financeiras).**
   - Problema: Dív.líq/EBITDA não existe para elas. Pela regra atual (ausente = 0), todo banco perde 2 pontos do
     índice e o semáforo não tem critério de endividamento.
   - Proposta:
     - marcar `setor_financeiro` (cad_cia_aberta/B3);
     - C_dívida = "não se aplica", com os outros pesos redistribuídos na mesma proporção (0,35/0,80…);
     - no semáforo, o critério aparece como "n/a" e a leitura vira "n de 4 critérios";
     - não marcar "dados incompletos".
2. **"Lucros seguidos" com prejuízo antigo.**
   - Proposta: contar de trás para frente a partir do **último exercício anual (DFP)** até o primeiro prejuízo;
     o prejuízo antigo zera a contagem só daquele ponto para trás.
   - "Lucro" = lucro líquido **atribuível aos controladores** > 0.
   - Teto de exibição "10+" quando os 10 anos da janela têm lucro. A CVM tem DFP desde 2010, então dá para
     distinguir 10 de 15.
   - Não usar o TTM do ITR.
3. **"Prejuízo no último ano: componente = 0".**
   - Problema: a spec não diz qual componente.
   - Proposta: C_lucro = 0 (já é, pelo streak) e C_preço = 0 (P/L indefinido). C_rent sai naturalmente com ROE
     ≤ 0 → 0. Prejuízo **não** liga o selo "dados incompletos"; o selo é só para dado ausente.
4. **P/L negativo.**
   - Proposta:
     - exibir "neg." (ou o valor em vermelho) e nunca como múltiplo "baixo";
     - ordenação: **sempre no fim**, nas duas direções;
     - C_preço = 0; semáforo "Não atende";
     - no Valuation, os anos com P/L ≤ 0 saem de mín/média/máx e não contam para o mínimo de 5 pontos;
     - o rótulo vira "média de N anos".
5. **"Dado obrigatório ausente" por classe.**
   - A spec não lista os campos. Proposta de lista mínima:

     | Classe | Obrigatórios |
     | --- | --- |
     | Ações/stocks | lucro anual (≥ 1 exercício), PL, nº de ações, cotação D-1; EBITDA e dívida líquida (exceto financeiras) |
     | FII | PL, nº de cotas, cotação, rendimentos 12m; vacância (tijolo) ou LTV/inadimplência (papel) |
     | REIT | FFO/share, dívida, EBITDA, ocupação |

   - **Provento zero não é ausente.** Usar o `MarketDataCoverage.status` que já existe ('EMPTY' = sem provento
     de verdade; 'FETCH_FAIL' = ausente).
6. **FII FoF.** Medido no Informe Mensal de jun/25:
   - dos 590 FIIs listados em bolsa, **64 (10,8%) têm ≥ 50% do PL em cotas de FII**;
   - o protótipo classifica BCFF11, HFOF11, KFOF11 e RBRF11 como "Papel", **com LTV e inadimplência inventados**.
   - Proposta: classe `fof` com semáforo próprio. Critérios: Renda recorrente, Preço vs. VP, Diversificação
     (nº de FIIs na carteira, que sai do trimestral `ativo` Tipo='FII'), Concentração da maior posição e
     Alavancagem.
   - No índice, C_rent entra como "n/a" com pesos redistribuídos.
7. **Tipo híbrido.** A regra "imóveis ≥ 50% do PL" é **aplicável** com o `inf_mensal_fii_ativo_passivo`. Medido em
   jun/25:

   | Tipo | Fundos | Participação |
   | --- | --- | --- |
   | Tijolo | 333 | 56% |
   | Papel | 140 | 24% |
   | FoF | 64 | 11% |
   | Indefinido (nenhum ≥ 50%: desenvolvimento, SPE, caixa) | 49 | 8% |
   | Sem dados | 4 | — |

   O campo **Mandato da CVM não serve** para isso: dos 318 "Híbrido", 96 viram tijolo, 13 papel, 13 FoF e 17
   indefinidos; 18 com mandato "TVM" são tijolo pela composição.
   - Proposta:
     - classificar pela composição, com **histerese de 3 meses** para não trocar de tipo a cada informe;
     - "indefinido" usa o semáforo de tijolo e mostra o selo "dados incompletos";
     - curadoria manual pode sobrescrever (`fii_type_override`).
8. **FII papel: "meses com rendimento" = idem tijolo?** Sim, é a mesma métrica. Mas:
   - **o Informe Mensal começa em set/2016.** Em jun/25 nenhum FII tem 120 meses (máximo possível de ~105);
     61 estão entre 60 e 119. O teto de 120 só fica alcançável a partir de set/2026.
   - `Percentual_Dividend_Yield_Mes` vem como **fração** (HGLG11 jun/25 = 0,006764, ou seja, 0,68%), e 247 dos
     590 listados informam 0 no mês.
   - Proposta: fonte primária = `AssetDividendHistory` (pagamentos mensais, BRAPI); a CVM fica como conferência.
9. **Dependência de PDF no FII de papel e no padrão construtivo.**
   - Problema: C_dívida (LTV) e C_rent (inadimplência) do papel somam **40% do índice**, e 3 dos 5 critérios do
     semáforo de papel (LTV, inadimplência e, em parte, diversificação) só existem em relatório gerencial, que o
     plano deixa para a Fase 5. No tijolo, o critério "Padrão construtivo" também é só PDF.
   - Sem decisão, **todo FII de papel sai com índice ≤ 6 e "dados incompletos" no lançamento.**
   - Proposta para o MVP:
     - papel: C_dívida → concentração do maior devedor ou nº de CRIs (o trimestral `ativo` dá, por exemplo,
       KNCR11 com 132 CRI/CRA em set/25); C_rent → "n/a" com peso redistribuído;
     - tijolo: "Padrão construtivo" substituído por "Alavancagem", como o próprio Pedro fez no detalhe do HGLG11,
       até a extração existir.
   - Atenção: a contagem de CRIs precisa se restringir ao papel. O HGLG11 tem 5–8 CRIs e o KNRI11 tem 67–72
     (caixa), o que daria "Diversificação" errada a um tijolo.
10. **Alavancagem de FII tijolo (% do PL).**
    - Proposta: `(Obrigacoes_Aquisicao_Imoveis + Obrigacoes_Securitizacao_Recebiveis) / PL` do Informe Mensal.
    - Medido nos 333 tijolos: p50 = 0%, p90 = 27%, 30 fundos ≥ 30%, **máximo 593%** (outlier para a regra de
      sanidade).
11. **Units e várias classes de ação.**
    - Problema: TAEE11/KLBN11/SANB11/ALUP11 estão no banco como `type='stock'`. "Cotação ÷ LPA" em unit exige o
      LPA por unit (1 ON + 2 PN = ×3). O LPA da DFP é por ação total.
    - Proposta: calcular os múltiplos no nível da **empresa** (valor de mercado = Σ classes × preço) e derivar por
      ticker com um fator de equivalência.
    - O Índice MF é da empresa (PETR3 e PETR4 = mesma nota, exceto DY e preço); o voto é por ticker.
12. **Peso de voto em conflito.** Quem tem o ativo na carteira **e** conta com menos de 30 dias recebe 1,5 ou 0,5?
    Proposta: vale o **menor** (anti-manipulação).
13. **Sinal da variação mensal do ranking.** Proposta: `posição anterior − posição atual` (subiu = positivo = ▲).
14. **C do bayesiano.** Proposta: média ponderada pelos pesos de todos os votos válidos da classe, recalculada no
    job das 03h; o valor do dia fica guardado em `rankings_daily`.
15. **"Nota" da convergência.** Proposta: usar a **bayesiana**, que é a nota exibida no ranking. Com menos de 200
    votos, não mostrar o selo.
16. **Status da barra perto de zero.** A spec não define "na média" quando |média| ≤ 0,5 (o protótipo usa
    |d| < 0,05) e tem o bug do sinal (§1, item 1). Proposta:
    - |média| ≤ 0,5: "na média" se |d| < 0,05;
    - média < −0,5: % = `(v − m)/|m|`;
    - percentuais continuam em p.p.
17. **Média "de 10 anos" com menos pontos.** Proposta: com 5 a 9 pontos o texto vira "média 7a" etc. Abaixo de 5,
    barra oculta. O histórico usa o ano fiscal e **não inclui o TTM**; o marcador é o TTM.
18. **Referência do setor.**
    - Problema: "mediana dos pares do mesmo segmento" exige setor/segmento, que `Asset` não tem.
    - Com menos de 3 pares, a mediana é instável. Proposta: mínimo de 3 pares; abaixo disso, subir para o setor;
      sem setor, só o índice da classe.
19. **DY 12m e DPA.** A spec não diz se entram pela data-com ou pela data de pagamento, nem se o JCP é bruto ou
    líquido.
    - Proposta: janela pela **data-com** (`AssetDividendHistory.dataCom`, com fallback para `date`); JCP **bruto**,
      como declarado; o rótulo diz "dividendos + JCP (bruto)".
20. **`financial_statements`.** A §5 cita a tabela (o Raio-X lê dela), mas **ela não está na lista de tabelas**.
    Proposta na §5 abaixo.
21. **"Dados FII não estruturados" e `fii_property_quality`** dependem de curador (Fase 5). A spec §10 exige 100
    FIIs aprovados só na Fase 3 da spec. É coerente com o plano, mas contradiz a §2 ("MVP… padrão construtivo").
22. **Fiagro.** Há 36 `Asset.type='fiagro'` no banco dev. Não está nem dentro nem fora do escopo. Proposta: fora
    do MVP.
23. **Filtro "Lucro consistente" em FIIs.** Proposta: em FIIs vira "Rendimento em 60+ meses".
24. **Leitura "n de 5 critérios".** Com critério "n/a" (financeira, FoF), vira "n de 4". Critério "sem dado" conta
    como não atendido, com ícone próprio (nem ✓ nem ✗).

## 4. Strings do protótipo × §9

Varredura por regex no HTML, sem o logo em base64.

| Linha | Texto | Problema | Sugestão |
| --- | --- | --- | --- |
| 924 | "em FII de papel, P/VP perto de 1,00 é o **saudável**; **desconto forte** costuma sinalizar risco de crédito" | adjetivo proibido ("saudável"), "desconto", juízo | "em FII de papel, o ★ marca o P/VP mais próximo de 1,00" |
| 678 | Cap rate: "Quanto maior, mais **"barato"** o imóvel em relação ao aluguel" | palavra proibida **na tela de Valuation** (falha o caso 23) | "Quanto maior, mais aluguel por real de valor do imóvel" |
| 713 | P/NAV: "Abaixo de 1 = **desconto** em relação ao portfólio" | proibida no Valuation (caso 23) | "Abaixo de 1 = cotação menor que o NAV estimado" |
| 411 | HGLG11: "Cota acima do VP = ágio; abaixo = **desconto**. O VP mostra se o gestor **cria valor**" | "desconto" + juízo sobre gestão | "Cota acima do VP = P/VP > 1; abaixo = P/VP < 1" |
| 473 | MSFT: "desvios grandes indicam ágio ou **desconto**" | "desconto" + leitura de preço | remover a segunda frase |
| 349 | WEGE3: "O preço segue o lucro no longo prazo — **a leitura mais importante da análise**" | tese causal e a palavra "análise" | "As duas séries começam em 100 em 2016" |
| 722 | AFFO payout: "mais folga para manter o dividendo em anos **ruins**" | adjetivo da lista (ruim) | "…em anos de FFO menor" |
| 408 | KPI HGLG11: "**alta** liquidez" | qualificativo | "R$ 9,8 mi/dia" |
| 617 | ROIC: "Acima do custo de capital = a empresa **cria valor** ao crescer" | juízo (definição de livro, limítrofe) | revisar com o parecer |
| 609 | "Yield baixo com dividendo crescente é **típico de empresa em expansão**" | interpretação | remover |
| 958/957 | badges "comunidade acima da **nota**" / "**nota** acima da comunidade" | a §9 diz que o Índice MF é "nunca 'Nota'", mas aqui "nota" é o Índice. **A §4.4 da spec usa esse texto: conflito interno** | "comunidade acima do Índice" / "Índice acima da comunidade" |
| 1150 | rodapé do Valuation com "preço justo" e "preço-alvo" | exigido pela spec, mas quebra o caso 23 | lista de exceções no teste de varredura |
| 494 | tese de exemplo do MSFT: "É o tipo de empresa que **você compra** e deixa 20 anos" | conteúdo de usuário em 2ª pessoa, com cara de recomendação; os termos proíbem "compre" | trocar o exemplo do protótipo por uma tese em 1ª pessoa |
| 457/519 | tags "Dividend grower", "S&P 500 Dividend Aristocrat" | rótulo de marketing | só listar a participação em índice ("S&P 500") |
| 371 | risco "Múltiplos **elevados**…" | adjetivo (vale se `source=community`; se for `curated`, fica proibido) | neutralizar os riscos curados |

Passam sem problema:

- botão "Registrar na carteira" (não há "Comprar");
- aviso legal idêntico ao da §9;
- nota do Quadro ("Não é análise nem recomendação");
- badges Atende / Parcial / Não atende com ícone e texto;
- frases do semáforo com número e referência.

## 5. Modelo de dados (§5) × `prisma/schema.prisma`

| Spec | Hoje no schema | Decisão proposta |
| --- | --- | --- |
| `assets` | **`Asset` @@map("assets")**: mesmo nome de tabela. `type` ∈ stock/fii/reit/etf/bdr/fiagro/…; **`type='stock'` + BRL = ação B3 e + USD = stock EUA** (dev: 879 stock BRL, 2 stock USD, 1 reit, 1.756 fii, 36 fiagro) | **Reaproveitar `Asset`**. Não criar `assets`; adicionar colunas: `analiseClasse` (acao/fii/stock/reit, preenchida por job; **não** reutilizar `type`), `sector`, `segment`, `listingSegment`, `exchange`, `fiiType` (tijolo/papel/fof/indefinido) + `fiiTypeOverride`, `active`, `liquidityAvg30d`. `cnpj` já existe, mas **está nulo nos FIIs** (HGLG11, KNCR11 no dev): o job precisa mapear ticker → CNPJ (ISIN do informe) |
| `quotes_daily` | `AssetPriceHistory` (só `price`; unique `symbol+date`; sem variação nem volume) | Manter como fonte de fechamento. Os derivados (pl, pvp, ps, pffo, dy_12m) vão em **`AssetMultiplesCurrent`** (1 linha por ativo, sobrescrita no job diário). Não criar histórico diário de derivado. Volume/liquidez exige fonte nova (BRAPI ou COTAHIST) |
| `fundamentals_period` | `AssetFundamentals` (1 linha por símbolo: P/L, beta, DY do momento, BRAPI; usado em `/api/ativos/[id]` e no cron `brapi-sync/fundamentals`) | **Nome parecido, papel diferente.** Não mexer no existente; criar `AssetFundamentalsPeriod` (assetId, periodType ANUAL/TRIM, periodEnd, fiscalYear, campos da spec, `source`, `sourceUrl`, `fetchedAt`, `reviewedBy`, `versao` CVM), unique (assetId, periodType, periodEnd, versao). Point-in-time: uma versão nova gera uma linha nova |
| `financial_statements` (citada, não definida) | — | Criar `AssetStatementLine`: assetId (ou companyCnpj), period, statement (DRE/BPA/BPP/DFC/DVA), `accountCode` (CD_CONTA CVM), label, value, group, format, source. Chave pela **empresa (CNPJ)**, não pelo ticker (units e classes) |
| `fii_property_quality` | — | Criar como na spec. Os campos estruturados (nº de imóveis, área, vacância por imóvel, nº de CRIs) vêm do trimestral **antes** do PDF |
| `scores` | — | Criar `AssetScore` (assetId, computedAt, indiceMf, c_*, `checks` json, `incomplete`, `paramsVersion`) + índice (assetId, computedAt desc) |
| `scoring_params` | — | Criar `ScoringParams` (version, `params` json validado por Zod, validFrom, createdBy). Seed v1 = limiares da §4 |
| `votes` | nada equivalente (`CommunityLike` é só de post) | Criar `AnaliseVoto` (userId+assetId unique, stars, wouldBuy, weight, holderAtVote, origin, expiresAt, status). Peso: `Portfolio` (holder) + `User.createdAt` (< 30 dias) |
| `rankings_daily` | — | Criar `AnaliseRankingDiario` |
| `theses` | `CommunityPost` (sem assetId, sem visibilidade) + Like/Report/Profile/moderação | **Tese pública** = `CommunityPost` com `categoria='tese'` + nova coluna `assetId?` + unique parcial (authorId, assetId) onde categoria = tese: reaproveita curtida, denúncia, suspensão e termos. **Tese privada** = tabela própria `AnaliseTesePrivada` (não é comunidade e não fica atrás da flag). Atenção: a Comunidade está **desligada em prod** |
| `asset_risks` | — | Criar `AssetRisco` (source community/curated) |
| `asset_events` | `Event` é a agenda **do usuário** (userId obrigatório); há fontes plugáveis em `services/calendario/fontes/*` (proventos, acoesCorporativas, mercado…) | Criar `AssetEvento` global + **uma nova fonte** `fontes/resultados.ts` que projeta na Agenda para quem tem o ativo. Não copiar linhas para `Event` |
| `watchlists` / `watchlist_items` | **`Watchlist` @@map("watchlists") já existe** com outro sentido (ativo planejado sem posição nas abas da carteira: objetivo, secao) | **Colisão.** Criar `AnaliseLista` / `AnaliseListaItem`. Nunca usar o nome `watchlists` |
| `comparisons` | — | `AnaliseComparacao` |
| `data_reports` | — | `AnaliseReporteDado` (pode aparecer no /admin) |
| `multiples_yearly` | — | `AssetMultiplesYearly` (assetId, fiscalYear, closeYearEnd + campos) |
| `user_scenarios` | — | `AnaliseCenario` (userId+assetId unique, inputs json) |
| `portfolio_positions` | `Portfolio` (quantity, avgPrice, totalInvested, **`objetivo` = alvo % do ativo**, `tipoFii` 'fofi'/'tvm'/'tijolo' declarado pelo usuário: 1 de 36 preenchido no dev) | Reaproveitar. O "seu alvo: 5%" do protótipo = `Portfolio.objetivo`; o valor de mercado e o peso vêm do serviço `itemValuation` já existente. Não usar `tipoFii` do usuário como tipo oficial |
| `planning_targets` | `AlocacaoConfig` (categoria acoes/fiis/stocks/reits, target) | Reaproveitar |
| `POST /planejamento/objetivos` | a rota real é **`/api/planejamento-sonhos`** (`PlanejamentoObjetivo`) | Corrigir a spec |
| Rotas `/analise`, `/api/analise/*` | **`/api/analises/*` já existe** (14 rotas de analytics da carteira); a página `/ativos/[id]` já existe (detalhe/edição da posição) | Página `/analise-ativos` e `/analise-ativos/[ticker]`; API `/api/analise-ativos/*`. Nunca `/analise` (singular), que se confunde com a rota existente |
| Planos Gold/Premium, flags | `User.accessLevel`; padrão de flag em `src/lib/comunidadeConfig.ts` | `src/lib/analiseAtivosConfig.ts` (edge-safe) + nível por feature |

## 6. Regras de sanidade propostas para a Fase 0

Ver `regrasSanidade` no retorno estruturado. São as que saem desta análise; as de fonte (CVM e BRAPI) ficam com os
outros papéis.

## 7. Recomendações para a Fase 0

Ver `recomendacoesFase0`. Em resumo:

- um módulo puro `src/services/analiseAtivos/regras/`, que nunca lança exceção (devolve `null` e o motivo);
- os 23 casos mais os casos-limite deste documento como testes vitest;
- parâmetros versionados em `ScoringParams`;
- textos centralizados com teste de varredura;
- classificação de classe e tipo de FII por job, e não por `Asset.type`.
