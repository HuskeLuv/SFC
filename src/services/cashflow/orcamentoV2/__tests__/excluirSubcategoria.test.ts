/**
 * Exclusão com fusão na Geral (desenho técnico §6.2, R-12, Q5, D11; PR 7). Dados 100% sintéticos
 * num banco em memória (`bancoFalso.ts`), com `personalizeGroup`, `ocultarItemTemplateTx`,
 * `garantirGerais` e o merge da árvore REAIS. O fake aplica o FK NO ACTION do orçado e o de
 * CashflowValue: um caminho que apagasse item com orçado/célula falharia aqui.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserChangeLog } from '@prisma/client';
import type { BancoFalso, Linha } from './bancoFalso';

const h = vi.hoisted(() => ({ banco: null as null | BancoFalso }));
const mockRecordChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => {
  const proxy = new Proxy(
    {},
    { get: (_alvo, chave: string) => (h.banco!.prisma as Record<string, unknown>)[chave] },
  );
  return { prisma: proxy, default: proxy };
});
vi.mock('@/services/cashflow/getCashflowTree', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/cashflow/getCashflowTree')>();
  return {
    ...original,
    getMergedCashflowGroups: vi.fn(async (userId: string, ano: number) =>
      h.banco!.arvoreMesclada(userId, ano),
    ),
  };
});
vi.mock('@/services/changeHistory', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/changeHistory')>();
  return { ...original, recordChange: mockRecordChange };
});
vi.mock('@/services/cashflow/evolucaoPatrimonioServer', () => ({
  recomputeEvolucaoSnapshotsSafe: vi.fn(),
}));

import { criarBancoFalso } from './bancoFalso';
import { personalizeGroup } from '@/utils/cashflowPersonalization';
import { capturarInvariantes, garantirGerais } from '../ativacao';
import {
  ACAO_EXCLUIR_SUBCATEGORIA,
  ErroExclusaoSubcategoria,
  executarExclusaoSubcategoria,
  hojeEmSaoPauloExclusao,
  planejarExclusao,
  planejarFusaoCelulas,
  planejarFusaoOrcados,
  tratarOrcadosAntesDeApagarItem,
  type Celula,
} from '../excluirSubcategoria';
import { delegarExclusaoItem } from '../guardas';
import { ORCAMENTO_V2_UNDO_HANDLERS } from '@/services/changeHistory/undo/handlers/orcamentoV2';
import { FLUXO_CAIXA_UNDO_HANDLERS } from '@/services/changeHistory/undo/handlers/fluxoCaixa';
import { removeObjetivoCashflow } from '@/services/planejamento/sonhoCashflowSync';
import { removeDividaCashflow } from '@/services/dividas/dividaCashflowSync';

const U = 'u1';
/** 23/10/2026: meses fechados = jan–set/2026 e anteriores; out = corrente. */
const AGORA = new Date('2026-10-23T12:00:00Z');
const HOJE_SP = hojeEmSaoPauloExclusao(AGORA);
const ANO = new Date().getFullYear();
const VERMELHO = '#FF0000';
const AZUL = '#0000FF';

let banco: BancoFalso;

function semearTemplates() {
  const g = (id: string, name: string, type: string, parentId: string | null, orderIndex = 0) =>
    banco.inserir('cashflowGroup', { id, userId: null, name, type, parentId, orderIndex });
  const i = (id: string, groupId: string, name: string, orderIndex = 0) =>
    banco.inserir('cashflowItem', { id, userId: null, groupId, name, orderIndex });
  g('tpl-ent', 'Entradas', 'entrada', null, 0);
  i('tpl-sal', 'tpl-ent', 'Salário');
  g('tpl-desp', 'Despesas', 'despesa', null, 1);
  g('tpl-fix', 'Despesas Fixas', 'despesa', 'tpl-desp', 0);
  g('tpl-hab', 'Habitação', 'despesa', 'tpl-fix', 0);
  i('tpl-alug', 'tpl-hab', 'Aluguel / Prestação', 0);
  i('tpl-cond', 'tpl-hab', 'Condomínio', 1);
  g('tpl-plan', 'Planejamento Financeiro', 'despesa', 'tpl-fix', 1);
  i('tpl-res', 'tpl-plan', 'Reserva de emergência');
  g('tpl-var', 'Despesas Variáveis', 'despesa', 'tpl-desp', 1);
  i('tpl-div', 'tpl-var', 'Diversos');
}

