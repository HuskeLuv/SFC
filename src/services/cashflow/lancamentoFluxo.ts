/**
 * Lançamento numa linha do fluxo de caixa mensal — o núcleo compartilhado entre o assistente
 * (proposta assinada → confirmação) e o lançamento rápido do celular (PWA fase 2, sem token: o
 * servidor recalcula tudo e relê cada célula na transação).
 *
 * Regra fixa: `somar` entra em cima do valor da célula; `definir` troca o valor de cada mês do
 * intervalo. Escrita manual zera a fórmula da célula. UMA entrada desfazível no histórico por
 * lançamento ('valor.editar' ou 'valores.editar-recorrente').
 *
 * Só servidor (Prisma).
 */
import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import type { AuthWithActingResult } from '@/utils/auth';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { recomputeEvolucaoSnapshotsSafe } from '@/services/cashflow/evolucaoPatrimonioServer';
import { checkOrcamentoAlertasSafe } from '@/services/cashflow/orcamentoAlertas';
import { listarLinhasEditaveis } from '@/services/cashflow/linhasEditaveis';
import { recordChange } from '@/services/changeHistory';
import { invalidarContextoUsuario, round } from '@/services/assistente/contexto';
import type { CashflowGroup } from '@/types/cashflow';

export const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** `somar`: o valor entra em cima do que já está na célula. `definir`: a célula passa a valer o valor. */
export type ModoLancamento = 'somar' | 'definir';

export interface CelulaLancamento {
  mes: number;
  valorAtual: number;
  valorNovo: number;
}

/** Lançamento já resolvido contra a árvore do usuário (linha, ano, meses e valores). */
export interface LancamentoResolvido {
  userId: string;
  itemId: string;
  itemNome: string;
  /** Trilha do grupo, ex.: "Despesas > Habitação". */
  grupoNome: string;
  tipo: 'despesa' | 'entrada';
  /** Valor por mês. */
  valor: number;
  ano: number;
  descricao: string | null;
  modo: ModoLancamento;
  /** Uma célula no lançamento único; várias (meses consecutivos) no recorrente. */
  celulas: CelulaLancamento[];
}

export function ehRecorrente(p: Pick<LancamentoResolvido, 'celulas'>): boolean {
  return p.celulas.length > 1;
}

/** "janeiro a dezembro/2026" ou "setembro/2026". */
export function descreverPeriodo(p: Pick<LancamentoResolvido, 'celulas' | 'ano'>): string {
  const primeiro = p.celulas[0]?.mes ?? 0;
  const ultimo = p.celulas[p.celulas.length - 1]?.mes ?? primeiro;
  if (primeiro === ultimo) return `${MESES_LONGOS[primeiro]}/${p.ano}`;
  return `${MESES_LONGOS[primeiro]} a ${MESES_LONGOS[ultimo]}/${p.ano}`;
}

interface CelulaLida {
  valor: number;
  formula: string | null;
}

function lerCelula(
  groups: CashflowGroup[],
  itemId: string,
  ano: number,
  mes: number,
): CelulaLida | null {
  const find = (g: CashflowGroup): CelulaLida | null => {
    for (const it of g.items ?? []) {
      if (it.id === itemId) {
        const v = (it.values ?? []).find((x) => x.year === ano && x.month === mes);
        return v
          ? { valor: Number(v.value), formula: v.formula ?? null }
          : { valor: 0, formula: null };
      }
    }
    for (const c of g.children ?? []) {
      const r = find(c);
      if (r !== null) return r;
    }
    return null;
  };
  for (const g of groups) {
    const r = find(g);
    if (r !== null) return r;
  }
  return null;
}

/** Valor atual de uma célula na árvore (0 se a linha ou a célula não existem). */
export function valorDaCelula(
  groups: CashflowGroup[],
  itemId: string,
  ano: number,
  mes: number,
): number {
  return lerCelula(groups, itemId, ano, mes)?.valor ?? 0;
}

/** Antes → depois de cada mês, pela regra do modo (somar ao atual ou definir o valor). */
export function celulasDoLancamento(
  groups: CashflowGroup[],
  itemId: string,
  ano: number,
  meses: number[],
  modo: ModoLancamento,
  valor: number,
): CelulaLancamento[] {
  return meses.map((mes) => {
    const valorAtual = round(valorDaCelula(groups, itemId, ano, mes));
    return { mes, valorAtual, valorNovo: modo === 'somar' ? round(valorAtual + valor) : valor };
  });
}

