import prisma from '@/lib/prisma';
import { deleteTtlCacheKeyPrefix } from '@/lib/simpleTtlCache';
import { round2 } from '@/utils/alocacaoPercents';

/**
 * Caixa para Investir — modelo "bolso total com reservas por aba" (decisão de
 * produto 17/09/2026):
 *
 *   - `caixa_para_investir_consolidado` é o BOLSO TOTAL (todo o dinheiro parado
 *     esperando investimento);
 *   - cada `caixa_para_investir_<aba>` é uma RESERVA dentro desse bolso
 *     (dinheiro já destinado àquela classe);
 *   - LIVRE = total − Σ reservas.
 *
 * Invariante: Σ reservas ≤ total. É garantida na ESCRITA (salvarCaixa*); a
 * LEITURA é defensiva (dado legado ou undo podem deixar Σ reservas > total):
 * `bolso` = max(total, reservado) é o número que entra nos totais do
 * patrimônio, contado UMA vez.
 *
 * Não interage com o Fluxo de Caixa — abastecer ou gastar o caixa não gera
 * linha de Aporte/Resgate.
 */
import {
  CAIXA_ABAS,
  CAIXA_CONSOLIDADO_METRIC,
  CAIXA_METRICS,
  CATEGORIA_TO_CAIXA_ABA,
  computeCaixaResumo,
  planejarDebito,
  type CaixaAbaKey,
  type CaixaResumo,
  type MovimentoCaixa,
} from '@/lib/caixaParaInvestirPlano';
import { categorizarAsset } from '@/services/portfolio/itemValuation';
import { getTesouroDestinoByAssetId } from '@/services/portfolio/tesouroDestino';

// Definições e contas puras vivem em lib/caixaParaInvestirPlano (a tela usa as
// mesmas); reexportadas aqui para os chamadores de servidor.
export {
  CAIXA_ABAS,
  CAIXA_ABA_KEYS,
  CAIXA_CONSOLIDADO_METRIC,
  CAIXA_METRICS,
  CATEGORIA_TO_CAIXA_ABA,
  computeCaixaResumo,
  movimentouCaixa,
  planejarDebito,
} from '@/lib/caixaParaInvestirPlano';
export type {
  CaixaAbaKey,
  CaixaResumo,
  MovimentoCaixa,
  PlanoDebito,
} from '@/lib/caixaParaInvestirPlano';

type CaixaDb = Pick<typeof prisma, 'dashboardData'>;

export async function loadCaixaResumo(userId: string, db: CaixaDb = prisma): Promise<CaixaResumo> {
  const rows = await db.dashboardData.findMany({
    where: { userId, metric: { in: [...CAIXA_METRICS] } },
    select: { metric: true, value: true },
  });
  return computeCaixaResumo(rows);
}

/** Grava a métrica e devolve o valor anterior — `null` quando a row não existia (locator do undo). */
async function upsertMetric(
  db: CaixaDb,
  userId: string,
  metric: string,
  value: number,
): Promise<number | null> {
  const existing = await db.dashboardData.findFirst({ where: { userId, metric } });
  if (existing) {
    // Lê o anterior ANTES de gravar: é o número que o Desfazer restaura.
    const anterior = existing.value ?? 0;
    await db.dashboardData.update({ where: { id: existing.id }, data: { value } });
    return anterior;
  }
  await db.dashboardData.create({ data: { userId, metric, value } });
  return null;
}

export type SalvarCaixaErro =
  | {
      ok: false;
      code: 'RESERVA_EXCEDE_TOTAL';
      /** Bolso total atual. */
      total: number;
      /** Σ das reservas das OUTRAS abas. */
      reservadoOutrasAbas: number;
      /** Máximo que esta aba pode reservar sem mexer no total. */
      maximoAba: number;
      /** Total necessário para caber a reserva pedida. */
      totalNecessario: number;
    }
  | {
      ok: false;
      code: 'TOTAL_ABAIXO_DAS_RESERVAS';
      reservado: number;
    };

