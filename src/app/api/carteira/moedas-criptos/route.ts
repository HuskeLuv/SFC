import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { getAssetPrices } from '@/services/assetPriceService';
import type { MoedaCriptoAtivo, MoedaCriptoSecao } from '@/types/moedas-criptos';

const mapAssetTypeToTipo = (assetType: string): 'moeda' | 'criptomoeda' | 'metal' | 'outro' => {
  if (assetType === 'crypto') return 'criptomoeda';
  if (assetType === 'currency') return 'moeda';
  if (assetType === 'metal' || assetType === 'commodity') return 'metal';
  return 'outro';
};

const mapCurrencyToRegiao = (currency: string): 'brasil' | 'estados_unidos' | 'internacional' => {
  if (currency === 'BRL') return 'brasil';
  if (currency === 'USD') return 'estados_unidos';
  return 'internacional';
};

export async function GET(request: NextRequest) {
  try {
    const { targetUserId } = await requireAuthWithActing(request);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const caixaParaInvestirData = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_moedas_criptos',
      },
    });
    const caixaParaInvestir = caixaParaInvestirData?.value || 0;

    const portfolio = await prisma.portfolio.findMany({
      where: {
        userId: user.id,
        assetId: { not: null },
        asset: {
          type: { in: ['crypto', 'currency', 'metal', 'commodity'] },
        },
      },
      include: { asset: true },
    });

    const itemsWithAsset = portfolio.filter((p) => p.asset != null);
    const symbols = itemsWithAsset.map((p) => p.asset!.symbol);
    const quotes = await getAssetPrices(symbols, { useBrapiFallback: true });

    const ativos: MoedaCriptoAtivo[] = itemsWithAsset.map((item) => {
      const valorTotal = item.totalInvested;
      const ticker = item.asset!.symbol;
      const cotacaoAtual = quotes.get(ticker) ?? item.avgPrice;
      const valorAtualizado = item.quantity * cotacaoAtual;
      const rentabilidade = item.avgPrice > 0
        ? ((cotacaoAtual - item.avgPrice) / item.avgPrice) * 100
        : 0;

      return {
        id: item.id,
        ticker,
        nome: item.asset!.name,
        tipo: mapAssetTypeToTipo(item.asset!.type),
        regiao: mapCurrencyToRegiao(item.asset!.currency ?? 'BRL'),
        indiceRastreado: '-',
        quantidade: item.quantity,
        precoAquisicao: item.avgPrice,
        valorTotal,
        cotacaoAtual,
        valorAtualizado,
        riscoPorAtivo: 0,
        percentualCarteira: 0,
        objetivo: Number(item.objetivo) ?? 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade,
      };
    });

    const totalQuantidade = ativos.reduce((sum, a) => sum + a.quantidade, 0);
    const totalValorAplicado = ativos.reduce((sum, a) => sum + a.valorTotal, 0);
    const totalValorAtualizado = ativos.reduce((sum, a) => sum + a.valorAtualizado, 0);
    const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;

    const buildSection = (
      tipo: 'moedas' | 'criptomoedas' | 'metais_joias',
      nome: string,
      filtrados: MoedaCriptoAtivo[]
    ): MoedaCriptoSecao => {
      const regiao = filtrados.some((a) => a.regiao === 'estados_unidos') && filtrados.some((a) => a.regiao === 'brasil')
        ? 'internacional'
        : filtrados.some((a) => a.regiao === 'estados_unidos')
          ? 'estados_unidos'
          : 'brasil';
      return {
        tipo,
        nome,
        regiao,
        ativos: filtrados,
        totalQuantidade: filtrados.reduce((s, a) => s + a.quantidade, 0),
        totalValorAplicado: filtrados.reduce((s, a) => s + a.valorTotal, 0),
        totalValorAtualizado: filtrados.reduce((s, a) => s + a.valorAtualizado, 0),
        totalRisco: 0,
        totalPercentualCarteira: 0,
        totalObjetivo: filtrados.reduce((s, a) => s + a.objetivo, 0),
        totalQuantoFalta: 0,
        totalNecessidadeAporte: 0,
        rentabilidadeMedia: filtrados.length
          ? filtrados.reduce((s, a) => s + a.rentabilidade, 0) / filtrados.length
          : 0,
      };
    };

    const criptomoedas = ativos.filter((a) => a.tipo === 'criptomoeda');
    const moedas = ativos.filter((a) => a.tipo === 'moeda');
    const metaisJoias = ativos.filter((a) => a.tipo === 'metal' || a.tipo === 'outro');

    const secoes: MoedaCriptoSecao[] = [
      buildSection('moedas', 'Moedas', moedas),
      buildSection('criptomoedas', 'Criptomoedas', criptomoedas),
      buildSection('metais_joias', 'Metais e Joias', metaisJoias),
    ];

    const data = {
      resumo: {
        necessidadeAporteTotal: 0,
        caixaParaInvestir,
        saldoInicioMes: totalValorAplicado,
        valorAtualizado: valorAtualizadoComCaixa,
        rendimento: valorAtualizadoComCaixa - totalValorAplicado,
        rentabilidade: totalValorAplicado > 0
          ? ((valorAtualizadoComCaixa - totalValorAplicado) / totalValorAplicado) * 100
          : 0,
      },
      secoes,
      totalGeral: {
        quantidade: totalQuantidade,
        valorAplicado: totalValorAplicado,
        valorAtualizado: valorAtualizadoComCaixa,
        percentualCarteira: 0,
        risco: 0,
        objetivo: ativos.reduce((s, a) => s + a.objetivo, 0),
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade: ativos.length
          ? ativos.reduce((s, a) => s + a.rentabilidade, 0) / ativos.length
          : 0,
      },
      alocacaoAtivo: ativos.map((a) => ({ ticker: a.ticker, percentual: 0, valor: a.valorAtualizado })),
      tabelaAuxiliar: ativos.map((a) => ({
        ticker: a.ticker,
        cotacaoAtual: a.cotacaoAtual,
        necessidadeAporte: 0,
        loteAproximado: 0,
      })),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro ao buscar dados Moedas/Criptos:', error);
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
    const { ativoId, objetivo, cotacao, caixaParaInvestir } = body;

    if (caixaParaInvestir !== undefined) {
      if (typeof caixaParaInvestir !== 'number' || caixaParaInvestir < 0) {
        return NextResponse.json({
          error: 'Caixa para investir deve ser um valor igual ou maior que zero'
        }, { status: 400 });
      }

      // Salvar ou atualizar caixa para investir de Moedas/Criptos
      const existingCaixa = await prisma.dashboardData.findFirst({
        where: {
          userId: targetUserId,
          metric: 'caixa_para_investir_moedas_criptos',
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
            metric: 'caixa_para_investir_moedas_criptos',
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
    console.error('Erro ao atualizar dados Moedas/Criptos:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}