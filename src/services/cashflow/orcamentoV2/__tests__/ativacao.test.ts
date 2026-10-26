/**
 * Ativação do Orçamento v2 (desenho técnico §4/§3.3, PR 5). Dados sintéticos num banco em memória
 * (`bancoFalso.ts`), com `personalizeGroup` e `mergeTemplatesWithCustomizations` REAIS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BancoFalso, Linha } from './bancoFalso';

const h = vi.hoisted(() => ({ banco: null as null | BancoFalso }));

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

import { criarBancoFalso } from './bancoFalso';
import { personalizeGroup } from '@/utils/cashflowPersonalization';
import {
  ORDEM_GERAL,
  ativarOrcamentoV2,
  capturarInvariantes,
  categoriasDaArvore,
  compararInvariantes,
  converterMeta,
  desativarOrcamentoV2,
  esperadoOrcado,
  garantirGerais,
  planejarAtivacao,
  resolverMetas,
} from '../ativacao';
import { RECURSO_ORCAMENTO_V2 } from '../acesso';

const U = 'u1';
const HOJE = new Date('2026-10-23T12:00:00Z');

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
  g('tpl-tra', 'Transporte', 'despesa', 'tpl-fix', 1);
  i('tpl-comb', 'tpl-tra', 'Combustível');
  g('tpl-laz', 'Lazer', 'despesa', 'tpl-fix', 2);
  i('tpl-cine', 'tpl-laz', 'Cinema');
  g('tpl-plan', 'Planejamento Financeiro', 'despesa', 'tpl-fix', 3);
  i('tpl-res', 'tpl-plan', 'Reserva de emergência');
  g('tpl-var', 'Despesas Variáveis', 'despesa', 'tpl-desp', 1);
  i('tpl-div', 'tpl-var', 'Diversos');
}

const grupoDo = (userId: string, templateId: string) =>
  banco.dados.cashflowGroup.find((x) => x.userId === userId && x.templateId === templateId)!
    .id as string;
const itemDo = (userId: string, templateId: string) =>
  banco.dados.cashflowItem.find((x) => x.userId === userId && x.templateId === templateId)!
    .id as string;

function valor(itemId: string, year: number, month: number, value: number, color?: string) {
  banco.inserir('cashflowValue', { itemId, userId: U, year, month, value, color: color ?? null });
}

function meta(id: string, groupId: string | null, valor_: number, extra: Linha = {}) {
  banco.inserir('cashflowOrcamento', {
    id,
    userId: U,
    groupId,
    tipo: 'grupo',
    tipoMeta: 'valor',
    year: 2026,
    valor: valor_,
    ...extra,
  });
}

/** Usuário típico de prod: árvore toda personalizada, com valores, metas e um caso de cada. */
async function cenarioPersonalizado(opts: { receitaSoAteJunho?: boolean } = {}) {
  await personalizeGroup('tpl-desp', U);
  await personalizeGroup('tpl-ent', U);
  for (let m = 0; m < 12; m++) {
    if (!opts.receitaSoAteJunho || m < 6) valor(itemDo(U, 'tpl-sal'), 2026, m, 10000, 'green');
  }
  valor(itemDo(U, 'tpl-alug'), 2026, 0, 2000, '#FF0000');
  valor(itemDo(U, 'tpl-alug'), 2026, 1, 2000);
  valor(itemDo(U, 'tpl-div'), 2025, 3, 150);
  // Lazer oculto pelo usuário
  banco.dados.cashflowGroup.find((x) => x.id === grupoDo(U, 'tpl-laz'))!.hidden = true;
  // Item do usuário chamado "geral" em Transporte → adotado como Geral
  banco.inserir('cashflowItem', {
    id: 'item-geral-tra',
    userId: U,
    groupId: grupoDo(U, 'tpl-tra'),
    name: ' GERAL',
    orderIndex: 5,
  });

  meta('m-hab', grupoDo(U, 'tpl-hab'), 1500);
  meta('m-hab-tpl', 'tpl-hab', 999); // duplicada: vence a do override
  meta('m-tra-tpl', 'tpl-tra', 300); // órfã: a tela atual não mostra
  meta('m-plan', grupoDo(U, 'tpl-plan'), 10, { tipoMeta: 'percentual' });
  meta('m-inv', null, 20, { tipo: 'investimentos', tipoMeta: 'percentual' });
  meta('m-laz', grupoDo(U, 'tpl-laz'), 400); // grupo oculto
  meta('m-var-2025', grupoDo(U, 'tpl-var'), 200, { year: 2025 });
  meta('m-fix', grupoDo(U, 'tpl-fix'), 50); // Despesas Fixas: não é categoria
}

