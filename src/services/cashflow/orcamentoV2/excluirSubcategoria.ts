/**
 * Exclusão de subcategoria com fusão na Geral (desenho técnico §6.2 "Exclusão com fusão", R-12,
 * Q5, D11; PR 7). `archived_at` não existe: excluir FUNDE a sub na Geral da categoria e depois usa
 * a exclusão/lápide que já existe. É o mesmo caminho para o Orçamento (DELETE v2) e para a
 * Planilha (`delegarExclusaoItem` no batch-update/update): o resultado é idêntico (D11).
 *
 * Antes de tudo, fora da transação, `garantirGerais` (e `personalizeGroup` se a categoria ainda for
 * template). Depois, UMA transação só com `tx`:
 *  1. células da sub: sem célula da Geral no (ano, mês) → `itemId = geral` (nada se perde); com
 *     célula → soma `value` e `valorBanco`, `formula = null`, comentário "Somado de <sub> ao
 *     excluir". Cor: mesmo status de consolidado → mantém a da Geral; status divergentes (uma
 *     paga, outra não, as duas com valor) → recusa 409 `cores_divergentes` com os meses (Q5): o
 *     Consolidado do histórico nunca muda. Célula zerada não conflita (vale a cor da outra);
 *  2. `bank_transactions.cashflowItemId` → Geral;
 *  3. orçados da sub: meses FECHADOS somados à Geral (pct convertido em valor com a receita
 *     Lançado do mês); corrente e futuros apagados explicitamente (FK NO ACTION);
 *  4. item: override (ou override legado) → `ocultarItemTemplateTx(tx, templateId)` na MESMA
 *     transação (vira a lápide); item-template → lápide nova; item só do usuário → `delete`.
 * Depois do commit, `recordChange('orcamento.subcategoria.excluir', snapshot)`; o handler de
 * undo (`handlers/orcamentoV2.ts`) restaura célula a célula, transações, orçados e o item.
 *
 * Invariantes (testadas): real Lançado e Consolidado por categoria e mês iguais antes e depois, e
 * orçado dos meses fechados por categoria igual.
 *
 * `tratarOrcadosAntesDeApagarItem` cobre os outros caminhos que apagam linha com orçado (espelho de
 * sonho e de dívida): meses fechados na Geral da categoria, o resto apagado.
 */
