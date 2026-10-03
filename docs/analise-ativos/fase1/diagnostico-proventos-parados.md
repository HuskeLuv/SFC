# Diagnóstico — proventos "parados", data-com da auditoria e SHOW3 sem setor (rodada 3, 02/10/2026)

Origem: alertas do job scores em produção — "93 ações com base de proventos defasada (DY/rendimento
12m ausentes): pagador_recorrente_parado; data-com mais recente da classe 2026-10-01" e "33 FIIs …
2026-09-30" (KLBN11 incompleto com `proventos_defasados_pagador_recorrente_parado`, motivo
`div:fonte_defasada`; ~170 de 330 ações do Quadro incompletas) — e do job quadro ("1 ações do
Quadro sem setor B3: SHOW3"). Diagnóstico no banco **dev** (mesma regra, mesma fonte) comparando
`asset_dividend_history` com a BRAPI ao vivo. Produção não foi acessada.

## 1. Pagador recorrente "parado"

Regra antiga (`motivoProventosDefasados`, `regras/calculo/proventos.ts`): pagou em ≥ 2 meses
distintos (ações; FIIs ≥ 6) nos 12 meses anteriores ao último provento **e** a última data-com tem
mais de 200 dias (FIIs 45) ⇒ DY/rendimento 12m `ausente('fonte_defasada')`.

No dev, 111 ações do Quadro com a flag (base de proventos do dev parada desde 10/06). Comparação com
a BRAPI ao vivo (02/10), por símbolo:

| Grupo                                 | Ações | O que é                                                                                                                                                                                                                                                                                                        | Exemplos                                                                                                                                   |
| ------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A — base atrás da fonte               | 32    | A BRAPI tem data-com mais nova que a base: o dev não roda o cron `market-data/refresh` desde jun/2026. Em prod o cron horário cobre o catálogo em poucos dias — não é a causa do alerta de prod. O sync grava tudo o que a BRAPI devolve (nenhuma linha perdida por unit/ON/PN, paginação ou janela de datas). | TGMA3 (dev 02/12/2025 × BRAPI 06/08/2026), ABEV3, BBSE3, ENGI11, UGPA3                                                                     |
| B — declaração com parcelas agendadas | 19    | Nenhuma data-com nova **na própria fonte**, mas pagamentos em curso: a empresa declarou em dez/2025 (antecipação à tributação de 2026) e paga ao longo de 2026–2028.                                                                                                                                           | **KLBN11**: data-com 15/12/2025, 4 parcelas (27/02, 20/05, 19/08 e 12/11/2026); EQTL3, SAPR11, MDNE3 (pagamento em set/2027), LAVV3, EUCA4 |
| C — sem novidade na fonte             | 60    | A BRAPI também não tem data-com depois da última da base. Maioria semestral/anual que antecipou em dez/2025 a distribuição de 2026 (CYRE3, DIRR3, SLCE3, YDUQ3, VIVA3…) ou pagador irregular/antigo (BRKM5 2022, USIM5 2024, TELB4 1998).                                                                      | CYRE3: data-coms 05/2023, 12/2023, 04/2024, 04/2025, 12/2025                                                                               |

Depois de re-sincronizar o dev com o mesmo código do cron (`backfill-market-data.ts --apply` no
universo do Quadro, 660 símbolos), os 111 símbolos batem 100% com a BRAPI (0 chaves faltando, 0
data-com mais nova na fonte): o sync não perde proventos de units/ON/PN, não pagina nem corta janela.
Com a base em dia e a regra antiga, o job scores do dev dá **84 ações + 15 FIIs** com
`pagador_recorrente_parado` — o mesmo quadro de prod (93 + 33).

Causa: **(b) a regra é estrita demais** — o prazo fixo de 200 dias trata semestral/anual como
"parado" depois de 6–7 meses, ignora parcelas de uma declaração antiga ainda em pagamento e marca
como "fonte defasada" empresas que pararam de pagar há anos (DASA3, BRKM5, USIM5, TELB4: o DY 0 é
real). Achado lateral: quando a BRAPI passa a informar o pagamento de um provento, a chave (symbol,
pagamento, tipo) muda e a linha antiga "sem pagamento" fica no banco — é a origem das repetições
que a auditoria já descarta (`duplicata_sem_pagamento`).

Correção (`motivoProventosDefasados`): pagador só é "parado" se

1. nenhuma parcela válida tem pagamento a partir de hoje − maxDias (inclusive futuro, até
   `pagamentoMaxAnos` = 3 anos após a data-com; o "9999-12-31 a definir" não conta); **e**
2. a última data-com passou do **prazo esperado** = max(maxDias, maior intervalo entre data-coms
   nos `janelaHistoricoMeses` = 36 meses anteriores × `fatorIntervalo` = 1,25).

Além disso: parcela agendada conta mesmo com data-com depois de hoje (GSFI11) e sem data-com há mais
de `maxDiasParado` = 730 dias com a cobertura verificada é interrupção real (DY 0 conta).
Parâmetros novos em `params.sanidade.proventos.frescor` com default no schema (a v1 gravada continua
válida, sem seed). Um trimestral sem a data-com recente (TGMA3 com a base parada) continua marcado.

Resync/diagnóstico em prod: `scripts/analise-ativos/resync-proventos-defasados.ts` (dry-run compara
base × BRAPI para os símbolos com a flag no Quadro e separa "atrás da fonte" de "fonte sem
novidade"; `--apply` re-sincroniza os atrasados com o mesmo código do cron).

## 2. Data-com da auditoria um pregão cedo

Desde o #270 (30/09/2026) o `dividendService` grava em `dataCom` a data-com real (`lastDatePrior`) e
o script `corrigir-datacom-proventos.ts` reescreveu as linhas antigas que a BRAPI ainda devolve; a
auditoria seguia `convencaoDataCom.BRAPI = 'ex'` e recuava mais um pregão (LOGG3 17/12/2025 virava
16/12; queda de preço 2 pregões depois da `dataComReal`).

Critério por linha (`dataComReal`): o **campo de origem** da data. Campo `dataCom` (BRAPI) ⇒
`convencaoDataComAtual` (`'com'`, default no schema); campo `date` (YAHOO, data ex) ⇒
`convencaoDataCom` (`'ex'`). Linhas antigas sem pagamento que a correção não alcança (a chave
(pagamento, tipo) mudou quando a BRAPI passou a informar o pagamento): conferência no dev com a BRAPI
(40 símbolos) — 674 linhas antigas com pagamento a ≤ 1 dia da data gravada batem com `lastDatePrior`
e nenhuma com `exDate`, então também são data-com. `semPagamento` passou a aceitar o formato atual
(data-com gravada + data ex no pagamento, até 1 pregão depois — sexta × segunda).

Pré-requisito em prod: a correção do #270 aplicada em todas as linhas (`corrigir-datacom-proventos.ts`
dry-run deve dizer "data-com a corrigir: 0"; senão `--apply` antes do recálculo).

## 3. SHOW3 sem setor B3

T4F (SHOW3) teve o registro de companhia aberta cancelado pela CVM em 01/09/2026, depois da OPA de
saída (leilão em 20/07/2026). O último negócio é de 01/09, a raiz SHOW saiu da ClassifSetorial da B3
(a planilha de 30/09 não a tem), mas o FCA da CVM ainda dá a companhia como "Ativo" e a regra do
Quadro (negociada nos últimos 30 pregões) a mantinha no Quadro, sem setor, até meados de outubro.

Correção geral (`montarLinhasQuadro`): ação cuja raiz não está na ClassifSetorial vigente (sem linha
em `asset_setores_b3` ou `presenteUltimoArquivo = false`) e sem negócio há mais de 5 pregões sai do
Quadro com o motivo `deslistada` (fica na busca com o selo "sem negociação recente"). Ação nova que
ainda negocia e não entrou na planilha continua no Quadro com o alerta.

## Antes × depois no dev

Base do dev re-sincronizada (02/10), recálculo `recalcular-analise.ts --etapas=proventos,eventos,
derivados,scores --tudo --apply` + job quadro, dataRef 29/09/2026. "Antes" = código de `main` na
mesma base.

| Medida                                                   | Antes     | Depois                     |
| -------------------------------------------------------- | --------- | -------------------------- |
| Alerta do job scores — ações `pagador_recorrente_parado` | 84        | 11                         |
| Alerta do job scores — FIIs `pagador_recorrente_parado`  | 15        | 7                          |
| Quadro de ações: linhas no Quadro                        | 331       | 330 (SHOW3 → `deslistada`) |
| Quadro de ações: `incompleto`                            | 169       | 120                        |
| Quadro de ações: `div:fonte_defasada`                    | 82        | 11                         |
| Quadro de ações: `calculado` / `zero_regra`              | 132 / 30  | 165 / 45                   |
| Quadro de FIIs: `incompleto`                             | 64        | 61                         |
| Quadro de FIIs: `div:fonte_defasada`                     | 12        | 6                          |
| Alerta `quadro_sem_setor`                                | 1 (SHOW3) | 0                          |

Exemplos:

- **KLBN11**: `incompleto` (`div:fonte_defasada`) → `calculado`; DY 12m 6,4% (4 parcelas da
  declaração de 15/12/2025) volta a contar; Índice 2,87 → 4,06.
- **AZZA3**: incompleto (`div:fonte_defasada`) → DY 14,4% conta; Índice 5,34 → 6,84.
- **SYNE3**: incompleto → DY 11,7% conta; Índice 2,91 → 4,41.
- **EUCA3/EUCA4** (declaração de dez/2025 paga até dez/2026): DY 4,9%/5,1% voltam; 5,32 → 6,28.
- **USIM5, BRKM5, HAPV3, CVCB3** (sem provento há anos): `incompleto` → `zero_regra` (DY 0 real).
- **MDNE3, LAVV3, SCAR3** (DY 19%, 30%, 58%): de "base defasada" para "em conferência" (teto).
- **LOGG3** (item 2): data-com 17/12/2025 → **18/12/2025**; o preço cai em 19/12 (26,07 → 23,01),
  o pregão seguinte. Idem BMKS3 24/11 → 25/11, BALM4 16/12 → 17/12, CEBR5 09/12 → 10/12.
- Efeito de borda do item 2: CURY3 (16,6% → 19,0%), BNFS11 e KIVO11 (FIIs, 18,9% → 20,5% e 19,9%
  → 20,2%) passam a ter na janela de 12m um provento com data-com no 1º pregão da janela e cruzam o
  teto ⇒ "em conferência".

Os 18 que continuam marcados (BSLI3/4, DXCO3, KEPL3, LAND3, LJQQ3, RAPT3/4, TUPY3, UCAS3, VULC3;
FIIs CNES11, DAMA11, HAAA11, MCLO11, VIUR11, VPPR11, VVMR11) estão iguais à BRAPI
(`resync-proventos-defasados.ts`: "fonte sem novidade") — pagadores regulares sem provento novo no
prazo esperado.

## Produção

Ordem (cada script com dry-run primeiro):

1. `scripts/corrigir-datacom-proventos.ts` — confirmar "data-com a corrigir: 0" (correção do #270);
   se não, `--apply`.
2. `scripts/analise-ativos/resync-proventos-defasados.ts` — quantos estão "atrás da fonte"; se
   houver, `--apply`.
3. `scripts/analise-ativos/recalcular-analise.ts --etapas=proventos,eventos,derivados,scores --tudo`
   (dry-run) → `--apply`.
4. `scripts/analise-ativos/rodar-job.ts quadro`.
