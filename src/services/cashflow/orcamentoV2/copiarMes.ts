/**
 * R-13, copiar o orçado de um mês para outro (Orçamento v2, desenho técnico §6.2/§6.3, Q8; PR 9).
 *
 * Para cada subcategoria VISÍVEL hoje na partição de categorias (árvore mesclada do ano de
 * destino) com orçado na origem (valor > 0 ou pct > 0), copia `valor`/`pct` como estão (inclusive
 * pct, T28) para o destino:
 * - destino sem orçado → grava;
 * - destino já orçado e `sobrescrever: false` ("Só preencher vazios") → NÃO toca, conta em
 *   `ignorados`;
 * - destino já orçado e `sobrescrever: true` ("Substituir tudo") → substitui.
 * Subcategoria sem orçado na origem não mexe no destino (a spec copia "budgets(sub, from)"; não
 * limpa nada). Destino igual à origem conta como copiado sem escrita.
 *
 * Tudo numa transação; depois do commit, `orcamento.copiar` no histórico com o estado anterior de
 * cada célula escrita — o undo (`handlers/orcamentoV2.ts`) só restaura se nenhuma delas mudou
 * depois (409 STATE_MISMATCH).
 */
import prisma from '@/lib/prisma';
import type { Orcado } from '@/lib/orcamento/regras';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { recordChange, type ChangeSnapshot } from '@/services/changeHistory';
import { categoriasDaArvore } from './ativacao';
import type { ContextoRegistro } from './excluirSubcategoria';
import { mesmoOrcado, orcadoDaLinha, rotuloMesAno } from './escritaOrcado';

export const ACAO_COPIAR_MES = 'orcamento.copiar';
export const KIND_SNAPSHOT_COPIAR = 'orcamento-copiar';

/** (ano, mês 0–11). */
export interface MesRef {
  ano: number;
  mes0: number;
}

export interface CelulaCopiada {
  itemId: string;
  antes: Orcado | null;
  depois: Orcado;
}

/** Dados do snapshot de `orcamento.copiar` (meses 0–11). */
export interface DadosSnapshotCopiar {
  de: MesRef;
  para: MesRef;
  sobrescrever: boolean;
  celulas: CelulaCopiada[];
}

export interface ResultadoCopiar {
  copiados: number;
  ignorados: number;
  /** Células efetivamente escritas (vazio = nada mudou, sem histórico). */
  celulas: CelulaCopiada[];
}

const temOrcado = (o: Orcado | null): o is Orcado => (o?.valor ?? 0) > 0 || (o?.pct ?? 0) > 0;

function itensVisiveis(g: CashflowGroup): CashflowItem[] {
  return [
    ...(g.items ?? []).filter((i) => !i.hidden),
    ...(g.children ?? []).filter((c) => !c.hidden).flatMap(itensVisiveis),
  ];
}

/** Ids das subcategorias visíveis hoje (os orçados moram sempre no id do usuário). */
async function subcategoriasVisiveis(userId: string, ano: number): Promise<string[]> {
  const arvore = await getMergedCashflowGroups(userId, ano);
  return categoriasDaArvore(arvore).flatMap((c) => itensVisiveis(c.grupo).map((i) => i.id));
}

/**
 * Plano puro: o que escrever no destino. `origem`/`destino` por itemId (só linhas existentes).
 */
export function planejarCopia(
  origem: Map<string, Orcado>,
  destino: Map<string, Orcado>,
  sobrescrever: boolean,
): ResultadoCopiar {
  let copiados = 0;
  let ignorados = 0;
  const celulas: CelulaCopiada[] = [];
  for (const [itemId, o] of origem) {
    if (!temOrcado(o)) continue;
    const atual = destino.get(itemId) ?? null;
    if (temOrcado(atual) && !sobrescrever) {
      ignorados++;
      continue;
    }
    copiados++;
    const depois: Orcado = { valor: o.valor, pct: o.pct };
    if (mesmoOrcado(atual, depois)) continue;
    celulas.push({ itemId, antes: atual, depois });
  }
  return { copiados, ignorados, celulas };
}

export async function copiarMes(
  userId: string,
  entrada: { de: MesRef; para: MesRef; sobrescrever: boolean },
  opts: { contexto?: ContextoRegistro } = {},
): Promise<ResultadoCopiar> {
  const { de, para, sobrescrever } = entrada;
  const ids = await subcategoriasVisiveis(userId, para.ano);
  if (ids.length === 0) return { copiados: 0, ignorados: 0, celulas: [] };

  const resultado = await prisma.$transaction(async (tx) => {
    const ler = async (m: MesRef) =>
      new Map(
        (
          await tx.cashflowOrcamentoItem.findMany({
            where: { userId, ano: m.ano, mes: m.mes0, itemId: { in: ids } },
            select: { itemId: true, valor: true, pct: true },
          })
        ).map((l) => [l.itemId, orcadoDaLinha(l)!]),
      );
    const plano = planejarCopia(await ler(de), await ler(para), sobrescrever);
    for (const c of plano.celulas) {
      const chave = { userId, itemId: c.itemId, ano: para.ano, mes: para.mes0 };
      await tx.cashflowOrcamentoItem.upsert({
        where: { userId_itemId_ano_mes: chave },
        update: { valor: c.depois.valor, pct: c.depois.pct },
        create: { ...chave, valor: c.depois.valor, pct: c.depois.pct },
      });
    }
    return plano;
  });

  if (resultado.celulas.length > 0 && opts.contexto) {
    const dados: DadosSnapshotCopiar = { de, para, sobrescrever, celulas: resultado.celulas };
    const snapshot: ChangeSnapshot = {
      v: 1,
      kind: KIND_SNAPSHOT_COPIAR,
      data: dados as unknown as Record<string, unknown>,
    };
    await recordChange({
      request: opts.contexto.request,
      auth: opts.contexto.auth,
      section: 'fluxo-caixa',
      action: ACAO_COPIAR_MES,
      entity: 'orcamento',
      entityId: `orcamento-${para.ano}-${String(para.mes0 + 1).padStart(2, '0')}`,
      entityLabel: `${rotuloMesAno(para.ano, para.mes0)} (copiado de ${rotuloMesAno(de.ano, de.mes0)})`,
      changes: [
        {
          field: 'subcategorias',
          label: 'Subcategorias copiadas',
          before: null,
          after: resultado.celulas.length,
          format: 'number',
        },
      ],
      snapshot,
    });
  }
  return resultado;
}
