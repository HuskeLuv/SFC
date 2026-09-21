import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { round2 } from '@/utils/alocacaoPercents';
import { getIndicator } from '@/services/market/marketIndicatorService';
import {
  creditarCaixa,
  invalidateCaixaCaches,
  loadCaixaResumo,
  type MovimentoCaixa,
} from '@/services/portfolio/caixaParaInvestir';
import {
  buildCaixaMovimentoSnapshot,
  diffFields,
  recordChange,
  RESUMO_FIELD_LABELS,
} from '@/services/changeHistory';

/**
 * Proventos → Caixa para Investir (fase 3, decisão 21/09/2026):
 *
 *   - opcional, por usuário (`User.caixaProventosDesde`, null = desligado);
 *   - NÃO retroativo: ligar grava o dia de hoje e só entram proventos com
 *     `dataPagamento` a partir dele (os antigos o usuário já gastou/reinvestiu);
 *   - o dinheiro entra no caixa LIVRE (só o total sobe, como no resgate);
 *   - valor LÍQUIDO (bruto − IR retido do JCP); provento em dólar entra em
 *     reais pela cotação USD-BRL do dia do crédito;
 *   - cada provento é creditado UMA vez (`caixaCreditadoEm`). Editar ou excluir
 *     o provento depois não mexe no caixa — o dinheiro já foi recebido.
 *
 * Roda no fim do cron diário de dividendos (depois da materialização dos
 * PortfolioProvento). Não interage com o Fluxo de Caixa.
 */

/** Hoje no fuso de Brasília, como meia-noite UTC (mesma convenção de `dataPagamento`). */
export function hojeBrasilUtc(agora: Date = new Date()): Date {
  const [ano, mes, dia] = agora
    .toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    .split('-')
    .map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Liga (a partir de hoje) ou desliga. Religar recomeça de hoje — nunca retroage. */
export async function definirCaixaProventos(userId: string, ativo: boolean): Promise<Date | null> {
  const desde = ativo ? hojeBrasilUtc() : null;
  await prisma.user.update({ where: { id: userId }, data: { caixaProventosDesde: desde } });
  invalidateCaixaCaches(userId);
  return desde;
}

export async function lerCaixaProventosDesde(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { caixaProventosDesde: true },
  });
  return user?.caixaProventosDesde ?? null;
}

export interface CreditoProventosUsuario {
  userId: string;
  proventos: number;
  valor: number;
  movimento: MovimentoCaixa;
}

type CambioFn = () => Promise<number | null>;

/** Cotação USD-BRL buscada no máximo uma vez por execução. */
function cambioPreguicoso(): CambioFn {
  let cache: Promise<number | null> | null = null;
  return () => {
    cache ??= getIndicator('USD-BRL', { useBrapiFallback: true })
      .then((ind) => (ind?.price && ind.price > 0 ? ind.price : null))
      .catch(() => null);
    return cache;
  };
}

/**
 * Credita no caixa os proventos pagos (dataPagamento ≤ hoje) de quem ligou a
 * opção. Idempotente: o que já foi creditado fica marcado. `request` só serve
 * ao registro no histórico (IP/user-agent do cron).
 */
export async function creditarProventosNoCaixa(
  opts: { request?: NextRequest; hoje?: Date; userIds?: string[] } = {},
): Promise<CreditoProventosUsuario[]> {
  const hoje = opts.hoje ?? hojeBrasilUtc();
  const cambio = cambioPreguicoso();

  const usuarios = await prisma.user.findMany({
    where: {
      caixaProventosDesde: { not: null, lte: hoje },
      ...(opts.userIds ? { id: { in: opts.userIds } } : {}),
    },
    select: { id: true, caixaProventosDesde: true },
  });

  const resultados: CreditoProventosUsuario[] = [];
  for (const usuario of usuarios) {
    try {
      const r = await creditarUsuario(usuario.id, usuario.caixaProventosDesde!, hoje, cambio);
      if (r) resultados.push(r);
    } catch (err) {
      logger.error(`[caixaProventos] falha ao creditar proventos de ${usuario.id}:`, err);
    }
  }

  if (opts.request) {
    for (const r of resultados) {
      await registrarNoHistorico(opts.request, r);
    }
  }
  return resultados;
}

async function creditarUsuario(
  userId: string,
  desde: Date,
  hoje: Date,
  cambio: CambioFn,
): Promise<CreditoProventosUsuario | null> {
  const pendentes = await prisma.portfolioProvento.findMany({
    where: {
      userId,
      dismissed: false,
      caixaCreditadoEm: null,
      dataPagamento: { gte: desde, lte: hoje },
    },
    select: {
      id: true,
      valorTotal: true,
      impostoRenda: true,
      portfolio: { select: { asset: { select: { currency: true } } } },
    },
  });
  if (pendentes.length === 0) return null;

  // Valor em R$ de cada provento; moeda sem câmbio (ou dólar sem cotação hoje)
  // fica pendente para a próxima execução.
  const creditos: Array<{ id: string; valor: number }> = [];
  for (const p of pendentes) {
    const liquido = Math.max(0, p.valorTotal - (p.impostoRenda ?? 0));
    const moeda = p.portfolio?.asset?.currency ?? 'BRL';
    if (moeda === 'BRL') {
      creditos.push({ id: p.id, valor: round2(liquido) });
    } else if (moeda === 'USD') {
      const taxa = await cambio();
      if (taxa) creditos.push({ id: p.id, valor: round2(liquido * taxa) });
    }
  }
  if (creditos.length === 0) return null;

  const agora = new Date();
  const resultado = await prisma.$transaction(async (tx) => {
    // Marca primeiro, com guarda: se outra execução já marcou, não credita de novo.
    let soma = 0;
    let marcados = 0;
    for (const c of creditos) {
      const { count } = await tx.portfolioProvento.updateMany({
        where: { id: c.id, caixaCreditadoEm: null },
        data: { caixaCreditadoEm: agora, caixaCreditadoValor: c.valor },
      });
      if (count === 1) {
        soma += c.valor;
        marcados += 1;
      }
    }
    if (marcados === 0) return null;
    const movimento = await creditarCaixa(tx, userId, round2(soma));
    return { userId, proventos: marcados, valor: round2(soma), movimento };
  });

  if (resultado) invalidateCaixaCaches(userId);
  return resultado;
}

async function registrarNoHistorico(request: NextRequest, r: CreditoProventosUsuario) {
  const depois = await loadCaixaResumo(r.userId);
  await recordChange({
    request,
    auth: { payload: { id: r.userId }, targetUserId: r.userId, actingClient: null },
    section: 'carteira',
    action: 'caixa-investir.proventos',
    entity: 'caixa-investir',
    entityId: 'proventos',
    entityLabel: r.proventos === 1 ? '1 provento' : `${r.proventos} proventos`,
    changes: diffFields(
      { caixaParaInvestir: round2(depois.total - r.movimento.deltaTotal) },
      { caixaParaInvestir: depois.total },
      RESUMO_FIELD_LABELS,
    ),
    snapshot: buildCaixaMovimentoSnapshot(r.movimento),
  });
}