export type SalvarCaixaAbaOk = {
  ok: true;
  /** `null` = a métrica ainda não existia. */
  valorAnterior: number | null;
  /** Preenchido quando `ajustarTotal` subiu o bolso total junto. */
  totalAjustado?: { anterior: number | null; novo: number };
};

/**
 * Grava a reserva de uma aba. Se a nova Σ reservas passar do bolso total:
 * devolve RESERVA_EXCEDE_TOTAL — ou, com `ajustarTotal`, sobe o total até caber.
 */
export async function salvarCaixaAba(
  userId: string,
  aba: CaixaAbaKey,
  valor: number,
  opts: { ajustarTotal?: boolean } = {},
): Promise<SalvarCaixaAbaOk | SalvarCaixaErro> {
  const result = await prisma.$transaction(async (tx) => {
    const atual = await loadCaixaResumo(userId, tx);
    const valorAnterior = atual.porAba[aba];
    const reservadoOutrasAbas = round2(atual.reservado - valorAnterior);
    const totalNecessario = round2(reservadoOutrasAbas + valor);

    // Reduzir a reserva nunca quebra a invariante — sempre permitido, mesmo
    // com dado legado inconsistente (é justamente o caminho pra consertar).
    const excede = valor > valorAnterior && totalNecessario > atual.total;
    if (excede && !opts.ajustarTotal) {
      return {
        ok: false as const,
        code: 'RESERVA_EXCEDE_TOTAL' as const,
        total: atual.total,
        reservadoOutrasAbas,
        maximoAba: round2(Math.max(0, atual.total - reservadoOutrasAbas)),
        totalNecessario,
      };
    }

    const anterior = await upsertMetric(tx, userId, CAIXA_ABAS[aba].metric, valor);
    if (excede) {
      const totalAnterior = await upsertMetric(
        tx,
        userId,
        CAIXA_CONSOLIDADO_METRIC,
        totalNecessario,
      );
      return {
        ok: true as const,
        valorAnterior: anterior,
        totalAjustado: { anterior: totalAnterior, novo: totalNecessario },
      };
    }
    return { ok: true as const, valorAnterior: anterior };
  });

  if (result.ok) invalidateCaixaCaches(userId);
  return result;
}

/** Grava o bolso total. Não pode ficar abaixo do que já está reservado nas abas. */
export async function salvarCaixaTotal(
  userId: string,
  valor: number,
): Promise<{ ok: true; valorAnterior: number | null } | SalvarCaixaErro> {
  const result = await prisma.$transaction(async (tx) => {
    const atual = await loadCaixaResumo(userId, tx);
    if (valor < atual.reservado && valor < atual.total) {
      return {
        ok: false as const,
        code: 'TOTAL_ABAIXO_DAS_RESERVAS' as const,
        reservado: atual.reservado,
      };
    }
    const anterior = await upsertMetric(tx, userId, CAIXA_CONSOLIDADO_METRIC, valor);
    return { ok: true as const, valorAnterior: anterior };
  });

  if (result.ok) invalidateCaixaCaches(userId);
  return result;
}

/** O resumo da carteira é cacheado (TTL) e embute os números do caixa. */
export function invalidateCaixaCaches(userId: string): void {
  deleteTtlCacheKeyPrefix('carteiraResumo', `${userId}:`);
}

// ── Movimento do caixa nas operações (aporte/compra/resgate) ─────────────────

type AssetParaCaixa = {
  id?: string | null;
  symbol?: string | null;
  type?: string | null;
  currency?: string | null;
  name?: string | null;
} | null;

/**
 * Aba do caixa de um ativo JÁ resolvido no servidor (mesma classificação da
 * carteira, `categorizarAsset`). `null` = sem reserva própria (reservas de
 * emergência/oportunidade, conta corrente, imóveis e bens): a operação só usa
 * o caixa livre. Tesouro comprado para uma reserva é reserva.
 */