const grupoDo = (templateId: string) =>
  banco.dados.cashflowGroup.find((x) => x.userId === U && x.templateId === templateId)!
    .id as string;
const itemDo = (templateId: string) =>
  banco.dados.cashflowItem.find((x) => x.userId === U && x.templateId === templateId)!.id as string;
const geralDe = (templateGroupId: string) =>
  banco.dados.cashflowItem.find(
    (x) => x.groupId === grupoDo(templateGroupId) && x.isGeral === true && !x.hidden,
  )!.id as string;

function celula(itemId: string, year: number, month: number, value: number, extra: Linha = {}) {
  return banco.inserir('cashflowValue', {
    itemId,
    userId: U,
    year,
    month,
    value,
    formula: null,
    comment: null,
    ...extra,
  });
}

function orcado(itemId: string, ano: number, mes: number, extra: Linha) {
  return banco.inserir('cashflowOrcamentoItem', {
    userId: U,
    itemId,
    ano,
    mes,
    valor: null,
    pct: null,
    ...extra,
  });
}

function itemProprio(id: string, templateGroupId: string, name: string, extra: Linha = {}) {
  return banco.inserir('cashflowItem', {
    id,
    userId: U,
    groupId: grupoDo(templateGroupId),
    name,
    ...extra,
  });
}

const celulasDo = (itemId: string) =>
  banco.dados.cashflowValue
    .filter((v) => v.itemId === itemId)
    .sort(
      (a, b) =>
        (a.year as number) - (b.year as number) || (a.month as number) - (b.month as number),
    );
const orcadosDo = (itemId: string) =>
  banco.dados.cashflowOrcamentoItem
    .filter((o) => o.itemId === itemId)
    .sort((a, b) => (a.ano as number) - (b.ano as number) || (a.mes as number) - (b.mes as number));

/** Estado comparável (sem ids gerados nem timestamps). */
function estado() {
  const sem = (l: Linha, ...fora: string[]) => {
    const out: Linha = {};
    for (const [k, v] of Object.entries(l)) {
      if (['createdAt', 'updatedAt', ...fora].includes(k)) continue;
      out[k] = v;
    }
    return out;
  };
  const ord = (ls: Linha[]) => ls.map((l) => JSON.stringify(l)).sort();
  return {
    itens: ord(banco.dados.cashflowItem.filter((i) => i.userId === U).map((i) => sem(i))),
    celulas: ord(banco.dados.cashflowValue.map((v) => sem(v, 'id'))),
    orcados: ord(banco.dados.cashflowOrcamentoItem.map((o) => sem(o, 'id'))),
    transacoes: ord(banco.dados.bankTransaction.map((t) => sem(t))),
  };
}

/** Estado pelo conteúdo: itens por "grupo/nome" (os ids gerados diferem entre dois bancos). */
function estadoSemantico() {
  const nomeGrupo = (id: unknown) =>
    (banco.dados.cashflowGroup.find((g) => g.id === id)?.name as string) ?? '?';
  const nomeItem = (id: unknown) => {
    const i = banco.dados.cashflowItem.find((x) => x.id === id);
    return i ? `${nomeGrupo(i.groupId)}/${i.name as string}` : String(id);
  };
  const ord = (ls: unknown[]) => ls.map((l) => JSON.stringify(l)).sort();
  return {
    itens: ord(
      banco.dados.cashflowItem
        .filter((i) => i.userId === U)
        .map((i) => [nomeItem(i.id), i.hidden, i.templateId, i.isGeral, i.orderIndex]),
    ),
    celulas: ord(
      banco.dados.cashflowValue.map((v) => [
        nomeItem(v.itemId),
        v.year,
        v.month,
        v.value,
        v.valorBanco,
        v.color,
        v.formula,
        v.comment,
      ]),
    ),
    orcados: ord(
      banco.dados.cashflowOrcamentoItem.map((o) => [
        nomeItem(o.itemId),
        o.ano,
        o.mes,
        o.valor,
        o.pct,
      ]),
    ),
    transacoes: ord(banco.dados.bankTransaction.map((t) => [t.id, nomeItem(t.cashflowItemId)])),
  };
}

