import { prisma } from '@/lib/prisma';
import { off2date } from './aposentadoria';
import { unidadeDaTransacao } from '@/lib/ativoEmDolar';
import {
  carregarCambioDasTransacoes,
  totalBRLTransacao,
} from '@/services/cashflow/investimentosPorMes';
import { ehImportacaoOpenFinance } from '@/services/pluggy/notaImportacao';

/**
 * Deriva os registros mensais de acompanhamento (aporte realizado + patrimônio
 * final) a partir de dados objetivos da carteira, eliminando a digitação manual:
 *
 * - `patFinal`  ← último snapshot diário (`portfolio_daily_snapshots`) do mês.
 * - `aporteReal`← fluxo líquido de transações do mês (compras − vendas),
 *                 excluindo reinvestimentos de proventos (não são capital novo).
 *                 Com ativos vinculados à aposentadoria (Portfolio.
 *                 vinculoAposentadoria), só as transações DELES contam; sem
 *                 vínculo, vale a carteira toda menos os ativos de sonho
 *                 (esse dinheiro pertence à meta do sonho). Transação gravada
 *                 em US$ entra em R$ por `totalBRLTransacao` (câmbio da tx).
 *                 Compras criadas pela importação do Open Finance também NÃO
 *                 contam: são a carteira antiga do cliente gravada na data da
 *                 conexão, não dinheiro novo (marcador em `notes`).
 *
 * Só cobre meses já iniciados (até o mês corrente). Meses sem snapshot ficam
 * com `hasData=false` e NÃO são preenchidos — não inventamos patrimônio.
 */

export interface DerivedAcompanhamentoEntry {
  off: number;
  year: number;
  month: number; // 1-12
  aporteReal: number;
  patFinal: number | null;
  /** true quando há snapshot no mês (base para auto-preencher). */
  hasData: boolean;
}

export interface PlanoTrack {
  trackStartMonth: number;
  trackStartYear: number;
  idade: number;
  apos: number;
}

/** Compras de reinvestimento de proventos não são aporte de capital novo. */
const isReinvestimento = (notes: string | null | undefined): boolean => {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return parsed?.operation?.action === 'reinvestimento';
  } catch {
    return false;
  }
};

/** Chave de mês-calendário em UTC (snapshots são gravados como UTC midnight). */
const monthKey = (year: number, month0: number): number => year * 12 + month0;

