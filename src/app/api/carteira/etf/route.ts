import { NextRequest, NextResponse } from 'next/server';
import {
  listarPlanejados,
  linhaPlanejadaBase,
  TIPOS_ATIVO_PLANEJAVEIS,
} from '@/services/portfolio/ativosPlanejados';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { handleCaixaAbaPost } from '@/app/api/carteira/_lib/caixaParaInvestirPost';
import { round2, distributeRoundedPercents } from '@/utils/alocacaoPercents';
import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getIndicator } from '@/services/market/marketIndicatorService';
import {
  valuatePortfolioItem,
  CATEGORIA_ASSET_TYPE_FILTERS,
} from '@/services/portfolio/itemValuation';
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
  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId: user.id,
      asset: {
        type: { in: [...CATEGORIA_ASSET_TYPE_FILTERS.etfs] },
      },
    },
    include: {
      asset: true,
    },
  });

  // Cotações live + dólar: a aba exibia valorAtualizado = totalInvested
  // (congelado no valor de compra) enquanto o resumo usava cotação — o mesmo
  // ETF valia números diferentes por tela.
  // Ativos PLANEJADOS (sem posição) da aba — linha zerada com objetivo (16/09/2026).
  const planejados = await listarPlanejados(
    targetUserId,
    TIPOS_ATIVO_PLANEJAVEIS.etf,
    portfolio.map((p) => p.assetId),
  );
  const symbols = [
    ...portfolio.map((item) => item.asset?.symbol),
    ...planejados.map((r) => r.asset.symbol),
  ].filter((s): s is string => Boolean(s));
  const [quotes, dolarIndicator] = await Promise.all([
    getAssetPrices(symbols, { useBrapiFallback: true }),
    getIndicator('USD-BRL', { useBrapiFallback: true }).catch(() => null),
  ]);
  const cotacaoDolar = dolarIndicator?.price ?? null;

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
      return {
        id: item.id,
        ticker: item.asset!.symbol,
        nome: item.asset!.name,
        regiao,
        indiceRastreado: 'outros' as const,
        categoria: '',
        quantidade: item.quantity,
        precoAquisicao: item.avgPrice,
        valorTotal: item.totalInvested,
        cotacaoAtual,
        valorAtualizado,
        riscoPorAtivo: 0, // Calcular depois
        percentualCarteira: 0, // Calcular depois
        objetivo: item.objetivo ?? 0,
        quantoFalta: 0, // Calcular depois
        necessidadeAporte: 0, // Calcular depois
        proventos: 0, // preenchido por aplicarProventosNosAtivos
        rentabilidade:
          item.totalInvested > 0
            ? round2(((valorAtualizado - item.totalInvested) / item.totalInvested) * 100)
            : 0,
        observacoes: undefined,
        dataUltimaAtualizacao: item.lastUpdate,
      };
    });

  // Posições + planejados (linha zerada, `planejado: true`).
  const etfAtivos: Array<
    Omit<(typeof etfPosicoes)[number], 'observacoes'> & {
      planejado?: boolean;
      observacoes?: string;
    }
  > = [...etfPosicoes];
  for (const r of planejados) {
    etfAtivos.push({
      ...linhaPlanejadaBase(r, quotes.get(r.asset.symbol) ?? 0),
      regiao: (r.secao === 'estados_unidos' || r.secao === 'brasil'
        ? r.secao
        : r.asset.currency === 'USD'
          ? 'estados_unidos'
          : 'brasil') as 'brasil' | 'estados_unidos',
      indiceRastreado: 'outros',
      categoria: '',
    });
  }

  // Calcular totais gerais
  const totalQuantidade = etfAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  // Auditoria 25/08/2026 (B1): proventos recebidos entram na rentabilidade da linha.
  const proventosPorSymbol = await proventosRecebidosPorSymbol(targetUserId);
  aplicarProventosNosAtivos(etfAtivos, proventosPorSymbol);
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