const geraisDo = (userId: string) =>
  banco.dados.cashflowItem.filter((x) => x.userId === userId && x.isGeral === true);
const geralDoGrupo = (groupId: string) =>
  banco.dados.cashflowItem.find((x) => x.groupId === groupId && x.isGeral === true && !x.hidden);
const somaOrcado = (itemId: string, ano: number) =>
  banco.dados.cashflowOrcamentoItem
    .filter((o) => o.itemId === itemId && o.ano === ano)
    .reduce((s, o) => s + (o.valor as number), 0);

beforeEach(() => {
  banco = criarBancoFalso();
  h.banco = banco;
  banco.inserir('user', { id: U, email: 'sintetico@teste.local' });
  banco.inserir('user', { id: 'u2', email: 'novo@teste.local' });
  semearTemplates();
});

describe('converterMeta', () => {
  it('valor anual → 12 mensais iguais', () => {
    expect(converterMeta({ tipoMeta: 'valor', valor: 1500 }, null).valores).toEqual(
      Array(12).fill(1500),
    );
  });

  it('% → valor mês a mês pela receita Lançado; mês sem receita → 0 e listado', () => {
    const receita = [10000, 3333.33, 0, ...Array(9).fill(1000)];
    const r = converterMeta({ tipoMeta: 'percentual', valor: 10 }, receita);
    expect(r.valores.slice(0, 4)).toEqual([1000, 333.33, 0, 100]);
    expect(r.mesesSemReceita).toEqual([2]);
    expect(converterMeta({ tipoMeta: 'percentual', valor: 10 }, null).mesesSemReceita).toHaveLength(
      12,
    );
  });
});

describe('resolverMetas', () => {
  it('subgrupo aninhado → a categoria que o contém', async () => {
    await personalizeGroup('tpl-desp', U);
    // (a árvore tem 3 níveis: subgrupo só é visível dentro de categoria de 2º nível)
    const sub = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Viagens',
      type: 'despesa',
      parentId: grupoDo(U, 'tpl-var'),
    });
    const arvore = banco.arvoreMesclada(U, 2026);
    const r = resolverMetas(
      [
        {
          id: 'x',
          groupId: sub.id as string,
          tipo: 'grupo',
          tipoMeta: 'valor',
          year: 2026,
          valor: 1,
        },
      ],
      arvore,
      new Set(),
    );
    expect(r.copiar).toHaveLength(1);
    expect(r.copiar[0].categoria.chave).toBe('tpl-var');
  });

  it('subgrupo com a categoria também orçada no ano → duplicada (a tela só mostra a da categoria)', async () => {
    await personalizeGroup('tpl-desp', U);
    const sub = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Viagens',
      type: 'despesa',
      parentId: grupoDo(U, 'tpl-var'),
    });
    const linha = (id: string, groupId: string, year = 2026) => ({
      id,
      groupId,
      tipo: 'grupo',
      tipoMeta: 'valor',
      year,
      valor: 1,
    });
    const r = resolverMetas(
      [
        linha('cat', grupoDo(U, 'tpl-var')),
        linha('sub', sub.id as string),
        linha('sub-2025', sub.id as string, 2025),
      ],
      banco.arvoreMesclada(U, 2026),
      new Set(),
    );
    expect(r.copiar.map((c) => [c.linha.id, c.deSubgrupo])).toEqual([
      ['cat', false],
      ['sub-2025', true],
    ]);
    expect(r.ignoradas).toEqual([{ linhaId: 'sub', motivo: 'duplicada' }]);
  });

  it('grupo que não existe mais → grupo_inexistente', () => {
    const r = resolverMetas(
      [{ id: 'x', groupId: 'sumiu', tipo: 'grupo', tipoMeta: 'valor', year: 2026, valor: 1 }],
      banco.arvoreMesclada(U, 2026),
      new Set(),
    );
    expect(r.ignoradas).toEqual([{ linhaId: 'x', motivo: 'grupo_inexistente' }]);
  });
});

