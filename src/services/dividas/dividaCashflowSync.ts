import { prisma } from '@/lib/prisma';
import { personalizeGroup } from '@/utils/cashflowPersonalization';
import { ensureDividasTemplate } from '@/utils/cashflowTemplates';
import { recomputeEvolucaoSnapshotsSafe } from '@/services/cashflow/evolucaoPatrimonioServer';
import { REALIZADO_COLOR } from '@/services/planejamento/cashflowToSonhoSync';
import { corrigirCronograma, gerarCronograma, parcelasCortadasDe } from './amortizacao';
import { isIndexadorCorrigivel, monthlyIndexFactors } from './indexacaoDivida';

/**
 * Sincroniza uma dívida com a linha-espelho no fluxo de caixa (grupo
 * "Despesas Financeiras" sob Despesas Fixas). A dívida é a FONTE: as parcelas do
 * cronograma SAC/Price viram os valores planejados dos meses da janela
 * (`primeiroVencimento` → fim do prazo), atravessando anos. A linha é
 * somente-leitura no fluxo de caixa (vínculo via CashflowItem.dividaId).
 *
 * Regras (clone estrutural de sonhoCashflowSync):
 *  - Só FINANCIAMENTOS projetam parcelas. Rotativas (cartão, cheque especial)
 *    não têm valor planejável — nenhuma linha é criada.
 *  - Dívida quitada não projeta: o planejado é limpo (realizados ficam).
 *  - Células REALIZADAS (REALIZADO_COLOR) são preservadas em qualquer ano.
 *  - Ao contrário do sonho (aporte constante), cada mês recebe a parcela
 *    DAQUELE mês — no SAC a parcela é decrescente.
 */

// Ex-"Dívidas" — renomeado p/ "Despesas Financeiras" (ago/2026, alinhado à
// categoria homônima da planilha-base; migração renomeia as linhas existentes).
const DIVIDAS_GROUP_NAME = 'Despesas Financeiras';

export interface DividaForSync {
  id: string;
  nome: string;
  modalidade: string;
  status: string;
  principal: number | null;
  taxaAm: number | null;
  prazoMeses: number | null;
  sistema: string | null;
  primeiroVencimento: string | null; // YYYY-MM
  /** TR/IPCA/IGPM/CDI corrigem a parcela projetada pelo índice realizado. */
  indexador?: string | null;
  /** Parcelas do FIM quitadas por amortização (redução de prazo) — saem da projeção. */
  parcelasCortadas?: number;
}

/** Decimal | number → number (Prisma serializa Decimal como objeto). */
function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Mapeia um registro Prisma de Divida (campos Decimal) para o input do sync
 * e executa. Conveniência para os callers de rota e undo.
 */
export async function syncDividaRecordToCashflow(
  userId: string,
  divida: {
    id: string;
    nome: string;
    modalidade: string;
    status: string;
    principal: unknown;
    taxaAm: unknown;
    prazoMeses: number | null;
    sistema: string | null;
    indexador?: string | null;
    primeiroVencimento: string | null;
    /** Quando o caller carrega os pagamentos, amortizações de prazo encurtam a projeção. */
    pagamentos?: Array<{ tipo: string; parcelaNumero: number | null; valor?: unknown }>;
  },
): Promise<void> {
  // Callers sem pagamentos carregados (create, undo de edição) buscam aqui —
  // barato (N pequeno) e garante que a projeção nunca "desencurta" por
  // esquecimento de include.
  const pagamentos =
    divida.pagamentos ??
    (await prisma.dividaPagamento.findMany({
      where: { dividaId: divida.id },
      select: { tipo: true, parcelaNumero: true },
    }));
  const parcelasCortadas = parcelasCortadasDe(
    pagamentos.map((p) => ({
      tipo: p.tipo,
      parcelaNumero: p.parcelaNumero,
      valor: 0,
      month: '',
    })),
  );
  await syncDividaToCashflow(userId, {
    id: divida.id,
    nome: divida.nome,
    modalidade: divida.modalidade,
    status: divida.status,
    principal: toNum(divida.principal),
    taxaAm: toNum(divida.taxaAm),
    prazoMeses: divida.prazoMeses,
    sistema: divida.sistema,
    indexador: divida.indexador ?? null,
    primeiroVencimento: divida.primeiroVencimento,
    parcelasCortadas,
  });
}

