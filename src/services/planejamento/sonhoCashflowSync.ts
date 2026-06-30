import { prisma } from '@/lib/prisma';
import { personalizeGroup } from '@/utils/cashflowPersonalization';
import { addMonths, pmt } from './planejamentoSonhos';
import { REALIZADO_COLOR } from './cashflowToSonhoSync';

/**
 * Sincroniza um objetivo do Planejamento de Sonhos com a linha espelho no fluxo
 * de caixa (grupo "Planejamento Financeiro"). O sonho é a FONTE: o aporte mensal
 * necessário (pmt) vira o valor dos meses da JANELA do sonho (`startDate` →
 * `startDate + months`), que pode atravessar vários anos. A linha é
 * somente-leitura no fluxo de caixa (vínculo via CashflowItem.objetivoId).
 */

const PLANEJAMENTO_GROUP_NAME = 'Planejamento Financeiro';

export interface ObjetivoForSync {
  id: string;
  name: string;
  target: number;
  available: number;
  months: number;
  rate: number;
  startDate: string | null; // YYYY-MM — início da janela de aportes
}

/** Resolve (personalizando se preciso) o grupo "Planejamento Financeiro" do usuário. */
async function resolvePlanejamentoGroupId(userId: string): Promise<string | null> {
  const own = await prisma.cashflowGroup.findFirst({
    where: { userId, name: PLANEJAMENTO_GROUP_NAME },
    select: { id: true },
  });
  if (own) return own.id;

  const template = await prisma.cashflowGroup.findFirst({
    where: { userId: null, name: PLANEJAMENTO_GROUP_NAME },
    select: { id: true },
  });
  if (!template) return null;
  return personalizeGroup(template.id, userId);
}

/** YYYY-MM → { year, month0 } (month0 = 0-based). */
function ymToYearMonth0(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m - 1 };
}

/**
 * Cria/atualiza a linha do fluxo de caixa que espelha o sonho. Escreve o aporte
 * mensal (pmt) nos meses da janela (`startDate` por `months` meses, atravessando
 * anos); se o aporte é 0 (meta não definida), apenas garante a linha existir.
 *
 * Preserva as células já REALIZADAS (vermelhas/"Pago") — derivadas pelo sync
 * reverso — e remove o planejado órfão de qualquer ano (ex.: quando `startDate`
 * ou `months` mudam e a janela se desloca).
 */
export async function syncObjetivoToCashflow(
  userId: string,
  objetivo: ObjetivoForSync,
): Promise<void> {
  const aporte = Math.round(pmt(objetivo) * 100) / 100;

  let item = await prisma.cashflowItem.findUnique({ where: { objetivoId: objetivo.id } });
  if (!item) {
    const groupId = await resolvePlanejamentoGroupId(userId);
    if (!groupId) return; // template ausente — nada a espelhar
    item = await prisma.cashflowItem.create({
      data: { userId, groupId, name: objetivo.name, rank: 'normal', objetivoId: objetivo.id },
    });
  } else if (item.name !== objetivo.name) {
    item = await prisma.cashflowItem.update({
      where: { id: item.id },
      data: { name: objetivo.name },
    });
  }

  // Janela de aportes: `months` meses a partir de startDate (YYYY-MM), podendo
  // atravessar anos. Sem startDate (legado), começa em janeiro do ano corrente.
  const start = objetivo.startDate ?? `${new Date().getFullYear()}-01`;
  const janela = Array.from({ length: Math.max(0, objetivo.months) }, (_, i) =>
    ymToYearMonth0(addMonths(start, i)),
  );

  // Meses já REALIZADOS (vermelho) — preservados em qualquer ano.
  const realized = await prisma.cashflowValue.findMany({
    where: { itemId: item.id, userId, color: REALIZADO_COLOR },
    select: { year: true, month: true },
  });
  const realizedKey = new Set(realized.map((v) => `${v.year}-${v.month}`));

  // Remove o planejado (não-realizado) de QUALQUER ano — limpa planejado órfão
  // fora da janela atual. Preserva os realizados (vermelhos).
  await prisma.cashflowValue.deleteMany({
    where: {
      itemId: item.id,
      userId,
      OR: [{ color: null }, { color: { not: REALIZADO_COLOR } }],
    },
  });

  // Reescreve o aporte planejado na janela, exceto nos meses já realizados.
  if (aporte > 0) {
    const toCreate = janela.filter((w) => !realizedKey.has(`${w.year}-${w.month}`));
    if (toCreate.length > 0) {
      await prisma.cashflowValue.createMany({
        data: toCreate.map((w) => ({
          itemId: item!.id,
          userId,
          year: w.year,
          month: w.month,
          value: aporte,
        })),
        skipDuplicates: true,
      });
    }
  }
}

/** Remove a linha do fluxo de caixa vinculada a um sonho (valores + item). */
export async function removeObjetivoCashflow(objetivoId: string): Promise<void> {
  const item = await prisma.cashflowItem.findUnique({
    where: { objetivoId },
    select: { id: true },
  });
  if (!item) return;
  await prisma.cashflowValue.deleteMany({ where: { itemId: item.id } });
  await prisma.cashflowItem.delete({ where: { id: item.id } });
}