const auth = { payload: { id: U }, targetUserId: U, actingClient: null };
const contexto = { request: {} as never, auth };

/** Entrada de histórico gravada pela exclusão (o recordChange mockado). */
function entradaGravada(): UserChangeLog {
  const params = mockRecordChange.mock.calls.at(-1)![0];
  return {
    id: 'log-1',
    action: params.action,
    entityId: params.entityId,
    entityLabel: params.entityLabel,
    changes: params.changes,
    snapshot: JSON.parse(JSON.stringify(params.snapshot)),
  } as unknown as UserChangeLog;
}

const desfazer = (entry: UserChangeLog) =>
  ORCAMENTO_V2_UNDO_HANDLERS[ACAO_EXCLUIR_SUBCATEGORIA].execute({
    request: {} as never,
    auth,
    entry,
  });

/** Orçado efetivo (valor) por (ano, mês) dos itens de uma categoria, só meses fechados. */
function orcadoFechadoDaCategoria(itemIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of banco.dados.cashflowOrcamentoItem) {
    if (!itemIds.includes(o.itemId as string)) continue;
    const ano = o.ano as number;
    const mes = o.mes as number;
    if (ano > HOJE_SP.ano || (ano === HOJE_SP.ano && mes >= HOJE_SP.mes0)) continue;
    const k = `${ano}|${mes}`;
    out[k] = Math.round(((out[k] ?? 0) + Number(o.valor ?? 0)) * 100) / 100;
  }
  return out;
}

beforeEach(async () => {
  vi.clearAllMocks();
  banco = criarBancoFalso();
  h.banco = banco;
  banco.inserir('user', { id: U, email: 'sintetico@teste.local' });
  semearTemplates();
  // Usuário ativado: árvore personalizada + Gerais (como a Fase A da ativação).
  await personalizeGroup('tpl-desp', U);
  await personalizeGroup('tpl-ent', U);
  await garantirGerais(U);
  mockRecordChange.mockResolvedValue('log-1');
});

// ─── Puro ────────────────────────────────────────────────────────────────────────────────────

const cel = (ano: number, mes: number, value: number, extra: Partial<Celula> = {}): Celula => ({
  id: `${ano}-${mes}-${value}`,
  ano,
  mes,
  value,
  valorBanco: 0,
  formula: null,
  comment: null,
  color: null,
  ...extra,
});