describe('planejarAtivacao (dry-run, só leitura)', () => {
  it('monta o plano completo sem escrever nada', async () => {
    await cenarioPersonalizado();
    const antes = banco.copia();
    const plano = await planejarAtivacao(U, HOJE);
    expect(banco.copia()).toEqual(antes);

    expect(plano.jaAtivado).toBe(false);
    expect(plano.totalCategorias).toBe(4); // Lazer oculto fica fora
    expect(plano.categoriasAPersonalizar).toEqual([]);
    expect(plano.geraisAdotadas).toEqual([
      { itemId: 'item-geral-tra', groupId: grupoDo(U, 'tpl-tra') },
    ]);
    expect(plano.geraisACriar.map((g) => g.groupId).sort()).toEqual(
      [grupoDo(U, 'tpl-hab'), grupoDo(U, 'tpl-plan'), grupoDo(U, 'tpl-var')].sort(),
    );

    // anual → 12 mensais; % → valor (inclusive Planejamento); 2025 também
    expect(plano.orcadosAInserir).toHaveLength(36);
    expect(esperadoOrcado(plano)).toEqual({
      '2026|tpl-hab': 18000,
      '2026|tpl-plan': 12000,
      '2025|tpl-var': 2400,
    });
    // órfã não entra por padrão
    expect(plano.orfasAdotaveis).toHaveLength(1);
    expect(plano.orfasAdotaveis[0]).toMatchObject({
      linhaId: 'm-tra-tpl',
      categoriaId: grupoDo(U, 'tpl-tra'),
      ano: 2026,
      valor: 300,
    });
    expect(esperadoOrcado(plano, true)['2026|tpl-tra']).toBe(3600);
    expect(Object.fromEntries(plano.orcadosIgnorados.map((x) => [x.linhaId, x.motivo]))).toEqual({
      'm-hab-tpl': 'duplicada',
      'm-inv': 'investimentos',
      'm-laz': 'grupo_oculto',
      'm-fix': 'fora_das_categorias',
    });
    expect(plano.valoresEmItemTemplate).toBe(0);
    expect(plano.usuarioNovo).toBe(false);
    expect(plano.sugestoesAAplicar).toBe(0);
  });

  it('meta % em mês sem receita → 0 e listado', async () => {
    await cenarioPersonalizado({ receitaSoAteJunho: true });
    const plano = await planejarAtivacao(U, HOJE);
    expect(plano.mesesSemReceita.map((m) => m.mes)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(esperadoOrcado(plano)['2026|tpl-plan']).toBe(6000);
  });

  it('itens soltos em Despesas Fixas (Q15) aparecem no plano', async () => {
    await personalizeGroup('tpl-desp', U);
    banco.inserir('cashflowItem', {
      id: 'solto',
      userId: U,
      groupId: grupoDo(U, 'tpl-fix'),
      name: 'Solto',
    });
    valor('solto', 2026, 2, 80);
    const plano = await planejarAtivacao(U, HOJE);
    expect(plano.itensSoltos).toEqual([{ itemId: 'solto', nome: 'Solto', total: 80 }]);
  });

  it('ativarOrcamentoV2 com dryRun = planejado, sem trava e sem escrita', async () => {
    await cenarioPersonalizado();
    const antes = banco.copia();
    const r = await ativarOrcamentoV2(U, { dryRun: true, hoje: HOJE });
    expect(r.status).toBe('planejado');
    expect(banco.copia()).toEqual(antes);
    expect(banco.travas).toHaveLength(0);
  });
});

describe('ativarOrcamentoV2 --aplicar', () => {
  it('cria/adota as Gerais, copia os orçados visíveis, marca a ativação e verifica', async () => {
    await cenarioPersonalizado();
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });

    expect(r.status).toBe('ativado');
    expect(r.divergencias).toEqual([]);
    expect(r.mudancas).toMatchObject({
      gruposPersonalizados: 0,
      geraisCriadas: 3,
      geraisAdotadas: 1,
      orcadosInseridos: 36,
      prefsGravado: true,
    });
    // trava por usuário
    expect(banco.travas).toHaveLength(1);
    expect(banco.travas[0].sql).toContain('pg_advisory_xact_lock(hashtext(');
    expect(banco.travas[0].valores).toEqual([`orcv2:${U}`]);

    const geralHab = geralDoGrupo(grupoDo(U, 'tpl-hab'))!;
    expect(geralHab).toMatchObject({ name: 'Geral', userId: U, orderIndex: ORDEM_GERAL });
    expect(somaOrcado(geralHab.id as string, 2026)).toBe(18000);
    expect(somaOrcado(geralDoGrupo(grupoDo(U, 'tpl-plan'))!.id as string, 2026)).toBe(12000);
    expect(somaOrcado(geralDoGrupo(grupoDo(U, 'tpl-var'))!.id as string, 2025)).toBe(2400);
    // Geral adotada, órfã NÃO copiada
    expect(geralDoGrupo(grupoDo(U, 'tpl-tra'))!.id).toBe('item-geral-tra');
    expect(somaOrcado('item-geral-tra', 2026)).toBe(0);
    // todos os orçados em valor (nunca %), sempre no id do usuário
    expect(banco.dados.cashflowOrcamentoItem.every((o) => o.pct === null)).toBe(true);
    // Geral é última na árvore mesclada
    const hab = categoriasDaArvore(banco.arvoreMesclada(U, 2026)).find(
      (c) => c.chave === 'tpl-hab',
    )!;
    expect(hab.grupo.items.at(-1)?.isGeral).toBe(true);
    // grupo oculto continua oculto, sem Geral
    expect(geralDoGrupo(grupoDo(U, 'tpl-laz'))).toBeUndefined();
    // prefs
    expect(banco.dados.cashflowOrcamentoPrefs).toHaveLength(1);
    expect(banco.dados.cashflowOrcamentoPrefs[0].estruturaCriadaEm).toBeInstanceOf(Date);
    // tabela antiga intocada
    expect(banco.dados.cashflowOrcamento).toHaveLength(8);
  });

  it('--adotar-orfas copia a órfã para a Geral da categoria do override', async () => {
    await cenarioPersonalizado();
    const r = await ativarOrcamentoV2(U, { dryRun: false, adotarOrfas: true, hoje: HOJE });
    expect(r.status).toBe('ativado');
    expect(somaOrcado('item-geral-tra', 2026)).toBe(3600);
    expect(r.mudancas.orcadosInseridos).toBe(48);
  });

  it('idempotência: 2ª execução = ja_ativado com 0 mudanças e banco idêntico', async () => {
    await cenarioPersonalizado();
    await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    const depoisDa1a = banco.copia();

    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('ja_ativado');
    expect(r.mudancas).toEqual({
      gruposPersonalizados: 0,
      ocultosPreservados: 0,
      geraisCriadas: 0,
      geraisAdotadas: 0,
      orcadosInseridos: 0,
      sugestoesCriadas: 0,
      prefsGravado: false,
    });
    expect(banco.copia()).toEqual(depoisDa1a);
    // dry-run de quem já está ativado também diz ja_ativado
    expect((await ativarOrcamentoV2(U, { dryRun: true, hoje: HOJE })).status).toBe('ja_ativado');
  });

  it('corrida: duas ativações simultâneas serializam na trava (uma ativa, a outra vê ja_ativado)', async () => {
    await cenarioPersonalizado();
    const rs = await Promise.all([
      ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE }),
      ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual(['ativado', 'ja_ativado']);
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(36);
    const porGrupo = new Map<unknown, number>();
    geraisDo(U).forEach((g) => porGrupo.set(g.groupId, (porGrupo.get(g.groupId) ?? 0) + 1));
    expect([...porGrupo.values()].every((n) => n === 1)).toBe(true);
  });

  it('pool: ativações de usuários diferentes não seguram duas travas ao mesmo tempo', async () => {
    await cenarioPersonalizado();
    const original = banco.prisma.$transaction as (
      fn: (tx: unknown) => Promise<unknown>,
      opcoes?: { timeout?: number },
    ) => Promise<unknown>;
    let travasAbertas = 0;
    let maximo = 0;
    banco.prisma.$transaction = async (
      fn: (tx: unknown) => Promise<unknown>,
      opcoes?: { timeout?: number },
    ) => {
      const daTrava = (opcoes?.timeout ?? 0) >= 10 * 60_000;
      if (daTrava) maximo = Math.max(maximo, ++travasAbertas);
      try {
        return await original(fn, opcoes);
      } finally {
        if (daTrava) travasAbertas--;
      }
    };
    const rs = await Promise.all([
      ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE }),
      ativarOrcamentoV2('u2', { dryRun: false, hoje: HOJE }),
      ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE }),
    ]);
    expect(rs.map((r) => r.status)).toEqual(['ativado', 'ativado', 'ja_ativado']);
    expect(maximo).toBe(1);
  });

  it('valoresEmItemTemplate > 0 aborta sem escrever nada', async () => {
    valor('tpl-alug', 2026, 0, 500); // célula do usuário apontando para item-template
    const antes = banco.copia();
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('abortado');
    expect(r.motivo).toBe('valores_em_item_template');
    expect(r.plano?.valoresEmItemTemplate).toBe(1);
    expect(banco.copia()).toEqual(antes);
  });

  it('orçados v2 sem a marca de ativação (resto de falha) abortam', async () => {
    await cenarioPersonalizado();
    banco.inserir('cashflowOrcamentoItem', {
      userId: U,
      itemId: itemDo(U, 'tpl-alug'),
      ano: 2026,
      mes: 0,
      valor: 1,
    });
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('abortado');
    expect(r.motivo).toBe('orcados_v2_sem_ativacao');
  });

  it('grupo oculto não ressuscita quando a Fase A personaliza um pai novo', async () => {
    // Só a raiz "Despesas" personalizada; Lazer oculto pendurado nela; Despesas Fixas ainda template.
    const desp = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Despesas',
      type: 'despesa',
      parentId: null,
      templateId: 'tpl-desp',
      orderIndex: 1,
    });
    const laz = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Lazer',
      type: 'despesa',
      parentId: desp.id,
      templateId: 'tpl-laz',
      hidden: true,
    });
    const variaveis = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Despesas Variáveis',
      type: 'despesa',
      parentId: desp.id,
      templateId: 'tpl-var',
      orderIndex: 1,
    });
    const div = banco.inserir('cashflowItem', {
      userId: U,
      groupId: variaveis.id,
      name: 'Diversos',
      templateId: 'tpl-div',
    });
    valor(div.id as string, 2026, 4, 321, 'red');

    const plano = await planejarAtivacao(U, HOJE);
    expect(plano.categoriasAPersonalizar.map((c) => c.templateGroupId)).toEqual([
      'tpl-hab',
      'tpl-tra',
      'tpl-plan',
    ]);
    expect(plano.geraisACriar.filter((g) => g.aposPersonalizar)).toHaveLength(3);

    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('ativado');
    expect(r.mudancas.gruposPersonalizados).toBe(3);
    // personalizeGroup real ressuscitou o Lazer; a ativação o ocultou de novo
    expect(r.mudancas.ocultosPreservados).toBe(1);
    expect(banco.dados.cashflowGroup.find((g) => g.id === laz.id)!.hidden).toBe(true);
    const categorias = categoriasDaArvore(banco.arvoreMesclada(U, 2026));
    expect(categorias.map((c) => c.chave)).not.toContain('tpl-laz');
    expect(categorias.every((c) => c.doUsuario)).toBe(true);
    expect(geraisDo(U)).toHaveLength(4);
  });

  it('usuário novo (sem despesas) recebe as sugestões do catálogo, nunca em Planejamento', async () => {
    const r = await ativarOrcamentoV2('u2', { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('ativado');
    expect(r.plano?.usuarioNovo).toBe(true);
    expect(r.mudancas.gruposPersonalizados).toBe(5);
    expect(r.mudancas.geraisCriadas).toBe(5);
    expect(r.mudancas.sugestoesCriadas).toBeGreaterThan(0);

    const categorias = categoriasDaArvore(banco.arvoreMesclada('u2', 2026));
    const plan = categorias.find((c) => c.chave === 'tpl-plan')!;
    expect(plan.grupo.items.map((i) => i.name)).toEqual(['Reserva de emergência', 'Geral']);
    const hab = categorias.find((c) => c.chave === 'tpl-hab')!;
    const nomes = hab.grupo.items.map((i) => i.name);
    // "Aluguel / Prestação" já cobre "Aluguel / Financiamento" (alias); Geral continua por último
    expect(nomes).not.toContain('Aluguel / Financiamento');
    expect(nomes.at(-1)).toBe('Geral');
    expect(nomes.slice(0, 2)).toEqual(['Aluguel / Prestação', 'Condomínio']);
  });

  it('meta de subgrupo: com a da categoria = duplicada; sozinha = copiada e relatada à parte', async () => {
    await cenarioPersonalizado();
    const viagens = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Viagens',
      type: 'despesa',
      parentId: grupoDo(U, 'tpl-var'),
    });
    meta('m-var-2026', grupoDo(U, 'tpl-var'), 1500); // a que a tela mostra
    meta('m-viag-2026', viagens.id as string, 300); // sobra de reestruturação: invisível
    meta('m-viag-2025', viagens.id as string, 100, { year: 2025 }); // categoria já tem 2025

    const plano = await planejarAtivacao(U, HOJE);
    expect(plano.orcadosIgnorados).toEqual(
      expect.arrayContaining([
        { linhaId: 'm-viag-2026', motivo: 'duplicada' },
        { linhaId: 'm-viag-2025', motivo: 'duplicada' },
      ]),
    );
    expect(plano.metasDeSubgrupo).toEqual([]);

    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('ativado');
    const geralVar = geralDoGrupo(grupoDo(U, 'tpl-var'))!.id as string;
    expect(somaOrcado(geralVar, 2026)).toBe(18000); // = meta visível × 12, não 21.600
  });

  it('meta só no subgrupo: copiada para a Geral, listada em metasDeSubgrupo e aceita na Fase C', async () => {
    await cenarioPersonalizado();
    const viagens = banco.inserir('cashflowGroup', {
      userId: U,
      name: 'Viagens',
      type: 'despesa',
      parentId: grupoDo(U, 'tpl-var'),
    });
    meta('m-viag-2026', viagens.id as string, 300);
    const plano = await planejarAtivacao(U, HOJE);
    expect(plano.metasDeSubgrupo).toEqual([
      { linhaId: 'm-viag-2026', categoriaChave: 'tpl-var', ano: 2026, total: 3600 },
    ]);
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('ativado');
    expect(somaOrcado(geralDoGrupo(grupoDo(U, 'tpl-var'))!.id as string, 2026)).toBe(3600);
  });

  it('compensação: verificação divergente desfaz orçados, prefs, Gerais criadas e a adoção', async () => {
    await cenarioPersonalizado();
    const itensAntes = banco.dados.cashflowItem.length;
    banco.ganchos['cashflowOrcamentoItem.createMany'] = (args) => {
      // defeito simulado: uma linha gravada com valor diferente do planejado
      const data = (args as { data: Linha[] }).data;
      data[0] = { ...data[0], valor: (data[0].valor as number) + 5 };
    };
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });

    expect(r.status).toBe('compensado');
    expect(r.motivo).toBe('verificacao_divergiu');
    expect(r.divergencias).toEqual([
      expect.objectContaining({ tipo: 'orcado', antes: expect.any(Number) }),
    ]);
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(0);
    expect(banco.dados.cashflowOrcamentoPrefs).toHaveLength(0);
    expect(geraisDo(U)).toHaveLength(0);
    expect(banco.dados.cashflowItem).toHaveLength(itensAntes);
    expect(banco.dados.cashflowItem.find((i) => i.id === 'item-geral-tra')!.isGeral).toBe(false);
  });

  it('compensação: falha na Fase B desfaz a transação e apaga as Gerais da Fase A', async () => {
    await cenarioPersonalizado();
    banco.ganchos['cashflowOrcamentoItem.createMany'] = () => {
      throw new Error('conexão caiu');
    };
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('compensado');
    expect(r.motivo).toBe('erro: conexão caiu');
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(0);
    expect(banco.dados.cashflowOrcamentoPrefs).toHaveLength(0);
    expect(geraisDo(U)).toHaveLength(0);
  });

  it('compensação: erro na Fase C (depois do commit) também desfaz e não deixa ativado', async () => {
    await cenarioPersonalizado();
    // a 2ª capturarInvariantes (Fase C) estoura na 1ª query
    const modelo = banco.prisma.cashflowValue as { findMany: (a?: Linha) => Promise<Linha[]> };
    const findMany = modelo.findMany;
    let capturas = 0;
    modelo.findMany = async (args?: Linha) => {
      if ((args?.distinct as string[] | undefined)?.[0] === 'year' && ++capturas === 2) {
        throw new Error('P2024 timeout');
      }
      return findMany(args);
    };
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('compensado');
    expect(r.motivo).toBe('erro_verificacao: P2024 timeout');
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(0);
    expect(banco.dados.cashflowOrcamentoPrefs).toHaveLength(0);
    expect(geraisDo(U)).toHaveLength(0);
    modelo.findMany = findMany;
    expect((await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE })).status).toBe('ativado');
  });
});

