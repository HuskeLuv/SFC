import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getIndicator } from '@/services/market/marketIndicatorService';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { Prisma } from '@prisma/client';
import { deleteTtlCacheKeyPrefix, getTtlCache } from '@/lib/simpleTtlCache';
import { applyChartAggregation } from '@/services/portfolio/portfolioSeriesAggregation';
import { loadHistoricoFromSnapshots } from '@/services/portfolio/portfolioSnapshotReader';
import { triggerLazyBackfill } from '@/services/portfolio/portfolioSnapshotPersistence';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';
import { valuatePortfolioItem } from '@/services/portfolio/itemValuation';
import { isFundoType } from '@/lib/fundoTypes';
import type { FixedIncomeAssetWithAsset } from '@/services/portfolio/patrimonioHistoricoBuilder';
import { filterInvestmentsExclReservas } from '@/utils/cashflowFilters';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import {
  recordChange,
  diffFields,
  buildDashboardMetricSnapshot,
  RESUMO_FIELD_LABELS,
} from '@/services/changeHistory';
import { parseRangeMonths } from '@/utils/rangeQuery';
import { loadProventosByDay } from '@/services/portfolio/proventosByDay';
const resumoCache = getTtlCache<Record<string, unknown>>('carteiraResumo');

export const GET = withErrorHandler(async (request: NextRequest) => {
  if (process.env.NODE_ENV !== 'production') {
    // Cenário de validação só em DEV. Dynamic import gated por env: produção
    // não paga o cold-start de carregar buildDailyTimeline/buildDailyPriceMap.
    const { runPatrimonioScenarioTest } = await import('./_devScenarioTest');
    runPatrimonioScenarioTest();
  }
  const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

  const { searchParams } = new URL(request.url);
  const twrStartDateParam = searchParams.get('twrStartDate');
  const twrStartDate = twrStartDateParam ? parseInt(twrStartDateParam, 10) : undefined;
  const includeHistorico = searchParams.get('includeHistorico') !== 'false';
  // Default null = sem cap. O snapshot reader já carregava sem cap; antes só
  // o caminho live truncava em 24m, fazendo "MAX" do chart aparentar curto
  // pra contas com histórico anterior a mai/24 (bug #17 do checklist mai/28).
  const rangeMonths = parseRangeMonths(request, null);
  // Snapshot path é o caminho rápido: lê portfolio_daily_snapshots em vez de
  // recomputar o histórico inteiro. Default true; o reader retorna coverageOk=false
  // quando não há dados suficientes (usuário novo ou cron ainda não acumulou 24m),
  // caindo graciosamente no live builder. Opt-out via USE_PORTFOLIO_SNAPSHOTS=false.
  const usePortfolioSnapshots = process.env.USE_PORTFOLIO_SNAPSHOTS !== 'false';
  const resumoCacheKey = `${targetUserId}:ih=${includeHistorico}:twr=${twrStartDate ?? ''}`;

  if (usePortfolioSnapshots) {
    const cached = resumoCache.get(resumoCacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  // Registrar acesso se estiver personificado
  await logSensitiveEndpointAccess(
    request,
    payload,
    targetUserId,
    actingClient,
    '/api/carteira/resumo',
    'GET',
  );

  // Paralelizar queries iniciais para reduzir tempo de carregamento
  const [
    user,
    portfolio,
    fixedIncomeResult,
    investmentGroupsTemplate,
    investmentGroupsCustom,
    dashboardMetrics,
    stockTransactions,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetUserId } }),
    prisma.portfolio.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
    }),
    (async (): Promise<FixedIncomeAssetWithAsset[]> => {
      try {
        return (await prisma.fixedIncomeAsset.findMany({
          where: { userId: targetUserId },
          include: { asset: true },
        })) as FixedIncomeAssetWithAsset[];
      } catch (error) {
        const prismaError = error as Prisma.PrismaClientKnownRequestError;
        if (prismaError?.code !== 'P2021') throw error;
        return [];
      }
    })(),
    prisma.cashflowGroup.findMany({
      where: { userId: null, type: 'investimento' },
      include: {
        items: {
          include: {
            values: {
              where: { userId: targetUserId, year: new Date().getFullYear() },
            },
          },
        },
      },
    }),
    prisma.cashflowGroup.findMany({
      where: { userId: targetUserId, type: 'investimento' },
      include: {
        items: {
          include: {
            values: {
              where: { userId: targetUserId, year: new Date().getFullYear() },
            },
          },
        },
      },
    }),
    prisma.dashboardData.findMany({
      where: {
        userId: targetUserId,
        metric: {
          in: [
            'meta_patrimonio',
            'caixa_para_investir_consolidado',
            'caixa_para_investir_acoes',
            'caixa_para_investir_fii',
            'caixa_para_investir_etf',
            'caixa_para_investir_reit',
            'caixa_para_investir_stocks',
            'caixa_para_investir_moedas_criptos',
            'caixa_para_investir_previdencia_seguros',
            'caixa_para_investir_opcoes',
            'caixa_para_investir_fim_fia',
            'caixa_para_investir_renda_fixa',
          ],
        },
      },
    }),
    prisma.stockTransaction.findMany({
      where: { userId: targetUserId },
      include: { asset: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const fixedIncomeAssets = fixedIncomeResult;

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Pricer compartilhado para marcação na curva (CDI/IPCA/Tesouro PU). Reutilizado em
  // todas as iterações do portfolio para que CDB/LCI/LCA/Tesouro tenham o mesmo valor
  // atual em qualquer aba (resumo, reservas, FIM/FIA, renda fixa).
  const fiPricer = await createFixedIncomePricer(targetUserId, {
    preloadedAssets: fixedIncomeAssets,
  });

  // Usa o map enriched do pricer (com `qty` populado do Portfolio). Sem isso,
  // Tesouro Direto cadastrado em estilo Kinvo (qty=1, avgPrice=valor pago) cai
  // no caminho do PU oficial e não reflete o ganho real até o BACEN publicar
  // o PU do dia.
  const fixedIncomeByAssetId = fiPricer.fixedIncomeByAssetId;

  // Mesclar grupos (personalizações têm prioridade)
  const allInvestmentGroups = [...investmentGroupsCustom];
  const templateMap = new Map(investmentGroupsTemplate.map((g) => [g.name, g]));
  investmentGroupsCustom.forEach((custom) => templateMap.delete(custom.name));
  allInvestmentGroups.push(...Array.from(templateMap.values()));

  // Coletar todos os itens de investimento
  const investments = allInvestmentGroups.flatMap((group) => group.items || []);

  // Itens de reserva no cashflow não devem ser somados - já estão no portfolio (evita duplicação)
  const investmentsExclReservas = filterInvestmentsExclReservas(investments);

  // Buscar cotações atuais dos ativos no portfolio
  // Excluir símbolos de reserva, imóveis/bens e personalizados pois são assets manuais sem cotações externas
  const symbols = portfolio
    .map((item) => {
      // Não incluir imóveis/bens e personalizados na busca de cotações
      if (item.asset && (item.asset.type === 'imovel' || item.asset.type === 'personalizado')) {
        return null;
      }
      // Renda fixa é precificada pela curva do FI — exceto fundos: um fundo
      // com FI E cota CVM (Asset.currentPrice) vale a cota, como na aba Fundos,
      // então o símbolo precisa entrar na busca de cotações.
      if (
        item.assetId &&
        fixedIncomeByAssetId.has(item.assetId) &&
        !isFundoType(item.asset?.type)
      ) {
        return null;
      }
      if (item.asset) {
        return item.asset.symbol;
      }
      return null;
    })
    .filter(
      (symbol): symbol is string =>
        symbol !== null &&
        !symbol.startsWith('RESERVA-EMERG') &&
        !symbol.startsWith('RESERVA-OPORT') &&
        !symbol.startsWith('RENDA-FIXA') &&
        !symbol.startsWith('CONTA-CORRENTE') &&
        !symbol.startsWith('PERSONALIZADO') &&
        !symbol.startsWith('-') &&
        /^[A-Za-z]/.test(symbol),
    );

  // Buscar cotações e dólar em paralelo
  const [quotesResult, dolarIndicator] = await Promise.all([
    getAssetPrices(symbols, { useBrapiFallback: true }),
    getIndicator('USD-BRL', { useBrapiFallback: true }).catch(() => null),
  ]);
  const quotes = quotesResult;
  const cotacaoDolar = dolarIndicator?.price ?? null;

  // Inicializar contadores para cada categoria (antes do loop)
  const categorias = {
    reservaEmergencia: 0,
    reservaOportunidade: 0,
    rendaFixaFundos: 0,
    fimFia: 0,
    fiis: 0,
    acoes: 0,
    stocks: 0,
    reits: 0,
    etfs: 0,
    moedasCriptos: 0,
    previdenciaSeguros: 0,
    opcoes: 0,
    imoveisBens: 0,
  };

  // Catalog Tesouro Direto compartilha asset.type='tesouro-direto' entre usuários;
  // a intenção de colocá-lo numa reserva fica registrada em transaction.notes.tesouroDestino.
  const tesouroReservaDestinoByAssetId = new Map<string, 'emergencia' | 'oportunidade'>();
  for (const tx of stockTransactions) {
    if (tx.type !== 'compra' || !tx.assetId || !tx.notes) continue;
    if (tesouroReservaDestinoByAssetId.has(tx.assetId)) continue;
    try {
      const parsed = JSON.parse(tx.notes);
      if (parsed?.tesouroDestino === 'reserva-oportunidade') {
        tesouroReservaDestinoByAssetId.set(tx.assetId, 'oportunidade');
      } else if (parsed?.tesouroDestino === 'reserva-emergencia') {
        tesouroReservaDestinoByAssetId.set(tx.assetId, 'emergencia');
      }
    } catch {
      // ignora notas malformadas
    }
  }

  // Loop ÚNICO de valoração + categorização (itemValuation). Antes eram dois
  // loops com prioridades divergentes — a mesma posição valia um número no
  // saldoBruto e outro na distribuição. Imóveis/personalizados ficam fora de
  // saldoBruto E de valorAplicado (contaNoSaldoBruto=false): contá-los só no
  // aplicado fazia a rentabilidade desabar (ex.: -94% com um imóvel de 500k).
  let stocksTotalInvested = 0;
  let stocksCurrentValue = 0;
  for (const item of portfolio) {
    const symbol = item.asset?.symbol;
    const valuation = valuatePortfolioItem({
      item,
      asset: item.asset,
      fixedIncome: item.assetId ? fixedIncomeByAssetId.get(item.assetId) : null,
      quote: symbol ? quotes.get(symbol) : null,
      cotacaoDolar,
      tesouroReservaDestino: item.assetId
        ? tesouroReservaDestinoByAssetId.get(item.assetId)
        : undefined,
      fiGetCurrentValue: fiPricer.getCurrentValue,
    });
    categorias[valuation.categoria] += valuation.valorAtualBRL;
    if (valuation.contaNoSaldoBruto) {
      stocksCurrentValue += valuation.valorAtualBRL;
      stocksTotalInvested += item.totalInvested;
    }
  }

  // Calcular totais dos outros investimentos (excluindo reservas - já estão no portfolio)
  const otherInvestmentsTotalInvested = investmentsExclReservas.reduce((sum, item) => {
    const totalValues = (item.values || []).reduce(
      (sumValues, value) => sumValues + value.value,
      0,
    );
    return sum + totalValues;
  }, 0);

  // Usar valor investido como valor atual (sem variação simulada)
  const otherInvestmentsCurrentValue = otherInvestmentsTotalInvested;

  // Totais consolidados
  const valorAplicado = stocksTotalInvested + otherInvestmentsTotalInvested;
  const saldoBruto = stocksCurrentValue + otherInvestmentsCurrentValue;

  // Proventos recebidos (realizados, líquidos de IRRF) entram no RETORNO: a
  // rentabilidade é TOTAL (capital + renda), igual à metodologia do Kinvo.
  // Sem isso, ativos com dividendo apareciam com retorno só de capital — ex.:
  // um FII que rendeu +35% com proventos aparecia como -12% (só o preço).
  // Proventos por dia (líquido de IRRF) — alimentam a SÉRIE de rentabilidade
  // (historicoTWR/MWR) além do card, pra ser retorno TOTAL (capital + renda).
  const { proventosByDay, total: proventosRecebidos } = await loadProventosByDay(targetUserId);

  const rentabilidade =
    valorAplicado > 0
      ? ((saldoBruto + proventosRecebidos - valorAplicado) / valorAplicado) * 100
      : 0;

  // dashboardMetrics já carregado em paralelo acima
  const metaPatrimonio = dashboardMetrics.find((item) => item.metric === 'meta_patrimonio');

  // Buscar caixa para investir consolidado (não é mais a soma dos outros)
  const caixaParaInvestirConsolidado = dashboardMetrics.find(
    (item) => item.metric === 'caixa_para_investir_consolidado',
  );
  const caixaParaInvestir = caixaParaInvestirConsolidado?.value || 0;

  // stockTransactions já carregado em paralelo acima

  // Buscar investimentos em cashflow para gerar histórico real (excluindo reservas)
  const cashflowInvestments = investmentsExclReservas;

  const historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }> =
    [];
  const historicoTWR: Array<{ data: number; value: number }> = [];
  let historicoTWRPeriodo: Array<{ data: number; value: number }> = [];
  // Proventos acumulados por dia (snapshots ou builder) — o MWR precisa deles
  // pra computar retorno total agora que a série exibida é só mercado.
  let proventosAcumuladosByDayForMwr: Map<number, number> | undefined;

  const hasHistoricoData =
    stockTransactions.length > 0 || cashflowInvestments.length > 0 || portfolio.length > 0;

  if (hasHistoricoData && includeHistorico) {
    // Carrega o builder pesado (~1k linhas) só quando o caller pediu o histórico.
    // Caminho rápido (`includeHistorico=false`, usado pelo first-paint do useCarteira)
    // não paga o cold-start desse módulo.
    const { buildPatrimonioHistorico, getRawPatrimonioTimelineStart, normalizeDateStart } =
      await import('@/services/portfolio/patrimonioHistoricoBuilder');

    const hoje = normalizeDateStart(new Date());
    const saldoBrutoAtual = Math.round((saldoBruto > 0 ? saldoBruto : valorAplicado) * 100) / 100;
    const valorAplicadoAtual = Math.round(valorAplicado * 100) / 100;

    const rawTimelineStart = getRawPatrimonioTimelineStart(
      stockTransactions,
      portfolio,
      cashflowInvestments,
      fixedIncomeAssets,
      new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1),
    );

    // firstActivityDate = primeira atividade REAL (sem o fallback de -11 meses
    // do rawTimelineStart). Permite ao reader detectar quando o snapshot mais
    // antigo está bem depois disso (sintoma clássico de backfill nunca rodado
    // pra essa conta).
    const activityCandidates: number[] = [];
    if (stockTransactions.length > 0) {
      activityCandidates.push(new Date(stockTransactions[0].date).getTime());
    }
    if (fixedIncomeAssets.length > 0) {
      const minFi = Math.min(
        ...fixedIncomeAssets
          .map((a) => new Date(a.startDate).getTime())
          .filter((v) => Number.isFinite(v)),
      );
      if (Number.isFinite(minFi)) activityCandidates.push(minFi);
    }
    cashflowInvestments.forEach((inv) => {
      (inv.values || []).forEach((v) => {
        activityCandidates.push(new Date(v.year, v.month, 1).getTime());
      });
    });
    const firstActivityDate =
      activityCandidates.length > 0 ? new Date(Math.min(...activityCandidates)) : undefined;

    let usedSnapshots = false;
    let snapCoverageReason: 'ok' | 'no-rows' | 'tail-gap' | 'history-gap' | null = null;
    if (usePortfolioSnapshots) {
      const snap = await loadHistoricoFromSnapshots(targetUserId, rawTimelineStart, hoje, {
        liveSaldoBruto: saldoBrutoAtual,
        liveValorAplicado: valorAplicadoAtual,
        twrStartDate,
        firstActivityDate,
      });
      snapCoverageReason = snap.coverageReason;
      if (snap.coverageOk && snap.historicoPatrimonio.length > 0) {
        proventosAcumuladosByDayForMwr = snap.proventosAcumuladosByDay;
        const startMs = snap.historicoPatrimonio[0]?.data ?? rawTimelineStart.getTime();
        const endMs =
          snap.historicoPatrimonio[snap.historicoPatrimonio.length - 1]?.data ?? hoje.getTime();
        const agg = applyChartAggregation(
          snap.historicoPatrimonio,
          snap.historicoTWR,
          startMs,
          endMs,
        );
        historicoPatrimonio.push(...agg.historicoPatrimonio);
        historicoTWR.push(...agg.historicoTWR);
        historicoTWRPeriodo = snap.historicoTWRPeriodo;
        usedSnapshots = true;
      }
    }

    if (!usedSnapshots) {
      const built = await buildPatrimonioHistorico({
        portfolio,
        fixedIncomeAssets,
        stockTransactions,
        investmentsExclReservas: cashflowInvestments,
        saldoBrutoAtual: saldoBruto,
        valorAplicadoAtual: valorAplicado,
        twrStartDate,
        maxHistoricoMonths: rangeMonths,
        // Patch desligado: sobrescrever último dia com totais live (BRAPI atual +
        // FI pricer live) divergia da engine que precifica os dias anteriores
        // (assetPriceHistory + curva diária), produzindo um drop artificial em
        // TWR/MWR no último ponto do gráfico de rentabilidade. Chart termina no
        // último close do cron; cards de Saldo Bruto/Rentabilidade no topo
        // continuam live por virem de um caminho independente.
        patchLastDayWithLiveTotals: false,
        fixedIncomeValueSeriesBuilder: fiPricer.buildValueSeriesForAsset,
        implicitCdiValueSeriesBuilder: fiPricer.buildImplicitCdiValueSeries,
        proventosByDay,
      });
      if (usePortfolioSnapshots) {
        const startMs = built.historicoPatrimonio[0]?.data ?? hoje.getTime();
        const endMs =
          built.historicoPatrimonio[built.historicoPatrimonio.length - 1]?.data ?? hoje.getTime();
        const agg = applyChartAggregation(
          built.historicoPatrimonio,
          built.historicoTWR,
          startMs,
          endMs,
        );
        historicoPatrimonio.push(...agg.historicoPatrimonio);
        historicoTWR.push(...agg.historicoTWR);
      } else {
        historicoPatrimonio.push(...built.historicoPatrimonio);
        historicoTWR.push(...built.historicoTWR);
      }
      historicoTWRPeriodo = built.historicoTWRPeriodo;
      proventosAcumuladosByDayForMwr = built.proventosAcumuladosByDay;

      // Lazy backfill: quando a falta de cobertura foi por gap histórico (snapshots
      // recentes mas nada cobrindo as transações antigas), dispara em background a
      // persistência da série completa pra próxima leitura ser servida pelo path
      // rápido. Não bloqueia a request — o usuário já recebeu o resultado via
      // buildPatrimonioHistorico aqui em cima.
      if (usePortfolioSnapshots && snapCoverageReason === 'history-gap') {
        void triggerLazyBackfill(targetUserId, hoje);
      }
    }
  }

  // Série de MWR cumulativo derivada do histórico de patrimônio. CashFlows
  // autoritativos (transações + valores manuais do cashflow planner) são montados
  // sobre uma timeline DIÁRIA — independente da granularidade agregada do gráfico —
  // e passados explicitamente pra buildMwrSeries.
  //
  // Sem isso, deriveCashFlowsFromValorAplicado interpretaria o salto entre o último
  // ponto (patched com totais ao vivo, que somam investimentos do cashflow planner
  // em valorAplicado) e o anterior (sem essa soma) como aporte fantasma — derrubando
  // o MWR no último dia de forma artificial.
  const historicoMWR: Array<{ data: number; value: number }> = [];
  let historicoMWRPeriodo: Array<{ data: number; value: number }> = [];
  if (historicoPatrimonio.length > 0) {
    const { buildDailyTimeline, buildPatrimonioCashFlowsByDayOnly } =
      await import('@/services/portfolio/patrimonioHistoricoBuilder');
    const { buildMwrSeries } = await import('@/services/portfolio/mwrSeriesBuilder');
    const startMs = historicoPatrimonio[0].data;
    const endMs = historicoPatrimonio[historicoPatrimonio.length - 1].data;
    const dailyTimeline = buildDailyTimeline(new Date(startMs), new Date(endMs));
    const cashFlowsByDay = buildPatrimonioCashFlowsByDayOnly(
      portfolio,
      fixedIncomeAssets,
      stockTransactions,
      cashflowInvestments,
      dailyTimeline,
    );
    historicoMWR.push(
      ...buildMwrSeries({
        historicoPatrimonio,
        cashFlowsByDay,
        proventosAcumuladosByDay: proventosAcumuladosByDayForMwr,
      }),
    );
    if (typeof twrStartDate === 'number' && Number.isFinite(twrStartDate)) {
      historicoMWRPeriodo = buildMwrSeries({
        historicoPatrimonio,
        cashFlowsByDay,
        startMs: twrStartDate,
        proventosAcumuladosByDay: proventosAcumuladosByDayForMwr,
      });
    }
  }

  // Placeholder quando não há dados ou includeHistorico=false (carregamento rápido)
  if (historicoPatrimonio.length === 0) {
    const hoje = new Date();
    const saldo = Math.round(saldoBruto * 100) / 100;
    const aplicado = Math.round(valorAplicado * 100) / 100;
    for (let i = 11; i >= 0; i--) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      historicoPatrimonio.push({
        data: data.getTime(),
        valorAplicado: aplicado,
        saldoBruto: saldo,
      });
    }
    historicoTWR.push(
      ...historicoPatrimonio.map((item, i) => ({ data: item.data, value: i === 0 ? 0 : 0 })),
    );
  }

  // Não incluir investimentos de cashflow na distribuição de alocação - evita valores fantasmas
  // A tabela de alocação reflete apenas portfolio real + caixa para investir
  // categorizedInvestments (cashflow) pode ter valores de planejamento que não correspondem ao patrimônio real

  // Buscar caixa para investir de cada tab e adicionar aos valores calculados
  // Isso garante que os valores incluam o caixa para investir de cada tab
  const caixaAcoes =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_acoes')?.value || 0;
  const caixaFii =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_fii')?.value || 0;
  const caixaEtf =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_etf')?.value || 0;
  const caixaReit =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_reit')?.value || 0;
  const caixaStocks =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_stocks')?.value || 0;
  const caixaMoedasCriptos =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_moedas_criptos')?.value ||
    0;
  const caixaPrevidenciaSeguros =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_previdencia_seguros')
      ?.value || 0;
  const caixaOpcoes =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_opcoes')?.value || 0;
  const caixaFimFia =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_fim_fia')?.value || 0;
  const caixaRendaFixa =
    dashboardMetrics.find((item) => item.metric === 'caixa_para_investir_renda_fixa')?.value || 0;

  // Adicionar caixas aos valores das categorias (que já foram calculados acima)
  categorias.acoes += caixaAcoes;
  categorias.fiis += caixaFii;
  categorias.etfs += caixaEtf;
  categorias.reits += caixaReit;
  categorias.stocks += caixaStocks;
  categorias.moedasCriptos += caixaMoedasCriptos;
  categorias.previdenciaSeguros += caixaPrevidenciaSeguros;
  categorias.opcoes += caixaOpcoes;
  categorias.fimFia += caixaFimFia;
  categorias.rendaFixaFundos += caixaRendaFixa;

  // Denominador ÚNICO dos percentuais (decisão de produto, jul/2026):
  //   totais.dinheiro = Σ categorias líquidas (caixas por aba já embutidos)
  //                     + caixa consolidado, contado UMA vez.
  //   Imóveis/bens ficam FORA do denominador das categorias líquidas; o % de
  //   imoveisBens usa dinheiroMaisBens. O frontend (pizza, tabela de alocação,
  //   necessidade de aporte) consome estes números prontos — antes cada tela
  //   recalculava com uma base diferente (0,96% vs 15,65% pra mesma categoria).
  const totalDinheiro =
    Object.entries(categorias).reduce(
      (sum, [key, valor]) => (key === 'imoveisBens' ? sum : sum + valor),
      0,
    ) + (caixaParaInvestir || 0);
  const totalDinheiroMaisBens = totalDinheiro + categorias.imoveisBens;

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const pctOf = (valor: number, base: number) => (base > 0 ? round2((valor / base) * 100) : 0);
  const distribuicaoEntry = (key: keyof typeof categorias) => ({
    valor: round2(categorias[key]),
    percentual: pctOf(
      categorias[key],
      key === 'imoveisBens' ? totalDinheiroMaisBens : totalDinheiro,
    ),
  });

  // Distribuição por tipo de investimento com dados reais
  const distribuicao = {
    reservaEmergencia: distribuicaoEntry('reservaEmergencia'),
    reservaOportunidade: distribuicaoEntry('reservaOportunidade'),
    rendaFixaFundos: distribuicaoEntry('rendaFixaFundos'),
    fimFia: distribuicaoEntry('fimFia'),
    fiis: distribuicaoEntry('fiis'),
    acoes: distribuicaoEntry('acoes'),
    stocks: distribuicaoEntry('stocks'),
    reits: distribuicaoEntry('reits'),
    etfs: distribuicaoEntry('etfs'),
    moedasCriptos: distribuicaoEntry('moedasCriptos'),
    previdenciaSeguros: distribuicaoEntry('previdenciaSeguros'),
    opcoes: distribuicaoEntry('opcoes'),
    imoveisBens: distribuicaoEntry('imoveisBens'),
  };

  const resumo: Record<string, unknown> = {
    saldoBruto: Math.round(saldoBruto * 100) / 100,
    valorAplicado: Math.round(valorAplicado * 100) / 100,
    rentabilidade: Math.round(rentabilidade * 100) / 100,
    metaPatrimonio: metaPatrimonio?.value || 0,
    caixaParaInvestir: caixaParaInvestir || 0,
    totais: {
      dinheiro: round2(totalDinheiro),
      dinheiroMaisBens: round2(totalDinheiroMaisBens),
    },
    historicoPatrimonio,
    historicoTWR,
    historicoMWR,
    distribuicao,
    portfolioDetalhes: {
      totalAcoes: portfolio.length,
      totalInvestimentos: investments.length,
      stocksTotalInvested: Math.round(stocksTotalInvested * 100) / 100,
      stocksCurrentValue: Math.round(stocksCurrentValue * 100) / 100,
      otherInvestmentsTotalInvested: Math.round(otherInvestmentsTotalInvested * 100) / 100,
      otherInvestmentsCurrentValue: Math.round(otherInvestmentsCurrentValue * 100) / 100,
    },
  };

  if (historicoTWRPeriodo.length > 0) {
    resumo.historicoTWRPeriodo = historicoTWRPeriodo;
  }
  if (historicoMWRPeriodo.length > 0) {
    resumo.historicoMWRPeriodo = historicoMWRPeriodo;
  }

  if (usePortfolioSnapshots) {
    const ttlMs = Number.parseInt(process.env.CARTEIRA_RESUMO_CACHE_MS ?? '60000', 10);
    resumoCache.set(resumoCacheKey, resumo, Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000);
  }

  return NextResponse.json(resumo);
});

