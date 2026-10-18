# ATIVAÇÃO — correções do backtest de 18/10/2026 (Análise de Ativos)

> Cada fatia do backtest acrescenta a sua seção. Todo passo marcado **[OK]** é humano, com OK
> explícito do Wellington. Em produção, só o que está escrito aqui; nada de rodar job ou script
> fora da ordem.

Convenções (iguais às de `docs/analise-ativos/blocoC/ATIVACAO.md`):

```bash
# na máquina de prod (acesso: infra/README.md → "Acesso operacional")
APP=/opt/myfinance/current
ENVF=/etc/myfinance/app.env
rodar() { cd "$APP" && sudo -u myfinance env NODE_OPTIONS=--max-old-space-size=512 \
  nice -n 10 node --env-file="$ENVF" --import tsx "$@"; }
PSQL='sudo -u postgres psql myfinance'
```

---

## Proventos (A1, A2, A5/M7 e a parte de proventos do M9)

Branch `bt-proventos`. O que muda:

| Item  | Onde                                                                                           | Efeito                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1a   | migration `20261018000000_proventos_chave_datacom` + `dividendService` + `proventosBrapiPlano` | a chave de `asset_dividend_history` passa a ter a data-com: o sync da BRAPI para de somar proventos de datas-com diferentes pagos no mesmo dia e reconcilia as linhas BRAPI do símbolo a cada passada |
| A1a   | `regras/calculo/proventos.ts` (`soma_de_parcelas`)                                             | linha que é a soma exata de outras linhas do banco sai da conta (SAPR11, BBDC3/4)                                                                                                                     |
| A1b   | `proventos.ts` (`parcela_de_total`)                                                            | total declarado + parcelas do mesmo provento: ficam só o total (CPFE3, ABEV3)                                                                                                                         |
| A1c   | `proventos.ts` (`tranche_ambigua`, `duplicata_data_com_deslocada`)                             | o mesmo JCP com dois pagamentos a menos de 20 dias, ou com a data-com 1 pregão depois, conta uma vez (ITUB4, ITSA4, GLCR11)                                                                           |
| A1d   | `proventos.ts` (`duplicata_classe_irma`)                                                       | valor de outra classe da empresa misturado no ticker: fica a linha COM pagamento (BRSR6, CEBR5, CEEB5 — conferido na B3)                                                                              |
| A1e   | `dividendService.agregarProventosBrapi`                                                        | a entry provisória da BRAPI (sem `approvedOn`, data-com = aprovação da definitiva) é descartada (PETR4 13/05/2024)                                                                                    |
| A2    | `proventos.ts` (`fantasma_mensal`) + informe mensal da CVM (`dyMesCvmPct`)                     | rendimento fantasma de FII (data-com = pagamento, dia 01) sai quando há o real no mesmo mês ou a CVM diz que não houve distribuição (RBTS11, XLPR11, ZAVI11, REME11, RSPD11, EDGE11, RBOP11…)         |
| A5/M7 | `regras/criterios/mesesJanela.ts`                                                              | "rendimento todos os meses": mês sem provento na base em que a CVM registra distribuição = **sem dado** (base incompleta), não "não atende" (KNRI11 10 anos, BTHF11)                                  |
| M9    | `plausibilidadeProventos` (motivo `linha_suspeita`)                                            | enquanto a soma antiga não é regravada, o DY 12m fica "em conferência" (VIVT3, CMIG4, RADL3, HYPE3, CEEB3/5, EKTR4, EALT3/4, VITT3)                                                                   |

Não mudam (decisões do Pedro pendentes): RZTR11 (mês de pagamento × competência, M8) continua
"59 de 60, não atende"; nenhuma regra de método (reapresentação, exercício fora de dezembro,
seguradoras, GARE11, lucro contábil × ajustado) foi tocada. Os limiares novos são parâmetros com
default no schema (`sanidade.proventos.somaParcelas`, `plausibilidade.orfaMinDias/orfaFator`): a
ScoringParams v2 gravada no banco os lê sem regravar.

