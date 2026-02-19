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

export async function GET(request: NextRequest) {
  try {
    const { payload, targetUserId, actingClient } = await requireAuthWithActing(request);

    await logSensitiveEndpointAccess(
      request,
      payload,
      targetUserId,
      actingClient,
      '/api/carteira/fim-fia',
      'GET',
    );

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar caixa para investir específico de FIM/FIA
    const caixaParaInvestirData = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_fim_fia',
      },
    });
    const caixaParaInvestir = caixaParaInvestirData?.value || 0;

    const portfolio = await prisma.portfolio.findMany({
      where: {
        userId: user.id,
        asset: { type: { in: ['fund', 'funds'] } },
      },
      include: { asset: true },
    });

    const assetIds = portfolio.map(p => p.assetId).filter((id): id is string => id !== null);
    const transactions = assetIds.length > 0 ? await prisma.stockTransaction.findMany({
      where: {
        userId: user.id,
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
      const valorCalculado = valorInicial + aporte - resgate;
      const valorAtualizado = (item.avgPrice && item.avgPrice > 0 && item.quantity > 0)
        ? item.avgPrice * item.quantity
        : valorCalculado;
      const notes = assetId ? latestCompraNotes.get(assetId) : null;

      const tipoFundo = (notes?.tipoFundo === 'fia' || notes?.tipoFundo === 'fim') ? notes.tipoFundo : 'fim';

      return {
        id: item.id,
        nome: item.asset?.name || 'Fundo',
        cotizacaoResgate: notes?.cotizacaoResgate || 'D+0',
        liquidacaoResgate: notes?.liquidacaoResgate || 'Imediata',
        categoriaNivel1: notes?.categoriaNivel1 || '',
        subcategoriaNivel2: notes?.subcategoriaNivel2 || '',
        valorInicialAplicado: valorInicial,
        aporte,
        resgate,
        valorAtualizado,
        percentualCarteira: 0,
        riscoPorAtivo: 0,
        objetivo: item.objetivo ?? 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade: valorInicial > 0 ? ((valorAtualizado - valorInicial) / valorInicial) * 100 : 0,
        tipo: tipoFundo,
        observacoes: notes?.observacoes,
      };
    });

    const totalCarteira = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const ativosComPercentuais = ativos.map(ativo => ({
      ...ativo,
      percentualCarteira: totalCarteira > 0 ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
      riscoPorAtivo: totalCarteira > 0 ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
    }));

    const FIM_FIA_SECTION_ORDER = ['fim', 'fia'] as const;
    const FIM_FIA_SECTION_NAMES: Record<string, string> = { fim: 'FIM', fia: 'FIA' };
    type AtivoFimFia = (typeof ativosComPercentuais)[number];
    const secoesMap = new Map<string, { tipo: string; nome: string; ativos: AtivoFimFia[] }>();
    ativosComPercentuais.forEach(ativo => {
      const tipo = ativo.tipo;
      const current = secoesMap.get(tipo) || { tipo, nome: FIM_FIA_SECTION_NAMES[tipo] || tipo, ativos: [] as AtivoFimFia[] };
      current.ativos.push(ativo);
      secoesMap.set(tipo, current);
    });

    const secoes = FIM_FIA_SECTION_ORDER.map(tipo => {
      const secao = secoesMap.get(tipo) || { tipo, nome: FIM_FIA_SECTION_NAMES[tipo], ativos: [] as AtivoFimFia[] };
      return {
      tipo: secao.tipo,
      nome: secao.nome,
      ativos: secao.ativos,
      totalValorAplicado: secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.valorInicialAplicado, 0),
      totalAporte: secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.aporte, 0),
      totalResgate: secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.resgate, 0),
      totalValorAtualizado: secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.valorAtualizado, 0),
      totalPercentualCarteira: totalCarteira > 0 ? (secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.valorAtualizado, 0) / totalCarteira) * 100 : 0,
      totalRisco: secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.riscoPorAtivo, 0),
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia: secao.ativos.length > 0
        ? secao.ativos.reduce((sum: number, ativo: any) => sum + ativo.rentabilidade, 0) / secao.ativos.length
        : 0,
    };
    });

    const totalValorAplicado = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.valorInicialAplicado, 0);
    const totalValorAtualizado = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalResgate = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalAporte = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
    const rentabilidade = totalValorAplicado > 0
      ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100
      : 0;

    return NextResponse.json({
      resumo: {
        necessidadeAporteTotal: 0,
        caixaParaInvestir: caixaParaInvestir,
        saldoInicioMes: totalValorAplicado,
        valorAtualizado: valorAtualizadoComCaixa,
        rendimento: valorAtualizadoComCaixa - totalValorAplicado,
        rentabilidade,
      },
      secoes,
      totalGeral: {
        quantidade: ativosComPercentuais.length,
        valorAplicado: totalValorAplicado,
        aporte: totalAporte,
        resgate: totalResgate,
        valorAtualizado: valorAtualizadoComCaixa, // Incluir caixa no total
        percentualCarteira: totalCarteira > 0 ? 100 : 0,
        risco: ativosComPercentuais.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0),
        objetivo: 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar dados FIM/FIA:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const body = await request.json();
    const { ativoId, objetivo, cotacao, caixaParaInvestir, campo, valor } = body;

    if (campo && valor !== undefined && ativoId) {
      const portfolio = await prisma.portfolio.findUnique({
        where: { id: ativoId },
        include: { asset: true },
      });

      if (!portfolio) {
        return NextResponse.json(
          { error: 'Portfolio não encontrado' },
          { status: 404 }
        );
      }

      if (portfolio.userId !== targetUserId) {
        return NextResponse.json(
          { error: 'Não autorizado' },
          { status: 403 }
        );
      }

      if (campo === 'valorAtualizado') {
        const numValor = typeof valor === 'number' ? valor : parseFloat(valor as string);
        if (!Number.isFinite(numValor) || numValor < 0) {
          return NextResponse.json(
            { error: 'Valor atualizado deve ser um número maior ou igual a zero' },
            { status: 400 }
          );
        }
        const qty = portfolio.quantity || 1;
        const novoAvgPrice = qty > 0 ? numValor / qty : numValor;

        await prisma.portfolio.update({
          where: { id: ativoId },
          data: {
            avgPrice: novoAvgPrice,
            lastUpdate: new Date(),
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Valor atualizado com sucesso',
        });
      }
    }

    if (caixaParaInvestir !== undefined) {
      if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
        return NextResponse.json({
          error: 'Caixa para investir deve ser um valor igual ou maior que zero'
        }, { status: 400 });
      }

      // Salvar ou atualizar caixa para investir de FIM/FIA
      const existingCaixa = await prisma.dashboardData.findFirst({
        where: {
          userId: targetUserId,
          metric: 'caixa_para_investir_fim_fia',
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
            metric: 'caixa_para_investir_fim_fia',
            value: caixaParaInvestir,
          },
        });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Caixa para investir atualizado com sucesso',
        caixaParaInvestir
      });
    }

    if (!ativoId) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: ativoId' },
        { status: 400 }
      );
    }

    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json({ 
      success: true, 
      message: 'Dados atualizados com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao atualizar dados FIM/FIA:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}