// POST para atualizar meta de patrimônio ou caixa para investir consolidado
export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const { targetUserId } = auth;

  const { metaPatrimonio, caixaParaInvestir } = await request.json();

  // Atualizar caixa para investir consolidado
  if (caixaParaInvestir !== undefined) {
    if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
      return NextResponse.json(
        {
          error: 'Caixa para investir deve ser um valor igual ou maior que zero',
        },
        { status: 400 },
      );
    }

    const existingCaixa = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_consolidado',
      },
    });

    if (existingCaixa) {
      await prisma.dashboardData.update({
        where: { id: existingCaixa.id },
        data: { value: caixaParaInvestir },
      });
    } else {
      await prisma.dashboardData.create({
        data: {
          userId: targetUserId,
          metric: 'caixa_para_investir_consolidado',
          value: caixaParaInvestir,
        },
      });
    }

    deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

    await recordChange({
      request,
      auth,
      section: 'carteira',
      action: 'resumo.atualizar',
      entity: 'resumo',
      entityId: 'caixa_para_investir_consolidado',
      changes: diffFields(
        { caixaParaInvestir: existingCaixa?.value ?? null },
        { caixaParaInvestir },
        RESUMO_FIELD_LABELS,
      ),
      snapshot: buildDashboardMetricSnapshot(
        'caixa_para_investir_consolidado',
        existingCaixa?.value,
      ),
    });

    return NextResponse.json({
      success: true,
      message: 'Caixa para investir atualizado com sucesso',
      caixaParaInvestir,
    });
  }

  // Atualizar meta de patrimônio (código existente)
  if (metaPatrimonio !== undefined) {
    if (typeof metaPatrimonio !== 'number' || metaPatrimonio <= 0) {
      return NextResponse.json(
        {
          error: 'Meta de patrimônio deve ser um valor positivo',
        },
        { status: 400 },
      );
    }

    const existingMeta = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'meta_patrimonio',
      },
    });

    if (existingMeta) {
      await prisma.dashboardData.update({
        where: { id: existingMeta.id },
        data: { value: metaPatrimonio },
      });
    } else {
      await prisma.dashboardData.create({
        data: {
          userId: targetUserId,
          metric: 'meta_patrimonio',
          value: metaPatrimonio,
        },
      });
    }

    deleteTtlCacheKeyPrefix('carteiraResumo', `${targetUserId}:`);

    await recordChange({
      request,
      auth,
      section: 'carteira',
      action: 'resumo.atualizar',
      entity: 'resumo',
      entityId: 'meta_patrimonio',
      changes: diffFields(
        { metaPatrimonio: existingMeta?.value ?? null },
        { metaPatrimonio },
        RESUMO_FIELD_LABELS,
      ),
      snapshot: buildDashboardMetricSnapshot('meta_patrimonio', existingMeta?.value),
    });

    return NextResponse.json({ success: true, metaPatrimonio });
  }

  return NextResponse.json(
    {
      error: 'Informe metaPatrimonio ou caixaParaInvestir',
    },
    { status: 400 },
  );
});