describe('planejarFusaoCelulas (puro)', () => {
  it('sem colisão → move; com colisão → soma value/valorBanco, fórmula nula, comentários', () => {
    const r = planejarFusaoCelulas(
      'Pet',
      [
        cel(2026, 0, 100),
        cel(2026, 1, 50, { valorBanco: 20, comment: 'ração', formula: '=30+20' }),
      ],
      [cel(2026, 1, 200, { valorBanco: 5, comment: 'obs', formula: '=100+100' })],
    );
    expect(r.mover.map((c) => c.mes)).toEqual([0]);
    expect(r.coresDivergentes).toEqual([]);
    expect(r.somar[0].depois).toEqual({
      value: 250,
      valorBanco: 25,
      formula: null,
      comment: 'obs\nPet: ração\nSomado de Pet ao excluir',
      color: null,
    });
  });

  it('cores: mesmo status mantém a da Geral; divergentes recusam; célula zerada não conflita', () => {
    const r = planejarFusaoCelulas(
      'Pet',
      [
        cel(2026, 0, 10, { color: 'red' }),
        cel(2026, 1, 10, { color: VERMELHO }),
        cel(2026, 2, 10, { color: VERMELHO }),
        cel(2026, 3, 0, { color: AZUL, comment: 'x' }),
        cel(2026, 4, 0),
      ],
      [
        cel(2026, 0, 5, { color: VERMELHO }),
        cel(2026, 1, 5, { color: AZUL }),
        cel(2026, 2, 0, { color: AZUL }),
        cel(2026, 3, 7, { color: VERMELHO }),
        cel(2026, 4, 9, { color: VERMELHO, comment: 'g' }),
      ],
    );
    expect(r.coresDivergentes).toEqual([{ ano: 2026, mes: 1 }]);
    const por = Object.fromEntries(r.somar.map((s) => [s.sub.mes, s.depois]));
    expect(por[0].color).toBe(VERMELHO); // as duas pagas: a da Geral
    expect(por[2]).toMatchObject({ value: 10, color: VERMELHO }); // Geral zerada: a da sub
    expect(por[3]).toMatchObject({ value: 7, color: VERMELHO }); // sub zerada: a da Geral
    // sub zerada sem comentário/fórmula: a Geral fica intacta
    expect(por[4]).toEqual({
      value: 9,
      valorBanco: 0,
      formula: null,
      comment: 'g',
      color: VERMELHO,
    });
  });
});

describe('planejarFusaoOrcados (puro)', () => {
  it('fechados somados (pct pela receita do mês), corrente e futuros só apagados', () => {
    const r = planejarFusaoOrcados(
      [
        { ano: 2026, mes: 8, valor: 100, pct: null },
        { ano: 2026, mes: 7, valor: null, pct: 10 },
        { ano: 2025, mes: 11, valor: 0, pct: null },
        { ano: 2026, mes: 9, valor: 300, pct: null },
        { ano: 2027, mes: 0, valor: 50, pct: null },
      ],
      [{ ano: 2026, mes: 8, valor: 40, pct: null }],
      HOJE_SP,
      (_ano, mes) => (mes === 7 ? 5000 : null),
    );
    expect(r.apagados).toBe(2);
    expect(r.somar).toEqual([
      { ano: 2026, mes: 8, antes: { valor: 40, pct: null }, depois: 140 },
      { ano: 2026, mes: 7, antes: null, depois: 500 },
    ]);
  });
});

// ─── Serviço ─────────────────────────────────────────────────────────────────────────────────

