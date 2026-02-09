import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

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

    let fixedIncomeAssets: any[] = [];
    try {
      fixedIncomeAssets = await prisma.fixedIncomeAsset.findMany({
        where: { userId: targetUserId },
        include: { asset: true },
      });
    } catch (error) {
      const prismaError = error as Prisma.PrismaClientKnownRequestError;
      if (prismaError?.code !== 'P2021') {
        throw error;
      }
      fixedIncomeAssets = [];
    }

    const portfolio = await prisma.portfolio.findMany({
      where: {
        userId: targetUserId,
        asset: {
          type: { in: ['bond', 'cash'] },
        },
      },
      include: { asset: true },
    });

    const fixedIncomeByAssetId = new Map<string, typeof fixedIncomeAssets[number]>();
    fixedIncomeAssets.forEach((fixedIncome) => {
      fixedIncomeByAssetId.set(fixedIncome.assetId, fixedIncome);
    });

    // Buscar transações para obter metadados editados
    const assetIds = portfolio.map(p => p.assetId).filter((id): id is string => id !== null);
    const transactions = assetIds.length > 0 ? await prisma.stockTransaction.findMany({
      where: {
        userId: targetUserId,
        assetId: { in: assetIds },
        type: { in: ['compra', 'venda'] },
      },
      orderBy: {
        date: 'desc',
      },
    }) : [];

    // Criar mapa de metadados por assetId (usar a transação mais recente)
    const metadataMap = new Map<string, {
      cotizacaoResgate?: string;
      liquidacaoResgate?: string;
      benchmark?: string;
      observacoes?: string;
    }>();

    transactions.forEach(transaction => {
      if (!transaction.assetId) return;
      if (transaction.notes && !metadataMap.has(transaction.assetId)) {
        try {
          const parsed = JSON.parse(transaction.notes);
          if (parsed.cotizacaoResgate || parsed.liquidacaoResgate || parsed.benchmark || parsed.observacoes) {
            metadataMap.set(transaction.assetId, {
              cotizacaoResgate: parsed.cotizacaoResgate,
              liquidacaoResgate: parsed.liquidacaoResgate,
              benchmark: parsed.benchmark,
              observacoes: parsed.observacoes,
            });
          }
        } catch (e) {
          // Se não for JSON válido, ignorar
        }
      }
    });

    // Buscar caixa para investir específico de Renda Fixa
    const caixaParaInvestirData = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_renda_fixa',
      },
    });
    const caixaParaInvestir = caixaParaInvestirData?.value || 0;

    const today = new Date();
    const normalizeDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const calculateFixedIncomeValue = (fixedIncome: typeof fixedIncomeAssets[number]) => {
      const start = normalizeDate(new Date(fixedIncome.startDate));
      const maturity = normalizeDate(new Date(fixedIncome.maturityDate));
      const current = normalizeDate(today);
      const endDate = current.getTime() > maturity.getTime() ? maturity : current;
      if (endDate.getTime() <= start.getTime()) {
        return fixedIncome.investedAmount;
      }
      const days = Math.floor((endDate.getTime() - start.getTime()) / DAY_MS);
      const rate = fixedIncome.annualRate / 100;
      const valorAtual = fixedIncome.investedAmount * Math.pow(1 + rate, days / 365);
      return Math.round(valorAtual * 100) / 100;
    };

    const getBenchmarkLabel = (fixedIncome: typeof fixedIncomeAssets[number]) => {
      if (fixedIncome.indexer === 'CDI') return 'CDI';
      if (fixedIncome.indexer === 'IPCA') return 'IPCA';
      return 'Pré';
    };

    const getLiquidityLabel = (fixedIncome: typeof fixedIncomeAssets[number]) => {
      if (fixedIncome.liquidityType === 'DAILY') return 'Diária';
      if (fixedIncome.liquidityType === 'MATURITY') return 'No vencimento';
      return 'No vencimento';
    };

    const ativos = portfolio
      .filter((item) => item.assetId)
      .map((item) => {
        const assetId = item.assetId as string;
        const fixedIncome = fixedIncomeByAssetId.get(assetId);
        if (!fixedIncome) {
          return null;
        }
        // Usar valor atualizado do portfolio (avgPrice) se foi editado manualmente
        const valorAtualizadoCalculado = calculateFixedIncomeValue(fixedIncome);
        const valorAtualizado = (item.avgPrice && item.avgPrice > 0 && item.quantity > 0)
          ? item.avgPrice * item.quantity
          : valorAtualizadoCalculado;
        const valorInicial = fixedIncome.investedAmount;
        const rentabilidade = valorInicial > 0 ? ((valorAtualizado - valorInicial) / valorInicial) * 100 : 0;

        // Buscar metadados editados das transações
        const metadata = metadataMap.get(assetId) || {};

      return {
          id: item.id,
          nome: fixedIncome.description || item.asset?.name || 'Renda Fixa',
          percentualRentabilidade: Math.round(rentabilidade * 100) / 100,
          cotizacaoResgate: metadata.cotizacaoResgate || getLiquidityLabel(fixedIncome),
          liquidacaoResgate: metadata.liquidacaoResgate || getLiquidityLabel(fixedIncome),
          vencimento: new Date(fixedIncome.maturityDate),
          benchmark: metadata.benchmark || getBenchmarkLabel(fixedIncome),
          valorInicialAplicado: valorInicial,
          aporte: 0,
          resgate: 0,
          valorAtualizado,
          percentualCarteira: 0,
          riscoPorAtivo: 0,
          rentabilidade,
          observacoes: metadata.observacoes,
          tipo: 'prefixada',
        };
      })
      .filter((ativo): ativo is NonNullable<typeof ativo> => Boolean(ativo));

    const legacyAssets = portfolio
      .filter((item) => item.assetId && !fixedIncomeByAssetId.has(item.assetId))
      .map((item) => {
        const assetId = item.assetId as string;
        const metadata = metadataMap.get(assetId) || {};
        const valorAtualizado = (item.avgPrice && item.avgPrice > 0 && item.quantity > 0)
          ? item.avgPrice * item.quantity
          : item.totalInvested;
        
        return {
          id: item.id,
          nome: item.asset?.name || 'Renda Fixa',
          percentualRentabilidade: 0,
          cotizacaoResgate: metadata.cotizacaoResgate || 'D+0',
          liquidacaoResgate: metadata.liquidacaoResgate || 'Imediata',
          vencimento: new Date(),
          benchmark: metadata.benchmark || 'CDI',
          valorInicialAplicado: item.totalInvested,
          aporte: 0,
          resgate: 0,
          valorAtualizado,
          percentualCarteira: 0,
          riscoPorAtivo: 0,
          rentabilidade: 0,
          observacoes: metadata.observacoes,
          tipo: 'prefixada' as const,
        };
      });

    const allAtivos = [...ativos, ...legacyAssets];

    const totalCarteira = allAtivos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);

    const ativosComPercentuais = allAtivos.map(ativo => ({
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
    const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
    const rentabilidade = totalValorAplicado > 0
      ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100
      : 0;

    return NextResponse.json({
      resumo: {
        necessidadeAporte: 0,
        caixaParaInvestir: caixaParaInvestir,
        saldoInicioMes: totalValorAplicado,
        saldoAtual: valorAtualizadoComCaixa,
        rendimento: valorAtualizadoComCaixa - totalValorAplicado,
        rentabilidade,
      },
      secoes,
      totalGeral: {
        valorAplicado: totalValorAplicado,
        aporte: totalAporte,
        resgate: totalResgate,
        valorAtualizado: valorAtualizadoComCaixa, // Incluir caixa no total
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

export async function POST(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);
    const body = await request.json();
    const { ativoId, objetivo, cotacao, caixaParaInvestir, campo, valor } = body;

    if (caixaParaInvestir !== undefined) {
      if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
        return NextResponse.json({
          error: 'Caixa para investir deve ser um valor igual ou maior que zero'
        }, { status: 400 });
      }

      // Salvar ou atualizar caixa para investir de Renda Fixa
      const existingCaixa = await prisma.dashboardData.findFirst({
        where: {
          userId: targetUserId,
          metric: 'caixa_para_investir_renda_fixa',
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
            metric: 'caixa_para_investir_renda_fixa',
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

    if (campo && valor !== undefined && ativoId) {
      // Atualizar campo específico do ativo
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

      // Buscar a transação mais recente para atualizar os metadados
      const transaction = await prisma.stockTransaction.findFirst({
        where: {
          userId: targetUserId,
          assetId: portfolio.assetId,
          type: 'compra',
        },
        orderBy: { date: 'desc' },
      });

      if (campo === 'valorAtualizado') {
        // Atualizar avgPrice do portfolio
        await prisma.portfolio.update({
          where: { id: ativoId },
          data: {
            avgPrice: typeof valor === 'number' ? valor : parseFloat(valor as string),
            lastUpdate: new Date(),
          },
        });
      } else {
        // Para outros campos, atualizar metadados na transação
        if (transaction) {
          const notes = transaction.notes ? JSON.parse(transaction.notes) : {};
          // Preservar a estrutura operation se existir
          const operation = notes.operation || {};
          notes[campo] = valor;
          notes.operation = operation;
          
          await prisma.stockTransaction.update({
            where: { id: transaction.id },
            data: {
              notes: JSON.stringify(notes),
            },
          });
        } else if (portfolio.assetId) {
          // Se não houver transação, buscar a primeira transação de compra ou criar uma nova
          const firstTransaction = await prisma.stockTransaction.findFirst({
            where: {
              userId: targetUserId,
              assetId: portfolio.assetId,
              type: 'compra',
            },
            orderBy: { date: 'asc' },
          });

          if (firstTransaction) {
            // Atualizar a primeira transação existente
            const notes = firstTransaction.notes ? JSON.parse(firstTransaction.notes) : {};
            const operation = notes.operation || {};
            notes[campo] = valor;
            notes.operation = operation;
            
            await prisma.stockTransaction.update({
              where: { id: firstTransaction.id },
              data: {
                notes: JSON.stringify(notes),
              },
            });
          } else {
            // Criar uma nova transação apenas para armazenar os metadados
            const notes = {
              [campo]: valor,
            };
            
            await prisma.stockTransaction.create({
              data: {
                userId: targetUserId,
                assetId: portfolio.assetId,
                type: 'compra',
                quantity: portfolio.quantity,
                price: portfolio.avgPrice,
                date: portfolio.lastUpdate || new Date(),
                total: portfolio.totalInvested || (portfolio.avgPrice * portfolio.quantity),
                notes: JSON.stringify(notes),
              },
            });
          }
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Campo atualizado com sucesso' 
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
    console.error('Erro ao atualizar dados Renda Fixa:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