### Prova (dados de prod de 17/10/2026 copiados para um schema isolado do banco local)

DY 12m (soma por data-com em 16/10/2025–16/10/2026) contra a B3:

| Ticker | Antes           | Só a auditoria nova | Auditoria + limpeza | B3             |
| ------ | --------------- | ------------------- | ------------------- | -------------- |
| SAPR11 | 2,5131 (6,28%)  | 0,5524 (1,38%)      | 0,5524 (1,38%)      | 0,5524 (1,38%) |
| VIVT3  | 3,0366 (9,56%)  | 2,0325 (6,40%)      | 1,2951 (4,08%)      | 1,2951 (4,08%) |
| CMIG4  | 2,4295 (20,54%) | 2,3113 (19,54%)     | 1,1394 (9,63%)      | 1,1394 (9,63%) |
| CPFE3  | 5,8144 (11,78%) | 3,7315 (7,56%)      | 3,7315 (7,56%)      | 3,7315 (7,56%) |
| BBDC4  | 2,2587 (11,09%) | 1,6145 (7,93%)      | 1,6145 (7,93%)      | 1,6145 (7,93%) |
| BRSR6  | 2,0004 (11,49%) | 1,5379 (8,83%)      | 1,5379 (8,83%)      | 1,5379 (8,83%) |
| ITUB4  | 4,1694 (8,67%)  | 3,4586 (7,19%)      | 3,0996 (6,45%)      | 3,0996 (6,45%) |
| ABEV3  | 1,1154 (6,62%)  | 0,8464 (5,03%)      | 0,8464 (5,03%)      | 0,8464 (5,03%) |
| ITSA4  | 1,1456 (7,42%)  | 1,1278 (7,31%)      | 1,1278 (7,31%)      | 1,1278 (7,31%) |
| RADL3  | 0,6171 (3,00%)  | 0,6171 (3,00%)      | 0,4506 (2,19%)      | 0,4538 (2,21%) |
| ISAE4  | 1,8506 (6,50%)  | 1,8506 (6,50%)      | 2,0395 (7,16%)      | 2,0395 (7,16%) |

Amostra do auditor (23 ações): **12 → 18 → 23 de 23** iguais à B3 (±1%). DPA anual 2023–2025
(62 combinações): **38 → 45 → 51**. FIIs: RBTS11 22,99 → 7,34 (B3 7,34); XLPR11 8,35 → 6,01 (B3
6,01); ZAVI11 1,53 → 1,39 (B3 ~1,39); REME11 8,23 → 6,09 (B3 6,09).

Universo inteiro (dump de prod, só a auditoria nova, antes da limpeza): 74 símbolos mudam de DY 12m;
70 têm proventos no suplemento da B3: 65 ficam iguais ou mais perto da B3 (50 iguais, ±1%) e os 5
restantes (GLCR11, ITSA4, MDNE3, TRIS3, ZAVI11) só parecem piores na conta crua do suplemento — a B3
lista um provento que a base ainda não tem (GLCR11 15/10/2026), não ajusta o desdobramento (ZAVI11
10:1) ou é a mesma parcela que a fonte repetiu (MDNE3, TRIS3: a B3 lista cada parcela uma vez). Selo
`linha_suspeita`: 11 ações antes da limpeza (CEEB3/5, CMIG3/4, EALT3/4, EKTR4, HYPE3, RADL3, VITT3,
VIVT3) e 2 depois (EALT3/4, soma ainda na própria BRAPI).

Ainda erram no DPA anual (histórico, fora da janela de 12 meses): BRSR6 2025 (dividendo especial
da PNA de 05/05/2025, razão 4,2 sobre a PNB), PETR4 2024 (a BRAPI publica o JCP 0,6536 de
23/12/2024 também como JCP, além de DIVIDENDO), ITSA4 2023–2025, ISAE4 2025, CPFE3 2023, TAEE11 2023,
KLBN11 2024, CMIG4 2024, ITUB4 2025 — erros da fonte que nem a chave nova nem as regras resolvem.