describe('metas no id do template (Fase A personaliza a categoria)', () => {
  it('compensado: a tela antiga continua mostrando a meta, sem reescrever a tabela antiga', async () => {
    // categoria ainda template, com meta visível hoje no id do template
    meta('m-hab-tpl', 'tpl-hab', 800);
    const antes = await capturarInvariantes(U);
    expect(antes.categorias['2026|tpl-hab'].metaMensal).toBe(800);

    banco.ganchos['cashflowOrcamentoItem.createMany'] = () => {
      throw new Error('conexão caiu');
    };
    const r = await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    expect(r.status).toBe('compensado');
    // a categoria ganhou override na Fase A; a meta segue valendo pelo templateId
    const depois = await capturarInvariantes(U);
    expect(depois.categorias['2026|tpl-hab'].metaMensal).toBe(800);
    expect(banco.dados.cashflowOrcamento).toHaveLength(1);
    expect(banco.dados.cashflowOrcamento[0].groupId).toBe('tpl-hab');
  });
});

describe('garantirGerais', () => {
  beforeEach(async () => {
    await personalizeGroup('tpl-desp', U);
  });

  it('idempotente: cria uma por categoria e depois não escreve mais', async () => {
    const r1 = await garantirGerais(U);
    expect(r1.criadas).toHaveLength(5);
    const snap = banco.copia();
    expect(await garantirGerais(U)).toEqual({ criadas: [], adotadas: [] });
    expect(banco.copia()).toEqual(snap);
  });

  it('corrida: P2002 no índice parcial é capturado e relido', async () => {
    const habUser = grupoDo(U, 'tpl-hab');
    let uma = true;
    banco.ganchos['cashflowItem.create'] = (data) => {
      if (uma && data.groupId === habUser) {
        uma = false;
        // outra execução criou a Geral entre a leitura e o create
        banco.inserir('cashflowItem', {
          userId: U,
          groupId: habUser,
          name: 'Geral',
          isGeral: true,
        });
      }
    };
    const r = await garantirGerais(U);
    expect(r.criadas).toHaveLength(4);
    expect(banco.dados.cashflowItem.filter((i) => i.groupId === habUser && i.isGeral)).toHaveLength(
      1,
    );
  });

  it('P2002 sem Geral ao reler é relançado', async () => {
    banco.ganchos['cashflowItem.create'] = () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    };
    await expect(garantirGerais(U)).rejects.toThrow('unique');
  });
});