describe('executarExclusaoSubcategoria', () => {
  it('sem colisão: células vão para a Geral sem perda e o item do usuário é apagado', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const c1 = celula('pet', ANO, 0, 120, { color: VERMELHO, comment: 'jan' });
    const c2 = celula('pet', ANO - 1, 5, 80);
    const geral = geralDe('tpl-hab');

    const r = await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA });

    expect(r).toMatchObject({ celulasMovidas: 2, celulasSomadas: 0, transacoesMovidas: 0 });
    expect(celulasDo(geral).map((c) => c.id)).toEqual([c2.id, c1.id]);
    expect(celulasDo(geral)[1]).toMatchObject({ value: 120, color: VERMELHO, comment: 'jan' });
    expect(banco.dados.cashflowItem.find((i) => i.id === 'pet')).toBeUndefined();
  });

  it('com colisão: soma value e valorBanco; cores iguais mantêm a da Geral', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 2, 50, { valorBanco: 30, color: VERMELHO, comment: 'ração' });
    celula(geral, ANO, 2, 100, { valorBanco: 10, color: 'red', formula: '=50+50' });

    const r = await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA });

    expect(r).toMatchObject({ celulasMovidas: 0, celulasSomadas: 1 });
    expect(celulasDo(geral)).toHaveLength(1);
    expect(celulasDo(geral)[0]).toMatchObject({
      value: 150,
      valorBanco: 40,
      color: 'red',
      formula: null,
      comment: 'Pet: ração\nSomado de Pet ao excluir',
    });
    expect(celulasDo('pet')).toHaveLength(0);
  });

  it('cores divergentes → 409 cores_divergentes com os meses e nada muda', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 1, 50, { color: VERMELHO });
    celula(geral, ANO, 1, 100, { color: AZUL });
    celula('pet', ANO, 4, 50);
    celula(geral, ANO, 4, 10, { color: VERMELHO });
    celula('pet', ANO, 6, 50); // sem colisão: seria movida, mas a transação desfaz
    const antes = estado();

    const erro = await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA }).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroExclusaoSubcategoria);
    expect(erro).toMatchObject({
      statusCode: 409,
      codigo: 'cores_divergentes',
      meses: [
        { ano: ANO, mes: 1 },
        { ano: ANO, mes: 4 },
      ],
    });
    expect(estado()).toEqual(antes);
    expect(mockRecordChange).not.toHaveBeenCalled();
  });

  it('transações do banco do item passam para a Geral', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 3, 70, { valorBanco: 70 });
    banco.inserir('bankTransaction', { id: 't1', userId: U, cashflowItemId: 'pet' });
    banco.inserir('bankTransaction', { id: 't2', userId: U, cashflowItemId: 'pet' });
    banco.inserir('bankTransaction', { id: 't3', userId: U, cashflowItemId: null });

    const r = await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA });

    expect(r?.transacoesMovidas).toBe(2);
    expect(banco.dados.bankTransaction.map((t) => [t.id, t.cashflowItemId])).toEqual([
      ['t1', geral],
      ['t2', geral],
      ['t3', null],
    ]);
  });

  it('orçados: fechados somados na Geral (pct convertido), corrente/futuros apagados', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    // receita Lançado de ago/2026 = 8.000 (para o pct)
    celula(itemDo('tpl-sal'), 2026, 7, 8000);
    orcado('pet', 2026, 8, { valor: 100 });
    orcado(geral, 2026, 8, { valor: 400 });
    orcado('pet', 2026, 7, { pct: 5 }); // 400
    orcado('pet', 2026, 9, { valor: 300 }); // corrente
    orcado('pet', 2027, 0, { valor: 50 }); // futuro

    const r = await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA });

    expect(r).toMatchObject({ orcadosSomados: 2, orcadosApagados: 2 });
    expect(orcadosDo('pet')).toEqual([]);
    expect(orcadosDo(geral).map((o) => [o.ano, o.mes, o.valor, o.pct])).toEqual([
      [2026, 7, 400, null],
      [2026, 8, 500, null],
    ]);
  });

  it('invariantes: real Lançado/Consolidado por categoria e mês e orçado fechado iguais', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    const alug = itemDo('tpl-alug');
    for (let m = 0; m < 12; m++) {
      celula('pet', ANO, m, 10 + m, { color: m < 6 ? VERMELHO : null, valorBanco: m });
      if (m % 2 === 0) celula(geral, ANO, m, 100, { color: m < 6 ? 'red' : AZUL });
      celula(alug, ANO, m, 2000, { color: VERMELHO });
      orcado('pet', ANO, m, { valor: 30 });
      if (m % 3 === 0) orcado(geral, ANO, m, { valor: 70 });
    }
    celula('pet', ANO - 1, 11, 99, { color: VERMELHO });
    const idsCategoria = [geral, alug, itemDo('tpl-cond'), 'pet'];
    const antes = await capturarInvariantes(U);
    const orcadoAntes = orcadoFechadoDaCategoria(idsCategoria);

    await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA });

    const depois = await capturarInvariantes(U);
    for (const chave of Object.keys(antes.categorias)) {
      expect(depois.categorias[chave].lancado, chave).toEqual(antes.categorias[chave].lancado);
      expect(depois.categorias[chave].consolidado, chave).toEqual(
        antes.categorias[chave].consolidado,
      );
    }
    expect(orcadoFechadoDaCategoria(idsCategoria)).toEqual(orcadoAntes);
  });

  it('override de template: oculta pelo templateId na mesma transação (vira a lápide)', async () => {
    const alug = itemDo('tpl-alug');
    celula(alug, ANO, 0, 2000, { color: VERMELHO });
    orcado(alug, ANO, 11, { valor: 2000 });
    const geral = geralDe('tpl-hab');

    const r = await executarExclusaoSubcategoria(U, alug, { agora: AGORA });

    expect(r?.celulasMovidas).toBe(1);
    const lapide = banco.dados.cashflowItem.find((i) => i.id === alug)!;
    expect(lapide).toMatchObject({ hidden: true, templateId: 'tpl-alug' });
    expect(celulasDo(geral)).toHaveLength(1);
    // a linha padrão não volta na árvore
    const hab = banco
      .arvoreMesclada(U, ANO)
      .flatMap((g) => g.children ?? [])
      .flatMap((g) => g.children ?? [])
      .find((g) => g.name === 'Habitação')!;
    expect(hab.items.map((i) => i.name)).toEqual(['Condomínio', 'Geral']);
  });

  it('override legado (sem templateId) e item-template viram lápide', async () => {
    // legado: linha do usuário com o nome da linha padrão, sem templateId
    const cond = itemDo('tpl-cond');
    banco.dados.cashflowItem.find((i) => i.id === cond)!.templateId = null;
    celula(cond, ANO, 0, 500);
    await executarExclusaoSubcategoria(U, cond, { agora: AGORA });
    expect(banco.dados.cashflowItem.find((i) => i.id === cond)).toMatchObject({
      hidden: true,
      templateId: 'tpl-cond',
    });

    // item-template ainda não personalizado (linha padrão nova): lápide nova
    banco.inserir('cashflowItem', {
      id: 'tpl-iptu',
      userId: null,
      groupId: 'tpl-hab',
      name: 'IPTU',
    });
    const r = await executarExclusaoSubcategoria(U, 'tpl-iptu', { agora: AGORA });
    expect(r?.snapshot.data).toMatchObject({ modo: 'lapide' });
    expect(
      banco.dados.cashflowItem.find((i) => i.userId === U && i.templateId === 'tpl-iptu'),
    ).toMatchObject({ hidden: true });
  });

  it('item de subgrupo dentro da categoria funde na Geral da categoria', async () => {
    banco.inserir('cashflowGroup', {
      id: 'sub-viagem',
      userId: U,
      name: 'Viagens',
      type: 'despesa',
      parentId: grupoDo('tpl-var'),
    });
    banco.inserir('cashflowItem', { id: 'hotel', userId: U, groupId: 'sub-viagem', name: 'Hotel' });
    celula('hotel', ANO, 0, 900);
    await executarExclusaoSubcategoria(U, 'hotel', { agora: AGORA });
    expect(celulasDo(geralDe('tpl-var'))).toMatchObject([{ value: 900 }]);
  });

  it('recusas: Geral 409, espelho 409, fora de categoria 404', async () => {
    const geral = geralDe('tpl-hab');
    itemProprio('espelho', 'tpl-plan', 'Viagem', { objetivoId: 'obj-1' });
    await expect(executarExclusaoSubcategoria(U, geral)).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'geral',
    });
    await expect(executarExclusaoSubcategoria(U, 'espelho')).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'espelho',
    });
    await expect(executarExclusaoSubcategoria(U, itemDo('tpl-sal'))).rejects.toMatchObject({
      statusCode: 404,
      codigo: 'fora_de_categoria',
    });
    // na delegação da Planilha, espelho e fora de categoria seguem o caminho de hoje
    expect(await delegarExclusaoItem(U, 'espelho')).toBe('nao_aplica');
    expect(await delegarExclusaoItem(U, itemDo('tpl-sal'))).toBe('nao_aplica');
  });

  it('categoria sem Geral: a Geral é garantida antes (fora da transação)', async () => {
    banco.inserir('cashflowGroup', {
      id: 'g-pets',
      userId: U,
      name: 'Pets',
      type: 'despesa',
      parentId: grupoDo('tpl-desp'),
    });
    banco.inserir('cashflowItem', { id: 'racao', userId: U, groupId: 'g-pets', name: 'Ração' });
    celula('racao', ANO, 0, 40);
    await executarExclusaoSubcategoria(U, 'racao', { agora: AGORA });
    const geral = banco.dados.cashflowItem.find((i) => i.groupId === 'g-pets' && i.isGeral)!;
    expect(celulasDo(geral.id as string)).toMatchObject([{ value: 40 }]);
  });
});

