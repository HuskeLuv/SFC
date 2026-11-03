import { NextRequest, NextResponse } from 'next/server';
import { listarPlanejados, linhaPlanejadaBase } from '@/services/portfolio/ativosPlanejados';
import { filtrarDaCategoria, wherePortfolioDaCategoria } from '@/services/portfolio/categoriaAba';
import { aplicarCamposMovido, camposMovidoPorLinha } from '@/app/api/carteira/_lib/linhaMovida';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { handleCaixaAbaPost } from '@/app/api/carteira/_lib/caixaParaInvestirPost';
import { round2, distributeRoundedPercents } from '@/utils/alocacaoPercents';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getCotacaoDolarHoje } from '@/services/market/cambioUsdBrl';
import { valuatePortfolioItem } from '@/services/portfolio/itemValuation';
import { isAtivoEmDolar, posicaoEmDolar } from '@/lib/ativoEmDolar';
import { valoresLinhaEua } from '@/app/api/carteira/_lib/linhaEua';
import { rentabilidadeAgregada } from '@/utils/rentabilidadeAgregada';
import {
  aplicarProventosNosAtivos,
  proventosRecebidosPorSymbol,
} from '@/services/portfolio/proventosPorSymbol';
// Função auxiliar para cores
function getAtivoColor(ticker: string): string {
  const colors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#8B5CF6',
    '#EF4444',
    '#06B6D4',
    '#84CC16',
    '#F97316',
  ];
  const index = ticker.charCodeAt(0) % colors.length;
  return colors[index];
}

/** Ticker de exibição do symbol manual ('VOO-1730000000000-ab3cd11' → 'VOO'). */
const extrairTicker = (symbol: string): string => {
  const parte = symbol.split('-')[0];
  return parte && /^[A-Za-z]/.test(parte) ? parte : symbol;
};

/**
 * Campos da linha de ETF americano em US$ (nov/2026). A moeda é da LINHA (posicaoEmDolar),
 * nunca da região: IVVB11 na seção EUA continua em R$ e sem nenhum destes campos.
 */
