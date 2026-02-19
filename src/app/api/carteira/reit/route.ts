import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAllIndicators } from '@/services/marketIndicatorService';

// Função auxiliar para cores
function getAtivoColor(ticker: string): string {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316'];
  const index = ticker.charCodeAt(0) % colors.length;
  return colors[index];
}

export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Buscar cotação do dólar para conversão USD -> BRL
    let cotacaoDolar: number | null = null;
    try {
      const indicators = await getAllIndicators();
      cotacaoDolar = indicators.dolar?.price ?? null;
    } catch {
      // Ignorar erro - usar null e exibir em USD
    }

    // Buscar caixa para investir específico de REIT
    const caixaParaInvestirData = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_reit',
      },
    });
    const caixaParaInvestir = caixaParaInvestirData?.value || 0;

    // Buscar portfolio do usuário com ativos do tipo correspondente
    const portfolio = await prisma.portfolio.findMany({
      where: { 
        userId: user.id,
        asset: {
          type: 'reit'
        }
      },
      include: {
        asset: true
      }
    });

    const assetIds = portfolio.map(p => p.assetId).filter((id): id is string => id !== null);
    const transactions = assetIds.length > 0 ? await prisma.stockTransaction.findMany({
      where: { userId: targetUserId, assetId: { in: assetIds }, type: 'compra' },
      orderBy: { date: 'desc' },
    }) : [];

    const latestNotesByAsset = new Map<string, { estrategia?: string }>();
    transactions.forEach(t => {
      if (!t.assetId || latestNotesByAsset.has(t.assetId)) return;
      try {
        const notes = t.notes ? JSON.parse(t.notes) : {};
        if (notes.estrategiaReit) {
          latestNotesByAsset.set(t.assetId, { estrategia: notes.estrategiaReit });
        }
      } catch {
        // ignore
      }
    });

    // Converter portfolio para formato esperado
    const reitAtivos = portfolio
      .filter(item => item.asset)
      .map(item => {
        const assetId = item.assetId || '';
        const notes = latestNotesByAsset.get(assetId);
        const estrategia = (notes?.estrategia === 'growth' || notes?.estrategia === 'risk' || notes?.estrategia === 'value')
          ? notes.estrategia
          : 'value';
        const valorAtualizado = (item.avgPrice && item.avgPrice > 0 && item.quantity > 0)
          ? item.avgPrice * item.quantity
          : item.totalInvested;
        const cotacaoAtual = item.quantity > 0 ? valorAtualizado / item.quantity : item.avgPrice || 0;

        return {
          id: item.id,
          ticker: item.asset!.symbol,
          nome: item.asset!.name,
          setor: 'outros',
          subsetor: '',
          quantidade: item.quantity,
          precoAquisicao: item.avgPrice,
          valorTotal: item.totalInvested,
          cotacaoAtual,
          valorAtualizado,
          riscoPorAtivo: 0,
          percentualCarteira: 0,
          objetivo: item.objetivo ?? 0,
          quantoFalta: 0,
          necessidadeAporte: 0,
          rentabilidade: item.totalInvested > 0 ? ((valorAtualizado - item.totalInvested) / item.totalInvested) * 100 : 0,
          estrategia,
          observacoes: undefined,
          dataUltimaAtualizacao: item.lastUpdate,
        };
      });

    // Calcular totais gerais
    const totalQuantidade = reitAtivos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = reitAtivos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    const totalValorAtualizado = reitAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalObjetivo = reitAtivos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = reitAtivos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = reitAtivos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
    const totalRisco = reitAtivos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const rentabilidadeMedia = reitAtivos.length > 0 
      ? reitAtivos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / reitAtivos.length 
      : 0;

    // Agrupar por estratégia
    const REIT_SECTION_ORDER = ['value', 'growth', 'risk'] as const;
    const REIT_SECTION_NAMES: Record<string, string> = { value: 'Value', growth: 'Growth', risk: 'Risk' };
    const secoesMap = new Map<string, typeof reitAtivos>();
    reitAtivos.forEach(ativo => {
      const e = ativo.estrategia;
      const list = secoesMap.get(e) || [];
      list.push(ativo);
      secoesMap.set(e, list);
    });

    const secoes = REIT_SECTION_ORDER.map(estrategia => {
      const ativos = secoesMap.get(estrategia) || [];
      return {
        estrategia,
        nome: REIT_SECTION_NAMES[estrategia],
        ativos,
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
    });

    // Calcular valores das seções
    secoes.forEach(secao => {
      secao.totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
      secao.totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
      secao.totalValorAtualizado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
      secao.totalPercentualCarteira = secao.ativos.reduce((sum, ativo) => sum + ativo.percentualCarteira, 0);
      secao.totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
      secao.totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
      secao.totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
      secao.totalNecessidadeAporte = secao.ativos.reduce((sum, ativo) => sum + ativo.necessidadeAporte, 0);
      secao.rentabilidadeMedia = secao.ativos.length > 0 
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
      rentabilidade: totalValorAplicado > 0 ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100 : 0
    };

    // Calcular alocação por ativo
    const totalValor = reitAtivos.reduce((sum, a) => sum + a.valorAtualizado, 0);
    const alocacaoAtivo = reitAtivos.map(ativo => ({
      ticker: ativo.ticker,
      valor: ativo.valorAtualizado,
      percentual: totalValor > 0 ? (ativo.valorAtualizado / totalValor) * 100 : 0,
      cor: getAtivoColor(ativo.ticker)
    }));

    // Tabela auxiliar (cotacaoAtual, necessidadeAporte, loteAproximado)
    const totalTabValue = valorAtualizadoComCaixa;
    const tabelaAuxiliar = reitAtivos.map(ativo => {
      const percentualCarteira = totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0;
      const quantoFalta = (ativo.objetivo ?? 0) - percentualCarteira;
      const necessidadeAporte = totalTabValue > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalTabValue : 0;
      const loteAproximado = ativo.cotacaoAtual > 0 ? Math.ceil(necessidadeAporte / ativo.cotacaoAtual) : 0;
      return {
        ticker: ativo.ticker,
        nome: ativo.nome,
        cotacaoAtual: ativo.cotacaoAtual,
        necessidadeAporte,
        loteAproximado,
      };
    });

    const data = {
      cotacaoDolar,
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
        rentabilidade: rentabilidadeMedia
      },
      alocacaoAtivo,
      tabelaAuxiliar
    };
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados REIT:', error);
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
        return NextResponse.json({ error: 'Portfolio não encontrado' }, { status: 404 });
      }
      if (portfolio.userId !== targetUserId) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
      }

      if (campo === 'valorAtualizado') {
        const numValor = typeof valor === 'number' ? valor : parseFloat(valor as string);
        if (!Number.isFinite(numValor) || numValor < 0) {
          return NextResponse.json({ error: 'Valor atualizado deve ser um número maior ou igual a zero' }, { status: 400 });
        }
        const qty = portfolio.quantity || 1;
        const novoAvgPrice = qty > 0 ? numValor / qty : numValor;

        await prisma.portfolio.update({
          where: { id: ativoId },
          data: { avgPrice: novoAvgPrice, lastUpdate: new Date() },
        });

        return NextResponse.json({ success: true, message: 'Valor atualizado com sucesso' });
      }
    }

    if (caixaParaInvestir !== undefined) {
      if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
        return NextResponse.json({
          error: 'Caixa para investir deve ser um valor igual ou maior que zero'
        }, { status: 400 });
      }

      // Salvar ou atualizar caixa para investir de REIT
      const existingCaixa = await prisma.dashboardData.findFirst({
        where: {
          userId: targetUserId,
          metric: 'caixa_para_investir_reit',
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
            metric: 'caixa_para_investir_reit',
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
    console.error('Erro ao atualizar dados REIT:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}