describe('planejarExclusao (impacto)', () => {
  it('conta células, transações, meses com orçado e as cores divergentes', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 0, 10);
    celula('pet', ANO, 1, 10, { color: VERMELHO });
    celula(geral, ANO, 1, 10);
    banco.inserir('bankTransaction', { id: 't1', userId: U, cashflowItemId: 'pet' });
    orcado('pet', ANO, 0, { valor: 10 });
    orcado('pet', ANO, 1, { valor: 0 });
    const antes = estado();

    expect(await planejarExclusao(U, 'pet', HOJE_SP)).toEqual({
      itemId: 'pet',
      nome: 'Pet',
      geralId: geral,
      celulas: 2,
      transacoes: 1,
      mesesComOrcado: 1,
      coresDivergentes: [{ ano: ANO, mes: 1 }],
    });
    expect(estado()).toEqual(antes);
  });
});

describe('Planilha × Orçamento (D11)', () => {
  async function cenario() {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 0, 10, { color: VERMELHO });
    celula('pet', ANO, 1, 20, { valorBanco: 20 });
    celula(geral, ANO, 1, 5);
    orcado('pet', 2026, 3, { valor: 15 });
    orcado('pet', 2026, 11, { valor: 15 });
    banco.inserir('bankTransaction', { id: 't1', userId: U, cashflowItemId: 'pet' });
  }

  it('excluir pela Planilha (delegação) ou pelo Orçamento dá o mesmo estado e o mesmo histórico', async () => {
    await cenario();
    await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA, contexto });
    const pelaTelaOrcamento = estadoSemantico();
    const acaoOrcamento = mockRecordChange.mock.calls[0][0].action;

    // de novo, do zero, pela Planilha
    banco = criarBancoFalso();
    h.banco = banco;
    banco.inserir('user', { id: U, email: 'sintetico@teste.local' });
    semearTemplates();
    await personalizeGroup('tpl-desp', U);
    await personalizeGroup('tpl-ent', U);
    await garantirGerais(U);
    // os ids gerados (overrides, Gerais) diferem entre os dois bancos: compara pelo conteúdo
    await cenario();
    expect(await delegarExclusaoItem(U, 'pet', contexto)).toBe('fundido');
    const pelaPlanilha = estadoSemantico();

    expect(pelaPlanilha).toEqual(pelaTelaOrcamento);
    expect(mockRecordChange.mock.calls[1][0].action).toBe(acaoOrcamento);
    expect(acaoOrcamento).toBe(ACAO_EXCLUIR_SUBCATEGORIA);
  });
});

