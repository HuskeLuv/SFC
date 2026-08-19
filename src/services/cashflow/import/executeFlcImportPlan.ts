import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ensurePersonalizedItem, personalizeGroup } from '@/utils/cashflowPersonalization';
import { normalizeLabel } from './parseFlcXlsx';
import type { FlcImportPlan, FlcItemPlano } from './mapFlcToCashflow';

/**
 * Executor do plano de importação (F2). Percorre o plano produzido pelo
 * mapFlcToCashflow e grava no banco:
 * - grupo template → personalizeGroup (mesma infra do batch-update);
 * - item destino 'existente' → ensurePersonalizedItem + upsert de valores;
 * - item destino 'criar' → cria item custom no grupo do usuário;
 * - conflito → política 'sobrescrever' grava o valor da planilha, 'manter' pula.
 *
 * Como o batch-update, a execução é por item com try/catch (não é uma
 * transação única): falha em um item entra no relatório de erros e não
 * derruba o restante. Reexecutar é seguro — upsert na chave composta
 * `(itemId, userId, year, month)` e o re-map casa itens criados por nome.
 */

export type FlcPoliticaConflito = 'sobrescrever' | 'manter';

export interface FlcImportRelatorio {
  itensCriados: number;
  celulasGravadas: number;
  comentariosGravados: number;
  /** cores de texto da planilha gravadas nas células (legenda) */
  coresGravadas: number;
  /** "O SEU PORQUÊ"/rank preenchidos em itens existentes que estavam vazios */
  significadosGravados: number;
  conflitosSobrescritos: number;
  conflitosMantidos: number;
  erros: { label: string; erro: string }[];
}

/** Estado de uma célula (para o snapshot de undo). */
export interface FlcCelulaEstado {
  value: number;
  comment: string | null;
  color: string | null;
}

/**
 * Dados de reversão da importação (ticket QA 19/08/2026): o pré-estado de
 * TUDO que o executor gravou. Vai no snapshot do UserChangeLog e o handler
 * 'fluxo.importar-planilha' restaura célula a célula — `antes: null` = a
 * célula não existia; `depois` permite pular células editadas após o import.
 */
export interface FlcImportUndoData {
  ano: number;
  itensCriados: { id: string; nome: string }[];
  metadados: {
    itemId: string;
    significadoAntes?: string | null;
    significadoDepois?: string;
    rankAntes?: string | null;
    rankDepois?: string;
  }[];
  /** Só células de itens PRÉ-existentes — as dos itens criados somem com eles. */
  valores: {
    itemId: string;
    month: number;
    antes: FlcCelulaEstado | null;
    depois: FlcCelulaEstado;
  }[];
}

