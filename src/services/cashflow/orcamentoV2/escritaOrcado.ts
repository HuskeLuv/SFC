/**
 * Escrita do orçado por subcategoria e da marca "fixa" (Orçamento v2, desenho técnico §6.2/§6.3,
 * PR 9). Usado pelas rotas `PUT .../subcategorias/[itemId]/orcado` e `PATCH
 * .../subcategorias/[itemId]`.
 *
 * - A subcategoria é resolvida na árvore MESCLADA do dono dos dados (`localizarNaCategoria`, o
 *   mesmo da exclusão): item oculto, fora da partição de categorias ou de outro usuário → 404.
 * - Todo orçado é gravado no id DO USUÁRIO (§2, pegadinha 2): item-template passa por
 *   `ensurePersonalizedItem` antes, como toda escrita de valor já faz.
 * - R-17: `pct` só em subcategoria NÃO Geral de categoria poupança (Planejamento) → senão 400.
 * - `valor: null` limpa (apaga a linha do mês). Sem mudança real → nada é gravado nem registrado.
 * - Histórico depois da escrita: `orcamento.item.editar` (undo pelo registry LIFO com o valor
 *   anterior, `handlers/orcamentoV2.ts`) e `orcamento.subcategoria.fixa` (sem undo). O consultor
 *   (acting) fica registrado pelo próprio `recordChange` (`viaConsultant`/`actorId`).
 */
import prisma from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import { ensurePersonalizedItem } from '@/utils/cashflowPersonalization';
import { aceitaPct, type Orcado } from '@/lib/orcamento/regras';
import { ehCategoriaPoupanca } from '@/lib/orcamento/catalogo';
import type { CashflowItem } from '@/types/cashflow';
import type { FonteOrcamento, OrcadoEscritaResponse } from '@/types/orcamentoV2';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import { recordChange, type ChangeSnapshot, type FieldChange } from '@/services/changeHistory';
import type { CategoriaAtivacao } from './ativacao';
import { carregarOrcamentoV2 } from './carregarOrcamento';
import { localizarNaCategoria, type ContextoRegistro } from './excluirSubcategoria';

export const ACAO_EDITAR_ORCADO = 'orcamento.item.editar';
export const KIND_SNAPSHOT_EDITAR_ORCADO = 'orcamento-item-editar';
export const ACAO_FIXA_SUBCATEGORIA = 'orcamento.subcategoria.fixa';

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/** "out/2026" (mês 0–11). */
export const rotuloMesAno = (ano: number, mes0: number): string => `${MESES_ABREV[mes0]}/${ano}`;

export type CodigoErroEscrita = 'nao_encontrado' | 'pct_nao_permitido' | 'fixa_poupanca';

const MENSAGEM_ERRO: Record<CodigoErroEscrita, string> = {
  nao_encontrado: 'Subcategoria não encontrada',
  pct_nao_permitido:
    'Percentual da receita só é aceito nas subcategorias de Planejamento Financeiro (exceto a Geral)',
  fixa_poupanca: 'Em Planejamento Financeiro as subcategorias são sempre fixas',
};

const STATUS_ERRO: Record<CodigoErroEscrita, 400 | 404> = {
  nao_encontrado: 404,
  pct_nao_permitido: 400,
  fixa_poupanca: 400,
};

export class ErroEscritaOrcamento extends ApiError {
  constructor(public codigo: CodigoErroEscrita) {
    super(STATUS_ERRO[codigo], MENSAGEM_ERRO[codigo]);
    this.name = 'ErroEscritaOrcamento';
  }
}

export interface SubcategoriaResolvida {
  /** Item mesclado (id = linha do usuário ou o template). */
  item: CashflowItem;
  categoria: CategoriaAtivacao;
  geral: boolean;
  poupanca: boolean;
}

