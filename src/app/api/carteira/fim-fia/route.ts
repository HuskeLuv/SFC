import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import { prisma } from '@/lib/prisma';
import { logSensitiveEndpointAccess } from '@/services/impersonationLogger';
import { createFixedIncomePricer } from '@/services/portfolio/fixedIncomePricing';

import { withErrorHandler } from '@/utils/apiErrorHandler';
import { round2, distributeRoundedPercents } from '@/utils/alocacaoPercents';
import {
  FUNDO_TYPES_AGRUPADOS,
  FUNDO_SUBTIPO_ORDER,
  FUNDO_SUBTIPO_LABEL,
  fundoSubtipoFromAssetType,
  type FundoSubtipo,
} from '@/lib/fundoTypes';
const parseNotes = (notes?: string | null) => {
  if (!notes) return null;
  try {
    return JSON.parse(notes);
  } catch {
    return null;
  }
};

export const GET = withErrorHandler(async (request: NextRequest) => {
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
      asset: { type: { in: [...FUNDO_TYPES_AGRUPADOS] } },
    },
    include: { asset: true },
  });

  // Pricer compartilhado: aplica a mesma marcação na curva (CDI/IPCA/Tesouro PU) usada
  // pela aba Renda Fixa, para que ativos com fixedIncomeAsset adicionados nesta aba
  // sejam precificados consistentemente.
  const pricer = await createFixedIncomePricer(targetUserId);

  const assetIds = portfolio.map((p) => p.assetId).filter((id): id is string => id !== null);
  const transactions =
    assetIds.length > 0
      ? await prisma.stockTransaction.findMany({
          where: {
            userId: user.id,
            assetId: { in: assetIds },
            type: { in: ['compra', 'venda'] },
          },
          orderBy: { date: 'desc' },
        })
      : [];

  const latestCompraNotes = new Map<string, Record<string, unknown> | null>();
  const comprasMap = new Map<string, number>();
  const aportesMap = new Map<string, number>();
  const resgatesMap = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (!transaction.assetId) return;
    if (transaction.type === 'compra') {
      const notes = parseNotes(transaction.notes);
      const action = notes?.operation?.action || 'compra';
      if (action === 'aporte') {
        aportesMap.set(
          transaction.assetId,
          (aportesMap.get(transaction.assetId) || 0) + transaction.total,
        );
      } else {
        comprasMap.set(
          transaction.assetId,
          (comprasMap.get(transaction.assetId) || 0) + transaction.total,
        );
      }
      if (!latestCompraNotes.has(transaction.assetId)) {
        latestCompraNotes.set(transaction.assetId, notes);
      }
    } else if (transaction.type === 'venda') {
      resgatesMap.set(
        transaction.assetId,
        (resgatesMap.get(transaction.assetId) || 0) + transaction.total,
      );
    }
  });

  const ativos = portfolio.map((item) => {
    const assetId = item.assetId || '';
    const totalCompras = assetId ? comprasMap.get(assetId) || 0 : 0;
    const totalAportes = assetId ? aportesMap.get(assetId) || 0 : 0;
    const totalResgates = assetId ? resgatesMap.get(assetId) || 0 : 0;
    const valorInicial = totalCompras > 0 ? totalCompras : item.totalInvested;
    const aporte = totalAportes;
    const resgate = totalResgates;
    const valorCalculado = valorInicial + aporte - resgate;
    // Renda fixa: para CDB/LCI/LCA na curva, exige rendimento acumulado (calc > investido)
    // como sanity check — emissão bancária na curva nunca decresce, então abaixo do
    // investido = série de taxas ainda não disponível. Para Tesouro Direto via
    // FixedIncomeAsset, o valor é PU/PU0 e PODE ficar abaixo do investido (alta de
    // juros), então usamos sempre que > 0.
    const fixedIncome = item.assetId ? pricer.fixedIncomeByAssetId.get(item.assetId) : undefined;
    const fiCurveValue = fixedIncome ? pricer.getCurrentValue(fixedIncome) : 0;
    const isFiTesouro = Boolean(fixedIncome?.tesouroBondType);
    const fiHasCurve = fixedIncome
      ? isFiTesouro
        ? fiCurveValue > 0
        : fiCurveValue > fixedIncome.investedAmount
      : false;
    // Cota CVM sincronizada (bridgeCvmToAssetPrices) tem prioridade sobre edição manual.
    const cvmCurrentPrice = item.asset?.currentPrice?.toNumber() ?? null;
    const isAutoUpdated = Boolean(
      fiHasCurve || (cvmCurrentPrice && cvmCurrentPrice > 0 && item.quantity > 0),
    );
    const valorAtualizado = fiHasCurve
      ? fiCurveValue
      : cvmCurrentPrice && cvmCurrentPrice > 0 && item.quantity > 0
        ? cvmCurrentPrice * item.quantity
        : item.avgPrice && item.avgPrice > 0 && item.quantity > 0
          ? item.avgPrice * item.quantity
          : valorCalculado;
    const notes = assetId ? latestCompraNotes.get(assetId) : null;

    // Subtipo: prioridade pro Asset.type classificado (CVM/RCVM 175), fallback
    // pro notes.tipoFundo (input antigo do wizard), default 'fim'.
    const subtipoFromAsset = fundoSubtipoFromAssetType(item.asset?.type);
    const subtipoFromNotes = FUNDO_SUBTIPO_ORDER.includes(notes?.tipoFundo as FundoSubtipo)
      ? (notes?.tipoFundo as FundoSubtipo)
      : null;
    const tipoFundo: FundoSubtipo = subtipoFromAsset ?? subtipoFromNotes ?? 'fim';

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
      isAutoUpdated,
    };
  });

  const totalCarteira = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
  const ativosComPercentuais = ativos.map((ativo) => ({
    ...ativo,
    percentualCarteira:
      totalCarteira > 0 ? round2((ativo.valorAtualizado / totalCarteira) * 100) : 0,
    riscoPorAtivo: totalCarteira > 0 ? round2((ativo.valorAtualizado / totalCarteira) * 100) : 0,
  }));

  // Bug #14 residual: largest-remainder pra Σ=100,00 (paridade com FII).
  if (totalCarteira > 0) {
    const adjusted = distributeRoundedPercents(
      ativosComPercentuais.map((a) => ({ percentual: a.percentualCarteira })),
    );
    adjusted.forEach((adj, i) => {
      ativosComPercentuais[i].percentualCarteira = adj.percentual;
      ativosComPercentuais[i].riscoPorAtivo = adj.percentual;
    });
  }

  type AtivoFundo = (typeof ativosComPercentuais)[number];
  const secoesMap = new Map<
    FundoSubtipo,
    { tipo: FundoSubtipo; nome: string; ativos: AtivoFundo[] }
  >();
  ativosComPercentuais.forEach((ativo) => {
    const tipo = ativo.tipo;
    const current = secoesMap.get(tipo) || {
      tipo,
      nome: FUNDO_SUBTIPO_LABEL[tipo] || tipo,
      ativos: [] as AtivoFundo[],
    };
    current.ativos.push(ativo);
    secoesMap.set(tipo, current);
  });

  // Mostra apenas as seções que têm ao menos um ativo — evita vitrine vazia
  // pra subtipos novos (FIDC, FIP, etc.) enquanto a base de usuários cresce.
  const secoes = FUNDO_SUBTIPO_ORDER.filter(
    (tipo) => tipo === 'fim' || tipo === 'fia' || secoesMap.has(tipo),
  ).map((tipo) => {
    const secao = secoesMap.get(tipo) || {
      tipo,
      nome: FUNDO_SUBTIPO_LABEL[tipo],
      ativos: [] as AtivoFundo[],
    };
    return {
      tipo: secao.tipo,
      nome: secao.nome,
      ativos: secao.ativos,
      totalValorAplicado: secao.ativos.reduce(
        (sum: number, ativo: AtivoFundo) => sum + ativo.valorInicialAplicado,
        0,
      ),
      totalAporte: secao.ativos.reduce((sum: number, ativo: AtivoFundo) => sum + ativo.aporte, 0),
      totalResgate: secao.ativos.reduce((sum: number, ativo: AtivoFundo) => sum + ativo.resgate, 0),
      totalValorAtualizado: secao.ativos.reduce(
        (sum: number, ativo: AtivoFundo) => sum + ativo.valorAtualizado,
        0,
      ),
      totalPercentualCarteira:
        totalCarteira > 0
          ? (secao.ativos.reduce(
              (sum: number, ativo: AtivoFundo) => sum + ativo.valorAtualizado,
              0,
            ) /
              totalCarteira) *
            100
          : 0,
      totalRisco: secao.ativos.reduce(
        (sum: number, ativo: AtivoFundo) => sum + ativo.riscoPorAtivo,
        0,
      ),
      totalObjetivo: 0,
      totalQuantoFalta: 0,
      totalNecessidadeAporte: 0,
      rentabilidadeMedia:
        secao.ativos.length > 0
          ? secao.ativos.reduce((sum: number, ativo: AtivoFundo) => sum + ativo.rentabilidade, 0) /
            secao.ativos.length
          : 0,
    };
  });

  const totalValorAplicado = ativosComPercentuais.reduce(
    (sum, ativo) => sum + ativo.valorInicialAplicado,
    0,
  );
  const totalValorAtualizado = ativosComPercentuais.reduce(
    (sum, ativo) => sum + ativo.valorAtualizado,
    0,
  );
  const totalResgate = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.resgate, 0);
  const totalAporte = ativosComPercentuais.reduce((sum, ativo) => sum + ativo.aporte, 0);
  const valorAtualizadoComCaixa = totalValorAtualizado + caixaParaInvestir;
  const rentabilidade =
    totalValorAplicado > 0
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
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const body = await request.json();
  const { ativoId, objetivo: _objetivo, cotacao: _cotacao, caixaParaInvestir, campo, valor } = body;

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
      // Fundo com cota CVM sincronizada (Asset.currentPrice) — bloquear sobrescrita manual.
      const cvmPrice = portfolio.asset?.currentPrice?.toNumber() ?? 0;
      if (cvmPrice > 0) {
        return NextResponse.json(
          {
            error:
              'Valor atualizado deste fundo é sincronizado automaticamente pela cota CVM e não pode ser editado.',
          },
          { status: 400 },
        );
      }
      const numValor = typeof valor === 'number' ? valor : parseFloat(valor as string);
      if (!Number.isFinite(numValor) || numValor < 0) {
        return NextResponse.json(
          { error: 'Valor atualizado deve ser um número maior ou igual a zero' },
          { status: 400 },
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
      return NextResponse.json(
        {
          error: 'Caixa para investir deve ser um valor igual ou maior que zero',
        },
        { status: 400 },
      );
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