### Passo 1 — Deploy

O merge na `main` roda `prisma migrate deploy` antes do flip (`infra/deploy.sh`). A migration é
idempotente e **não mexe em dado**: troca o índice único `(symbol, date, tipo)` por
`(symbol, date, tipo, dataCom) NULLS NOT DISTINCT` (as linhas atuais já satisfazem a chave nova).

```bash
$PSQL -c "select migration_name, finished_at from _prisma_migrations
          where migration_name = '20261018000000_proventos_chave_datacom';"
$PSQL -c "select indexname from pg_indexes where tablename = 'asset_dividend_history';"
# esperado: ..._symbol_date_tipo_dataCom_key presente e ..._symbol_date_tipo_key ausente
```

**Rollback do app depois da migration:** o código antigo grava proventos com `upsert` na chave
antiga, que não existe mais — o sync de proventos (cron `market-data/refresh` e o fallback das
telas) passa a falhar até um novo deploy. Se precisar voltar o app, volte também o índice SÓ se não
houver duas linhas na mesma (symbol, date, tipo):

```bash
$PSQL -c "select count(*) from (select 1 from asset_dividend_history
          group by symbol, date, tipo having count(*) > 1) x;"   # 0 = pode recriar
$PSQL -c 'create unique index if not exists "asset_dividend_history_symbol_date_tipo_key"
          on asset_dividend_history (symbol, date, tipo);'
```

Entre o `migrate deploy` e o flip (segundos) o código antigo ainda está no ar: se coincidir com o
cron de proventos, o símbolo daquele lote falha e o próximo ciclo refaz. Melhor não fazer o merge
perto das 07:20 UTC (proventos BRAPI).

Depois do deploy, o próprio cron `market-data/refresh` já reconcilia, aos poucos, cada símbolo que
visita (mesmo código do passo 2). O passo 2 faz tudo de uma vez e mostra o que muda.

### Passo 2 — Limpeza das linhas somadas (dry-run primeiro) **[OK]**

Só leitura no banco + 1 GET na BRAPI por símbolo (≈ 813 símbolos, ~10 min com a pausa padrão):

```bash
rodar scripts/analise-ativos/limpar-proventos-somados.ts > /tmp/limpeza-dry.txt
rodar scripts/analise-ativos/limpar-proventos-somados.ts --symbols=VIVT3,SAPR11,CMIG4,ITUB4,ISAE4
```

Esperado (cópia de prod de 17/10/2026, BRAPI de 18/10): ver a tabela "Volume esperado" abaixo. O
que conferir no dry-run:

- `sem resposta da BRAPI` baixo (símbolo sem resposta é pulado — nada muda nele);
- `linhas a apagar (versao_antiga (valor sai da base))` pequeno perto de `versao_antiga`: a maioria
  das versões antigas são o mesmo provento com a data-com do legado (data ex) e ganham a linha certa
  em `criar`;
- na amostra, `apaga …*` = o valor sai da base sem provento igual na fonte (soma antiga, parcela que a
  fonte trocou pelo total).

Com o OK:

```bash
rodar scripts/analise-ativos/limpar-proventos-somados.ts --apply > /tmp/limpeza-apply.txt
rodar scripts/analise-ativos/limpar-proventos-somados.ts | grep -E 'com mudança|criar|atualizar|apagar'
# idempotente: a 2ª passada deve dar 0 (ou só o que a BRAPI publicou entre as duas)
```

Conferência (só leitura):

```bash
$PSQL -c "select symbol, date::date pag, \"dataCom\"::date com, tipo, \"valorUnitario\"
          from asset_dividend_history where symbol in ('SAPR11','VIVT3')
          and date >= '2026-04-01' order by 1,2,3;"
# SAPR11 em 26/06/2026: 1,408226885 (com 30/06/2025) e 0,552412806 (com 30/12/2025), sem o 1,9606
```