/** Subcategoria visível do usuário na partição de categorias, ou 404. */
export async function resolverSubcategoria(
  userId: string,
  itemId: string,
  ano: number,
): Promise<SubcategoriaResolvida> {
  const arvore = await getMergedCashflowGroups(userId, ano);
  const achado = localizarNaCategoria(arvore, itemId);
  if (
    !achado ||
    achado.item.hidden ||
    (achado.item.userId !== null && achado.item.userId !== userId)
  ) {
    throw new ErroEscritaOrcamento('nao_encontrado');
  }
  return {
    item: achado.item,
    categoria: achado.categoria,
    geral: achado.item.isGeral === true,
    poupanca: ehCategoriaPoupanca(achado.categoria.nomeCanonico),
  };
}

/** Id do usuário para gravar (item-template → override via `ensurePersonalizedItem`). */
async function idDoUsuario(item: CashflowItem, userId: string): Promise<string> {
  if (item.userId !== null) return item.id;
  return (await ensurePersonalizedItem(item.id, userId)).itemId;
}

const numeroOuNull = (v: unknown): number | null => (v == null ? null : Number(v));

/** Linha do banco → `Orcado` (null = sem linha). */
export const orcadoDaLinha = (
  l: { valor: unknown; pct: unknown } | null | undefined,
): Orcado | null => (l ? { valor: numeroOuNull(l.valor), pct: numeroOuNull(l.pct) } : null);

/** Mesmo orçado (null = sem linha). */
export function mesmoOrcado(a: Orcado | null, b: Orcado | null): boolean {
  if (a === null || b === null) return a === b;
  const igual = (x: number | null, y: number | null) =>
    x === null || y === null ? x === y : Math.abs(x - y) < 1e-6;
  return igual(a.valor, b.valor) && igual(a.pct, b.pct);
}

/** Pares antes/depois do histórico (valor em R$ e % da receita, só os que mudaram). */
function changesOrcado(antes: Orcado | null, depois: Orcado | null): FieldChange[] {
  const out: FieldChange[] = [];
  const va = antes?.valor ?? null;
  const vd = depois?.valor ?? null;
  const pa = antes?.pct ?? null;
  const pd = depois?.pct ?? null;
  if (va !== vd) {
    out.push({ field: 'valor', label: 'Orçado', before: va, after: vd, format: 'currency' });
  }
  if (pa !== pd) {
    out.push({
      field: 'pct',
      label: 'Orçado (% da receita)',
      before: pa,
      after: pd,
      format: 'percent',
    });
  }
  return out;
}

/** Dados do snapshot de `orcamento.item.editar` (mês 0–11). */
export interface DadosSnapshotEditarOrcado {
  itemId: string;
  ano: number;
  mes: number;
  antes: Orcado | null;
  depois: Orcado | null;
}

export type EntradaOrcado =
  | { ano: number; mes0: number; modo: 'valor'; valor: number | null }
  | { ano: number; mes0: number; modo: 'pct'; pct: number };

export interface ResultadoOrcado {
  /** Id do usuário em que o orçado ficou gravado. */
  itemId: string;
  nome: string;
  antes: Orcado | null;
  depois: Orcado | null;
  mudou: boolean;
}

/**
 * Grava (ou limpa) o orçado de uma subcategoria num mês. Lança `ErroEscritaOrcamento` (404/400).
 * Com `contexto`, registra `orcamento.item.editar` depois da escrita (só se mudou).
 */
