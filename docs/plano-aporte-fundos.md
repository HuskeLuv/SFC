# Plano — Modelo de aporte/resgate (opção 3) + Fundos como ações

> Criado 2026-06-06. Origem: ao corrigir eventos corporativos no registro
> (commit `78514a5`), descobrimos que aporte/resgate usam um modelo **value-based**
> (quantity=1) incompatível com o modelo **share-based** de ações — e que **fundos**
> hoje ficam num meio-termo (às vezes valor, às vezes cota), sem cálculo de cota
> atual, sem série histórica e sem gráfico. Este plano corrige os dois, em sequência.

## Contexto medido (2026-06-06, prod)

- Eventos corporativos no registro: ✅ resolvido para `operacao` (Part B, `78514a5`).
- `aporte`/`resgate`: oferecidos para ações/FII/ETF (via `/api/carteira/resgate/tipos`),
  mas `aporte` cria `compra` com **quantity=1** (depósito de valor) → não são cotas.
- Catálogo de fundos: **30.672 assets com CNPJ** (multimercado 10.695, fund-rf 5.453,
  fidc 4.019, fia 3.586, previdencia 3.029, fip 1.890, fii 1.257, fiagro 276, etc.).
- **`cvm_fund_quotas` = 0 linhas**, `asset_price_history(source=CVM)` = 0 → não há
  série de cota; o `cvm-fund-sync` só processa fundos que já estão em alguma carteira.

---

## FASE 1 — Modelo consistente de aporte/resgate (opção 3)

**Princípio:** `aporte` é uma operação **de valor**, válida só para ativos
value-based (**renda-fixa, reservas**). Ativos **share/quota-based** (ações, FII,
ETF, REIT — e fundos, após a Fase 2) crescem via **comprar** (`operacao`, com
quantidade) e diminuem via **vender** (`resgate` share-based). Acaba a anomalia de
"aportar valor numa ação" (que contaria como +1 cota e corromperia o recálculo).

### Passos

1.1 **Separar "tipos aportáveis" de "tipos resgatáveis".** Hoje o wizard de aporte
    reusa `/api/carteira/resgate/tipos`. Criar `/api/carteira/aporte/tipos` (ou um
    filtro) que retorna só value-based (renda-fixa, reservas). `resgate/tipos`
    continua com todos. _Refs:_ `src/components/carteira/wizard/Step1AssetType.tsx:32`
    (`fetchTiposAporte`), `src/app/api/carteira/resgate/tipos/route.ts`.

1.2 **Guard na API do aporte.** `POST /api/carteira/aporte` rejeita (400) quando o
    asset é share-based (`stock`/`fii`/`etf`/`reit`/`fim-fia`/`bdr`) com mensagem
    "use Comprar para adicionar cotas". Belt-and-suspenders. _Ref:_
    `src/app/api/carteira/aporte/route.ts:19-26`.

1.3 **resgate share-based → recalc.** Para ativos de bolsa, rotear o caminho de venda
    por `recalculatePortfolioFromTransactions` (aplica eventos corporativos na venda).
    Seguro agora porque, sem aporte de valor em equity, o histórico só tem cotas
    reais. Renda-fixa (modo `valor`, qty=1) mantém o cálculo inline atual. Guard por
    `asset.type` + método. _Refs:_ `src/app/api/carteira/resgate/route.ts:176-233`.

1.4 **Migração de dados.** Posições legadas de aporte-em-equity (`compra` qty=1) →
    **zero hoje** (sem usuários reais). Nada a migrar; documentar o invariante.

1.5 **Testes.** aporte rejeita equity; resgate-equity aplica fator de evento; renda-fixa
    intacta; aporte em renda-fixa continua funcionando.

**Resultado:** aporte/resgate corretos e seguros; o modelo share-based fica coeso e
pronto para receber os fundos na Fase 2.

---

## FASE 2 — Fundos se comportam como ações

**Objetivo:** posição de fundo **quota-based** (quantity=cotas, avgPrice=valor da
cota), com **preço de cota atual** aplicado, **série histórica de cota** alimentando
os **gráficos**, e **rendimento** calculado como ação. A infra está ~70% pronta
(catálogo CVM + tabela `cvm_fund_quotas` + bridge para `Asset.currentPrice`); falta
ligar à carteira e popular o histórico.

### Passos

