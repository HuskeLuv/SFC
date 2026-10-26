/**
 * Escrita do Orçamento v2 (PR 9): orçado por subcategoria, fixa, copiar mês e os undos
 * `orcamento.item.editar`/`orcamento.copiar`. Dados 100% sintéticos no banco em memória
 * (`bancoFalso.ts`), com `personalizeGroup`/`personalizeItem`, `garantirGerais` e o merge REAIS.
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
import { garantirGerais } from '../ativacao';
import {
  ACAO_EDITAR_ORCADO,
  ACAO_FIXA_SUBCATEGORIA,
  ErroEscritaOrcamento,
  marcarFixa,
  respostaDaSubcategoria,
  salvarOrcado,
} from '../escritaOrcado';
import { ACAO_COPIAR_MES, copiarMes, planejarCopia } from '../copiarMes';
import { ORCAMENTO_V2_UNDO_HANDLERS } from '@/services/changeHistory/undo/handlers/orcamentoV2';
import { UNDO_REGISTRY } from '@/services/changeHistory/undo/registry';
import { UndoError } from '@/services/changeHistory/undo/types';

const U = 'u1';
const OUTRO = 'u2';
const ANO = 2026;

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

const orcadoDe = (itemId: string, ano: number, mes: number) => {
  const l = banco.dados.cashflowOrcamentoItem.find(
    (o) => o.itemId === itemId && o.ano === ano && o.mes === mes && o.userId === U,
  );
  return l ? { valor: l.valor ?? null, pct: l.pct ?? null } : null;
};

const auth = { payload: { id: U }, targetUserId: U, actingClient: null };
const contexto = { request: {} as never, auth };

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
  ORCAMENTO_V2_UNDO_HANDLERS[entry.action].execute({ request: {} as never, auth, entry });

beforeEach(async () => {
  vi.clearAllMocks();
  banco = criarBancoFalso();
  h.banco = banco;
  banco.inserir('user', { id: U, email: 'sintetico@teste.local' });
  banco.inserir('user', { id: OUTRO, email: 'outro@teste.local' });
  semearTemplates();
  // Usuário ativado: árvore personalizada + Gerais (como a Fase A da ativação).
  await personalizeGroup('tpl-desp', U);
  await personalizeGroup('tpl-ent', U);
  await garantirGerais(U);
  mockRecordChange.mockResolvedValue('log-1');
});

// ─── salvarOrcado ────────────────────────────────────────────────────────────────────────────

describe('salvarOrcado', () => {
  it('grava valor no id do usuário e registra orcamento.item.editar com o anterior', async () => {
    const alug = itemDo('tpl-alug');
    orcado(alug, ANO, 9, { valor: 1500 });
    const r = await salvarOrcado(
      U,
      alug,
      { ano: ANO, mes0: 9, modo: 'valor', valor: 1800 },
      { contexto },
    );
    expect(r).toMatchObject({ itemId: alug, mudou: true, antes: { valor: 1500, pct: null } });
    expect(orcadoDe(alug, ANO, 9)).toEqual({ valor: 1800, pct: null });

    const e = entradaGravada();
    expect(e.action).toBe(ACAO_EDITAR_ORCADO);
    expect(e.entityId).toBe(alug);
    expect(e.entityLabel).toBe('Aluguel / Prestação · out/2026');
    expect(e.changes).toEqual([
      { field: 'valor', label: 'Orçado', before: 1500, after: 1800, format: 'currency' },
    ]);
  });

  it('aceita o id do TEMPLATE de um item já personalizado (mesma linha)', async () => {
    await salvarOrcado(U, 'tpl-alug', { ano: ANO, mes0: 0, modo: 'valor', valor: 10 });
    expect(orcadoDe(itemDo('tpl-alug'), ANO, 0)).toEqual({ valor: 10, pct: null });
    expect(banco.dados.cashflowOrcamentoItem.some((o) => o.itemId === 'tpl-alug')).toBe(false);
  });

  it('item-template sem override → personaliza (ensurePersonalizedItem) e grava no override', async () => {
    banco.inserir('cashflowItem', {
      id: 'tpl-gas',
      userId: null,
      groupId: 'tpl-hab',
      name: 'Gás',
      orderIndex: 2,
    });
    const r = await salvarOrcado(U, 'tpl-gas', { ano: ANO, mes0: 3, modo: 'valor', valor: 90 });
    const override = itemDo('tpl-gas');
    expect(override).not.toBe('tpl-gas');
    expect(r.itemId).toBe(override);
    expect(orcadoDe(override, ANO, 3)).toEqual({ valor: 90, pct: null });
  });

  it('valor: null limpa a linha; limpar o que não existe não registra nada', async () => {
    const cond = itemDo('tpl-cond');
    orcado(cond, ANO, 2, { valor: 400 });
    await salvarOrcado(U, cond, { ano: ANO, mes0: 2, modo: 'valor', valor: null }, { contexto });
    expect(orcadoDe(cond, ANO, 2)).toBeNull();
    expect(entradaGravada().changes).toEqual([
      { field: 'valor', label: 'Orçado', before: 400, after: null, format: 'currency' },
    ]);

    mockRecordChange.mockClear();
    const r = await salvarOrcado(
      U,
      cond,
      { ano: ANO, mes0: 2, modo: 'valor', valor: null },
      { contexto },
    );
    expect(r.mudou).toBe(false);
    expect(mockRecordChange).not.toHaveBeenCalled();
  });

  it('mesmo valor → não grava histórico', async () => {
    const cond = itemDo('tpl-cond');
    orcado(cond, ANO, 2, { valor: 400 });
    const r = await salvarOrcado(
      U,
      cond,
      { ano: ANO, mes0: 2, modo: 'valor', valor: 400 },
      { contexto },
    );
    expect(r.mudou).toBe(false);
    expect(mockRecordChange).not.toHaveBeenCalled();
  });

  it('pct em sub de Planejamento grava pct e zera o valor', async () => {
    const res = itemDo('tpl-res');
    orcado(res, ANO, 4, { valor: 1000 });
    await salvarOrcado(U, res, { ano: ANO, mes0: 4, modo: 'pct', pct: 7.5 });
    expect(orcadoDe(res, ANO, 4)).toEqual({ valor: null, pct: 7.5 });
  });

  it.each([
    ['fora da categoria de poupança', () => itemDo('tpl-alug')],
    ['na Geral de Planejamento', () => geralDe('tpl-plan')],
  ])('pct %s → 400 pct_nao_permitido, sem escrita', async (_caso, id) => {
    const err = await salvarOrcado(U, id(), { ano: ANO, mes0: 0, modo: 'pct', pct: 5 }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ErroEscritaOrcamento);
    expect(err).toMatchObject({ statusCode: 400, codigo: 'pct_nao_permitido' });
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(0);
  });

  it('Geral aceita valor', async () => {
    const geral = geralDe('tpl-hab');
    await salvarOrcado(U, geral, { ano: ANO, mes0: 0, modo: 'valor', valor: 50 });
    expect(orcadoDe(geral, ANO, 0)).toEqual({ valor: 50, pct: null });
  });

  it.each([
    [
      'item oculto (lápide)',
      async () => {
        const cond = itemDo('tpl-cond');
        banco.dados.cashflowItem.find((i) => i.id === cond)!.hidden = true;
        return cond;
      },
    ],
    [
      'item de outro usuário',
      async () => {
        banco.inserir('cashflowItem', {
          id: 'alheio',
          userId: OUTRO,
          groupId: 'tpl-hab',
          name: 'Alheio',
        });
        return 'alheio';
      },
    ],
    ['item fora das categorias (Entradas)', async () => 'tpl-sal'],
    ['id inexistente', async () => 'nao-existe'],
  ])('%s → 404, sem escrita', async (_caso, preparar) => {
    const id = await preparar();
    const err = await salvarOrcado(U, id, { ano: ANO, mes0: 0, modo: 'valor', valor: 1 }).catch(
      (e) => e,
    );
    expect(err).toMatchObject({ statusCode: 404, codigo: 'nao_encontrado' });
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(0);
  });

  it('acting: o histórico recebe o auth do consultor (actorId/viaConsultant no recordChange)', async () => {
    const consultor = {
      payload: { id: 'consultor-1' },
      targetUserId: U,
      actingClient: { id: U },
    };
    await salvarOrcado(
      U,
      itemDo('tpl-alug'),
      { ano: ANO, mes0: 0, modo: 'valor', valor: 1 },
      { contexto: { request: {} as never, auth: consultor } },
    );
    expect(mockRecordChange).toHaveBeenCalledWith(expect.objectContaining({ auth: consultor }));
  });
});

// ─── resposta recalculada ───────────────────────────────────────────────────────────────────

describe('respostaDaSubcategoria', () => {
  it('devolve a sub, a categoria e o resumo da montagem pura', async () => {
    const alug = itemDo('tpl-alug');
    orcado(alug, ANO, 9, { valor: 1200 });
    const r = await respostaDaSubcategoria(U, alug, { ano: ANO, mes0: 9 });
    expect(r?.subcategoria).toMatchObject({ id: alug, orcado: 1200, valor: 1200 });
    expect(r?.categoria).toMatchObject({ id: grupoDo('tpl-hab'), orcado: 1200 });
    expect(r?.resumo.orcado).toBe(1200);
  });
});

// ─── marcarFixa ─────────────────────────────────────────────────────────────────────────────

describe('marcarFixa', () => {
  it('grava orcamentoFixa e registra orcamento.subcategoria.fixa; null volta ao padrão', async () => {
    const div = itemDo('tpl-div');
    await marcarFixa(U, div, true, ANO, { contexto });
    expect(banco.dados.cashflowItem.find((i) => i.id === div)!.orcamentoFixa).toBe(true);
    expect(mockRecordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACAO_FIXA_SUBCATEGORIA,
        changes: [{ field: 'orcamentoFixa', label: 'Fixa', before: null, after: true }],
      }),
    );
    await marcarFixa(U, div, null, ANO);
    expect(banco.dados.cashflowItem.find((i) => i.id === div)!.orcamentoFixa).toBeNull();
  });

  it('Planejamento → 400 (sempre fixa); oculto → 404', async () => {
    await expect(marcarFixa(U, itemDo('tpl-res'), false, ANO)).rejects.toMatchObject({
      statusCode: 400,
      codigo: 'fixa_poupanca',
    });
    const cond = itemDo('tpl-cond');
    banco.dados.cashflowItem.find((i) => i.id === cond)!.hidden = true;
    await expect(marcarFixa(U, cond, true, ANO)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── copiarMes ──────────────────────────────────────────────────────────────────────────────

describe('planejarCopia (puro)', () => {
  it('pula origem sem orçado, ignora destino orçado sem sobrescrever, conta igual sem escrever', () => {
    const origem = new Map([
      ['a', { valor: 100, pct: null }],
      ['b', { valor: 0, pct: null }],
      ['c', { valor: null, pct: 5 }],
      ['d', { valor: 30, pct: null }],
    ]);
    const destino = new Map([
      ['c', { valor: 999, pct: null }],
      ['d', { valor: 30, pct: null }],
    ]);
    expect(planejarCopia(origem, destino, false)).toEqual({
      copiados: 1,
      ignorados: 2,
      celulas: [{ itemId: 'a', antes: null, depois: { valor: 100, pct: null } }],
    });
    const sub = planejarCopia(origem, destino, true);
    expect(sub.copiados).toBe(3);
    expect(sub.ignorados).toBe(0);
    expect(sub.celulas.map((c) => c.itemId)).toEqual(['a', 'c']);
  });
});

describe('copiarMes', () => {
  let alug: string;
  let cond: string;
  let res: string;

  beforeEach(() => {
    alug = itemDo('tpl-alug');
    cond = itemDo('tpl-cond');
    res = itemDo('tpl-res');
    orcado(alug, ANO, 8, { valor: 1500 });
    orcado(cond, ANO, 8, { valor: 400 });
    orcado(res, ANO, 8, { pct: 10 });
    orcado(cond, ANO, 9, { valor: 450 });
  });

  const de = { ano: ANO, mes0: 8 };
  const para = { ano: ANO, mes0: 9 };

  it('sobrescrever=false: só preenche vazios (inclusive pct) e não toca nos já orçados', async () => {
    const r = await copiarMes(U, { de, para, sobrescrever: false }, { contexto });
    expect(r).toMatchObject({ copiados: 2, ignorados: 1 });
    expect(orcadoDe(alug, ANO, 9)).toEqual({ valor: 1500, pct: null });
    expect(orcadoDe(res, ANO, 9)).toEqual({ valor: null, pct: 10 });
    expect(orcadoDe(cond, ANO, 9)).toEqual({ valor: 450, pct: null });
    expect(entradaGravada()).toMatchObject({
      action: ACAO_COPIAR_MES,
      entityId: 'orcamento-2026-10',
      entityLabel: 'out/2026 (copiado de set/2026)',
    });
  });

  it('sobrescrever=true: substitui os já orçados', async () => {
    const r = await copiarMes(U, { de, para, sobrescrever: true });
    expect(r).toMatchObject({ copiados: 3, ignorados: 0 });
    expect(orcadoDe(cond, ANO, 9)).toEqual({ valor: 400, pct: null });
  });

  it('cruza o ano (dez → jan) e ignora sub oculta', async () => {
    orcado(alug, ANO, 11, { valor: 1600 });
    orcado(cond, ANO, 11, { valor: 410 });
    banco.dados.cashflowItem.find((i) => i.id === cond)!.hidden = true;
    const r = await copiarMes(U, {
      de: { ano: ANO, mes0: 11 },
      para: { ano: ANO + 1, mes0: 0 },
      sobrescrever: false,
    });
    expect(r).toMatchObject({ copiados: 1, ignorados: 0 });
    expect(orcadoDe(alug, ANO + 1, 0)).toEqual({ valor: 1600, pct: null });
    expect(orcadoDe(cond, ANO + 1, 0)).toBeNull();
  });

  it('nada a escrever → sem histórico', async () => {
    await copiarMes(U, { de: { ano: ANO, mes0: 0 }, para, sobrescrever: true }, { contexto });
    expect(mockRecordChange).not.toHaveBeenCalled();
  });
});

// ─── undo ───────────────────────────────────────────────────────────────────────────────────

describe('undo orcamento.item.editar', () => {
  it('está no registry e volta ao valor anterior (e apaga quando não havia linha)', async () => {
    expect(UNDO_REGISTRY[ACAO_EDITAR_ORCADO]).toBeDefined();
    const alug = itemDo('tpl-alug');
    orcado(alug, ANO, 1, { valor: 100 });
    await salvarOrcado(U, alug, { ano: ANO, mes0: 1, modo: 'valor', valor: 200 }, { contexto });
    const r = await desfazer(entradaGravada());
    expect(orcadoDe(alug, ANO, 1)).toEqual({ valor: 100, pct: null });
    expect(r.changes).toEqual([
      { field: 'valor', label: 'Orçado', before: 200, after: 100, format: 'currency' },
    ]);

    await salvarOrcado(U, alug, { ano: ANO, mes0: 2, modo: 'valor', valor: 50 }, { contexto });
    await desfazer(entradaGravada());
    expect(orcadoDe(alug, ANO, 2)).toBeNull();
  });

  it('limpar e desfazer recria a linha (pct inclusive)', async () => {
    const res = itemDo('tpl-res');
    orcado(res, ANO, 1, { pct: 8 });
    await salvarOrcado(U, res, { ano: ANO, mes0: 1, modo: 'valor', valor: null }, { contexto });
    await desfazer(entradaGravada());
    expect(orcadoDe(res, ANO, 1)).toEqual({ valor: null, pct: 8 });
  });

  it('orçado mudou depois → 409 STATE_MISMATCH, nada muda', async () => {
    const alug = itemDo('tpl-alug');
    await salvarOrcado(U, alug, { ano: ANO, mes0: 1, modo: 'valor', valor: 200 }, { contexto });
    const entrada = entradaGravada();
    banco.dados.cashflowOrcamentoItem.find((o) => o.itemId === alug)!.valor = 999;
    const err = await desfazer(entrada).catch((e) => e);
    expect(err).toBeInstanceOf(UndoError);
    expect(err.status).toBe(409);
    expect(orcadoDe(alug, ANO, 1)).toEqual({ valor: 999, pct: null });
  });

  it('subcategoria excluída/oculta depois → 409', async () => {
    const alug = itemDo('tpl-alug');
    await salvarOrcado(U, alug, { ano: ANO, mes0: 1, modo: 'valor', valor: 200 }, { contexto });
    banco.dados.cashflowItem.find((i) => i.id === alug)!.hidden = true;
    await expect(desfazer(entradaGravada())).rejects.toMatchObject({ status: 409 });
  });
});

describe('undo orcamento.subcategoria.fixa', () => {
  const entradaFixa = (): UserChangeLog => {
    const params = mockRecordChange.mock.calls.at(-1)![0];
    return {
      id: 'log-1',
      action: params.action,
      entityId: params.entityId,
      entityLabel: params.entityLabel,
      changes: params.changes,
      snapshot: null,
    } as unknown as UserChangeLog;
  };

  it('está no registry e volta orcamentoFixa ao anterior', async () => {
    expect(UNDO_REGISTRY[ACAO_FIXA_SUBCATEGORIA]).toBeDefined();
    const div = itemDo('tpl-div');
    await marcarFixa(U, div, true, ANO, { contexto });
    const r = await desfazer(entradaFixa());
    expect(banco.dados.cashflowItem.find((i) => i.id === div)!.orcamentoFixa).toBeNull();
    expect(r.changes).toEqual([
      { field: 'orcamentoFixa', label: 'Fixa', before: true, after: null },
    ]);
  });

  it('fixa mudou depois → 409, nada muda', async () => {
    const div = itemDo('tpl-div');
    await marcarFixa(U, div, true, ANO, { contexto });
    const entrada = entradaFixa();
    banco.dados.cashflowItem.find((i) => i.id === div)!.orcamentoFixa = false;
    await expect(desfazer(entrada)).rejects.toMatchObject({ status: 409 });
    expect(banco.dados.cashflowItem.find((i) => i.id === div)!.orcamentoFixa).toBe(false);
  });
});

describe('undo orcamento.copiar', () => {
  let alug: string;
  let cond: string;

  beforeEach(() => {
    alug = itemDo('tpl-alug');
    cond = itemDo('tpl-cond');
    orcado(alug, ANO, 8, { valor: 1500 });
    orcado(cond, ANO, 8, { valor: 400 });
    orcado(cond, ANO, 9, { valor: 450 });
  });

  it('volta cada célula ao anterior (apaga as criadas, restaura as substituídas)', async () => {
    expect(UNDO_REGISTRY[ACAO_COPIAR_MES]).toBeDefined();
    await copiarMes(
      U,
      { de: { ano: ANO, mes0: 8 }, para: { ano: ANO, mes0: 9 }, sobrescrever: true },
      { contexto },
    );
    await desfazer(entradaGravada());
    expect(orcadoDe(alug, ANO, 9)).toBeNull();
    expect(orcadoDe(cond, ANO, 9)).toEqual({ valor: 450, pct: null });
  });

  it('uma célula editada depois → 409 e nenhuma é desfeita', async () => {
    await copiarMes(
      U,
      { de: { ano: ANO, mes0: 8 }, para: { ano: ANO, mes0: 9 }, sobrescrever: true },
      { contexto },
    );
    const entrada = entradaGravada();
    banco.dados.cashflowOrcamentoItem.find((o) => o.itemId === cond && o.mes === 9)!.valor = 777;
    await expect(desfazer(entrada)).rejects.toMatchObject({ status: 409 });
    expect(orcadoDe(alug, ANO, 9)).toEqual({ valor: 1500, pct: null });
    expect(orcadoDe(cond, ANO, 9)).toEqual({ valor: 777, pct: null });
  });
});