describe('invariantes', () => {
  it('real alterado por categoria/mês diverge; orçado igual ao esperado não diverge', async () => {
    await cenarioPersonalizado();
    const antes = await capturarInvariantes(U);
    expect(antes.categorias['2026|tpl-hab']).toMatchObject({
      metaMensal: 1500,
      metaAnual: 18000,
      orcadoV2: 0,
    });
    // meta % visível convertida pela receita Lançado do ano (10% × 10.000 × 12)
    expect(antes.categorias['2026|tpl-plan']).toMatchObject({ metaMensal: 10, metaAnual: 12000 });
    expect(antes.categorias['2026|tpl-hab'].lancado.slice(0, 2)).toEqual([2000, 2000]);
    expect(antes.categorias['2026|tpl-hab'].consolidado.slice(0, 2)).toEqual([2000, 0]);

    const depois = structuredClone(antes);
    for (const c of Object.values(depois.categorias)) c.orcadoV2 = c.metaAnual;
    depois.categorias['2026|tpl-hab'].consolidado[1] = 2000;
    expect(compararInvariantes(antes, depois, {})).toEqual([
      { chave: '2026|tpl-hab', tipo: 'real_consolidado', mes: 1, antes: 0, depois: 2000 },
    ]);
    // tolerância de R$ 0,01 no orçado
    depois.categorias['2026|tpl-hab'].consolidado[1] = 0;
    depois.categorias['2026|tpl-hab'].orcadoV2 = 18000.01;
    expect(compararInvariantes(antes, depois, {})).toEqual([]);
    depois.categorias['2026|tpl-hab'].orcadoV2 = 17990;
    expect(compararInvariantes(antes, depois, {})[0].tipo).toBe('orcado');
    // o esperado vem da meta visível de ANTES: gravar a mais (soma em dobro) diverge
    depois.categorias['2026|tpl-hab'].orcadoV2 = 21600;
    expect(compararInvariantes(antes, depois, {})).toEqual([
      { chave: '2026|tpl-hab', tipo: 'orcado', antes: 18000, depois: 21600 },
    ]);
    // ... a não ser que o plano declare o excedente (subgrupo copiado, órfã adotada)
    expect(compararInvariantes(antes, depois, { '2026|tpl-hab': 3600 })).toEqual([]);
  });

  it('categoria com valores que some da árvore diverge', async () => {
    await cenarioPersonalizado();
    const antes = await capturarInvariantes(U);
    const depois = structuredClone(antes);
    delete depois.categorias['2026|tpl-hab'];
    expect(compararInvariantes(antes, depois, {}).map((d) => d.tipo)).toContain('categoria_sumiu');
  });
});