2.1 **Registro sempre quota-based para fundos CVM.** Exigir **preço de cota +
    quantidade** (o wizard já default 'cotas' para fundos CVM); quando o usuário
    informar só valor, converter para cotas pela cota mais recente. Armazenar
    `quantity=cotas`, `avgPrice=valor_cota`. Eliminar o caminho `quantity=1` para
    fundos CVM. _Refs:_ `src/app/api/carteira/operacao/route.ts:1581-1591`,
    `src/components/carteira/wizard/Step4FundoDebenturePrevidenciaFields.tsx:34-284`.

2.2 **Série de cota CVM: on-demand + histórico completo.** Hoje o bridge grava só a
    **última** cota em `AssetPriceHistory`. Mudar para gravar **toda a série** de
    `cvm_fund_quotas`. E, como `cvm_fund_quotas` está vazio (sync gated em holdings),
    **buscar on-demand no registro** (padrão do Part B): ao registrar um fundo, baixar
    os INF_DIARIO recentes do CNPJ e popular `cvm_fund_quotas` + `asset_price_history`.
    Backfill profundo (vários meses) via cron. _Refs:_
    `src/services/pricing/cvmFundSync.ts:131-365` (`runCvmFundSync`,
    `bridgeCvmToAssetPrices`), `prisma/schema.prisma:745-762` (`CvmFundQuota`).
    - **Cuidado de performance:** INF_DIARIO é mensal e cobre todos os fundos do BR
      (arquivo grande). Estratégia: baixar o ZIP do mês **uma vez** e popular todos os
      CNPJs registrados de uma vez (não por fundo). No registro, buscar só os últimos
      ~N meses (gráfico/rendimento recente); o cron aprofunda o histórico.

2.3 **GET dos fundos como ações.** `valorAtualizado = quantity × cota_atual`;
    `rentabilidade = (cota_atual − avgPrice) / avgPrice`. Remover a conflação com
    `FixedIncomeAsset` para fundos que **não** são renda-fixa (hoje fundo manual em
    destino renda-fixa vira marcação de curva CDI/IPCA, o que é errado). _Refs:_
    `src/app/api/carteira/fim-fia/route.ts:112-177`, `operacao/route.ts:1164-1193`.

2.4 **Gráficos de histórico.** Com `asset_price_history` populado (2.2), o
    `patrimonioHistoricoBuilder` já monta a série. Garantir que símbolos de fundo
    entram na coleta de símbolos do snapshot/chart e no pipeline de
    `/api/carteira/resumo` e `/api/ativos/[id]`. _Refs:_
    `src/services/portfolio/patrimonioHistoricoBuilder.ts:118-146`.

2.5 **Rendimentos/proventos.** Proventos de fundo via `PortfolioProvento` (já
    suportado); alinhar o cálculo de rendimento com o de ação/FII.

2.6 **Fundos manuais (sem CNPJ).** Decidir: exigir CNPJ (vincula à série CVM) ou
    manter fallback value-based explícito (sem gráfico de cota). _Ref:_
    `operacao/route.ts:1108-1162`.

2.7 **Testes + backfill.** Entrada quota-based; bridge de série completa; cálculo de
    valor com cota viva; gráfico renderizando. Backfill de posições value-based
    existentes → zero hoje.

**Resultado:** fundo aparece, calcula, rende e gráfica igual a uma ação; e encaixa no
modelo share-based da Fase 1 (aporte sai, comprar/vender entra).

---

## Ordem e dependências

```
Part B (eventos no registro) ── já feito (78514a5), aguardando deploy
        │
        ▼
FASE 1 (aporte/resgate opção 3) ── estabelece "share/quota-based usa comprar/vender"
        │
        ▼
FASE 2 (fundos como ações) ── torna fundos quota-based; aporte de fundo vira comprar
```

Fase 1 antes da 2: a 1 fixa o invariante do modelo; a 2 migra os fundos pra dentro
dele. Na 1, ao restringir o aporte, já deixar previsto que **fundos** saem da lista de
aportáveis quando virarem quota-based (Fase 2).

## Riscos principais

- **Volume CVM:** baixar séries de cota é pesado (INF_DIARIO mensal, ~todos os fundos
  do BR). Mitigar com download mensal único + filtro multi-CNPJ + on-demand raso no
  registro / backfill profundo no cron.
- **Latência no registro:** o fetch on-demand de cota adiciona tempo — buscar só meses
  recentes no caminho síncrono.
- **Precisão:** `quotaValue` é Decimal(18,8); manter precisão no cálculo de posição.
- **Sem dados reais ainda:** ótimo momento pra mudar o modelo (zero migração de dados).