describe('undo orcamento.subcategoria.excluir', () => {
  it('restaura células (valor e cor), transações, orçados e o item apagado', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet', { orderIndex: 3, orcamentoFixa: true });
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 0, 10, { color: VERMELHO, comment: 'a' });
    celula('pet', ANO, 1, 20, { valorBanco: 20, formula: '=10+10' });
    celula(geral, ANO, 1, 5, { comment: 'g' });
    orcado('pet', 2026, 3, { valor: 15 });
    orcado(geral, 2026, 3, { valor: 5 });
    orcado('pet', 2026, 2, { valor: 7 });
    orcado('pet', 2026, 11, { pct: 3 });
    banco.inserir('bankTransaction', { id: 't1', userId: U, cashflowItemId: 'pet' });
    const antes = estado();

    await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA, contexto });
    expect(estado()).not.toEqual(antes);
    await desfazer(entradaGravada());

    expect(estado()).toEqual(antes);
  });

  it('restaura o override oculto (hidden=false, templateId original)', async () => {
    const alug = itemDo('tpl-alug');
    celula(alug, ANO, 0, 2000, { color: VERMELHO });
    const antes = estado();
    await executarExclusaoSubcategoria(U, alug, { agora: AGORA, contexto });
    await desfazer(entradaGravada());
    expect(estado()).toEqual(antes);
  });

  it('Geral mexida depois → 409 e nada é desfeito pela metade', async () => {
    itemProprio('pet', 'tpl-hab', 'Pet');
    const geral = geralDe('tpl-hab');
    celula('pet', ANO, 1, 20);
    celula(geral, ANO, 1, 5);
    celula('pet', ANO, 2, 30);
    await executarExclusaoSubcategoria(U, 'pet', { agora: AGORA, contexto });
    banco.dados.cashflowValue.find((v) => v.itemId === geral && v.month === 1)!.value = 999;
    const depoisDaEdicao = estado();

    await expect(desfazer(entradaGravada())).rejects.toMatchObject({ status: 409 });
    expect(estado()).toEqual(depoisDaEdicao);
  });
});

