import { NextRequest, NextResponse } from 'next/server';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';
import { isReinvestimentoTransaction } from '@/services/portfolio/patrimonioHistoricoBuilder';
import { categoriaEfetiva, isReservaAsset } from '@/services/portfolio/itemValuation';
import { reservaDestinoPorAsset } from '@/services/portfolio/tesouroDestino';
import { unidadeDaTransacao } from '@/lib/ativoEmDolar';
import { fxDaTransacao } from '@/services/market/cambioUsdBrl';
import { carregarCambioDasTransacoes } from '@/services/cashflow/investimentosPorMes';

/**
 * Movimentações (compras/vendas) do período para a seção de Relatórios
 * (ticket 20/08/2026, formato inspirado no extrato dos relatórios
 * Gorila/Kinvo). Read-only; `start`/`end` em ISO (yyyy-mm-dd), inclusivos.
 * Limite de 500 linhas (relatório é resumo, não dump — o total vem em
 * `totalNoPeriodo` para o caller sinalizar truncamento).
 *
 * `categoria` é a categoria EFETIVA (categoriaEfetiva: aba escolhida no mover,
 * reserva do Tesouro de catálogo, Imóveis & Bens) — a mesma régua da pizza e
 * das abas. `tipoAtivo` (Asset.type cru) fica só por compatibilidade.
 *
 * Moeda por linha (Carteira EUA em US$): `moeda` é a unidade gravada da transação
 * (`unidadeDaTransacao`). Em US$, `totalMoeda` = total em US$ (sem taxas), `cotacaoMoeda`
 * = câmbio da operação (ou da série USD-BRL na data) e `valorBRL` = total × câmbio + fees
 * (R$). `total` continua sendo o valor em R$ (é o que o resumo do período soma); linha em
 * US$ sem câmbio tem `valorBRL` null e `total` 0 — fora da soma, nunca US$ como R$.
 */

const MAX_LINHAS = 500;

const parseIsoDate = (value: string | null): Date | null => {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { targetUserId } = await requireAuthWithActing(request);
  const { searchParams } = new URL(request.url);

  const start = parseIsoDate(searchParams.get('start'));
  const endDay = parseIsoDate(searchParams.get('end'));
  // end inclusivo: soma 1 dia e usa lt.
  const end = endDay ? new Date(endDay.getTime() + 24 * 60 * 60 * 1000) : null;

  const where = {
    userId: targetUserId,
    type: { in: ['compra', 'venda'] },
    ...(start || end
      ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
      : {}),
  };

  const [totalNoPeriodo, transacoes] = await Promise.all([
    prisma.stockTransaction.count({ where }),
    prisma.stockTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: MAX_LINHAS,
      select: {
        id: true,
        date: true,
        type: true,
        quantity: true,
        price: true,
        total: true,
        fees: true,
        notes: true,
        assetId: true,
        asset: { select: { symbol: true, name: true, type: true, currency: true } },
      },
    }),
  ]);

  // Override do mover (Portfolio.categoriaOverride) e reserva do Tesouro de
  // catálogo, só dos ativos que aparecem na página.
  const assetIds = [
    ...new Set(transacoes.map((t) => t.assetId).filter((id): id is string => !!id)),
  ];
  const tesouroIds = [
    ...new Set(
      transacoes
        .filter((t) => t.assetId && t.asset?.type === 'tesouro-direto')
        .map((t) => t.assetId as string),
    ),
  ];
  const [posicoes, reservaDestino] = await Promise.all([
    assetIds.length > 0
      ? prisma.portfolio.findMany({
          where: { userId: targetUserId, assetId: { in: assetIds } },
          select: { assetId: true, categoriaOverride: true },
        })
      : Promise.resolve([]),
    tesouroIds.length > 0
      ? reservaDestinoPorAsset(targetUserId, tesouroIds)
      : Promise.resolve(new Map<string, 'emergencia' | 'oportunidade'>()),
  ]);
  const overridePorAsset = new Map(
    posicoes.filter((p) => p.assetId).map((p) => [p.assetId as string, p.categoriaOverride]),
  );

  const categoriaDe = (t: (typeof transacoes)[number]) => {
    if (!t.asset) return null;
    const destino = t.assetId ? reservaDestino.get(t.assetId) : undefined;
    return categoriaEfetiva(t.asset, t.assetId ? overridePorAsset.get(t.assetId) : null, {
      isReserva: isReservaAsset(t.asset, destino),
      tesouroReservaDestino: destino,
    });
  };

  const serieCambio = await carregarCambioDasTransacoes(transacoes);
  const valoresDe = (t: (typeof transacoes)[number]) => {
    const fees = t.fees || 0;
    if (unidadeDaTransacao(t, t.asset) !== 'USD') {
      const valorBRL = Math.round((t.total + fees) * 100) / 100;
      return {
        moeda: 'BRL' as const,
        totalMoeda: valorBRL,
        cotacaoMoeda: null,
        valorBRL,
        total: valorBRL,
      };
    }
    const fx = fxDaTransacao(t.notes, t.date, serieCambio);
    const valorBRL = fx == null ? null : Math.round((t.total * fx + fees) * 100) / 100;
    return {
      moeda: 'USD' as const,
      totalMoeda: Math.round(t.total * 100) / 100,
      cotacaoMoeda: fx,
      valorBRL,
      total: valorBRL ?? 0,
    };
  };

  const movimentacoes = transacoes.map((t) => ({
    id: t.id,
    data: t.date.toISOString().slice(0, 10),
    operacao: t.type,
    ativo: t.asset?.name || t.asset?.symbol || '—',
    symbol: t.asset?.symbol ?? null,
    tipoAtivo: t.asset?.type ?? null,
    categoria: categoriaDe(t),
    quantidade: t.quantity,
    preco: t.price,
    ...valoresDe(t),
    // Flag "dinheiro já estava investido" (rolagem/troca/posição pré-existente)
    jaInvestido: isReinvestimentoTransaction(t.notes),
  }));

  return NextResponse.json({ movimentacoes, totalNoPeriodo, limite: MAX_LINHAS });
});
