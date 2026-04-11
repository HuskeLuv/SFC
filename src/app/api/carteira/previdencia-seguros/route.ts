import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import type {
  PrevidenciaSegurosAtivo,
  PrevidenciaSegurosData,
  PrevidenciaSegurosSecao,
} from '@/types/previdencia-seguros';

import { withErrorHandler } from '@/utils/apiErrorHandler';

function getAtivoColor(label: string): string {
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
  const seed = label.length > 0 ? label.charCodeAt(0) : 0;
  return colors[seed % colors.length];
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar caixa para investir específico de Previdência/Seguros
  const caixaParaInvestirData = await prisma.dashboardData.findFirst({
    where: {
      userId: targetUserId,
      metric: 'caixa_para_investir_previdencia_seguros',
    },
  });
  const caixaParaInvestir = caixaParaInvestirData?.value || 0;

  // Buscar portfolio do usuário com ativos de previdência
  const portfolio = await prisma.portfolio.findMany({
    where: {
      userId: targetUserId,
      asset: {
        type: 'previdencia',
      },
    },
    include: {
      asset: true,
    },
  });

  // Previdência: valores atualizados apenas via edição manual.
  // valorAtualizado = avgPrice * quantity (avgPrice atualiza quando o usuário edita).
  const ativos: PrevidenciaSegurosAtivo[] = portfolio
    .filter((item) => item.asset)
    .map((item) => {
      const valorAtualizado =
        item.avgPrice > 0 && item.quantity > 0 ? item.avgPrice * item.quantity : item.totalInvested;
      const cotacaoAtual = item.quantity > 0 ? valorAtualizado / item.quantity : item.avgPrice || 0;
      const rentabilidade =
        item.totalInvested > 0
          ? ((valorAtualizado - item.totalInvested) / item.totalInvested) * 100
          : 0;

      return {
        id: item.id,
        ticker: item.asset!.symbol,
        nome: item.asset!.name,
        quantidade: item.quantity,
        precoAquisicao: item.avgPrice,
        valorTotal: item.totalInvested,
        cotacaoAtual,
        valorAtualizado,
        riscoPorAtivo: 0, // calculado no cliente com dados da carteira
        percentualCarteira: 0, // calculado no cliente
        objetivo: item.objetivo ?? 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade,
        observacoes: undefined,
        dataUltimaAtualizacao: item.lastUpdate,
        // Campos específicos de previdência — ainda não persistidos, defaults neutros
        carencia: 0,
        cotacaoResgate: 0,
        liquidacaoResgate: 0,
        modalidade: 'outro',
        subclasse: 'outro',
      };
    });

  // Totais gerais
  const totalQuantidade = ativos.reduce((sum, a) => sum + a.quantidade, 0);
  const totalValorAplicado = ativos.reduce((sum, a) => sum + a.valorTotal, 0);
  const totalValorAtualizado = ativos.reduce((sum, a) => sum + a.valorAtualizado, 0);
  const totalObjetivo = ativos.reduce((sum, a) => sum + a.objetivo, 0);
  const totalQuantoFalta = ativos.reduce((sum, a) => sum + a.quantoFalta, 0);
  const totalNecessidadeAporte = ativos.reduce((sum, a) => sum + a.necessidadeAporte, 0);
  const totalRisco = ativos.reduce((sum, a) => sum + a.riscoPorAtivo, 0);
  const rentabilidadeMedia =
    ativos.length > 0 ? ativos.reduce((sum, a) => sum + a.rentabilidade, 0) / ativos.length : 0;

  // Agrupar por tipo: seguros (modalidade='vida') e fundos de previdência (demais)
  const secoes: PrevidenciaSegurosSecao[] = (['seguro', 'growth_fundos_prev'] as const).map(
    (tipo) => {
      const filtro =
        tipo === 'seguro'
          ? (a: PrevidenciaSegurosAtivo) => a.modalidade === 'vida'
          : (a: PrevidenciaSegurosAtivo) => a.modalidade !== 'vida';
      const ativosDaSecao = ativos.filter(filtro);
      return {
        tipo,
        nome: tipo === 'seguro' ? 'Seguros' : 'Previdência',
        ativos: ativosDaSecao,
        totalQuantidade: ativosDaSecao.reduce((sum, a) => sum + a.quantidade, 0),
        totalValorAplicado: ativosDaSecao.reduce((sum, a) => sum + a.valorTotal, 0),
        totalValorAtualizado: ativosDaSecao.reduce((sum, a) => sum + a.valorAtualizado, 0),
        totalPercentualCarteira: ativosDaSecao.reduce((sum, a) => sum + a.percentualCarteira, 0),
        totalRisco: ativosDaSecao.reduce((sum, a) => sum + a.riscoPorAtivo, 0),
        totalObjetivo: ativosDaSecao.reduce((sum, a) => sum + a.objetivo, 0),
        totalQuantoFalta: ativosDaSecao.reduce((sum, a) => sum + a.quantoFalta, 0),
        totalNecessidadeAporte: ativosDaSecao.reduce((sum, a) => sum + a.necessidadeAporte, 0),
        rentabilidadeMedia:
          ativosDaSecao.length > 0
            ? ativosDaSecao.reduce((sum, a) => sum + a.rentabilidade, 0) / ativosDaSecao.length
            : 0,
      };
    },
  );

  const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
  const resumo = {
    necessidadeAporteTotal: totalNecessidadeAporte,
    caixaParaInvestir,
    saldoInicioMes: totalValorAplicado,
    valorAtualizado: valorAtualizadoComCaixa,
    rendimento: valorAtualizadoComCaixa - totalValorAplicado,
    rentabilidade:
      totalValorAplicado > 0
        ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100
        : 0,
  };

  const totalValor = ativos.reduce((sum, a) => sum + a.valorAtualizado, 0);
  const alocacaoAtivo = ativos.map((ativo) => ({
    nome: ativo.nome,
    ticker: ativo.ticker,
    valor: ativo.valorAtualizado,
    percentual: totalValor > 0 ? (ativo.valorAtualizado / totalValor) * 100 : 0,
    cor: getAtivoColor(ativo.ticker || ativo.nome),
  }));

  const tabelaAuxiliar = ativos.map((ativo) => {
    const percentualCarteira =
      valorAtualizadoComCaixa > 0 ? (ativo.valorAtualizado / valorAtualizadoComCaixa) * 100 : 0;
    const quantoFalta = (ativo.objetivo ?? 0) - percentualCarteira;
    const necessidadeAporte =
      valorAtualizadoComCaixa > 0 && quantoFalta > 0
        ? (quantoFalta / 100) * valorAtualizadoComCaixa
        : 0;
    const loteAproximado =
      ativo.cotacaoAtual > 0 ? Math.ceil(necessidadeAporte / ativo.cotacaoAtual) : 0;
    return {
      nome: ativo.nome,
      ticker: ativo.ticker,
      cotacaoAtual: ativo.cotacaoAtual,
      necessidadeAporte,
      loteAproximado,
    };
  });

  const data: PrevidenciaSegurosData = {
    resumo,
    secoes,
    totalGeral: {
      quantidade: totalQuantidade,
      valorAplicado: totalValorAplicado,
      valorAtualizado: valorAtualizadoComCaixa,
      risco: totalRisco,
      objetivo: totalObjetivo,
      quantoFalta: totalQuantoFalta,
      necessidadeAporte: totalNecessidadeAporte,
      rentabilidade: rentabilidadeMedia,
    },
    alocacaoAtivo,
    tabelaAuxiliar,
  };

  return NextResponse.json(data);
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const body = await request.json();
  const { ativoId, objetivo: _objetivo, cotacao: _cotacao, caixaParaInvestir } = body;

  if (caixaParaInvestir !== undefined) {
    if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
      return NextResponse.json(
        {
          error: 'Caixa para investir deve ser um valor igual ou maior que zero',
        },
        { status: 400 },
      );
    }

    // Salvar ou atualizar caixa para investir de Previdência/Seguros
    const existingCaixa = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_previdencia_seguros',
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
          metric: 'caixa_para_investir_previdencia_seguros',
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

  // Simular delay de rede
  await new Promise((resolve) => setTimeout(resolve, 500));

  return NextResponse.json({
    success: true,
    message: 'Dados atualizados com sucesso',
  });
});
