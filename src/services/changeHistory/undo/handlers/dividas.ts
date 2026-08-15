/**
 * Handlers de undo — seção DÍVIDAS.
 *
 * Todo undo que toca a dívida re-dispara o sync da linha-espelho no fluxo
 * de caixa (mesmas chamadas das rotas), senão a planilha fica dessincronizada.
 */

import prisma from '@/lib/prisma';
import {
  syncDividaRecordToCashflow,
  removeDividaCashflow,
} from '@/services/dividas/dividaCashflowSync';
import { UndoError, type UndoContext, type UndoDefinition, type UndoOutcome } from '../types';
import {
  assertCurrentMatchesAfter,
  getChanges,
  getSnapshot,
  invertChanges,
  isUniqueViolation,
  restoreData,
} from '../helpers';

const dividaCriar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const divida = await prisma.divida.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
      include: { pagamentos: { select: { id: true } } },
    });
    if (!divida) throw new UndoError(409, 'A dívida não existe mais');
    // Pagamentos registrados depois da criação seriam apagados junto (cascade)
    // — bloqueia pra não destruir dados que o undo da criação não cobre.
    if (divida.pagamentos.length > 0) {
      throw new UndoError(409, 'A dívida já tem pagamentos registrados — exclua-os antes');
    }

    // Mesma ordem do DELETE da rota: espelho primeiro (FK SetNull deixaria
    // a linha órfã), depois a dívida.
    await removeDividaCashflow(divida.id);
    await prisma.divida.delete({ where: { id: divida.id } });
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const dividaEditar: UndoDefinition = {
  strategy: 'restore-fields',
  requires: { entityId: true, changes: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const changes = getChanges(entry);
    const divida = await prisma.divida.findFirst({
      where: { id: entry.entityId!, userId: auth.targetUserId },
    });
    if (!divida) throw new UndoError(409, 'A dívida não existe mais');

    assertCurrentMatchesAfter(divida as unknown as Record<string, unknown>, changes);
    const updated = await prisma.divida.update({
      where: { id: divida.id },
      data: restoreData(changes),
    });
    await syncDividaRecordToCashflow(auth.targetUserId, updated);
    return { changes: invertChanges(changes) };
  },
};

const dividaExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      id: string;
      nome: string;
      instituicao: string | null;
      tipo: string;
      modalidade: string;
      principal: number | null;
      taxaAm: number | null;
      taxaUnidadeEntrada: string;
      prazoMeses: number | null;
      sistema: string | null;
      indexador: string;
      primeiroVencimento: string | null;
      saldoInicial: number | null;
      dataSaldoInicial: string | null;
      status: string;
      notes: string | null;
    };
    const meta = (snap.meta ?? {}) as {
      pagamentos?: Array<{
        month: string;
        valor: number;
        parcelaNumero: number | null;
        tipo: string;
        notes: string | null;
      }>;
    };

    let created;
    try {
      created = await prisma.divida.create({
        data: {
          id: data.id,
          userId: auth.targetUserId,
          nome: data.nome,
          instituicao: data.instituicao,
          tipo: data.tipo,
          modalidade: data.modalidade,
          principal: data.principal,
          taxaAm: data.taxaAm,
          taxaUnidadeEntrada: data.taxaUnidadeEntrada,
          prazoMeses: data.prazoMeses,
          sistema: data.sistema,
          indexador: data.indexador,
          primeiroVencimento: data.primeiroVencimento,
          saldoInicial: data.saldoInicial,
          dataSaldoInicial: data.dataSaldoInicial,
          status: data.status,
          notes: data.notes,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'A dívida já foi restaurada');
      throw error;
    }

    if (meta.pagamentos && meta.pagamentos.length > 0) {
      await prisma.dividaPagamento.createMany({
        data: meta.pagamentos.map((p) => ({
          dividaId: created.id,
          month: p.month,
          valor: p.valor,
          parcelaNumero: p.parcelaNumero,
          tipo: p.tipo,
          notes: p.notes,
        })),
      });
    }

    await syncDividaRecordToCashflow(auth.targetUserId, created);
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const dividaPagamentoRegistrar: UndoDefinition = {
  strategy: 'delete-created',
  requires: { entityId: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const pagamento = await prisma.dividaPagamento.findFirst({
      where: { id: entry.entityId!, divida: { userId: auth.targetUserId } },
      include: { divida: true },
    });
    if (!pagamento) throw new UndoError(409, 'O pagamento não existe mais');

    await prisma.dividaPagamento.delete({ where: { id: pagamento.id } });
    // Amortização de prazo desfeita devolve as parcelas do fim à projeção.
    if (pagamento.tipo === 'amortizacao_prazo') {
      await syncDividaRecordToCashflow(auth.targetUserId, pagamento.divida);
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

const dividaPagamentoExcluir: UndoDefinition = {
  strategy: 'recreate-from-snapshot',
  requires: { entityId: true, snapshot: true },
  async execute({ auth, entry }: UndoContext): Promise<UndoOutcome> {
    const snap = getSnapshot(entry)!;
    const data = snap.data as unknown as {
      id: string;
      month: string;
      valor: number;
      parcelaNumero: number | null;
      tipo: string;
      notes: string | null;
    };
    const meta = (snap.meta ?? {}) as { dividaId?: string };
    if (!meta.dividaId) throw new UndoError(400, 'Snapshot sem dívida', 'UNDO_MISSING_DATA');

    const divida = await prisma.divida.findFirst({
      where: { id: meta.dividaId, userId: auth.targetUserId },
      include: { pagamentos: { select: { parcelaNumero: true, tipo: true } } },
    });
    if (!divida) throw new UndoError(409, 'A dívida não existe mais');
    // Mesma regra da rota: parcela não pode voltar duplicada.
    if (
      data.parcelaNumero != null &&
      data.tipo === 'pagamento' &&
      divida.pagamentos.some(
        (p) => p.parcelaNumero === data.parcelaNumero && p.tipo === 'pagamento',
      )
    ) {
      throw new UndoError(409, `A parcela ${data.parcelaNumero} já foi registrada de novo`);
    }

    try {
      await prisma.dividaPagamento.create({
        data: {
          id: data.id,
          dividaId: divida.id,
          month: data.month,
          valor: data.valor,
          parcelaNumero: data.parcelaNumero,
          tipo: data.tipo,
          notes: data.notes,
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new UndoError(409, 'O pagamento já foi restaurado');
      throw error;
    }
    // Amortização de prazo restaurada volta a encurtar a projeção. Os
    // pagamentos carregados acima são de ANTES do recreate — forçar o sync a
    // recarregar do banco (inclui o restaurado).
    if (data.tipo === 'amortizacao_prazo') {
      await syncDividaRecordToCashflow(auth.targetUserId, { ...divida, pagamentos: undefined });
    }
    return { changes: invertChanges(getChanges(entry)) };
  },
};

export const DIVIDAS_UNDO_HANDLERS: Record<string, UndoDefinition> = {
  'divida.criar': dividaCriar,
  'divida.editar': dividaEditar,
  'divida.excluir': dividaExcluir,
  'divida-pagamento.registrar': dividaPagamentoRegistrar,
  'divida-pagamento.excluir': dividaPagamentoExcluir,
};