export interface LancamentoPorItemInput {
  itemId: string;
  valor: number;
  ano: number;
  /** 0 = janeiro. Primeiro mês (ou o único). */
  mes: number;
  /** `true` = define o valor de `mes` até `mesFim` (padrão dezembro); `false` = soma em `mes`. */
  recorrente: boolean;
  mesFim?: number;
  descricao?: string | null;
}

export type ResultadoResolucao =
  | {
      ok: true;
      lancamento: LancamentoResolvido;
      /** Meses em que a célula tinha fórmula (a gravação troca por valor fixo). */
      mesesComFormula: number[];
    }
  | { ok: false; motivo: string };

export const LINHA_NAO_EDITAVEL = 'Linha não encontrada ou não editável.';

/**
 * Resolve um lançamento por id de linha (lançamento rápido): a linha precisa estar na árvore do
 * usuário e ser editável (entrada/despesa, visível, sem sonho/dívida — `listarLinhasEditaveis`),
 * o que também barra id de outro usuário. Único = soma; recorrente = define até `mesFim`.
 */
export async function resolverLancamentoPorItem(
  userId: string,
  input: LancamentoPorItemInput,
): Promise<ResultadoResolucao> {
  const valor = round(Number(input.valor));
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, motivo: 'Valor inválido.' };
  const fim = input.recorrente ? (input.mesFim ?? 11) : input.mes;
  if (input.mes < 0 || fim > 11 || fim < input.mes || input.ano < 2000 || input.ano > 2100) {
    return { ok: false, motivo: 'Mês ou ano inválido.' };
  }

  const groups = await getMergedCashflowGroups(userId, input.ano);
  const linha = listarLinhasEditaveis(groups).find((l) => l.itemId === input.itemId);
  if (!linha || (linha.grupoTipo !== 'despesa' && linha.grupoTipo !== 'entrada')) {
    return { ok: false, motivo: LINHA_NAO_EDITAVEL };
  }

  const meses = Array.from({ length: fim - input.mes + 1 }, (_, i) => input.mes + i);
  const modo: ModoLancamento = input.recorrente ? 'definir' : 'somar';
  const celulas = celulasDoLancamento(groups, linha.itemId, input.ano, meses, modo, valor);
  const mesesComFormula = meses.filter(
    (mes) => !!lerCelula(groups, linha.itemId, input.ano, mes)?.formula,
  );

  return {
    ok: true,
    lancamento: {
      userId,
      itemId: linha.itemId,
      itemNome: linha.itemNome,
      grupoNome: linha.grupoNome,
      tipo: linha.grupoTipo,
      valor,
      ano: input.ano,
      descricao: input.descricao?.trim().slice(0, 200) || null,
      modo,
      celulas,
    },
    mesesComFormula,
  };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

export interface CelulaAplicada {
  mes: number;
  valorAnterior: number;
  valorNovo: number;
}

export interface ResultadoAplicacao {
  itemId: string;
  celulas: CelulaAplicada[];
}

export type OrigemLancamento = 'assistente' | 'lancamento-rapido';

export interface OpcoesLancamento {
  origem: OrigemLancamento;
  /**
   * Carimbo no comentário da célula: 'sempre' (assistente — "Gasto de R$ X (assistente)") ou
   * 'com-descricao' (lançamento rápido: só quando o usuário escreveu uma descrição).
   */
  carimbar: 'sempre' | 'com-descricao';
  /**
   * Recalcular snapshots de evolução, checar alertas de orçamento e invalidar o contexto do
   * assistente depois de gravar (padrão true). O lote do assistente desliga e faz uma vez no fim.
   */
  posProcessar?: boolean;
}

const SUFIXO_ORIGEM: Record<OrigemLancamento, string> = {
  assistente: '(assistente)',
  'lancamento-rapido': '(lançamento rápido)',
};

/** Pós-gravação: uma vez por confirmação. */
export async function posProcessarLancamento(
  userId: string,
  ano: number,
  mes: number,
): Promise<void> {
  await recomputeEvolucaoSnapshotsSafe(userId, new Date(ano, mes, 1));
  await checkOrcamentoAlertasSafe(userId);
  invalidarContextoUsuario(userId);
}

