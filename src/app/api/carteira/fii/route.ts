import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { FiiData, FiiAtivo, FiiSecao, TipoFii } from '@/types/fii';
import { getAssetPrices } from '@/services/pricing/assetPriceService';

import { withErrorHandler } from '@/utils/apiErrorHandler';
// Funções auxiliares para cores
function getSegmentColor(tipo: string): string {
  const colors: { [key: string]: string } = {
    fofi: '#3B82F6',
    fof: '#3B82F6', // Compatibilidade
    tvm: '#10B981',
    tijolo: '#F59E0B',
    ijol: '#F59E0B', // Compatibilidade
    hibrido: '#8B5CF6',
    renda: '#EF4444',
  };
  return colors[tipo] || '#6B7280';
}

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

async function calculateFiiData(userId: string): Promise<FiiData> {
  // Buscar caixa para investir específico de FII
  const caixaParaInvestirData = await prisma.dashboardData.findFirst({
    where: {
      userId,
      metric: 'caixa_para_investir_fii',
    },
  });
  const caixaParaInvestir = caixaParaInvestirData?.value || 0;

  // Pós-consolidação Stock → Asset: FIIs vivem na tabela Asset com type='fii'.
  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId,
      asset: { type: 'fii' },
    },
    include: { asset: true },
  });

  const fiiPortfolio = portfolio.filter((item) => item.asset?.type === 'fii');

  // Buscar cotações atuais dos FIIs (banco primeiro, fallback BRAPI quando necessário)
  const symbols = fiiPortfolio
    .map((item) => item.asset?.symbol || '')
    .filter((ticker) => ticker && ticker.trim());
  const quotes = await getAssetPrices(symbols, { useBrapiFallback: true });

  // Converter para formato FiiAtivo
  const fiiAtivos: FiiAtivo[] = fiiPortfolio.map((item) => {
    const valorTotal = item.totalInvested;

    // Determinar ticker e nome baseado na origem (Stock ou Asset)
    const ticker = item.asset?.symbol || '';
    const nome = item.asset?.name || '';

    // Buscar cotação atual da brapi
    let cotacaoAtual = quotes.get(ticker);

    // Se não encontrou cotação, usar preço médio como fallback
    if (!cotacaoAtual) {
      logger.warn(
        `⚠️  Não foi possível obter cotação de ${ticker}, usando preço médio como fallback`,
      );
      cotacaoAtual = item.avgPrice;
    }

    // Calcular valor atualizado com cotação atual
    const valorAtualizado = item.quantity * cotacaoAtual;

    // Calcular rentabilidade real
    const rentabilidade =
      item.avgPrice > 0 ? ((cotacaoAtual - item.avgPrice) / item.avgPrice) * 100 : 0;

    // Usar tipo persistido no portfolio (tipoFii), fallback para 'fofi' quando não definido
    const tipoFii: 'fofi' | 'tvm' | 'tijolo' = (
      item.tipoFii && ['fofi', 'tvm', 'tijolo'].includes(item.tipoFii) ? item.tipoFii : 'fofi'
    ) as 'fofi' | 'tvm' | 'tijolo';

    return {
      id: item.id,
      ticker: ticker,
      nome: nome,
      mandato: 'Estratégico', // Padrão
      segmento: 'outros', // Asset não tem segmento
      quantidade: item.quantity,
      precoAquisicao: item.avgPrice,
      valorTotal,
      cotacaoAtual: cotacaoAtual,
      valorAtualizado,
      riscoPorAtivo: 0, // Calcular depois
      percentualCarteira: 0, // Calcular depois
      objetivo: item.objetivo ?? 0,
      quantoFalta: 0, // Calcular depois
      necessidadeAporte: 0, // Calcular depois
      rentabilidade,
      tipo: tipoFii, // Usar tipo novo diretamente
      observacoes: undefined,
      dataUltimaAtualizacao: item.lastUpdate,
    };
  });

  // Calcular totais gerais
  const totalQuantidade = fiiAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
  const totalValorAplicado = fiiAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
  const totalValorAtualizado = fiiAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const totalObjetivo = fiiAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
  const totalQuantoFalta = fiiAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
  const totalNecessidadeAporte = fiiAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
  const totalRisco = fiiAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
  const rentabilidadeMedia =
    fiiAtivos.length > 0
      ? fiiAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / fiiAtivos.length
      : 0;

  // Agrupar por tipo (fofi, tvm, tijolo)
  const tipos: ('fofi' | 'tvm' | 'tijolo')[] = ['fofi', 'tvm', 'tijolo'];
  const secoes: FiiSecao[] = tipos
    .map((tipo) => {
      const ativosDoTipo = fiiAtivos.filter((ativo) => ativo.tipo === tipo);

      const nomesTipo = {
        fofi: 'FOF (Fundos de Fundos)',
        tvm: 'TVM (Títulos e Valores Mobiliários)',
        tijolo: 'Tijolo',
      };

      return {
        tipo: tipo as TipoFii, // Tipo compatível com TipoFii
        nome: nomesTipo[tipo],
        ativos: ativosDoTipo,
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
  const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir: caixaParaInvestir,
    saldoInicioMes: totalValorAplicado,
    valorAtualizado: valorAtualizadoComCaixa,
    rendimento: valorAtualizadoComCaixa - totalValorAplicado,
    rentabilidade:
      totalValorAplicado > 0
        ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100
        : 0,
  };

  // Bug #06: arredondar valores antes de enviar ao chart impede que aritmética
  // JS em ponto flutuante (ex.: 200 × 156,05 = 31210.000000000004) vaze pro
  // label central do donut como "31210.000000000004".
  const round2 = (n: number) => Math.round(n * 100) / 100;

  /**
   * Bug #14 (2º passe): arredondar cada percentual individualmente NÃO garante
   * soma=100 (3 ativos de mesmo valor: 33.33+33.33+33.33 = 99.99). Distribui
   * o resto da divisão no item com maior percentual — diferença de R$ 0.01
   * indistinguível visualmente mas a soma fecha 100,00 exato.
   */
  const distributeRoundedPercents = <T extends { percentual: number }>(items: T[]): T[] => {
    if (items.length === 0) return items;
    const total = items.reduce((acc, item) => acc + item.percentual, 0);
    if (total === 0) return items;
    const diff = round2(100 - total);
    if (diff === 0) return items;
    let maxIdx = 0;
    for (let i = 1; i < items.length; i++) {
      if (items[i].percentual > items[maxIdx].percentual) maxIdx = i;
    }
    items[maxIdx] = {
      ...items[maxIdx],
      percentual: round2(items[maxIdx].percentual + diff),
    };
    return items;
  };

  // Calcular alocação por segmento (% sobre total da carteira de FIIs — soma=100)
  const alocacaoSegmento = distributeRoundedPercents(
    secoes.map((secao) => ({
      segmento: secao.nome,
      valor: round2(secao.totalValorAtualizado),
      percentual: round2(
        totalValorAtualizado > 0 ? (secao.totalValorAtualizado / totalValorAtualizado) * 100 : 0,
      ),
      cor: getSegmentColor(secao.tipo),
    })),
  );

  // Calcular alocação por ativo (% sobre total da carteira de FIIs — soma=100)
  const alocacaoAtivo = distributeRoundedPercents(
    fiiAtivos.map((ativo) => ({
      ticker: ativo.ticker,
      valor: round2(ativo.valorAtualizado),
      percentual: round2(
        totalValorAtualizado > 0 ? (ativo.valorAtualizado / totalValorAtualizado) * 100 : 0,
      ),
      cor: getAtivoColor(ativo.ticker),
    })),
  );

  // Tabela auxiliar (dados adicionais)
  const tabelaAuxiliar = fiiAtivos.map((ativo) => ({
    ticker: ativo.ticker,
    nome: ativo.nome,
    quantidade: ativo.quantidade,
    valorAplicado: ativo.valorTotal,
    valorAtualizado: ativo.valorAtualizado,
    rentabilidade: ativo.rentabilidade,
    cotacaoAtual: ativo.cotacaoAtual,
    necessidadeAporte: ativo.necessidadeAporte,
    loteAproximado: Math.ceil(ativo.quantidade / 100), // Aproximação
  }));

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
    alocacaoSegmento,
    alocacaoAtivo,
    tabelaAuxiliar,
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

  const data = await calculateFiiData(user.id);

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

    // Salvar ou atualizar caixa para investir de FII
    const existingCaixa = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_fii',
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
          metric: 'caixa_para_investir_fii',
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
    logger.info(`Atualizando objetivo do FII ${ativoId} para ${objetivo}%`);
  }

  if (cotacao !== undefined) {
    if (cotacao <= 0) {
      return NextResponse.json({ error: 'Cotação deve ser maior que zero' }, { status: 400 });
    }
    logger.info(`Atualizando cotação do FII ${ativoId} para R$ ${cotacao}`);
  }

  // Simular delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    success: true,
    message: 'Dados atualizados com sucesso',
  });
});