/** Resolve (personalizando se preciso) o grupo "Despesas Financeiras" do usuário. */
async function resolveDividasGroupId(userId: string): Promise<string | null> {
  const own = await prisma.cashflowGroup.findFirst({
    where: { userId, name: DIVIDAS_GROUP_NAME },
    select: { id: true },
  });
  if (own) return own.id;

  // Bancos antigos podem não ter o template — upgrade idempotente.
  await ensureDividasTemplate();

  const template = await prisma.cashflowGroup.findFirst({
    where: { userId: null, name: DIVIDAS_GROUP_NAME },
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
 * Cria/atualiza a linha do fluxo de caixa que espelha a dívida. Escreve a
 * parcela de cada mês do cronograma; remove planejado órfão de qualquer ano
 * (ex.: prazo/taxa mudaram e a janela se deslocou); preserva realizados.
 */
export async function syncDividaToCashflow(userId: string, divida: DividaForSync): Promise<void> {
  const touched = await syncDividaToCashflowInner(userId, divida);
  if (!touched) return;
  // A linha-espelho é despesa e a janela pode cobrir meses passados —
  // snapshots travados da Evolução do Patrimônio precisam ser recomputados.
  await recomputeEvolucaoSnapshotsSafe(userId, new Date(0));
}

/** @returns true se a linha existia/foi criada (algo pode ter mudado). */
async function syncDividaToCashflowInner(userId: string, divida: DividaForSync): Promise<boolean> {
  const cronogramaCompleto =
    divida.modalidade === 'financiamento' &&
    divida.principal != null &&
    divida.taxaAm != null &&
    divida.prazoMeses != null &&
    divida.sistema &&
    divida.primeiroVencimento
      ? gerarCronograma({
          principal: divida.principal,
          taxaAm: divida.taxaAm,
          prazoMeses: divida.prazoMeses,
          primeiroVencimento: divida.primeiroVencimento,
          sistema: divida.sistema,
        })
      : [];
  // Amortização com redução de prazo: as últimas N parcelas foram quitadas —
  // saem da projeção (o deleteMany abaixo limpa o planejado que sobrou delas).
  const cortadas = Math.max(0, divida.parcelasCortadas ?? 0);
  const cronograma =
    cortadas > 0
      ? cronogramaCompleto.slice(0, cronogramaCompleto.length - cortadas)
      : cronogramaCompleto;

  let item = await prisma.cashflowItem.findUnique({ where: { dividaId: divida.id } });
  if (!item) {
    // Rotativa (ou financiamento incompleto) sem linha existente: nada a
    // espelhar — não cria linha vazia.
    if (cronograma.length === 0) return false;
    const groupId = await resolveDividasGroupId(userId);
    if (!groupId) return false; // template ausente — nada a espelhar
    item = await prisma.cashflowItem.create({
      data: { userId, groupId, name: divida.nome, rank: 'normal', dividaId: divida.id },
    });
  } else if (item.name !== divida.nome) {
    item = await prisma.cashflowItem.update({
      where: { id: item.id },
      data: { name: divida.nome },
    });
  }

  // Meses já REALIZADOS (pintados) — preservados em qualquer ano.
  const realized = await prisma.cashflowValue.findMany({
    where: { itemId: item.id, userId, color: REALIZADO_COLOR },
    select: { year: true, month: true },
  });
  const realizedKey = new Set(realized.map((v) => `${v.year}-${v.month}`));

  // Remove o planejado (não-realizado) de QUALQUER ano — limpa planejado
  // órfão fora da janela atual. Preserva os realizados.
  await prisma.cashflowValue.deleteMany({
    where: {
      itemId: item.id,
      userId,
      OR: [{ color: null }, { color: { not: REALIZADO_COLOR } }],
    },
  });

  // Reescreve a parcela planejada de cada mês do cronograma, exceto nos meses
  // já realizados. Só 'ativa' (Iniciada) projeta: quitada, pausada e em
  // espera não pagam parcela — o deleteMany acima já limpou o planejado e
  // nada é reescrito (mesma semântica dos sonhos pausados).
  if (divida.status === 'ativa' && cronograma.length > 0) {
    // Contrato indexado: projeta a parcela CORRIGIDA pelo índice realizado até
    // o aniversário de cada mês (futuros ficam na correção realizada até hoje;
    // o cron diário de índices ressincroniza — ver resyncDividasIndexadas).
    let rows = cronograma;
    if (isIndexadorCorrigivel(divida.indexador)) {
      const fatores = await monthlyIndexFactors(
        divida.indexador!,
        divida.primeiroVencimento,
        cronograma[cronograma.length - 1].mes,
      );
      rows = corrigirCronograma(cronograma, fatores);
    }
    const toCreate = rows
      .map((p) => ({ ...ymToYearMonth0(p.mes), value: p.parcelaCorrigida ?? p.parcela }))
      .filter((w) => w.value > 0 && !realizedKey.has(`${w.year}-${w.month}`));
    if (toCreate.length > 0) {
      await prisma.cashflowValue.createMany({
        data: toCreate.map((w) => ({
          itemId: item!.id,
          userId,
          year: w.year,
          month: w.month,
          value: w.value,
        })),
        skipDuplicates: true,
      });
    }
  }
  return true;
}

/**
 * Ressincroniza TODAS as dívidas indexadas (TR/IPCA/IGPM/CDI) ativas com a
 * linha-espelho do fluxo de caixa — chamado pelo cron diário de índices
 * econômicos depois da ingestão BACEN, pra que a correção mensal das parcelas
 * avance sozinha no aniversário de cada dívida (sem esperar uma mutação).
 */
export async function resyncDividasIndexadas(): Promise<{ dividas: number; usuarios: number }> {
  const dividas = await prisma.divida.findMany({
    where: {
      modalidade: 'financiamento',
      status: 'ativa',
      indexador: { in: ['TR', 'IPCA', 'IGPM', 'CDI'] },
    },
    include: { pagamentos: { select: { tipo: true, parcelaNumero: true } } },
  });
  const usuarios = new Set<string>();
  for (const d of dividas) {
    await syncDividaRecordToCashflow(d.userId, d);
    usuarios.add(d.userId);
  }
  return { dividas: dividas.length, usuarios: usuarios.size };
}

/** Remove a linha do fluxo de caixa vinculada a uma dívida (valores + item). */
export async function removeDividaCashflow(dividaId: string): Promise<void> {
  const item = await prisma.cashflowItem.findUnique({
    where: { dividaId },
    select: { id: true, userId: true },
  });
  if (!item) return;
  await prisma.cashflowValue.deleteMany({ where: { itemId: item.id } });
  await prisma.cashflowItem.delete({ where: { id: item.id } });
  // Valores (planejados e realizados) de qualquer ano sumiram — recomputa os
  // snapshots travados da Evolução do Patrimônio.
  if (item.userId) {
    await recomputeEvolucaoSnapshotsSafe(item.userId, new Date(0));
  }
}