type CamposLinhaUsd = {
  symbol: string;
  moedaRegistro: 'USD';
  precoAquisicaoUSD: number;
  valorTotalUSD: number;
  cotacaoAtualUSD: number;
  valorAtualizadoUSD: number;
  proventosUSD: number;
  semCambio: boolean;
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar caixa para investir específico de ETF
  const caixaParaInvestirData = await prisma.dashboardData.findFirst({
    where: {
      userId: targetUserId,
      metric: 'caixa_para_investir_etf',
    },
  });
  const caixaParaInvestir = caixaParaInvestirData?.value || 0;

  // Buscar portfolio do usuário com ativos do tipo correspondente
  // Mover na Carteira (out/2026): + itens movidos para ETF's, − os ETFs
  // movidos daqui para outra aba. Base = CATEGORIA_ASSET_TYPE_FILTERS.etfs.
  const portfolio = filtrarDaCategoria(
    await prisma.portfolio.findMany({
      where: wherePortfolioDaCategoria(user.id, 'etfs'),
      include: {
        asset: true,
      },
    }),
    'etfs',
  );

  // Cotações live + dólar: a aba exibia valorAtualizado = totalInvested
  // (congelado no valor de compra) enquanto o resumo usava cotação — o mesmo
  // ETF valia números diferentes por tela.
  // Ativos PLANEJADOS (sem posição) da aba — linha zerada com objetivo (16/09/2026).
  const planejados = await listarPlanejados(
    targetUserId,
    { categoria: 'etfs' },
    portfolio.map((p) => p.assetId),
  );
  const symbols = [
    ...portfolio.map((item) => item.asset?.symbol),
    ...planejados.map((r) => r.asset.symbol),
  ].filter((s): s is string => Boolean(s));
  // Câmbio do dia = o mesmo do resumo e das abas Stocks/REIT's (getCotacaoDolarHoje).
  const [quotes, cotacaoHoje] = await Promise.all([
    getAssetPrices(symbols, { useBrapiFallback: true }),
    getCotacaoDolarHoje().catch(() => null),
  ]);
  const cotacaoDolar = cotacaoHoje?.taxa ?? null;

  // Converter portfolio para formato esperado
  const etfPosicoes = portfolio
    .filter((item) => item.asset) // Filtrar apenas itens com asset
    .map((item) => {
      const regiao = (item.regiaoEtf ??
        (item.asset!.currency === 'USD' ? 'estados_unidos' : 'brasil')) as
        | 'brasil'
        | 'estados_unidos';
      const valuation = valuatePortfolioItem({
        item,
        asset: item.asset,
        quote: quotes.get(item.asset!.symbol),
        cotacaoDolar,
      });
      const valorAtualizado = valuation.valorAtualBRL;
      const cotacaoAtual = item.quantity > 0 ? valorAtualizado / item.quantity : item.avgPrice;
      // ETF americano (posição gravada em US$): TODOS os campos base em R$ (valuation: q ×
      // cotação US$ × câmbio do dia; aplicado = totalInvestedBrl) e os US$ só nos *USD.
      // Sem câmbio a linha fica zerada em R$ (fora das somas) e marcada semCambio.
      const emDolar = posicaoEmDolar(item, item.asset);
      const usd: CamposLinhaUsd | null = emDolar
        ? (() => {
            const eua = valoresLinhaEua({
              item,
              asset: item.asset,
              quote: quotes.get(item.asset!.symbol),
              cotacaoDolar,
            });
            return {
              symbol: item.asset!.symbol,
              moedaRegistro: 'USD' as const,
              precoAquisicaoUSD: eua.precoAquisicao,
              valorTotalUSD: eua.valorTotal,
              cotacaoAtualUSD: eua.cotacaoAtual,
              valorAtualizadoUSD: eua.valorAtualizado,
              proventosUSD: 0, // preenchido depois dos proventos
              semCambio: valuation.semCambio === true,
            };
          })()
        : null;
      const valorAplicado = emDolar ? valuation.valorAplicadoBRL : item.totalInvested;
      const precoAquisicao = emDolar
        ? item.quantity > 0
          ? valorAplicado / item.quantity
          : 0
        : item.avgPrice;
      return {
        id: item.id,
        // Linha USD: ticker = symbol cru até os proventos serem aplicados (chave da busca);
        // vira o ticker de exibição (extrairTicker) depois.
        ticker: item.asset!.symbol,
        nome: item.asset!.name,
        regiao,
        indiceRastreado: 'outros' as const,
        categoria: '',
        quantidade: item.quantity,
        precoAquisicao,
        valorTotal: valorAplicado,
        cotacaoAtual: emDolar && item.quantity <= 0 ? 0 : cotacaoAtual,
        valorAtualizado,
        riscoPorAtivo: 0, // Calcular depois
        percentualCarteira: 0, // Calcular depois
        objetivo: item.objetivo ?? 0,
        quantoFalta: 0, // Calcular depois
        necessidadeAporte: 0, // Calcular depois
        proventos: 0, // preenchido por aplicarProventosNosAtivos
        rentabilidade:
          valorAplicado > 0 ? round2(((valorAtualizado - valorAplicado) / valorAplicado) * 100) : 0,
        observacoes: undefined,
        dataUltimaAtualizacao: item.lastUpdate,
        // Só na linha USD (a linha BRL sai idêntica à de antes, sem estes campos).
        ...(usd ?? {}),
      };
    });

  // Posições + planejados (linha zerada, `planejado: true`).
  const etfAtivos: Array<
    Omit<(typeof etfPosicoes)[number], 'observacoes' | keyof CamposLinhaUsd> &
      Partial<CamposLinhaUsd> & {
        planejado?: boolean;
        observacoes?: string;
      }
  > = [...etfPosicoes];
  for (const r of planejados) {
    // Planejado de ETF americano (manual, sem cotação): linha zerada com o selo US$.
    const usdPlanejado = isAtivoEmDolar(r.asset);
    etfAtivos.push({
      ...linhaPlanejadaBase(r, quotes.get(r.asset.symbol) ?? 0),
      regiao: (r.secao === 'estados_unidos' || r.secao === 'brasil'
        ? r.secao
        : r.asset.currency === 'USD'
          ? 'estados_unidos'
          : 'brasil') as 'brasil' | 'estados_unidos',
      indiceRastreado: 'outros',
      categoria: '',
      ...(usdPlanejado
        ? {
            symbol: r.asset.symbol,
            moedaRegistro: 'USD' as const,
            precoAquisicaoUSD: 0,
            valorTotalUSD: 0,
            cotacaoAtualUSD: quotes.get(r.asset.symbol) ?? 0,
            valorAtualizadoUSD: 0,
            proventosUSD: 0,
            semCambio: false,
          }
        : {}),
    });
  }
  const temLinhaUsd = etfAtivos.some((a) => a.moedaRegistro === 'USD');

  aplicarCamposMovido(
    etfAtivos,
    await camposMovidoPorLinha(targetUserId, 'etfs', [...portfolio, ...planejados]),
  );

  // Calcular totais gerais
  const totalQuantidade = etfAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  // Auditoria 25/08/2026 (B1): proventos recebidos entram na rentabilidade da linha.
  // Pela chave Asset.symbol CRU (o ETF manual é 'VOO-<ts>-<rnd>'), ANTES de o ticker virar o
  // de exibição — senão os proventos somem em silêncio.
  const proventosPorSymbol = await proventosRecebidosPorSymbol(targetUserId);
  aplicarProventosNosAtivos(etfAtivos, proventosPorSymbol, (a) => a.symbol ?? a.ticker);
  // Linha USD: provento nativo em US$ → R$ pelo câmbio do dia; rentabilidade em R$ refeita com
  // ele. Sem câmbio: fora das somas (0 em R$). Por último, o ticker de exibição.
  for (const a of etfAtivos) {
    if (a.moedaRegistro !== 'USD') continue;
    const proventosUSD = a.proventos ?? 0;
    a.proventosUSD = proventosUSD;
    a.proventos = a.semCambio || cotacaoDolar == null ? 0 : proventosUSD * cotacaoDolar;
    a.rentabilidade =
      a.valorTotal > 0
        ? ((a.valorAtualizado + a.proventos - a.valorTotal) / a.valorTotal) * 100
        : 0;
    a.ticker = extrairTicker(a.symbol ?? a.ticker);
  }
  const totalProventos = etfAtivos.reduce((sum, ativo) => sum + (ativo.proventos ?? 0), 0);
  const totalValorAplicado = etfAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = etfAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);

  // Bug #14 residual: percentualCarteira no backend (paridade com FII).
  if (totalValorAtualizado > 0) {
    etfAtivos.forEach((ativo) => {
      const pct = (ativo.valorAtualizado / totalValorAtualizado) * 100;
      ativo.percentualCarteira = round2(pct);
      ativo.riscoPorAtivo = ativo.percentualCarteira;
    });
    const adjusted = distributeRoundedPercents(
      etfAtivos.map((a) => ({ percentual: a.percentualCarteira })),
    );
    adjusted.forEach((adj, i) => {
      etfAtivos[i].percentualCarteira = adj.percentual;
      etfAtivos[i].riscoPorAtivo = adj.percentual;
    });
    etfAtivos.forEach((ativo) => {
      ativo.quantoFalta = round2(ativo.objetivo - ativo.percentualCarteira);
      ativo.necessidadeAporte =
        ativo.quantoFalta > 0 ? round2((ativo.quantoFalta / 100) * totalValorAtualizado) : 0;
    });
  }

  const totalObjetivo = etfAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = etfAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = etfAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = etfAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia = rentabilidadeAgregada(
    etfAtivos,
    (a) => a.valorTotal,
    (a) => a.valorAtualizado + (a.proventos ?? 0),
  );

  // Agrupar por região (Brasil e EUA)
  const ETF_SECTION_ORDER = ['brasil', 'estados_unidos'] as const;
  const ETF_SECTION_NAMES: Record<(typeof ETF_SECTION_ORDER)[number], string> = {
    brasil: 'Brasil',
    estados_unidos: 'EUA',
  };
  const secoes = ETF_SECTION_ORDER.map((regiao) => ({
    regiao,
    nome: ETF_SECTION_NAMES[regiao],
    ativos: etfAtivos.filter((a) => a.regiao === regiao),
    totalQuantidade: 0,
    totalValorAplicado: 0,
    totalValorAtualizado: 0,
    totalPercentualCarteira: 0,
    totalRisco: 0,
    totalObjetivo: 0,
    totalQuantoFalta: 0,
    totalNecessidadeAporte: 0,
    rentabilidadeMedia: 0,
    totalProventos: 0,
  }));

  // Calcular valores das seções
  secoes.forEach((secao) => {
    secao.totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    secao.totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    secao.totalProventos = secao.ativos.reduce((sum, ativo) => sum + (ativo.proventos ?? 0), 0);
    secao.totalValorAtualizado = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.valorAtualizado,
      0,
    );
    secao.totalPercentualCarteira = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.percentualCarteira,
      0,
    );
    secao.totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    secao.totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    secao.totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    secao.totalNecessidadeAporte = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.necessidadeAporte,
      0,
    );
    secao.rentabilidadeMedia = rentabilidadeAgregada(
      secao.ativos,
      (a) => a.valorTotal,
      (a) => a.valorAtualizado + (a.proventos ?? 0),
    );
  });

  // Calcular resumo
  const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: caixaParaInvestir,
    saldoInicioMes: totalValorAplicado,
    valorAtualizado: valorAtualizadoComCaixa,
    rendimento: totalValorAtualizado + totalProventos - totalValorAplicado,
    rentabilidade:
      totalValorAplicado > 0
        ? ((totalValorAtualizado + totalProventos - totalValorAplicado) / totalValorAplicado) * 100
        : 0,
  };

  // Calcular alocação por ativo
  const alocacaoAtivo = etfAtivos
    .filter((a) => !a.planejado)
    .map((ativo) => ({
      name: ativo.ticker,
      value: ativo.valorAtualizado,
      color: getAtivoColor(ativo.ticker),
    }));

  // Tabela auxiliar (dados adicionais)
  const tabelaAuxiliar = etfAtivos
    .filter((a) => !a.planejado)
    .map((ativo) => ({
      ticker: ativo.ticker,
      nome: ativo.nome,
      quantidade: ativo.quantidade,
      valorAplicado: ativo.valorTotal,
      valorAtualizado: ativo.valorAtualizado,
      rentabilidade: ativo.rentabilidade,
      cotacaoAtual: ativo.cotacaoAtual ?? 0,
      necessidadeAporte: ativo.necessidadeAporte ?? 0,
      loteAproximado: 0,
    }));

  const data = {
    // Câmbio da aba (faixa "US$ 1 = R$ x") só quando há linha USD: carteira só com ETF da B3
    // (inclusive IVVB11 na seção EUA) recebe a mesma resposta de antes.
    ...(temLinhaUsd
      ? {
          cotacaoDolar,
          taxaData: cotacaoHoje?.data.toISOString().slice(0, 10) ?? null,
          posicoesSemCambio: etfAtivos.filter((a) => a.semCambio).length,
        }
      : {}),
    resumo,
    secoes,
    totalGeral: {
      quantidade: totalQuantidade,
      valorAplicado: totalValorAplicado,
      valorAtualizado: valorAtualizadoComCaixa, // Incluir caixa no total
      percentualCarteira: 100.0,
      risco: totalRisco,
      objetivo: totalObjetivo,
      quantoFalta: totalQuantoFalta,
      necessidadeAporte: totalNecessidadeAporte,
      rentabilidade: rentabilidadeMedia,
      proventos: totalProventos,
    },
    alocacaoAtivo,
    tabelaAuxiliar,
  };

  return NextResponse.json(data);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await requireAuthWithActing(request);
  const body = await request.json();
  const { ativoId, objetivo: _objetivo, cotacao: _cotacao, caixaParaInvestir } = body;

  if (caixaParaInvestir !== undefined) {
    return handleCaixaAbaPost(request, auth, 'etf', body);
  }

  if (!ativoId) {
    return NextResponse.json({ error: 'Parâmetro obrigatório: ativoId' }, { status: 400 });
  }

  // Simular delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    success: true,
    message: 'Dados atualizados com sucesso',
  });
});
