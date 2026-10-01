# Pendências da fatia B (FIIs CVM)

Itens que dependem de arquivos da fatia 0 (não editados pela B, contornados localmente).

1. **`TickerFii['origem']` (tipos.ts) sem `'b3_cnpj'`.** A lista `GetListFunds` da B3 não traz ISIN,
   então o casamento "ISIN completo" nunca acontece com a lista pura. A B contorna consultando
   `GetDetailFund` (mesmo host da allowlist), que devolve o **CNPJ** do fundo — evidência mais forte que
   ISIN e nome. Esses casamentos são gravados com `FiiTickerMap.origem = 'b3_cnpj'` (coluna String,
   sem mudança de schema). Proposta: acrescentar `'b3_cnpj'` à união em `tipos.ts`; até lá,
   `repositorio.universo.listarFiisListados` devolve o valor cru com cast. A D não depende da origem
   (usa `conferido`).
2. **`FiiQuarterly` sem coluna `naoSeAplica`.** Três estados gravados como coluna null + flag
   `nsa:<coluna>` (ex.: `nsa:vacanciaFisicaCvmPct` em FII de papel); null sem flag = ausente.
   Proposta: coluna `naoSeAplica String[]` como nas tabelas de ações.
3. **Cron no template do Lightsail**: as 3 linhas (`fii-cadastro` dom 05:40, `fii-mensal` 09:35,
   `fii-trimestral` 09:45) ficam com a fatia E (spec `jobsComum.linhasCronTemplate`).
4. **KNCR11 "LCI 12,5%"** (spec/relatório): nos informes de 2025–2026 a LCI do KNCR11 fica entre 1% e
   10,8% do PL (ago/26 = 6,4%). O teste usa o valor real de ago/26 e um caso sintético de 12,5%.
5. **20 tickers com CNPJ da B3 sem informe mensal recente** (`motivo = cnpj_b3_sem_informe_recente`,
   `conferido=false`: BRGL11, BRCD11, BPOF11, CPHG11, FTRR11, FTRE11, VGRH11, KOIM11, SLDZ11, MAGM11,
   GANT11, MOSO11, RZZE11, MTES11, BOAT11, FRRE11, RJDA11…). Provável classe nova (CVM 175) ou fundo que
   não entrega o informe; ficam sem FiiMonthly e fora do universo publicado. Curadoria: conferir e, se
   preciso, entrar em `tickersManuais.ts`.
6. **Conferência PL×cotação divergente** (~19 fundos no dev com o COTAHIST da fatia C, ex.: CARE11, PABY11,
   BLUE11): ficam `conferido=false` e com alerta semanal até revisão manual.