function formatarBrl(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

/**
 * Grava o lançamento. Cada célula é relida do banco na hora (o valor pode ter mudado desde a
 * prévia/proposta): `somar` entra em cima do valor atual, `definir` substitui. Uma célula que já
 * vale o valor definido não é tocada. Todas as células vão numa transação; o histórico recebe UMA
 * entrada (desfazível) para o lançamento inteiro — `changeLogId` é o id dela.
 */
export async function aplicarLancamento(
  auth: AuthWithActingResult,
  request: NextRequest,
  l: LancamentoResolvido,
  opcoes: OpcoesLancamento,
): Promise<ResultadoAplicacao & { changeLogId?: string }> {
  const userId = auth.targetUserId;
  const { itemId } = await ensurePersonalizedItem(l.itemId, userId);
  const recorrente = ehRecorrente(l);
  const meses = [...new Set(l.celulas.map((c) => c.mes))].sort((a, b) => a - b);
  const sufixo = SUFIXO_ORIGEM[opcoes.origem];

  const rotulo = `${l.tipo === 'despesa' ? 'Gasto' : 'Receita'}${recorrente ? ' mensal' : ''} de ${formatarBrl(l.valor)}`;
  const carimbo =
    opcoes.carimbar === 'sempre' || l.descricao
      ? `${rotulo}${l.descricao ? ` — ${l.descricao}` : ''} ${sufixo}`
      : null;

  interface CelulaGravada extends CelulaAplicada {
    existia: boolean;
    alterada: boolean;
  }

  const gravadas = await prisma.$transaction(async (tx) => {
    const out: CelulaGravada[] = [];
    for (const mes of meses) {
      const where = { itemId_userId_year_month: { itemId, userId, year: l.ano, month: mes } };
      const atual = await tx.cashflowValue.findUnique({ where });
      const valorAnterior = atual ? round(Number(atual.value)) : 0;
      const valorNovo = l.modo === 'somar' ? round(valorAnterior + l.valor) : l.valor;
      if (atual && valorNovo === valorAnterior) {
        out.push({ mes, valorAnterior, valorNovo, existia: true, alterada: false });
        continue;
      }
      if (carimbo) {
        const comentario = atual?.comment ? `${atual.comment}\n${carimbo}` : carimbo;
        await tx.cashflowValue.upsert({
          where,
          create: {
            itemId,
            userId,
            year: l.ano,
            month: mes,
            value: valorNovo,
            comment: comentario,
          },
          // Escrita manual invalida a fórmula da célula (ela deixaria de bater).
          update: { value: valorNovo, formula: null, comment: comentario.slice(0, 2000) },
        });
      } else {
        // Sem carimbo (lançamento rápido sem descrição): o comentário da célula não muda.
        await tx.cashflowValue.upsert({
          where,
          create: { itemId, userId, year: l.ano, month: mes, value: valorNovo },
          update: { value: valorNovo, formula: null },
        });
      }
      out.push({ mes, valorAnterior, valorNovo, existia: Boolean(atual), alterada: true });
    }
    return out;
  });

  let changeLogId: string | undefined;
  const alteradas = gravadas.filter((c) => c.alterada);
  if (alteradas.length > 0) {
    const changes = alteradas.map((c) => ({
      field: 'monthlyValue',
      label: `${MESES_LONGOS[c.mes]}/${l.ano}`,
      before: c.existia ? c.valorAnterior : null,
      after: c.valorNovo,
      format: 'currency' as const,
    }));

    if (!recorrente) {
      const c = alteradas[0];
      changeLogId = await recordChange({
        request,
        auth,
        section: 'fluxo-caixa',
        action: 'valor.editar',
        entity: 'valor',
        entityId: itemId,
        entityLabel: `${l.itemNome} · ${MESES_LONGOS[c.mes]}/${l.ano} ${sufixo}`,
        changes,
        snapshot: {
          v: 1,
          kind: 'cashflow-valor',
          data: { value: c.existia ? c.valorAnterior : null },
          meta: { itemId, year: l.ano, month: c.mes, origem: opcoes.origem },
        },
      });
    } else {
      changeLogId = await recordChange({
        request,
        auth,
        section: 'fluxo-caixa',
        action: 'valores.editar-recorrente',
        entity: 'valores',
        entityId: itemId,
        entityLabel: `${l.itemNome} · ${descreverPeriodo(l)} ${sufixo}`,
        changes,
        snapshot: {
          v: 1,
          kind: 'cashflow-valores',
          data: {
            celulas: alteradas.map((c) => ({
              month: c.mes,
              before: c.existia ? c.valorAnterior : null,
              after: c.valorNovo,
            })),
          },
          meta: { itemId, year: l.ano, origem: opcoes.origem, modo: l.modo },
        },
      });
    }

    if (opcoes.posProcessar !== false) {
      await posProcessarLancamento(userId, l.ano, alteradas[0].mes);
    }
  }

  return {
    itemId,
    celulas: gravadas.map(({ mes, valorAnterior, valorNovo }) => ({
      mes,
      valorAnterior,
      valorNovo,
    })),
    ...(changeLogId ? { changeLogId } : {}),
  };
}
