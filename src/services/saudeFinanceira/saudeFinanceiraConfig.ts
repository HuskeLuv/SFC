/**
 * Persistência dos parâmetros personalizáveis da Saúde Financeira.
 *
 * Reusa o key-value DashboardData (metric/value por user) — mesmo lugar de
 * meta_patrimonio e caixa_para_investir_* — então não há migração: ausência
 * de linha = default da metodologia (DEFAULT_SAUDE_CONFIG).
 */

import { prisma } from '@/lib/prisma';
import { DEFAULT_SAUDE_CONFIG, type SaudeFinanceiraConfig } from './indicadores';

export const SAUDE_CONFIG_METRICS: Record<keyof SaudeFinanceiraConfig, string> = {
  multReserva: 'saude_financeira_mult_reserva',
  multSeguranca: 'saude_financeira_mult_seguranca',
  fatorIdeal: 'saude_financeira_fator_ideal',
  coberturaMinimaMeses: 'saude_financeira_cobertura_minima',
};

/** Faixas sanas por parâmetro — valor fora da faixa é ignorado (default). */
const RANGES: Record<keyof SaudeFinanceiraConfig, [number, number]> = {
  multReserva: [1, 24],
  multSeguranca: [1, 60],
  fatorIdeal: [0.01, 1],
  coberturaMinimaMeses: [1, 24],
};

const isValid = (key: keyof SaudeFinanceiraConfig, value: number): boolean => {
  const [min, max] = RANGES[key];
  return Number.isFinite(value) && value >= min && value <= max;
};

/** Config efetiva do user: overrides válidos por cima dos defaults. */
export async function getSaudeConfig(userId: string): Promise<SaudeFinanceiraConfig> {
  const rows = await prisma.dashboardData.findMany({
    where: { userId, metric: { in: Object.values(SAUDE_CONFIG_METRICS) } },
    select: { metric: true, value: true },
  });
  const byMetric = new Map(rows.map((r) => [r.metric, r.value]));

  const config = { ...DEFAULT_SAUDE_CONFIG };
  for (const key of Object.keys(SAUDE_CONFIG_METRICS) as (keyof SaudeFinanceiraConfig)[]) {
    const value = byMetric.get(SAUDE_CONFIG_METRICS[key]);
    if (value != null && isValid(key, value)) {
      config[key] = value;
    }
  }
  return config;
}

/**
 * Upsert dos parâmetros informados (parcial). Valor igual ao default REMOVE a
 * linha — voltar ao padrão não deixa override fantasma pra sempre.
 */
export async function saveSaudeConfig(
  userId: string,
  partial: Partial<SaudeFinanceiraConfig>,
): Promise<SaudeFinanceiraConfig> {
  for (const key of Object.keys(SAUDE_CONFIG_METRICS) as (keyof SaudeFinanceiraConfig)[]) {
    const value = partial[key];
    if (value == null) continue;
    const metric = SAUDE_CONFIG_METRICS[key];
    const existing = await prisma.dashboardData.findFirst({ where: { userId, metric } });

    if (value === DEFAULT_SAUDE_CONFIG[key]) {
      if (existing) await prisma.dashboardData.delete({ where: { id: existing.id } });
      continue;
    }
    if (existing) {
      await prisma.dashboardData.update({ where: { id: existing.id }, data: { value } });
    } else {
      await prisma.dashboardData.create({ data: { userId, metric, value } });
    }
  }
  return getSaudeConfig(userId);
}
