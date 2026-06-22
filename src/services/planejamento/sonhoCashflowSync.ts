import { prisma } from '@/lib/prisma';
import { personalizeGroup } from '@/utils/cashflowPersonalization';
import { pmt } from './planejamentoSonhos';

/**
 * Sincroniza um objetivo do Planejamento de Sonhos com a linha espelho no fluxo
 * de caixa (grupo "Planejamento Financeiro"). O sonho é a FONTE: o aporte mensal
 * necessário (pmt) vira o valor dos 12 meses dessa linha. A linha é
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

/**
 * Cria/atualiza a linha do fluxo de caixa que espelha o sonho. Reescreve os 12
 * meses do ano com o aporte mensal (pmt); se o aporte é 0 (meta não definida),
 * apenas garante a linha existir, sem valores (ausência = 0 na agregação).
 */
export async function syncObjetivoToCashflow(
  userId: string,
  objetivo: ObjetivoForSync,
  year: number = new Date().getFullYear(),
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

  // Reescreve o ano corrente com o aporte (idempotente).
  await prisma.cashflowValue.deleteMany({ where: { itemId: item.id, userId, year } });
  if (aporte > 0) {
    await prisma.cashflowValue.createMany({
      data: Array.from({ length: 12 }, (_, month) => ({
        itemId: item!.id,
        userId,
        year,
        month,
        value: aporte,
      })),
    });
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