export async function deriveAcompanhamentoEntries(
  userId: string,
  plano: PlanoTrack,
): Promise<DerivedAcompanhamentoEntry[]> {
  const now = new Date();
  // Offset do mês corrente a partir do início do acompanhamento.
  const curOff =
    (now.getUTCFullYear() - plano.trackStartYear) * 12 +
    (now.getUTCMonth() - (plano.trackStartMonth - 1));
  const retM = Math.max(0, (plano.apos - plano.idade) * 12);
  const maxOff = retM > 0 ? Math.min(retM, curOff) : curOff;
  if (maxOff < 1) return [];

  const startDate = new Date(Date.UTC(plano.trackStartYear, plano.trackStartMonth - 1, 1));

  const [snapshots, transactions, vinculos] = await Promise.all([
    prisma.portfolioDailySnapshot.findMany({
      where: { userId, date: { gte: startDate, lte: now } },
      orderBy: { date: 'asc' },
      select: { date: true, totalValue: true },
    }),
    prisma.stockTransaction.findMany({
      where: { userId, type: { in: ['compra', 'venda'] }, date: { gte: startDate, lte: now } },
      select: {
        assetId: true,
        date: true,
        type: true,
        total: true,
        price: true,
        quantity: true,
        fees: true,
        notes: true,
        asset: { select: { type: true, currency: true } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.portfolio.findMany({
      where: {
        userId,
        OR: [{ vinculoAposentadoria: true }, { planejamentoObjetivoId: { not: null } }],
      },
      select: { assetId: true, vinculoAposentadoria: true, planejamentoObjetivoId: true },
    }),
  ]);

  const assetsAposentadoria = new Set(
    vinculos.filter((v) => v.vinculoAposentadoria && v.assetId).map((v) => v.assetId),
  );
  const assetsDeSonho = new Set(
    vinculos.filter((v) => v.planejamentoObjetivoId && v.assetId).map((v) => v.assetId),
  );

  // patFinal por mês: último snapshot do mês (ordenado asc → última escrita vence).
  const patByMonth = new Map<number, number>();
  for (const s of snapshots) {
    patByMonth.set(monthKey(s.date.getUTCFullYear(), s.date.getUTCMonth()), Number(s.totalValue));
  }

  // aporte líquido por mês (compras − vendas, excl. reinvestimento).
  const aporteByMonth = new Map<number, number>();
  const lastRateByAsset = new Map<string, number>();
  const serieCambio = await carregarCambioDasTransacoes(transactions);
  for (const tx of transactions) {
    if (isReinvestimento(tx.notes)) continue;
    if (ehImportacaoOpenFinance(tx.notes)) continue;
    if (assetsAposentadoria.size > 0) {
      if (!tx.assetId || !assetsAposentadoria.has(tx.assetId)) continue;
    } else if (tx.assetId && assetsDeSonho.has(tx.assetId)) {
      continue;
    }
    const key = monthKey(tx.date.getUTCFullYear(), tx.date.getUTCMonth());
    // R$ legado: como sempre (total, sem somar taxas). US$: total × câmbio da tx + fees.
    const total =
      unidadeDaTransacao(tx, tx.asset) === 'USD'
        ? totalBRLTransacao(
            {
              ...tx,
              total: Number(tx.total) > 0 ? Number(tx.total) : tx.price * tx.quantity,
            },
            lastRateByAsset,
            serieCambio,
          )
        : Number(tx.total) > 0
          ? Number(tx.total)
          : tx.price * tx.quantity;
    const signed = tx.type === 'compra' ? total : -total;
    aporteByMonth.set(key, (aporteByMonth.get(key) ?? 0) + signed);
  }

  const out: DerivedAcompanhamentoEntry[] = [];
  for (let off = 1; off <= maxOff; off++) {
    const { year, month } = off2date(plano, off);
    const key = monthKey(year, month - 1);
    const patFinalRaw = patByMonth.get(key);
    const patFinal = patFinalRaw != null ? Math.round(patFinalRaw * 100) / 100 : null;
    const aporteReal = Math.round((aporteByMonth.get(key) ?? 0) * 100) / 100;
    out.push({ off, year, month, aporteReal, patFinal, hasData: patFinal != null });
  }
  return out;
}

// ── Preenchimento automático (sem clique) ──────────────────────────────────

export const ORIGEM_AUTO = 'auto';
export const ORIGEM_MANUAL = 'manual';

interface EntryAtual {
  id: string;
  off: number;
  year: number;
  month: number;
  aporteReal: unknown;
  patFinal: unknown;
  origem: string;
}

export interface PlanoSync extends PlanoTrack {
  id: string;
}

export interface PlanoSyncResultado {
  criados: number;
  atualizados: number;
  removidos: number;
}

const mesmoValor = (a: unknown, b: number): boolean => Math.abs(Number(a) - b) < 0.005;

/**
 * Plano de gravação (puro) que espelha os valores derivados nos registros:
 *  - mês sem registro e com snapshot → cria como 'auto';
 *  - registro 'auto' com valor/mês desatualizado → atualiza (o mês corrente
 *    fica "parcial" e acompanha a carteira até o mês virar);
 *  - registro 'auto' que deixou de ter base (mudou o início, sem snapshot) → remove;
 *  - registro 'manual' (digitado pelo cliente) → NUNCA é tocado.
 */
export function planejarSync(
  derived: DerivedAcompanhamentoEntry[],
  existentes: EntryAtual[],
): {
  criar: DerivedAcompanhamentoEntry[];
  atualizar: { id: string; d: DerivedAcompanhamentoEntry }[];
  remover: string[];
} {
  const porOff = new Map(existentes.map((e) => [e.off, e]));
  const derivadosComBase = new Map(
    derived.filter((d) => d.hasData && d.patFinal != null).map((d) => [d.off, d]),
  );
  const criar: DerivedAcompanhamentoEntry[] = [];
  const atualizar: { id: string; d: DerivedAcompanhamentoEntry }[] = [];
  const remover: string[] = [];

  for (const d of derivadosComBase.values()) {
    const e = porOff.get(d.off);
    if (!e) {
      criar.push(d);
      continue;
    }
    if (e.origem !== ORIGEM_AUTO) continue;
    const igual =
      e.year === d.year &&
      e.month === d.month &&
      mesmoValor(e.aporteReal, d.aporteReal) &&
      mesmoValor(e.patFinal, d.patFinal as number);
    if (!igual) atualizar.push({ id: e.id, d });
  }
  for (const e of existentes) {
    if (e.origem === ORIGEM_AUTO && !derivadosComBase.has(e.off)) remover.push(e.id);
  }
  return { criar, atualizar, remover };
}

/**
 * Grava o acompanhamento automático do plano (idempotente; seguro em leituras
 * concorrentes — create com skipDuplicates e updates só em linhas 'auto').
 * Chamado ao ler o plano (abrir a tela) e pelo botão "Preencher".
 */
export async function sincronizarAcompanhamentoAuto(
  userId: string,
  plano: PlanoSync,
): Promise<PlanoSyncResultado> {
  const [derived, existentes] = await Promise.all([
    deriveAcompanhamentoEntries(userId, plano),
    prisma.aposentadoriaPlanoEntry.findMany({
      where: { planoId: plano.id },
      select: {
        id: true,
        off: true,
        year: true,
        month: true,
        aporteReal: true,
        patFinal: true,
        origem: true,
      },
    }),
  ]);
  const { criar, atualizar, remover } = planejarSync(derived, existentes);

  if (criar.length > 0) {
    await prisma.aposentadoriaPlanoEntry.createMany({
      data: criar.map((d) => ({
        planoId: plano.id,
        off: d.off,
        year: d.year,
        month: d.month,
        aporteReal: d.aporteReal,
        patFinal: d.patFinal as number,
        origem: ORIGEM_AUTO,
      })),
      skipDuplicates: true,
    });
  }
  for (const { id, d } of atualizar) {
    // updateMany com origem no filtro: se o cliente acabou de digitar o mês, não pisa.
    await prisma.aposentadoriaPlanoEntry.updateMany({
      where: { id, origem: ORIGEM_AUTO },
      data: {
        year: d.year,
        month: d.month,
        aporteReal: d.aporteReal,
        patFinal: d.patFinal as number,
      },
    });
  }
  if (remover.length > 0) {
    await prisma.aposentadoriaPlanoEntry.deleteMany({
      where: { id: { in: remover }, origem: ORIGEM_AUTO },
    });
  }
  return { criados: criar.length, atualizados: atualizar.length, removidos: remover.length };
}