describe('outros caminhos de exclusão não falham pelo FK NO ACTION', () => {
  it('removeObjetivoCashflow: orçados fechados do espelho vão para a Geral de Planejamento', async () => {
    itemProprio('espelho', 'tpl-plan', 'Viagem', { objetivoId: 'obj-1' });
    celula('espelho', 2026, 0, 500, { color: VERMELHO });
    orcado('espelho', 2026, 0, { valor: 500 });
    orcado('espelho', 2026, 9, { valor: 500 });
    orcado('espelho', 2026, 11, { valor: 500 });
    const geral = geralDe('tpl-plan');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
    try {
      await removeObjetivoCashflow('obj-1');
    } finally {
      vi.useRealTimers();
    }
    expect(banco.dados.cashflowItem.find((i) => i.id === 'espelho')).toBeUndefined();
    expect(orcadosDo(geral).map((o) => [o.mes, o.valor])).toEqual([[0, 500]]);
  });

  it('removeDividaCashflow: idem, na Geral da categoria do espelho', async () => {
    itemProprio('esp-div', 'tpl-hab', 'Financiamento', { dividaId: 'div-1' });
    orcado('esp-div', 2026, 1, { valor: 900 });
    orcado('esp-div', 2027, 1, { valor: 900 });
    const geral = geralDe('tpl-hab');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
    try {
      await removeDividaCashflow('div-1');
    } finally {
      vi.useRealTimers();
    }
    expect(banco.dados.cashflowItem.find((i) => i.id === 'esp-div')).toBeUndefined();
    expect(orcadosDo(geral).map((o) => [o.ano, o.mes, o.valor])).toEqual([[2026, 1, 900]]);
  });

  it('tratarOrcadosAntesDeApagarItem: conta os somados e os apagados', async () => {
    itemProprio('esp', 'tpl-plan', 'Carro', { objetivoId: 'obj-2' });
    orcado('esp', 2026, 1, { valor: 900 });
    orcado('esp', 2027, 1, { valor: 900 });
    expect(await tratarOrcadosAntesDeApagarItem(U, 'esp', AGORA)).toEqual({
      somados: 1,
      apagados: 1,
    });
    expect(orcadosDo('esp')).toEqual([]);
  });

  it('undo de criação de item apaga os orçados antes do item', async () => {
    itemProprio('novo', 'tpl-hab', 'Novo');
    orcado('novo', 2026, 10, { valor: 10 });
    await FLUXO_CAIXA_UNDO_HANDLERS['item.criar'].execute({
      request: {} as never,
      auth,
      entry: { entityId: 'novo', changes: [] } as unknown as UserChangeLog,
    });
    expect(banco.dados.cashflowItem.find((i) => i.id === 'novo')).toBeUndefined();
    expect(orcadosDo('novo')).toEqual([]);
  });
});