import type { NextRequest } from 'next/server';
import type { Prisma, PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ApiError } from '@/utils/apiErrorHandler';
import { isConsolidadoColor } from '@/utils/cashflowColorLegend';
import { ocultarItemTemplateTx, personalizeGroup } from '@/utils/cashflowPersonalization';
import { arred2, faseDoMes, orcadoEfetivo, type HojeSP } from '@/lib/orcamento/regras';
import type { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { getMergedCashflowGroups } from '@/services/cashflow/getCashflowTree';
import {
  recordChange,
  finalStateChanges,
  CASHFLOW_FIELD_LABELS,
  type ChangeSnapshot,
} from '@/services/changeHistory';
import { categoriasDaArvore, garantirGerais, receitaLancadaPorMes } from './ativacao';
import type { CategoriaAtivacao } from './ativacao';

type Db = PrismaClient | Prisma.TransactionClient;

export const ACAO_EXCLUIR_SUBCATEGORIA = 'orcamento.subcategoria.excluir';
export const KIND_SNAPSHOT_EXCLUSAO = 'orcamento-subcategoria-excluir';
/** A transação lê a árvore e move células de vários anos: folga sobre os 5 s padrão. */
const TIMEOUT_TX_MS = 30_000;

/** "Hoje" em America/Sao_Paulo (UTC−3 fixo), mesmo critério de `orcamentoAlertas`. */
export function hojeEmSaoPauloExclusao(agora: Date): HojeSP {
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return { ano: brt.getUTCFullYear(), mes0: brt.getUTCMonth(), dia: brt.getUTCDate() };
}

// ---------------------------------------------------------------------------------------------
// Erros e tipos
// ---------------------------------------------------------------------------------------------

/** (ano, mês 0–11). A API converte para 1–12. */
export interface MesAno {
  ano: number;
  mes: number;
}

export type CodigoRecusaExclusao =
  | 'nao_encontrado'
  | 'fora_de_categoria'
  | 'geral'
  | 'espelho'
  | 'sem_geral'
  | 'cores_divergentes';

const MENSAGEM_RECUSA: Record<CodigoRecusaExclusao, string> = {
  nao_encontrado: 'Subcategoria não encontrada',
  fora_de_categoria: 'A linha não é subcategoria de uma categoria do orçamento',
  geral: 'A subcategoria Geral não pode ser excluída',
  espelho: 'Linha vinculada a um sonho ou dívida: exclua na área de origem',
  sem_geral: 'A categoria ainda não tem a subcategoria Geral',
  cores_divergentes:
    'Há meses em que esta subcategoria e a Geral têm status diferentes (pago × não pago). Acerte o status na Planilha antes de excluir.',
};

const STATUS_RECUSA: Record<CodigoRecusaExclusao, 404 | 409> = {
  nao_encontrado: 404,
  fora_de_categoria: 404,
  geral: 409,
  espelho: 409,
  sem_geral: 409,
  cores_divergentes: 409,
};

/** Recusa da exclusão. `meses` (0–11) só em `cores_divergentes`. */
export class ErroExclusaoSubcategoria extends ApiError {
  constructor(
    public codigo: CodigoRecusaExclusao,
    public meses: MesAno[] = [],
  ) {
    super(
      STATUS_RECUSA[codigo],
      MENSAGEM_RECUSA[codigo],
      meses.length > 0 ? { coresDivergentes: meses.map(rotuloMes) } : undefined,
    );
    this.name = 'ErroExclusaoSubcategoria';
  }
}

/** "2026-03" (mês 1–12), para mensagens e o `details` do erro. */
export const rotuloMes = ({ ano, mes }: MesAno): string =>
  `${ano}-${String(mes + 1).padStart(2, '0')}`;

export interface ImpactoExclusao {
  itemId: string;
  nome: string;
  geralId: string | null;
  celulas: number;
  transacoes: number;
  mesesComOrcado: number;
  coresDivergentes: MesAno[];
}

/** Estado de uma célula (CashflowValue) guardado no snapshot do undo. */
export interface CelulaEstado {
  value: number;
  valorBanco: number;
  formula: string | null;
  comment: string | null;
  color: string | null;
}

export interface Celula extends CelulaEstado {
  id: string;
  ano: number;
  mes: number;
}

export interface OrcadoLinha {
  ano: number;
  mes: number;
  valor: number | null;
  pct: number | null;
}

export interface SomaOrcadoGeral {
  ano: number;
  mes: number;
  antes: { valor: number | null; pct: number | null } | null;
  depois: number;
}

/** Como o item saiu: `ocultado` = override (ou legado) virou lápide; `lapide` = lápide nova de
 *  item-template; `apagado` = linha só do usuário apagada. */
export type ModoRemocao = 'ocultado' | 'lapide' | 'apagado';

export interface DadosSnapshotExclusao {
  item: {
    id: string;
    groupId: string;
    name: string;
    significado: string | null;
    rank: string | null;
    orderIndex: number;
    templateId: string | null;
    orcamentoFixa: boolean | null;
  };
  modo: ModoRemocao;
  tombstoneId: string | null;
  geralId: string;
  /** Ids das células movidas para a Geral (mesmo id, `itemId` trocado). */
  celulasMovidas: string[];
  celulasSomadas: {
    ano: number;
    mes: number;
    geralAntes: CelulaEstado;
    sub: CelulaEstado;
    geralDepois: { value: number; valorBanco: number };
  }[];
  transacoes: string[];
  orcadosSub: OrcadoLinha[];
  orcadosGeral: SomaOrcadoGeral[];
}

export interface ResultadoExclusao {
  itemId: string;
  nome: string;
  geralId: string;
  celulasMovidas: number;
  celulasSomadas: number;
  transacoesMovidas: number;
  orcadosSomados: number;
  orcadosApagados: number;
  snapshot: ChangeSnapshot;
}

// ---------------------------------------------------------------------------------------------
// Fusão (puro)
// ---------------------------------------------------------------------------------------------

const vazia = (c: CelulaEstado) => c.value === 0 && c.valorBanco === 0;

/**
 * Fusão das células da sub nas da Geral, por (ano, mês). Sem colisão → mover; com colisão →
 * somar. Cor (Q5): célula zerada não conflita (vale a cor da outra); as duas com valor e status de
 * consolidado diferentes → `coresDivergentes`; mesmo status → mantém a da Geral.
 */
export function planejarFusaoCelulas(
  nomeSub: string,
  sub: Celula[],
  geral: Celula[],
): {
  mover: Celula[];
  somar: { sub: Celula; geral: Celula; depois: CelulaEstado }[];
  coresDivergentes: MesAno[];
} {
  const daGeral = new Map(geral.map((c) => [`${c.ano}|${c.mes}`, c]));
  const mover: Celula[] = [];
  const somar: { sub: Celula; geral: Celula; depois: CelulaEstado }[] = [];
  const coresDivergentes: MesAno[] = [];
  for (const s of sub) {
    const g = daGeral.get(`${s.ano}|${s.mes}`);
    if (!g) {
      mover.push(s);
      continue;
    }
    // Sub zerada, sem comentário nem fórmula: nada a somar; só some com a linha.
    if (vazia(s) && !s.comment && !s.formula) {
      somar.push({ sub: s, geral: g, depois: estadoDe(g) });
      continue;
    }
    let color: string | null;
    if (vazia(s)) color = g.color;
    else if (vazia(g)) color = s.color;
    else if (isConsolidadoColor(s.color) !== isConsolidadoColor(g.color)) {
      coresDivergentes.push({ ano: s.ano, mes: s.mes });
      continue;
    } else color = g.color;
    const comentarios = [
      g.comment,
      s.comment ? `${nomeSub}: ${s.comment}` : null,
      `Somado de ${nomeSub} ao excluir`,
    ].filter((c): c is string => Boolean(c && c.trim()));
    somar.push({
      sub: s,
      geral: g,
      depois: {
        value: arred2(g.value + s.value),
        valorBanco: arred2(g.valorBanco + s.valorBanco),
        formula: vazia(g) ? s.formula : vazia(s) ? g.formula : null,
        comment: comentarios.join('\n'),
        color,
      },
    });
  }
  coresDivergentes.sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  return { mover, somar, coresDivergentes };
}

/**
 * Orçados da sub: os de meses FECHADOS (fase 'passado') somados à Geral, em valor (pct convertido
 * pela receita do mês; Geral em pct, que não deveria existir, também vira valor); corrente e
 * futuros só apagados. `receitaDe` só é chamada para linhas em pct.
 */
export function planejarFusaoOrcados(
  sub: OrcadoLinha[],
  geral: OrcadoLinha[],
  hojeSP: HojeSP,
  receitaDe: (ano: number, mes: number) => number | null,
): { somar: SomaOrcadoGeral[]; apagados: number } {
  const daGeral = new Map(geral.map((o) => [`${o.ano}|${o.mes}`, o]));
  const efetivo = (o: OrcadoLinha) =>
    o.pct != null ? orcadoEfetivo(o, receitaDe(o.ano, o.mes)) : orcadoEfetivo(o, null);
  const somar: SomaOrcadoGeral[] = [];
  let apagados = 0;
  for (const o of sub) {
    if (faseDoMes(o.ano, o.mes, hojeSP) !== 'passado') {
      apagados++;
      continue;
    }
    const v = efetivo(o);
    if (v === 0) continue;
    const g = daGeral.get(`${o.ano}|${o.mes}`);
    somar.push({
      ano: o.ano,
      mes: o.mes,
      antes: g ? { valor: g.valor, pct: g.pct } : null,
      depois: arred2((g ? efetivo(g) : 0) + v),
    });
  }
  return { somar, apagados };
}

// ---------------------------------------------------------------------------------------------
// Resolução do alvo
// ---------------------------------------------------------------------------------------------

interface AlvoExclusao {
  /** Item mesclado (id = linha do usuário ou o template). */
  item: CashflowItem;
  categoria: CategoriaAtivacao;
  geral: CashflowItem | null;
}

type Resolucao = { ok: true; alvo: AlvoExclusao } | { ok: false; codigo: CodigoRecusaExclusao };

function itensDaSubarvore(g: CashflowGroup): CashflowItem[] {
  return [...(g.items ?? []), ...(g.children ?? []).flatMap(itensDaSubarvore)];
}

/** Item (pelo id mesclado ou pelo template que ele personaliza) na partição de categorias. */
export function localizarNaCategoria(
  arvore: CashflowGroup[],
  itemId: string,
): { item: CashflowItem; categoria: CategoriaAtivacao; geral: CashflowItem | null } | null {
  for (const categoria of categoriasDaArvore(arvore)) {
    const item = itensDaSubarvore(categoria.grupo).find(
      (i) => i.id === itemId || i.templateId === itemId,
    );
    if (item) {
      // A Geral mora direto no grupo da categoria (itens de subgrupos entram achatados).
      const geral = (categoria.grupo.items ?? []).find((i) => i.isGeral) ?? null;
      return { item, categoria, geral };
    }
  }
  return null;
}

async function resolverAlvo(db: Db, userId: string, itemId: string): Promise<Resolucao> {
  const arvore = await getMergedCashflowGroups(userId, new Date().getFullYear(), db);
  const achado = localizarNaCategoria(arvore, itemId);
  if (!achado) {
    const existe = await db.cashflowItem.findFirst({
      where: { id: itemId, OR: [{ userId }, { userId: null }] },
      select: { id: true },
    });
    return { ok: false, codigo: existe ? 'fora_de_categoria' : 'nao_encontrado' };
  }
  if (achado.item.isGeral) return { ok: false, codigo: 'geral' };
  if (achado.item.objetivoId || achado.item.dividaId) return { ok: false, codigo: 'espelho' };
  if (achado.item.userId !== null && achado.item.userId !== userId) {
    return { ok: false, codigo: 'nao_encontrado' };
  }
  return { ok: true, alvo: achado };
}

const numero = (v: unknown): number => (v == null ? 0 : Number(v));
const numeroOuNull = (v: unknown): number | null => (v == null ? null : Number(v));

function estadoDe(c: CelulaEstado): CelulaEstado {
  return {
    value: c.value,
    valorBanco: c.valorBanco,
    formula: c.formula,
    comment: c.comment,
    color: c.color,
  };
}

async function celulasDo(db: Db, itemId: string, userId: string): Promise<Celula[]> {
  const linhas = await db.cashflowValue.findMany({
    where: { itemId, userId },
    select: {
      id: true,
      year: true,
      month: true,
      value: true,
      valorBanco: true,
      formula: true,
      comment: true,
      color: true,
    },
  });
  return linhas.map((l) => ({
    id: l.id,
    ano: l.year,
    mes: l.month,
    value: numero(l.value),
    valorBanco: numero(l.valorBanco),
    formula: l.formula ?? null,
    comment: l.comment ?? null,
    color: l.color ?? null,
  }));
}

async function orcadosDo(db: Db, itemId: string, userId: string): Promise<OrcadoLinha[]> {
  const linhas = await db.cashflowOrcamentoItem.findMany({
    where: { itemId, userId },
    select: { ano: true, mes: true, valor: true, pct: true },
  });
  return linhas.map((l) => ({
    ano: l.ano,
    mes: l.mes,
    valor: numeroOuNull(l.valor),
    pct: numeroOuNull(l.pct),
  }));
}

/** Receita Lançado por (ano, mês), montando a árvore do ano só quando um pct precisa dela. */
async function receitasPara(
  db: Db,
  userId: string,
  linhas: OrcadoLinha[],
): Promise<(ano: number, mes: number) => number | null> {
  const anos = [...new Set(linhas.filter((l) => l.pct != null).map((l) => l.ano))];
  const porAno = new Map<number, number[]>();
  for (const ano of anos) {
    porAno.set(ano, receitaLancadaPorMes(await getMergedCashflowGroups(userId, ano, db)));
  }
  return (ano, mes) => porAno.get(ano)?.[mes] ?? null;
}

/** Soma os orçados de meses fechados na Geral e apaga TODOS os orçados do item (FK NO ACTION). */
async function fundirOrcados(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
  geralId: string | null,
  hojeSP: HojeSP,
): Promise<{ orcadosSub: OrcadoLinha[]; somar: SomaOrcadoGeral[]; apagados: number }> {
  const orcadosSub = await orcadosDo(tx, itemId, userId);
  if (orcadosSub.length === 0) return { orcadosSub, somar: [], apagados: 0 };
  let somar: SomaOrcadoGeral[] = [];
  let apagados = orcadosSub.length;
  if (geralId) {
    const anos = [...new Set(orcadosSub.map((o) => o.ano))];
    const orcadosGeral = (await orcadosDo(tx, geralId, userId)).filter((o) => anos.includes(o.ano));
    const receitaDe = await receitasPara(tx, userId, [...orcadosSub, ...orcadosGeral]);
    ({ somar, apagados } = planejarFusaoOrcados(orcadosSub, orcadosGeral, hojeSP, receitaDe));
    for (const s of somar) {
      await tx.cashflowOrcamentoItem.upsert({
        where: {
          userId_itemId_ano_mes: { userId, itemId: geralId, ano: s.ano, mes: s.mes },
        },
        update: { valor: s.depois, pct: null },
        create: { userId, itemId: geralId, ano: s.ano, mes: s.mes, valor: s.depois },
      });
    }
  }
  await tx.cashflowOrcamentoItem.deleteMany({ where: { itemId, userId } });
  return { orcadosSub, somar, apagados };
}

// ---------------------------------------------------------------------------------------------
// Impacto (só leitura) e exclusão
// ---------------------------------------------------------------------------------------------

/** Contagens para a confirmação (GET .../impacto). Lança 404/409 como a exclusão. */
export async function planejarExclusao(
  userId: string,
  itemId: string,
  _hojeSP: HojeSP,
): Promise<ImpactoExclusao> {
  const r = await resolverAlvo(prisma, userId, itemId);
  if (!r.ok) throw new ErroExclusaoSubcategoria(r.codigo);
  const { item, geral } = r.alvo;
  const [sub, daGeral, transacoes, orcados] = await Promise.all([
    celulasDo(prisma, item.id, userId),
    geral ? celulasDo(prisma, geral.id, userId) : Promise.resolve([]),
    prisma.bankTransaction.count({ where: { userId, cashflowItemId: item.id } }),
    orcadosDo(prisma, item.id, userId),
  ]);
  return {
    itemId: item.id,
    nome: item.name,
    geralId: geral?.id ?? null,
    celulas: sub.length,
    transacoes,
    mesesComOrcado: orcados.filter((o) => (o.valor ?? 0) > 0 || (o.pct ?? 0) > 0).length,
    coresDivergentes: planejarFusaoCelulas(item.name, sub, daGeral).coresDivergentes,
  };
}

/**
 * Núcleo transacional: funde a sub na Geral e remove o item. Chamar só dentro de
 * `prisma.$transaction` (a Geral já garantida fora). Lança `ErroExclusaoSubcategoria`.
 */
export async function excluirSubcategoria(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
  hojeSP: HojeSP,
): Promise<ResultadoExclusao> {
  const r = await resolverAlvo(tx, userId, itemId);
  if (!r.ok) throw new ErroExclusaoSubcategoria(r.codigo);
  const { item: mesclado, geral } = r.alvo;
  if (!geral) throw new ErroExclusaoSubcategoria('sem_geral');

  const linha = await tx.cashflowItem.findUnique({ where: { id: mesclado.id } });
  if (!linha) throw new ErroExclusaoSubcategoria('nao_encontrado');

  // 1) Células
  const [sub, daGeral] = await Promise.all([
    celulasDo(tx, linha.id, userId),
    celulasDo(tx, geral.id, userId),
  ]);
  const fusao = planejarFusaoCelulas(linha.name, sub, daGeral);
  if (fusao.coresDivergentes.length > 0) {
    throw new ErroExclusaoSubcategoria('cores_divergentes', fusao.coresDivergentes);
  }
  if (fusao.mover.length > 0) {
    await tx.cashflowValue.updateMany({
      where: { id: { in: fusao.mover.map((c) => c.id) } },
      data: { itemId: geral.id },
    });
  }
  for (const { geral: g, depois } of fusao.somar) {
    await tx.cashflowValue.update({
      where: { id: g.id },
      data: {
        value: depois.value,
        valorBanco: depois.valorBanco,
        formula: depois.formula,
        comment: depois.comment,
        color: depois.color,
      },
    });
  }
  if (fusao.somar.length > 0) {
    await tx.cashflowValue.deleteMany({
      where: { id: { in: fusao.somar.map((s) => s.sub.id) } },
    });
  }

  // 2) Transações do banco
  const transacoes = (
    await tx.bankTransaction.findMany({
      where: { userId, cashflowItemId: linha.id },
      select: { id: true },
    })
  ).map((t) => t.id);
  if (transacoes.length > 0) {
    await tx.bankTransaction.updateMany({
      where: { id: { in: transacoes } },
      data: { cashflowItemId: geral.id },
    });
  }

  // 3) Orçados
  const orc = await fundirOrcados(tx, userId, linha.id, geral.id, hojeSP);

  // 4) Item: lápide pelo templateId (mesma transação) ou delete
  let modo: ModoRemocao;
  let tombstoneId: string | null = null;
  const templateParaOcultar =
    linha.userId === null ? linha.id : (linha.templateId ?? (await templateLegado(tx, linha)));
  if (templateParaOcultar) {
    tombstoneId = await ocultarItemTemplateTx(tx, templateParaOcultar, userId);
    modo = linha.userId === null ? 'lapide' : 'ocultado';
  } else {
    await tx.cashflowItem.delete({ where: { id: linha.id } });
    modo = 'apagado';
  }

  const dados: DadosSnapshotExclusao = {
    item: {
      id: linha.id,
      groupId: linha.groupId,
      name: linha.name,
      significado: linha.significado ?? null,
      rank: linha.rank ?? null,
      orderIndex: linha.orderIndex ?? 0,
      templateId: linha.templateId ?? null,
      orcamentoFixa: linha.orcamentoFixa ?? null,
    },
    modo,
    tombstoneId,
    geralId: geral.id,
    celulasMovidas: fusao.mover.map((c) => c.id),
    celulasSomadas: fusao.somar.map(({ sub: s, geral: g, depois }) => ({
      ano: s.ano,
      mes: s.mes,
      geralAntes: estadoDe(g),
      sub: estadoDe(s),
      geralDepois: { value: depois.value, valorBanco: depois.valorBanco },
    })),
    transacoes,
    orcadosSub: orc.orcadosSub,
    orcadosGeral: orc.somar,
  };

  return {
    itemId: linha.id,
    nome: linha.name,
    geralId: geral.id,
    celulasMovidas: fusao.mover.length,
    celulasSomadas: fusao.somar.length,
    transacoesMovidas: transacoes.length,
    orcadosSomados: orc.somar.length,
    orcadosApagados: orc.apagados,
    snapshot: {
      v: 1,
      kind: KIND_SNAPSHOT_EXCLUSAO,
      data: dados as unknown as Record<string, unknown>,
    },
  };
}

/**
 * Override LEGADO (sem templateId gravado, casado com a linha padrão de mesmo nome no
 * grupo-template, como em `getCashflowTree.findOverrideItem`): devolve o item-template para
 * ocultar; `ocultarItemTemplateTx` transforma o próprio legado na lápide.
 */
async function templateLegado(
  tx: Prisma.TransactionClient,
  linha: { name: string; groupId: string },
): Promise<string | null> {
  const grupo = await tx.cashflowGroup.findUnique({
    where: { id: linha.groupId },
    select: { templateId: true },
  });
  if (!grupo?.templateId) return null;
  const tpl = await tx.cashflowItem.findFirst({
    where: { userId: null, groupId: grupo.templateId, name: linha.name },
    select: { id: true },
  });
  return tpl?.id ?? null;
}

/** Quem registra o histórico (rota): request + auth de `requireAuthWithActing`. */
export interface ContextoRegistro {
  request: NextRequest;
  auth: { payload: { id: string }; targetUserId: string; actingClient: { id: string } | null };
}

export interface OpcoesExecucao {
  agora?: Date;
  contexto?: ContextoRegistro;
  /**
   * Delegação da Planilha: item fora de categoria, inexistente ou espelho → `null` ('nao_aplica',
   * a rota segue o caminho de hoje) em vez de lançar.
   */
  delegacao?: boolean;
}

const NAO_APLICA_NA_DELEGACAO = new Set<CodigoRecusaExclusao>([
  'nao_encontrado',
  'fora_de_categoria',
  'espelho',
]);

/**
 * Fluxo completo (Orçamento e Planilha): garante a Geral fora da transação, funde numa transação
 * e registra o histórico depois do commit. `null` só na delegação quando não se aplica.
 */
export async function executarExclusaoSubcategoria(
  userId: string,
  itemId: string,
  opts: OpcoesExecucao = {},
): Promise<ResultadoExclusao | null> {
  const hojeSP = hojeEmSaoPauloExclusao(opts.agora ?? new Date());
  const r = await resolverAlvo(prisma, userId, itemId);
  if (!r.ok) {
    if (opts.delegacao && NAO_APLICA_NA_DELEGACAO.has(r.codigo)) return null;
    throw new ErroExclusaoSubcategoria(r.codigo);
  }
  // Fora de transação: personalizeGroup abre a própria e garantirGerais tolera corrida (P2002).
  if (!r.alvo.geral) {
    if (!r.alvo.categoria.doUsuario) await personalizeGroup(r.alvo.categoria.id, userId);
    await garantirGerais(userId);
  }
  // Item-template: a lápide mora no override do grupo-template, que `ocultarItemTemplateTx` não
  // cria (o `groupId` do item mesclado pode já ser o do usuário: lê o da linha).
  if (r.alvo.item.userId === null) {
    const tpl = await prisma.cashflowItem.findUnique({
      where: { id: r.alvo.item.id },
      select: { groupId: true },
    });
    if (tpl) await personalizeGroup(tpl.groupId, userId);
  }

  const resultado = await prisma.$transaction(
    (tx) => excluirSubcategoria(tx, userId, itemId, hojeSP),
    { timeout: TIMEOUT_TX_MS },
  );

  if (opts.contexto) {
    const d = resultado.snapshot.data as unknown as DadosSnapshotExclusao;
    await recordChange({
      request: opts.contexto.request,
      auth: opts.contexto.auth,
      section: 'fluxo-caixa',
      action: ACAO_EXCLUIR_SUBCATEGORIA,
      entity: 'item',
      entityId: resultado.itemId,
      entityLabel: resultado.nome,
      changes: finalStateChanges(
        { name: d.item.name, significado: d.item.significado, rank: d.item.rank },
        CASHFLOW_FIELD_LABELS,
      ),
      snapshot: resultado.snapshot,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------------------------------
// Outros caminhos que apagam linha com orçado (espelho de sonho e de dívida)
// ---------------------------------------------------------------------------------------------

/**
 * Antes de apagar uma linha que tem orçado (FK NO ACTION): meses fechados somados na Geral da
 * categoria em que a linha está (espelho de sonho → Planejamento Financeiro; dívida → a categoria
 * do espelho); corrente e futuros apagados. Sem categoria/Geral, os orçados só são apagados (com
 * log): o orçado só se grava em subcategoria, então isso não deveria acontecer.
 */
export async function tratarOrcadosAntesDeApagarItem(
  userId: string,
  itemId: string,
  agora: Date = new Date(),
): Promise<{ somados: number; apagados: number }> {
  const hojeSP = hojeEmSaoPauloExclusao(agora);
  const arvore = await getMergedCashflowGroups(userId, new Date().getFullYear());
  let geralId = localizarNaCategoria(arvore, itemId)?.geral?.id ?? null;
  if (!geralId && localizarNaCategoria(arvore, itemId)) {
    await garantirGerais(userId);
    const depois = await getMergedCashflowGroups(userId, new Date().getFullYear());
    geralId = localizarNaCategoria(depois, itemId)?.geral?.id ?? null;
  }
  if (!geralId) {
    logger.warn('[orcamento-v2] orçados apagados sem Geral para somar', { itemId });
  }
  const r = await prisma.$transaction((tx) => fundirOrcados(tx, userId, itemId, geralId, hojeSP), {
    timeout: TIMEOUT_TX_MS,
  });
  return { somados: r.somar.length, apagados: r.apagados };
}