export async function resolverCaixaAba(
  userId: string,
  asset: AssetParaCaixa,
  ctx: { tesouroDestino?: string | null } = {},
): Promise<CaixaAbaKey | null> {
  if (!asset) return null;
  let destino = ctx.tesouroDestino ?? null;
  if (!destino && asset.type === 'tesouro-direto' && asset.id) {
    destino = (await getTesouroDestinoByAssetId(userId, [asset.id])).get(asset.id) ?? null;
  }
  const tesouroReservaDestino =
    destino === 'reserva-emergencia'
      ? ('emergencia' as const)
      : destino === 'reserva-oportunidade'
        ? ('oportunidade' as const)
        : undefined;
  const categoria = categorizarAsset(
    { symbol: asset.symbol ?? '', type: asset.type, currency: asset.currency, name: asset.name },
    { isReserva: tesouroReservaDestino !== undefined, tesouroReservaDestino },
  );
  return CATEGORIA_TO_CAIXA_ABA[categoria];
}

/**
 * Desconta um investimento de `valor` (R$) do caixa: reserva da aba primeiro,
 * depois o livre (ver `planejarDebito`). Nunca bloqueia: se faltar caixa,
 * desconta só o que existe. Rodar DENTRO da transação da operação.
 */
export async function debitarCaixa(
  db: CaixaDb,
  userId: string,
  aba: CaixaAbaKey | null,
  valor: number,
): Promise<MovimentoCaixa> {
  const atual = await loadCaixaResumo(userId, db);
  const plano = planejarDebito(atual, aba, valor);

  if (aba && plano.daReserva > 0) {
    await upsertMetric(
      db,
      userId,
      CAIXA_ABAS[aba].metric,
      round2(atual.porAba[aba] - plano.daReserva),
    );
  }
  const novoTotal = round2(Math.max(0, atual.total - plano.coberto));
  if (novoTotal !== atual.total) {
    await upsertMetric(db, userId, CAIXA_CONSOLIDADO_METRIC, novoTotal);
  }

  return {
    aba,
    valorOperacao: round2(Math.max(0, valor)),
    debitoReserva: plano.daReserva,
    debitoLivre: plano.doLivre,
    credito: 0,
    deltaTotal: round2(novoTotal - atual.total),
  };
}

/** Devolve o valor de um resgate ao caixa, como livre. Rodar DENTRO da transação. */
export async function creditarCaixa(
  db: CaixaDb,
  userId: string,
  valor: number,
): Promise<MovimentoCaixa> {
  const credito = round2(Math.max(0, valor));
  if (credito > 0) {
    const atual = await loadCaixaResumo(userId, db);
    await upsertMetric(db, userId, CAIXA_CONSOLIDADO_METRIC, round2(atual.total + credito));
  }
  return {
    aba: null,
    valorOperacao: credito,
    debitoReserva: 0,
    debitoLivre: 0,
    credito,
    deltaTotal: credito,
  };
}

/**
 * Desfazer da operação: devolve à reserva o que saiu dela e desfaz a mudança
 * do total. Se o usuário mexeu no caixa depois, o resultado pode deixar as
 * reservas acima do total — o card avisa e o total não fica negativo.
 */
export async function reverterMovimentoCaixa(userId: string, mov: MovimentoCaixa): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const atual = await loadCaixaResumo(userId, tx);
    if (mov.aba && mov.debitoReserva > 0) {
      await upsertMetric(
        tx,
        userId,
        CAIXA_ABAS[mov.aba].metric,
        round2(atual.porAba[mov.aba] + mov.debitoReserva),
      );
    }
    if (mov.deltaTotal !== 0) {
      await upsertMetric(
        tx,
        userId,
        CAIXA_CONSOLIDADO_METRIC,
        round2(Math.max(0, atual.total - mov.deltaTotal)),
      );
    }
  });
  invalidateCaixaCaches(userId);
}