export const executeFlcImportPlan = async (
  plan: FlcImportPlan,
  targetUserId: string,
  ano: number,
  politica: FlcPoliticaConflito,
): Promise<{ relatorio: FlcImportRelatorio; undo: FlcImportUndoData }> => {
  const relatorio: FlcImportRelatorio = {
    itensCriados: 0,
    celulasGravadas: 0,
    comentariosGravados: 0,
    coresGravadas: 0,
    significadosGravados: 0,
    conflitosSobrescritos: 0,
    conflitosMantidos: 0,
    erros: [],
  };
  const undo: FlcImportUndoData = { ano, itensCriados: [], metadados: [], valores: [] };
  const idsItensCriados = new Set<string>();

  // grupo do plano → grupo final do usuário (personalizado sob demanda)
  const grupoFinal = new Map<string, string>();
  const resolverGrupo = async (groupId: string): Promise<string> => {
    const cached = grupoFinal.get(groupId);
    if (cached) return cached;
    const g = await prisma.cashflowGroup.findUnique({ where: { id: groupId } });
    if (!g) throw new Error('Grupo do plano não existe mais');
    const finalId = g.userId === null ? await personalizeGroup(g.id, targetUserId) : g.id;
    grupoFinal.set(groupId, finalId);
    return finalId;
  };

  // dedupe intra-execução (seção duplicada na planilha → mesmo item criado 1x)
  const itemCriado = new Map<string, string>();

  interface EscritaMes {
    valor?: number;
    comentario?: string;
    cor?: string;
  }

  const upsertValores = async (itemId: string, porMes: Map<number, EscritaMes>): Promise<void> => {
    await Promise.all(
      [...porMes.entries()].map(([mes, { valor, comentario, cor }]) =>
        prisma.cashflowValue.upsert({
          where: {
            itemId_userId_year_month: { itemId, userId: targetUserId, year: ano, month: mes },
          },
          update: {
            ...(valor !== undefined && { value: valor }),
            ...(comentario !== undefined && { comment: comentario }),
            ...(cor !== undefined && { color: cor }),
          },
          // célula só com comentário/cor segue o precedente da rota manual:
          // valor 0. Cor vem da legenda da planilha (report 10/08, item 4).
          create: {
            itemId,
            userId: targetUserId,
            year: ano,
            month: mes,
            value: valor ?? 0,
            ...(comentario !== undefined && { comment: comentario }),
            ...(cor !== undefined && { color: cor }),
          },
        }),
      ),
    );
  };

  const executarItem = async (planGroupId: string, itemPlano: FlcItemPlano): Promise<void> => {
    const escritas = [...itemPlano.escritas];
    if (politica === 'sobrescrever') {
      escritas.push(...itemPlano.conflitos.map((c) => ({ mes: c.mes, valor: c.valorPlanilha })));
      relatorio.conflitosSobrescritos += itemPlano.conflitos.length;
    } else {
      relatorio.conflitosMantidos += itemPlano.conflitos.length;
    }
    // comentário/cor conflitantes (app já tem outro valor) seguem a mesma
    // política dos valores
    const comentarios = itemPlano.comentarios.filter(
      (c) => c.textoApp === null || politica === 'sobrescrever',
    );
    const cores = itemPlano.cores.filter((c) => c.corApp === null || politica === 'sobrescrever');

    const porMes = new Map<number, EscritaMes>();
    for (const { mes, valor } of escritas) porMes.set(mes, { valor });
    for (const { mes, texto } of comentarios) {
      porMes.set(mes, { ...porMes.get(mes), comentario: texto });
    }
    for (const { mes, cor } of cores) {
      porMes.set(mes, { ...porMes.get(mes), cor });
    }
    // metadados (significado/rank) preenchendo item existente vazio contam
    // como trabalho mesmo sem célula a gravar (report 10/08, bug #1)
    const significadoNovo =
      itemPlano.destino.tipo === 'existente' ? (itemPlano.destino.significado ?? null) : null;
    const rankNovo =
      itemPlano.destino.tipo === 'existente' ? (itemPlano.destino.rank ?? null) : null;
    if (porMes.size === 0 && !significadoNovo && !rankNovo) return;

    let finalItemId: string;
    if (itemPlano.destino.tipo === 'existente') {
      const { itemId, item } = await ensurePersonalizedItem(itemPlano.destino.itemId, targetUserId);
      // defensivo: o mapper já exclui linhas-espelho de sonho/dívida, mas o
      // plano é recalculado do banco e um vínculo pode ter surgido entre map
      // e execução
      if (item.objetivoId || item.dividaId) return;
      finalItemId = itemId;
      // fill-if-empty re-checado contra o estado do banco (o plano é recalculado
      // no commit, mas entre map e execução o usuário pode ter preenchido)
      if ((significadoNovo && !item.significado?.trim()) || (rankNovo && !item.rank?.trim())) {
        const gravaSignificado = Boolean(significadoNovo && !item.significado?.trim());
        const gravaRank = Boolean(rankNovo && !item.rank?.trim());
        await prisma.cashflowItem.update({
          where: { id: finalItemId },
          data: {
            ...(gravaSignificado && { significado: significadoNovo }),
            ...(gravaRank && { rank: rankNovo }),
          },
        });
        undo.metadados.push({
          itemId: finalItemId,
          ...(gravaSignificado && {
            significadoAntes: item.significado ?? null,
            significadoDepois: significadoNovo!,
          }),
          ...(gravaRank && { rankAntes: item.rank ?? null, rankDepois: rankNovo! }),
        });
        if (gravaSignificado) relatorio.significadosGravados += 1;
      }
    } else {
      const finalGroupId = await resolverGrupo(planGroupId);
      const chave = `${finalGroupId}:${normalizeLabel(itemPlano.label)}`;
      const jaCriado = itemCriado.get(chave);
      if (jaCriado) {
        finalItemId = jaCriado;
      } else {
        const criado = await prisma.cashflowItem.create({
          data: {
            userId: targetUserId,
            groupId: finalGroupId,
            name: itemPlano.label,
            significado: itemPlano.destino.significado,
            rank: itemPlano.destino.rank,
          },
        });
        itemCriado.set(chave, criado.id);
        idsItensCriados.add(criado.id);
        undo.itensCriados.push({ id: criado.id, nome: itemPlano.label });
        relatorio.itensCriados += 1;
        finalItemId = criado.id;
      }
    }

    // Pré-estado das células (undo). Só itens PRÉ-existentes: célula de item
    // criado pelo import é revertida junto com a exclusão do item. Ler ANTES
    // do upsert — se o upsert falhar, antes==atual e o handler trata como
    // "não bate com o depois" e pula (idempotente).
    if (!idsItensCriados.has(finalItemId) && porMes.size > 0) {
      const existentes = await prisma.cashflowValue.findMany({
        where: {
          itemId: finalItemId,
          userId: targetUserId,
          year: ano,
          month: { in: [...porMes.keys()] },
        },
      });
      const antesPorMes = new Map<number, FlcCelulaEstado>(
        existentes.map((r) => [
          r.month,
          { value: Number(r.value), comment: r.comment ?? null, color: r.color ?? null },
        ]),
      );
      for (const [mes, e] of porMes) {
        const antes = antesPorMes.get(mes) ?? null;
        undo.valores.push({
          itemId: finalItemId,
          month: mes,
          antes,
          depois: {
            value: e.valor ?? antes?.value ?? 0,
            comment: e.comentario ?? antes?.comment ?? null,
            color: e.cor ?? antes?.color ?? null,
          },
        });
      }
    }

    await upsertValores(finalItemId, porMes);
    relatorio.celulasGravadas += escritas.length;
    relatorio.comentariosGravados += comentarios.length;
    relatorio.coresGravadas += cores.length;
  };

  for (const grupo of plan.grupos) {
    for (const itemPlano of grupo.itens) {
      try {
        await executarItem(grupo.destino.groupId, itemPlano);
      } catch (error) {
        logger.error(`Import FLC: erro no item "${itemPlano.label}":`, error);
        relatorio.erros.push({
          label: itemPlano.label,
          erro: error instanceof Error ? error.message : 'Erro ao gravar item',
        });
      }
    }
  }

  return { relatorio, undo };
};