### Passo 3 — Recalcular a Análise **[OK]**

```bash
rodar scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,scores --tudo
# dry-run acima; com o OK:
rodar scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,scores --tudo --apply
sudo /usr/local/bin/myfinance-job.sh criterios
sudo /usr/local/bin/myfinance-job.sh quadro
```

Sem o passo 3, o job diário das 10:10 faz o mesmo (a auditoria de proventos é completa a cada run).

Conferência (DY 12m na tela, `asset_multiples_current.dy12mPct`): SAPR11 ≈ 1,4%, VIVT3 ≈ 4,1%,
CMIG4 ≈ 9,6%, CPFE3 ≈ 7,6%, BBDC4 ≈ 7,9%, BRSR6 ≈ 8,8%, ITUB4 ≈ 6,5%; RBTS11 ≈ 3,5%. O selo
`proventos_em_conferencia_linha_suspeita` deve sumir dos símbolos regravados no passo 2.

### Efeito para o usuário da Carteira

- O histórico global de proventos (`asset_dividend_history`) alimenta a Carteira. Com a chave nova,
  proventos pagos no mesmo dia com datas-com diferentes viram linhas separadas: cada parcela usa a
  quantidade que o usuário tinha na SUA data-com (antes, a soma inteira usava a quantidade da
  data-com de uma parcela só). `ensurePortfolioProventosFromMarket` continua gravando um provento
  por (pagamento, tipo) — a soma das parcelas — e o override manual do usuário vale para todas as
  parcelas do mesmo dia (`resolveProventos`).
- Depois da limpeza, quem tem VIVT3, CMIG4, SAPR11, ITUB4, ISAE4, RADL3, BBDC3/4 e os demais da lista
  vê o valor da B3 nesses pagamentos (antes, a soma antiga e as parcelas "sem pagamento" do legado
  contavam juntas). Rentabilidade e proventos recebidos dessas posições caem para o valor certo.
- Linhas de provento já materializadas na posição (`portfolio_proventos`, source `brapi`) do mesmo
  (pagamento, tipo) são atualizadas no próximo sync; as de uma versão que a fonte trocou (outro
  pagamento) ficam até o usuário apagar — o mesmo que já acontece hoje com qualquer correção da
  BRAPI. Resumo e rentabilidade usam o histórico global e saem certos.
- O fantasma mensal de FII na Carteira continua com a regra de antes (só o mesmo mês).

### Volume esperado (cópia de prod, 18/10/2026)

Limpeza completa sobre a cópia local de prod (813 símbolos com linha BRAPI, BRAPI de 18/10/2026):

| Medida                                                        |      Valor |
| ------------------------------------------------------------- | ---------: |
| sem resposta da BRAPI (pulados)                               |          5 |
| símbolos com mudança                                          |        399 |
| linhas criadas (parcelas que a soma escondia, chave certa)    |        941 |
| linhas atualizadas (soma → valor da parcela)                  |        665 |
| apagadas `versao_antiga` (mesmo provento, chave certa criada) |      3.059 |
| apagadas `versao_antiga` (valor sai da base)                  |        280 |
| apagadas `soma_orfa`                                          |          1 |
| 2ª passada                                                    | 0 mudanças |

As 280 "valor sai da base" se espalham por 117 símbolos e 1997–2026. Conferidas na B3: totais que a
fonte trocou pelo cronograma de parcelas (CPFE3 2,7540 de 2024), parcelas que a fonte trocou pelo
total (CPFE3 30/04/2025 e 30/04/2026), somas antigas (VIVT3 0,8559; ITUB4 0,71076 de 31/08/2026),
versões com valor velho (CURY3 0,3571 → 0,4545 de 04/02/2026), a escala errada da HBTS5
(259,97/ação) e tranches que a fonte separou (VITT3 0,0647 de 03/11/2025 = 0,0326 + 0,0321). O
número exato em prod é o do dry-run do passo 2 (a BRAPI muda dia a dia).
