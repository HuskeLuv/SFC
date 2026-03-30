import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';

import { withErrorHandler } from '@/utils/apiErrorHandler';
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
  }

  // Buscar caixa para investir específico de Opções
  const caixaParaInvestirData = await prisma.dashboardData.findFirst({
    where: {
      userId: targetUserId,
      metric: 'caixa_para_investir_opcoes',
    },
  });
  const caixaParaInvestir = caixaParaInvestirData?.value || 0;

  // Buscar portfolio do usuário com ativos do tipo opcao
  const portfolios = await prisma.portfolio.findMany({
    where: {
      userId: targetUserId,
      assetId: { not: null },
      asset: {
        type: 'opcao',
      },
    },
    include: {
      asset: true,
    },
  });

  // Buscar transações para obter metadata (opcaoTipo, opcaoCompraVenda, dataVencimento)
  const assetIds = portfolios.map((p) => p.assetId).filter(Boolean) as string[];
  const transacoes =
    assetIds.length > 0
      ? await prisma.stockTransaction.findMany({
          where: { assetId: { in: assetIds }, userId: targetUserId },
          orderBy: { date: 'asc' },
        })
      : [];

  // Mapa assetId -> metadata da primeira transação
  const metadataPorAsset: Record<
    string,
    {
      opcaoTipo?: string;
      opcaoCompraVenda?: string;
      tickerAtivo?: string;
      dataVencimento?: string;
    }
  > = {};
  for (const tx of transacoes) {
    if (tx.assetId && !metadataPorAsset[tx.assetId] && tx.notes) {
      try {
        const parsed = JSON.parse(tx.notes) as {
          opcaoTipo?: string;
          opcaoCompraVenda?: string;
          tickerAtivo?: string;
          dataVencimento?: string;
          operation?: { opcaoTipo?: string; opcaoCompraVenda?: string };
        };
        const op = parsed.operation;
        metadataPorAsset[tx.assetId] = {
          opcaoTipo: parsed.opcaoTipo ?? op?.opcaoTipo,
          opcaoCompraVenda: parsed.opcaoCompraVenda ?? op?.opcaoCompraVenda,
          tickerAtivo: parsed.tickerAtivo ?? undefined,
          dataVencimento: parsed.dataVencimento ?? undefined,
        };
      } catch {
        // Fallback: parsear do asset.name (formato "TICKER - DD/MM/YYYY")
        const asset = portfolios.find((p) => p.assetId === tx.assetId)?.asset;
        if (asset?.name) {
          const ticker = asset.name.split(/\s*-\s*/)[0]?.trim() ?? '';
          metadataPorAsset[tx.assetId] = {
            tickerAtivo: ticker,
            opcaoTipo: 'put',
            opcaoCompraVenda: 'compra',
          };
        }
      }
    }
  }

  // Fallback: parsear do asset.name quando não há metadata nas notes
  for (const p of portfolios) {
    if (p.assetId && !metadataPorAsset[p.assetId] && p.asset?.name) {
      const ticker = p.asset.name.split(/\s*-\s*/)[0]?.trim() ?? '';
      metadataPorAsset[p.assetId] = {
        tickerAtivo: ticker,
        opcaoTipo: 'put',
        opcaoCompraVenda: 'compra',
      };
    }
  }

  // Agrupar por (tickerAtivo, opcaoTipo) para formar seções
  const secaoMap = new Map<
    string,
    {
      ticker: string;
      tipo: 'put' | 'call';
      ativos: Array<{
        portfolio: (typeof portfolios)[0];
        metadata: (typeof metadataPorAsset)[string];
      }>;
    }
  >();
  for (const p of portfolios) {
    if (!p.assetId || !p.asset) continue;
    const meta = metadataPorAsset[p.assetId];
    const ticker = (meta?.tickerAtivo ?? p.asset.name.split(/\s+/)[0] ?? '') || 'Opção';
    const tipo = (meta?.opcaoTipo === 'call' ? 'call' : 'put') as 'put' | 'call';
    const key = `${ticker}-${tipo}`;
    if (!secaoMap.has(key)) {
      secaoMap.set(key, { ticker, tipo, ativos: [] });
    }
    secaoMap.get(key)!.ativos.push({ portfolio: p, metadata: meta ?? {} });
  }

  const secoes: Array<{
    nome: string;
    tipo: 'put' | 'call';
    ativos: Array<{
      id: string;
      nome: string;
      compraVenda: 'compra' | 'venda';
      vencimento: string;
      quantidade: number;
      precoAquisicao: number;
      valorTotal: number;
      cotacaoAtual: number;
      valorAtualizado: number;
      riscoPorAtivo: number;
      percentualCarteira: number;
      objetivo: number;
      quantoFalta: number;
      necessidadeAporte: number;
      rentabilidade: number;
    }>;
    totalQuantidade: number;
    totalValorAplicado: number;
    totalValorAtualizado: number;
    totalRisco: number;
    totalPercentualCarteira: number;
    totalObjetivo: number;
    totalQuantoFalta: number;
    totalNecessidadeAporte: number;
    rentabilidadeMedia: number;
  }> = [];

  for (const [, sec] of secaoMap) {
    const ativos = sec.ativos.map(({ portfolio: p, metadata: m }) => {
      const compraVenda = (m?.opcaoCompraVenda === 'venda' ? 'venda' : 'compra') as
        | 'compra'
        | 'venda';
      const vencimento = m?.dataVencimento ?? '';
      const valorTotal = p.totalInvested;
      const valorAtualizado = valorTotal; // Sem cotação em tempo real por enquanto
      const rentabilidade =
        valorTotal > 0 ? ((valorAtualizado - valorTotal) / valorTotal) * 100 : 0;
      return {
        id: p.id,
        nome: p.asset!.name,
        compraVenda,
        vencimento,
        quantidade: p.quantity,
        precoAquisicao: p.avgPrice,
        valorTotal,
        cotacaoAtual: p.avgPrice,
        valorAtualizado,
        riscoPorAtivo: 0,
        percentualCarteira: 0,
        objetivo: p.objetivo ?? 0,
        quantoFalta: 0,
        necessidadeAporte: 0,
        rentabilidade,
      };
    });
    const totalQuantidade = ativos.reduce((s, a) => s + a.quantidade, 0);
    const totalValorAplicado = ativos.reduce((s, a) => s + a.valorTotal, 0);
    const totalValorAtualizado = ativos.reduce((s, a) => s + a.valorAtualizado, 0);
    const totalRisco = 0;
    const totalPercentualCarteira = 0;
    const totalObjetivo = ativos.length
      ? ativos.reduce((s, a) => s + a.objetivo, 0) / ativos.length
      : 0;
    const totalQuantoFalta = 0;
    const totalNecessidadeAporte = 0;
    const rentabilidadeMedia =
      totalValorAplicado > 0
        ? ((totalValorAtualizado - totalValorAplicado) / totalValorAplicado) * 100
        : 0;
    secoes.push({
      nome: sec.ticker,
      tipo: sec.tipo,
      ativos,
      totalQuantidade,
      totalValorAplicado,
      totalValorAtualizado,
      totalRisco,
      totalPercentualCarteira,
      totalObjetivo,
      totalQuantoFalta,
      totalNecessidadeAporte,
      rentabilidadeMedia,
    });
  }

  // Ordenar seções: PUT primeiro, depois CALL; dentro de cada tipo, por ticker
  secoes.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'put' ? -1 : 1;
    return a.nome.localeCompare(b.nome);
  });

  const totalGeralValorAplicado = secoes.reduce((s, sec) => s + sec.totalValorAplicado, 0);
  const totalGeralValorAtualizado = secoes.reduce((s, sec) => s + sec.totalValorAtualizado, 0);
  const totalGeralQuantidade = secoes.reduce((s, sec) => s + sec.totalQuantidade, 0);

  const data = {
    resumo: {
      necessidadeAporteTotal: 0,
      caixaParaInvestir: caixaParaInvestir,
      saldoInicioMes: 0,
      valorAtualizado: totalGeralValorAtualizado + caixaParaInvestir,
      rendimento: 0,
      rentabilidade:
        totalGeralValorAplicado > 0
          ? ((totalGeralValorAtualizado - totalGeralValorAplicado) / totalGeralValorAplicado) * 100
          : 0,
    },
    secoes,
    totalGeral: {
      quantidade: totalGeralQuantidade,
      valorAplicado: totalGeralValorAplicado,
      valorAtualizado: totalGeralValorAtualizado + caixaParaInvestir,
      percentualCarteira: 0,
      risco: 0,
      objetivo: 0,
      quantoFalta: 0,
      necessidadeAporte: 0,
      rentabilidade:
        totalGeralValorAplicado > 0
          ? ((totalGeralValorAtualizado - totalGeralValorAplicado) / totalGeralValorAplicado) * 100
          : 0,
    },
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

    // Salvar ou atualizar caixa para investir de Opções
    const existingCaixa = await prisma.dashboardData.findFirst({
      where: {
        userId: targetUserId,
        metric: 'caixa_para_investir_opcoes',
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
          metric: 'caixa_para_investir_opcoes',
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
