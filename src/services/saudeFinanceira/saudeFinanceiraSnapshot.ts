/**
 * Saúde Financeira — foto mensal e tendências.
 *
 * O GET /api/saude-financeira grava (lazy, fire-and-forget) um snapshot do
 * mês corrente com o pacote de indicadores; as setas de tendência comparam o
 * diagnóstico live com o snapshot mais recente de um mês ANTERIOR — a
 * semântica de "status em relação ao último teste" da planilha, com o teste
 * virando automático. Sem cron: um mês sem visita fica sem foto (o gráfico
 * liga os pontos existentes).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SaudeFinanceiraIndicadores, StatusSaudeCodigo } from './indicadores';

/** Pacote fechado persistido por mês (novos campos não pedem migração). */
export interface SnapshotData {
  rendaMensal: number;
  gastoMensal: number;
  poupancaMensal: number;
  taxaPoupanca: number | null;
  ativosAltaLiquidez: number;
  ativosBaixaLiquidez: number;
  passivosCurtoPrazo: number;
  passivosLongoPrazo: number;
  patrimonioLiquido: number;
  reservaEmergencia: number;
  mesesCobertura: number | null;
  grauIndependencia: number | null;
  /** Rentabilidade nominal a.a. usada no mês (TWR 12m ou proxy CDI).
   *  Opcional: snapshots gravados antes de ago/2026 não têm o campo. */
  rentabilidadeAA?: number | null;
  status: StatusSaudeCodigo;
}

export type TendenciaDirecao = 'up' | 'down' | 'flat';

/** Chaves comparáveis mês a mês (subset numérico do SnapshotData). */
export const TENDENCIA_KEYS = [
  'rendaMensal',
  'gastoMensal',
  'poupancaMensal',
  'taxaPoupanca',
  'ativosAltaLiquidez',
  'passivosTotal',
  'patrimonioLiquido',
  'mesesCobertura',
  'grauIndependencia',
] as const;
export type TendenciaKey = (typeof TENDENCIA_KEYS)[number];

/** null = sem snapshot anterior (primeiro mês) ou valor incalculável num dos lados. */
export type TendenciasSaude = Record<TendenciaKey, TendenciaDirecao | null>;

export interface EvolucaoPonto {
  year: number;
  /** 0 = janeiro ... 11 = dezembro (padrão CashflowPatrimonioSnapshot). */
  month: number;
  data: SnapshotData;
}

/** Extrai o pacote persistível/comparável do resultado do cálculo. */
export function extractSnapshotData(indicadores: SaudeFinanceiraIndicadores): SnapshotData {
  return {
    rendaMensal: indicadores.fluxo.rendaMensal,
    gastoMensal: indicadores.fluxo.gastoMensal,
    poupancaMensal: indicadores.fluxo.poupancaMensal,
    taxaPoupanca: indicadores.fluxo.taxaPoupanca,
    ativosAltaLiquidez: indicadores.balanco.ativosAltaLiquidez,
    ativosBaixaLiquidez: indicadores.balanco.ativosBaixaLiquidez,
    passivosCurtoPrazo: indicadores.balanco.passivosCurtoPrazo,
    passivosLongoPrazo: indicadores.balanco.passivosLongoPrazo,
    patrimonioLiquido: indicadores.balanco.patrimonioLiquido,
    reservaEmergencia: indicadores.benchmarks.reservaEmergencia.atual,
    mesesCobertura: indicadores.metricas.mesesCobertura,
    grauIndependencia: indicadores.metricas.grauIndependencia,
    rentabilidadeAA: indicadores.economia.rentabilidadeAA,
    status: indicadores.status.codigo,
  };
}

const valorComparavel = (data: SnapshotData, key: TendenciaKey): number | null => {
  if (key === 'passivosTotal') return data.passivosCurtoPrazo + data.passivosLongoPrazo;
  const v = data[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Direção factual da variação (a UI decide se subir é bom ou ruim). Tolerância:
 * variações menores que 0,1% do valor anterior (mínimo 1 centavo) são "flat" —
 * evita seta em ruído de arredondamento/cotação.
 */
export function computeTendencias(
  atual: SnapshotData,
  anterior: SnapshotData | null,
): TendenciasSaude {
  const out = {} as TendenciasSaude;
  for (const key of TENDENCIA_KEYS) {
    if (!anterior) {
      out[key] = null;
      continue;
    }
    const a = valorComparavel(atual, key);
    const b = valorComparavel(anterior, key);
    if (a == null || b == null) {
      out[key] = null;
      continue;
    }
    const tolerancia = Math.max(0.01, Math.abs(b) * 0.001);
    const delta = a - b;
    out[key] = Math.abs(delta) < tolerancia ? 'flat' : delta > 0 ? 'up' : 'down';
  }
  return out;
}

/**
 * Snapshot mais recente de um mês ESTRITAMENTE anterior a `now` — a base das
 * setas. O do próprio mês corrente não serve (compararia o live com ele mesmo).
 */
export async function getSnapshotAnterior(userId: string, now: Date): Promise<SnapshotData | null> {
  const year = now.getFullYear();
  const month = now.getMonth();
  try {
    const row = await prisma.saudeFinanceiraSnapshot.findFirst({
      where: {
        userId,
        OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { data: true },
    });
    return (row?.data as SnapshotData | undefined) ?? null;
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    return null;
  }
}

/** Upsert do mês corrente — cada visita re-carimba a foto do mês. */
export async function upsertSnapshotMesCorrente(
  userId: string,
  data: SnapshotData,
  now: Date,
): Promise<void> {
  const year = now.getFullYear();
  const month = now.getMonth();
  try {
    await prisma.saudeFinanceiraSnapshot.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: { userId, year, month, data: data as unknown as Prisma.InputJsonValue },
      update: { data: data as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
  }
}

/** Série mensal (mais antigo → mais recente), limitada aos últimos `limit` pontos. */
export async function getEvolucao(userId: string, limit = 24): Promise<EvolucaoPonto[]> {
  try {
    const rows = await prisma.saudeFinanceiraSnapshot.findMany({
      where: { userId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit,
      select: { year: true, month: true, data: true },
    });
    return rows.reverse().map((r) => ({
      year: r.year,
      month: r.month,
      data: r.data as unknown as SnapshotData,
    }));
  } catch (error) {
    const prismaError = error as Prisma.PrismaClientKnownRequestError;
    if (prismaError?.code !== 'P2021') throw error;
    return [];
  }
}
