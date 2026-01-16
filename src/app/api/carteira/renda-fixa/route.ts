import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';

const parseNotes = (notes?: string | null) => {
  if (!notes) return null;
  try {
    return JSON.parse(notes);
  } catch {
    return null;
  }
};

const mapTipoRendaFixa = (tipoAtivo?: string) => {
  if (tipoAtivo === 'renda-fixa-posfixada') return 'pos-fixada';
  if (tipoAtivo === 'renda-fixa-prefixada') return 'prefixada';
  return 'hibrida';
};

export async function GET(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/carteira/renda-fixa',
      'GET',
    );

    const portfolio = await prisma.portfolio.findMany({
      where: {
        userId: targetUserId,
        asset: {
          type: { in: ['bond', 'cash'] },
        },
      },
      include: { asset: true },
    });

    const assetIds = portfolio.map(p => p.assetId).filter((id): id is string => id !== null);
    const transactions = assetIds.length > 0 ? await prisma.stockTransaction.findMany({
      where: {
        userId: targetUserId,
        assetId: { in: assetIds },
        type: { in: ['compra', 'venda'] },
      },
      orderBy: { date: 'desc' },
    }) : [];

    const latestCompraNotes = new Map<string, any>();
    const comprasMap = new Map<string, number>();
    const aportesMap = new Map<string, number>();
    const resgatesMap = new Map<string, number>();

    transactions.forEach(transaction => {
      if (!transaction.assetId) return;
      if (transaction.type === 'compra') {
        const notes = parseNotes(transaction.notes);
        const action = notes?.operation?.action || 'compra';
        if (action === 'aporte') {
          aportesMap.set(transaction.assetId, (aportesMap.get(transaction.assetId) || 0) + transaction.total);
        } else {
          comprasMap.set(transaction.assetId, (comprasMap.get(transaction.assetId) || 0) + transaction.total);
        }
        if (!latestCompraNotes.has(transaction.assetId)) {
          latestCompraNotes.set(transaction.assetId, notes);
        }
      } else if (transaction.type === 'venda') {
        resgatesMap.set(transaction.assetId, (resgatesMap.get(transaction.assetId) || 0) + transaction.total);
      }
    });

    const ativos = portfolio.map(item => {
      const assetId = item.assetId || '';
      const totalCompras = assetId ? (comprasMap.get(assetId) || 0) : 0;
      const totalAportes = assetId ? (aportesMap.get(assetId) || 0) : 0;
      const totalResgates = assetId ? (resgatesMap.get(assetId) || 0) : 0;
      const valorInicial = totalCompras > 0 ? totalCompras : item.totalInvested;
      const aporte = totalAportes;
      const resgate = totalResgates;
      const valorAtualizado = valorInicial + aporte - resgate;
      const notes = assetId ? latestCompraNotes.get(assetId) : null;
      const tipoAtivo = notes?.operation?.tipoAtivo;
      const tipo = mapTipoRendaFixa(tipoAtivo);

      return {
        id: item.id,
        nome: item.asset?.name || 'Renda Fixa',
        percentualRentabilidade: 0,
        cotizacaoResgate: notes?.cotizacaoResgate || 'D+0',
        liquidacaoResgate: notes?.liquidacaoResgate || 'Imediata',
        vencimento: notes?.vencimento ? new Date(notes.vencimento) : new Date(),
        benchmark: notes?.benchmark || 'CDI',
        valorInicialAplicado: valorInicial,
        aporte,
        resgate,
        valorAtualizado,
        percentualCarteira: 0,
        riscoPorAtivo: 0,
        rentabilidade: 0,
        observacoes: notes?.observacoes,
        tipo,
      };
    });

    const totalCarteira = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);

    const ativosComPercentuais = ativos.map(ativo => ({
      ...ativo,
      percentualCarteira: totalCarteira > 0 ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
      riscoPorAtivo: totalCarteira > 0 ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
      rentabilidade: ativo.valorInicialAplicado > 0
        ? ((ativo.valorAtualizado - ativo.valorInicialAplicado) / ativo.valorInicialAplicado) * 100
        : 0,
    }));

    const secoesMap = new Map<string, any>();
    ativosComPercentuais.forEach(ativo => {
      const current = secoesMap.get(ativo.tipo) || { tipo: ativo.tipo, nome: ativo.tipo, ativos: [] };
      current.ativos.push(ativo);
      secoesMap.set(ativo.tipo, current);
    });

    const secoes = Array.from(secoesMap.values()).map(secao => {
      const totalValorAplicado = secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.valorInicialAplicado, 0);
      const totalAporte = secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.aporte, 0);
      const totalResgate = secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.resgate, 0);
      const totalValorAtualizado = secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.valorAtualizado, 0);
      const percentualTotal = totalCarteira > 0 ? (totalValorAtualizado / totalCarteira) * 100 : 0;
      const rentabilidadeMedia = secao.ativos.length > 0
        ? secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.rentabilidade, 0) / secao.ativos.length
        : 0;

      return {
        ...secao,
        totalValorAplicado,
        totalAporte,
        totalResgate,
        totalValorAtualizado,
        percentualTotal,
        rentabilidadeMedia,
      };
    });

    const totalValorAplicado = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.valorInicialAplicado, 0);
    const totalAporte = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const totalResgate = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalValorAtualizado = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const rentabilidade = totalValorAplicado > 0
      ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100
      : 0;

    return NextResponse.json({
      resumo: {
        necessidadeAporte: 0,
        caixaParaInvestir: 0,
        saldoInicioMes: totalValorAplicado,
        saldoAtual: totalValorAtualizado,
        rendimento: totalValorAtualizado - totalValorAplicado,
        rentabilidade,
      },
      secoes,
      totalGeral: {
        valorAplicado: totalValorAplicado,
        aporte: totalAporte,
        resgate: totalResgate,
        valorAtualizado: totalValorAtualizado,
        rentabilidade,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar dados renda fixa:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