export async function salvarOrcado(
  userId: string,
  itemId: string,
  entrada: EntradaOrcado,
  opts: { contexto?: ContextoRegistro } = {},
): Promise<ResultadoOrcado> {
  const { ano, mes0 } = entrada;
  const sub = await resolverSubcategoria(userId, itemId, ano);
  if (entrada.modo === 'pct' && !aceitaPct({ geral: sub.geral }, { poupanca: sub.poupanca })) {
    throw new ErroEscritaOrcamento('pct_nao_permitido');
  }
  const depois: Orcado | null =
    entrada.modo === 'pct'
      ? { valor: null, pct: entrada.pct }
      : entrada.valor === null
        ? null
        : { valor: entrada.valor, pct: null };

  const idFinal = await idDoUsuario(sub.item, userId);
  const chave = { userId, itemId: idFinal, ano, mes: mes0 };

  const { antes, mudou } = await prisma.$transaction(async (tx) => {
    const linha = await tx.cashflowOrcamentoItem.findUnique({
      where: { userId_itemId_ano_mes: chave },
      select: { valor: true, pct: true },
    });
    const anterior = orcadoDaLinha(linha);
    if (mesmoOrcado(anterior, depois)) return { antes: anterior, mudou: false };
    if (depois === null) {
      await tx.cashflowOrcamentoItem.deleteMany({ where: chave });
    } else {
      await tx.cashflowOrcamentoItem.upsert({
        where: { userId_itemId_ano_mes: chave },
        update: { valor: depois.valor, pct: depois.pct },
        create: { ...chave, valor: depois.valor, pct: depois.pct },
      });
    }
    return { antes: anterior, mudou: true };
  });

  if (mudou && opts.contexto) {
    const dados: DadosSnapshotEditarOrcado = { itemId: idFinal, ano, mes: mes0, antes, depois };
    const snapshot: ChangeSnapshot = {
      v: 1,
      kind: KIND_SNAPSHOT_EDITAR_ORCADO,
      data: dados as unknown as Record<string, unknown>,
    };
    await recordChange({
      request: opts.contexto.request,
      auth: opts.contexto.auth,
      section: 'fluxo-caixa',
      action: ACAO_EDITAR_ORCADO,
      entity: 'orcamento-item',
      entityId: idFinal,
      entityLabel: `${sub.item.name} · ${rotuloMesAno(ano, mes0)}`,
      changes: changesOrcado(antes, depois),
      snapshot,
    });
  }

  return { itemId: idFinal, nome: sub.item.name, antes, depois, mudou };
}

/**
 * R-07: marca/desmarca a subcategoria como fixa (`null` = volta ao padrão do catálogo). Em
 * Planejamento Financeiro é sempre fixa → 400. Registra `orcamento.subcategoria.fixa` (sem undo).
 */
export async function marcarFixa(
  userId: string,
  itemId: string,
  fixa: boolean | null,
  ano: number,
  opts: { contexto?: ContextoRegistro } = {},
): Promise<{ itemId: string; mudou: boolean }> {
  const sub = await resolverSubcategoria(userId, itemId, ano);
  if (sub.poupanca) throw new ErroEscritaOrcamento('fixa_poupanca');
  const antes = sub.item.orcamentoFixa ?? null;
  if (antes === fixa) return { itemId: sub.item.id, mudou: false };

  const idFinal = await idDoUsuario(sub.item, userId);
  await prisma.cashflowItem.update({ where: { id: idFinal }, data: { orcamentoFixa: fixa } });

  if (opts.contexto) {
    await recordChange({
      request: opts.contexto.request,
      auth: opts.contexto.auth,
      section: 'fluxo-caixa',
      action: ACAO_FIXA_SUBCATEGORIA,
      entity: 'item',
      entityId: idFinal,
      entityLabel: sub.item.name,
      changes: [{ field: 'orcamentoFixa', label: 'Fixa', before: antes, after: fixa }],
    });
  }
  return { itemId: idFinal, mudou: true };
}

/**
 * `{subcategoria, categoria, resumo}` do mês recalculados pela montagem pura do GET (mesma
 * árvore, mesmas regras). `null` se a linha não aparece mais (não deveria acontecer).
 */
export async function respostaDaSubcategoria(
  userId: string,
  itemId: string,
  params: { ano: number; mes0: number; fonte?: FonteOrcamento },
  agora: Date = new Date(),
): Promise<OrcadoEscritaResponse | null> {
  const corpo = await carregarOrcamentoV2(
    userId,
    { ano: params.ano, mes0: params.mes0, visao: 'mes', fonte: params.fonte },
    agora,
  );
  for (const categoria of corpo.categorias) {
    const subcategoria = categoria.subcategorias.find((s) => s.id === itemId);
    if (subcategoria) return { subcategoria, categoria, resumo: corpo.resumo };
  }
  return null;
}
