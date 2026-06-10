import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { AcaoData, AcaoAtivo, AcaoSecao, SetorAcao } from '@/types/acoes';
import { getAssetPrices } from '@/services/pricing/assetPriceService';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { round2, distributeRoundedPercents } from '@/utils/alocacaoPercents';
// Função helper para validar e converter setor para SetorAcao
function parseSetorAcao(setor: string | null | undefined): SetorAcao {
  const setoresValidos: SetorAcao[] = [
    'financeiro',
    'energia',
    'consumo',
    'saude',
    'tecnologia',
    'industria',
    'materiais',
    'utilidades',
    'outros',
  ];
  if (setor && setoresValidos.includes(setor as SetorAcao)) {
    return setor as SetorAcao;
  }
  return 'outros';
}

async function calculateAcoesData(userId: string): Promise<AcaoData> {
  // Buscar caixa para investir específico de ações
  const caixaParaInvestirData = await prisma.dashboardData.findFirst({
    where: {
      userId,
      metric: 'caixa_para_investir_acoes',
    },
  });
  const caixaParaInvestir = caixaParaInvestirData?.value || 0;

  // Pós-consolidação Stock → Asset: ações brasileiras (type='stock' com ticker
  // no padrão B3) e BDRs (type='bdr'|'brd') vivem ambos na tabela Asset.
  // FIIs (type='fii') aparecem na aba FIIs e ficam fora dessa busca.
  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId,
      asset: { type: { in: ['stock', 'bdr', 'brd'] } },
    },
    include: { asset: true },
  });

  // Aceita dígito no meio (ex.: B3SA3, o ticker da própria B3); exclui units
  // (AAAA11), fracionários (AAAA3F) e BDRs (6+ chars).
  const isB3StockTicker = (ticker: string) => /^[A-Z][A-Z0-9]{3}[0-9]$/.test(ticker.toUpperCase());
  const acoesStockPortfolio = portfolio.filter(
    (item) => item.asset?.type === 'stock' && isB3StockTicker(item.asset.symbol),
  );
  const bdrPortfolio = portfolio.filter(
    (item) => item.asset && (item.asset.type === 'bdr' || item.asset.type === 'brd'),
  );

  // Buscar cotações atuais (banco primeiro, fallback BRAPI quando necessário)
  const stockSymbols = acoesStockPortfolio.map((item) => item.asset!.symbol);
  const bdrSymbols = bdrPortfolio.map((item) => item.asset!.symbol);
  const quotes = await getAssetPrices([...stockSymbols, ...bdrSymbols], {
    useBrapiFallback: true,
  });

  const mapStockPortfolioItem = (item: (typeof acoesStockPortfolio)[number]): AcaoAtivo => {
    const valorTotal = item.totalInvested;
    const ticker = item.asset!.symbol;

    let cotacaoAtual = quotes.get(ticker);
    if (!cotacaoAtual) {
      logger.warn(
        `⚠️  Não foi possível obter cotação de ${ticker}, usando preço médio como fallback`,
      );
      cotacaoAtual = item.avgPrice;
    }

    const valorAtualizado = item.quantity * cotacaoAtual;
    const rentabilidade =
      item.avgPrice > 0 ? ((cotacaoAtual - item.avgPrice) / item.avgPrice) * 100 : 0;

    const estrategia =
      item.estrategia && ['value', 'growth', 'risk'].includes(item.estrategia)
        ? (item.estrategia as 'value' | 'growth' | 'risk')
        : 'value';

    return {
      id: item.id,
      ticker,
      nome: item.asset!.name,
      // setor/subsetor não estão no Asset (eram do Stock). Mantidos vazios
      // até o cron BRAPI popular um campo análogo em Asset.
      setor: parseSetorAcao(''),
      subsetor: '',
      quantidade: item.quantity,
      precoAquisicao: item.avgPrice,
      valorTotal,
      cotacaoAtual,
      valorAtualizado,
      riscoPorAtivo: 0,
      percentualCarteira: 0,
      objetivo: item.objetivo ?? 0,
      quantoFalta: 0,
      necessidadeAporte: 0,
      rentabilidade,
      estrategia,
      observacoes: undefined,
      dataUltimaAtualizacao: item.lastUpdate,
    };
  };

  const mapBdrPortfolioItem = (item: (typeof bdrPortfolio)[number]): AcaoAtivo => {
    const valorTotal = item.totalInvested;
    const ticker = item.asset!.symbol;

    let cotacaoAtual = quotes.get(ticker);
    if (!cotacaoAtual) {
      cotacaoAtual = item.avgPrice;
    }

    const valorAtualizado = item.quantity * cotacaoAtual;
    const rentabilidade =
      item.avgPrice > 0 ? ((cotacaoAtual - item.avgPrice) / item.avgPrice) * 100 : 0;

    const estrategia =
      item.estrategia && ['value', 'growth', 'risk'].includes(item.estrategia)
        ? (item.estrategia as 'value' | 'growth' | 'risk')
        : 'value';

    return {
      id: item.id,
      ticker,
      nome: item.asset!.name,
      setor: 'outros',
      subsetor: '',
      quantidade: item.quantity,
      precoAquisicao: item.avgPrice,
      valorTotal,
      cotacaoAtual,
      valorAtualizado,
      riscoPorAtivo: 0,
      percentualCarteira: 0,
      objetivo: item.objetivo ?? 0,
      quantoFalta: 0,
      necessidadeAporte: 0,
      rentabilidade,
      estrategia,
      observacoes: undefined,
      dataUltimaAtualizacao: item.lastUpdate,
    };
  };

  const acoesAtivos: AcaoAtivo[] = [
    ...acoesStockPortfolio.map(mapStockPortfolioItem),
    ...bdrPortfolio.map(mapBdrPortfolioItem),
  ];

  // Calcular totais gerais
  const totalQuantidade = acoesAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = acoesAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = acoesAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);

  // Bug #14 residual: percentualCarteira/riscoPorAtivo/quantoFalta/necessidadeAporte
  // por ativo no backend (mesma cobertura do fix de FII em 1a8cfb0, que era padrão D
  // do postmortem v2). Largest-remainder garante Σ=100,00.
  if (totalValorAtualizado > 0) {
    acoesAtivos.forEach((ativo) => {
      const pct = (ativo.valorAtualizado / totalValorAtualizado) * 100;
      ativo.percentualCarteira = round2(pct);
      ativo.riscoPorAtivo = ativo.percentualCarteira;
    });
    const adjusted = distributeRoundedPercents(
      acoesAtivos.map((a) => ({ percentual: a.percentualCarteira })),
    );
    adjusted.forEach((adj, i) => {
      acoesAtivos[i].percentualCarteira = adj.percentual;
      acoesAtivos[i].riscoPorAtivo = adj.percentual;
    });
    acoesAtivos.forEach((ativo) => {
      ativo.quantoFalta = round2(ativo.objetivo - ativo.percentualCarteira);
      ativo.necessidadeAporte =
        ativo.quantoFalta > 0 ? round2((ativo.quantoFalta / 100) * totalValorAtualizado) : 0;
    });
  }

  const totalObjetivo = acoesAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = acoesAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = acoesAtivos.reduce(
    (sum, ativo) => sum + ativo.necessidadeAporte,
    0,
  );
  const totalRisco = acoesAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia =
    acoesAtivos.length > 0
      ? acoesAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / acoesAtivos.length
      : 0;

  // Agrupar por estratégia (value, growth, risk)
  const estrategias: ('value' | 'growth' | 'risk')[] = ['value', 'growth', 'risk'];
  const secoes: AcaoSecao[] = estrategias
    .map((estrategia) => {
      const ativosDaEstrategia = acoesAtivos.filter((ativo) => ativo.estrategia === estrategia);
      const nomesEstrategia = {
        value: 'Value',
        growth: 'Growth',
        risk: 'Risk',
      };

      return {
        estrategia,
        nome: nomesEstrategia[estrategia],
        ativos: ativosDaEstrategia,
        totalQuantidade: 0,
        totalValorAplicado: 0,
        totalValorAtualizado: 0,
        totalPercentualCarteira: 0,
        totalRisco: 0,
        totalObjetivo: 0,
        totalQuantoFalta: 0,
        totalNecessidadeAporte: 0,
        rentabilidadeMedia: 0,
      };
    })
    .filter((secao) => secao.ativos.length > 0); // Remover seções vazias

  // Calcular valores das seções
  secoes.forEach((secao) => {
    secao.totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    secao.totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
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
    secao.rentabilidadeMedia =
      secao.ativos.length > 0
        ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length
        : 0;
  });

  // Calcular resumo
  // Para simplificar, vamos considerar:
  // - Saldo início do mês = valor aplicado (investido)
  // - Valor atualizado = valor com cotação atual + caixa para investir
  // - Rendimento = diferença entre valor atualizado e aplicado
  // - Rentabilidade = percentual de ganho/perda
  const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: caixaParaInvestir,
    saldoInicioMes: totalValorAplicado, // Valor investido (base de cálculo)
    valorAtualizado: valorAtualizadoComCaixa, // Valor com cotação atual + caixa
    rendimento: valorAtualizadoComCaixa - totalValorAplicado, // Ganho ou perda em R$
    rentabilidade:
      totalValorAplicado > 0
        ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100
        : 0, // Percentual de ganho ou perda
  };

  return {
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
    },
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  const data = await calculateAcoesData(user.id);

  return NextResponse.json(data);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const body = await request.json();
  const { ativoId, objetivo, cotacao, caixaParaInvestir } = body;

  if (caixaParaInvestir !== undefined) {
    if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
      return NextResponse.json(
        {
          error: 'Caixa para investir deve ser um valor igual ou maior que zero',
        },
        { status: 400 },
      );
    }

    // Salvar ou atualizar caixa para investir de ações
    const existingCaixa = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_acoes',
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
          metric: 'caixa_para_investir_acoes',
          value: caixaParaInvestir,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Caixa para investir atualizado com sucesso',
      caixaParaInvestir,
    });
  }

  if (!ativoId) {
    return NextResponse.json({ error: 'Parâmetro obrigatório: ativoId' }, { status: 400 });
  }

  if (objetivo !== undefined) {
    if (objetivo < 0 || objetivo > 100) {
      return NextResponse.json({ error: 'Objetivo deve estar entre 0 e 100%' }, { status: 400 });
    }
    logger.info(`Atualizando objetivo da ação ${ativoId} para ${objetivo}%`);
  }

  if (cotacao !== undefined) {
    if (cotacao <= 0) {
      return NextResponse.json({ error: 'Cotação deve ser maior que zero' }, { status: 400 });
    }
    logger.info(`Atualizando cotação da ação ${ativoId} para R$ ${cotacao}`);
  }

  // Simular delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    success: true,
    message: 'Dados atualizados com sucesso',
  });
});