describe('desativarOrcamentoV2', () => {
  async function ativado() {
    await cenarioPersonalizado();
    banco.inserir('featureBetaUser', {
      recurso: RECURSO_ORCAMENTO_V2,
      userId: U,
      adicionadoPor: 't',
    });
    await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE });
    // célula digitada na Geral de Habitação: essa Geral fica como item comum
    valor(geralDoGrupo(grupoDo(U, 'tpl-hab'))!.id as string, 2026, 9, 77);
  }

  it('dry-run só planeja', async () => {
    await ativado();
    const antes = banco.copia();
    const { plano, aplicado } = await desativarOrcamentoV2(U, { dryRun: true });
    expect(aplicado).toBe(false);
    expect(plano).toMatchObject({ noBeta: true, ativado: true, orcados: 36, temPrefs: true });
    expect(plano.geraisAConverter).toEqual([geralDoGrupo(grupoDo(U, 'tpl-hab'))!.id]);
    expect(plano.geraisAApagar).toHaveLength(3);
    expect(banco.copia()).toEqual(antes);
  });

  it('--aplicar: tira do beta, apaga orçados/prefs/Gerais vazias e faz isGeral=false nas com valores', async () => {
    await ativado();
    const geralHab = geralDoGrupo(grupoDo(U, 'tpl-hab'))!.id;
    const { aplicado } = await desativarOrcamentoV2(U, { dryRun: false });
    expect(aplicado).toBe(true);
    expect(banco.dados.featureBetaUser).toHaveLength(0);
    expect(banco.dados.cashflowOrcamentoItem).toHaveLength(0);
    expect(banco.dados.cashflowOrcamentoPrefs).toHaveLength(0);
    expect(geraisDo(U)).toHaveLength(0);
    expect(banco.dados.cashflowItem.find((i) => i.id === geralHab)).toMatchObject({
      isGeral: false,
    });
    // a tabela antiga continua lá (metas congeladas)
    expect(banco.dados.cashflowOrcamento).toHaveLength(8);
    // 2ª execução: nada a fazer
    const { plano } = await desativarOrcamentoV2(U, { dryRun: true });
    expect(plano).toMatchObject({ noBeta: false, ativado: false, orcados: 0 });
    expect(plano.geraisAApagar).toEqual([]);
    expect(plano.geraisAConverter).toEqual([]);
    // e pode ativar de novo
    expect((await ativarOrcamentoV2(U, { dryRun: false, hoje: HOJE })).status).toBe('ativado');
  });
});
