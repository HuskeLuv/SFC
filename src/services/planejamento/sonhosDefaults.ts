import { prisma } from '@/lib/prisma';
import { categoryFromMonths, type Priority } from './planejamentoSonhos';
import { syncObjetivoToCashflow } from './sonhoCashflowSync';

/**
 * 6 sonhos padrão provisionados no 1º acesso ao Planejamento de Sonhos.
 *
 * Nascem como placeholders (meta 0, "Em espera", aporte 0): aparecem tanto no
 * planejamento quanto na linha espelho do fluxo de caixa, e só comprometem
 * caixa quando o usuário define meta + prazo. Não presumimos valores.
 */
export interface SonhoDefault {
  name: string;
  months: number;
  priority: Priority;
}

export const DEFAULT_SONHOS: SonhoDefault[] = [
  { name: 'Reserva de Emergência', months: 12, priority: 'Alta' },
  { name: 'Viagem dos Sonhos', months: 24, priority: 'Moderado' },
  { name: 'Troca de Carro', months: 36, priority: 'Moderado' },
  { name: 'Casa Própria (entrada)', months: 120, priority: 'Moderado' },
  { name: 'Educação dos Filhos', months: 180, priority: 'Baixa' },
  { name: 'Projeto Pessoal', months: 24, priority: 'Baixa' },
];

/** Métrica-flag (DashboardData) que marca que o provisionamento já rodou. */
export const SONHOS_PROVISIONED_METRIC = 'sonhos_default_provisioned';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Provisiona os 6 sonhos padrão para o usuário (idempotente). Não faz nada se:
 * (a) já provisionou antes (flag), ou (b) o usuário já tem objetivos próprios —
 * nesse caso só marca a flag para não tentar de novo (respeita deleções).
 */
export async function provisionDefaultSonhos(userId: string): Promise<void> {
  const flag = await prisma.dashboardData.findFirst({
    where: { userId, metric: SONHOS_PROVISIONED_METRIC },
    select: { id: true },
  });
  if (flag) return;

  const existing = await prisma.planejamentoObjetivo.count({ where: { userId } });
  if (existing > 0) {
    await prisma.dashboardData.create({
      data: { userId, metric: SONHOS_PROVISIONED_METRIC, value: 1 },
    });
    return;
  }

  const startDate = currentYearMonth();
  for (const sonho of DEFAULT_SONHOS) {
    const created = await prisma.planejamentoObjetivo.create({
      data: {
        userId,
        name: sonho.name,
        target: 0,
        months: sonho.months,
        startDate,
        available: 0,
        rate: 0,
        priority: sonho.priority,
        category: categoryFromMonths(sonho.months),
        status: 'Em espera',
        notes: null,
      },
    });
    await syncObjetivoToCashflow(userId, {
      id: created.id,
      name: created.name,
      target: 0,
      available: 0,
      months: created.months,
      rate: 0,
      startDate: created.startDate,
      status: created.status,
    });
  }

  await prisma.dashboardData.create({
    data: { userId, metric: SONHOS_PROVISIONED_METRIC, value: 1 },
  });
}
