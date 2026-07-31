import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem, CashflowValue } from '@/types/cashflow';
import { mapFlcToCashflow } from '../mapFlcToCashflow';
import type { FlcParseResult, FlcSecao } from '../parseFlcXlsx';

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

const valor = (month: number, value: number): CashflowValue => ({
  id: uid('val'),
  itemId: 'x',
  userId: 'user-1',
  year: 2026,
  month,
  value,
});

const item = (name: string, overrides: Partial<CashflowItem> = {}): CashflowItem => ({
  id: uid('item'),
  userId: 'user-1',
  groupId: 'x',
  name,
  significado: null,
  rank: null,
  values: [],
  ...overrides,
});

const grupo = (name: string, overrides: Partial<CashflowGroup> = {}): CashflowGroup => ({
  id: uid('grp'),
  userId: 'user-1',
  name,
  type: 'despesa',
  parentId: null,
  orderIndex: 0,
  items: [],
  children: [],
  ...overrides,
});

/** árvore mínima com os grupos estruturais que o mapper procura */
const arvorePadrao = () => {
  const entradasFixas = grupo('Entradas Fixas', { type: 'entrada', items: [item('Salário')] });
  const semTributacao = grupo('Sem Tributação', { type: 'entrada' });
  const comTributacao = grupo('Com Tributação', { type: 'entrada' });
  const entradasVariaveis = grupo('Entradas Variáveis', {
    type: 'entrada',
    children: [semTributacao, comTributacao],
  });
  const entradas = grupo('Entradas', {
    type: 'entrada',
    children: [entradasFixas, entradasVariaveis],
  });

  const habitacao = grupo('Habitação', { items: [item('Aluguel'), item('Condomínio')] });
  const despesasFixas = grupo('Despesas Fixas', { children: [habitacao] });
  const despesasVariaveis = grupo('Despesas Variáveis');
  const despesas = grupo('Despesas', { children: [despesasFixas, despesasVariaveis] });

  const contaCorrente = grupo('Conta Corrente', { type: 'saldo', items: [item('Banco 1')] });

  return {
    tree: [entradas, despesas, contaCorrente],
    entradasFixas,
    entradasVariaveis,
    semTributacao,
    habitacao,
    despesasFixas,
    despesasVariaveis,
    contaCorrente,
  };
};

const meses = (porMes: Record<number, number> = {}): (number | null)[] =>
  Array.from({ length: 12 }, (_, m) => porMes[m] ?? null);

const secao = (chave: FlcSecao['chave'], nome: string, itens: FlcSecao['itens']): FlcSecao => ({
  chave,
  nome,
  linha: 1,
  itens,
});

const flcItem = (
  label: string,
  valores: (number | null)[],
  extra: Partial<FlcSecao['itens'][number]> = {},
): FlcSecao['itens'][number] => ({
  linha: 10,
  label,
  significado: null,
  rank: null,
  valores,
  ...extra,
});

const parseResult = (secoes: FlcSecao[], extra: Partial<FlcParseResult> = {}): FlcParseResult => ({
  secoes,
  ignorados: [],
  avisos: [],
  ...extra,
});

// ---------------------------------------------------------------------------
// testes
// ---------------------------------------------------------------------------

describe('mapFlcToCashflow', () => {
  it('casa grupo template e item existente por nome normalizado (acentos/caixa)', () => {
    const { tree, habitacao } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([secao('habitacao', 'Habitação', [flcItem('ALUGUEL', meses({ 0: 1500 }))])]),
      tree,
    );

    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].destino).toEqual({
      tipo: 'existente',
      groupId: habitacao.id,
      nome: 'Habitação',
    });
    const itemPlano = plan.grupos[0].itens[0];
    expect(itemPlano.destino).toEqual({
      tipo: 'existente',
      itemId: habitacao.items[0].id,
      nome: 'Aluguel',
    });
    expect(itemPlano.escritas).toEqual([{ mes: 0, valor: 1500 }]);
    expect(plan.resumo).toMatchObject({ gruposNovos: 0, itensNovos: 0, celulas: 1, conflitos: 0 });
  });

  it('acha grupo renomeado pelo usuário via templateName', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.name = 'Casa';
    habitacao.templateName = 'Habitação';

    const plan = mapFlcToCashflow(
      parseResult([secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 100 }))])]),
      tree,
    );
    expect(plan.grupos[0].destino).toMatchObject({ tipo: 'existente', groupId: habitacao.id });
  });

  it('item sem match vira criação com significado e rank convertido para string', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Jardineiro', meses({ 2: 200 }), {
            significado: 'Manutenção do jardim',
            rank: 3,
          }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].destino).toEqual({
      tipo: 'criar',
      significado: 'Manutenção do jardim',
      rank: '3',
    });
    expect(plan.resumo.itensNovos).toBe(1);
  });

  it('seções §4.1 sem grupo no app viram criação de grupo custom sob o pai correto', () => {
    const { tree, despesasFixas, entradasVariaveis } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('despesas-financeiras', 'Despesas Financeiras', [
          flcItem('Juros cheque especial', meses({ 0: 50 })),
        ]),
        secao('receita-investimentos', 'Receita Investimentos', [
          flcItem('Dividendos', meses({ 0: 10 })),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].destino).toEqual({
      tipo: 'criar',
      nome: 'Despesas Financeiras',
      type: 'despesa',
      paiGroupId: despesasFixas.id,
      paiNome: 'Despesas Fixas',
    });
    expect(plan.grupos[1].destino).toEqual({
      tipo: 'criar',
      nome: 'Receita Investimentos',
      type: 'entrada',
      paiGroupId: entradasVariaveis.id,
      paiNome: 'Entradas Variáveis',
    });
    expect(plan.resumo.gruposNovos).toBe(2);
  });

  it('reimport: grupo custom criado por import anterior é reusado (idempotência)', () => {
    const { tree, despesasFixas } = arvorePadrao();
    const jaCriado = grupo('Despesas Financeiras', { parentId: despesasFixas.id });
    despesasFixas.children.push(jaCriado);

    const plan = mapFlcToCashflow(
      parseResult([
        secao('despesas-financeiras', 'Despesas Financeiras', [flcItem('Juros', meses({ 0: 5 }))]),
      ]),
      tree,
    );
    expect(plan.grupos[0].destino).toMatchObject({ tipo: 'existente', groupId: jaCriado.id });
    expect(plan.resumo.gruposNovos).toBe(0);
  });

  it('classifica célula a célula: escrita, já igual e conflito', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].values = [valor(0, 1500), valor(1, 999)];

    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 1500, 1: 1600, 2: 1700 }))]),
      ]),
      tree,
    );

    const itemPlano = plan.grupos[0].itens[0];
    expect(itemPlano.jaIguais).toEqual([0]);
    expect(itemPlano.conflitos).toEqual([{ mes: 1, valorPlanilha: 1600, valorApp: 999 }]);
    expect(itemPlano.escritas).toEqual([{ mes: 2, valor: 1700 }]);
    expect(plan.resumo).toMatchObject({ celulas: 1, conflitos: 1, jaIguais: 1 });
  });

  it('compara valores arredondados a 2 casas (Decimal(15,2) do app)', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].values = [valor(0, 100)];

    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 100.0000001 }))]),
      ]),
      tree,
    );
    expect(plan.grupos[0].itens[0].jaIguais).toEqual([0]);
  });

  it('linha vinculada a sonho (objetivoId) é ignorada como somente-leitura', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].objetivoId = 'obj-1';

    const plan = mapFlcToCashflow(
      parseResult([secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 100 }))])]),
      tree,
    );
    expect(plan.grupos[0].itens).toHaveLength(0);
    expect(plan.ignorados).toContainEqual(
      expect.objectContaining({ label: 'Aluguel', motivo: expect.stringContaining('sonho') }),
    );
  });

  it('item novo sem nenhum valor não é criado (vira ignorado); item existente sem valor é omitido', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses()),
          flcItem('Novo item', meses()),
        ]),
      ]),
      tree,
    );
    expect(plan.grupos[0].itens).toHaveLength(0);
    expect(plan.ignorados).toContainEqual(
      expect.objectContaining({
        label: 'Novo item',
        motivo: 'sem valores preenchidos na planilha',
      }),
    );
    expect(plan.ignorados.map((i) => i.label)).not.toContain('Aluguel');
  });

  it('item oculto (tombstone) não casa — planilha recria como item novo', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].hidden = true;

    const plan = mapFlcToCashflow(
      parseResult([secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 100 }))])]),
      tree,
    );
    expect(plan.grupos[0].itens[0].destino).toMatchObject({ tipo: 'criar' });
  });

  it('seção conhecida cujo grupo não existe na árvore vira aviso + itens ignorados', () => {
    const plan = mapFlcToCashflow(
      parseResult([secao('impostos', 'Impostos', [flcItem('IPTU', meses({ 0: 300 }))])]),
      [], // árvore vazia
    );
    expect(plan.grupos).toHaveLength(0);
    expect(plan.avisos.some((a) => a.includes('Impostos'))).toBe(true);
    expect(plan.ignorados).toContainEqual(expect.objectContaining({ label: 'IPTU' }));
  });

  it('conta corrente casa no grupo type=saldo e importa linhas de banco', () => {
    const { tree, contaCorrente } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('conta-corrente', 'Conta Corrente', [
          flcItem('Banco 1', meses({ 0: 5000 })),
          flcItem('Banco Novo', meses({ 3: 200 })),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].destino).toMatchObject({ tipo: 'existente', groupId: contaCorrente.id });
    expect(plan.grupos[0].itens[0].destino).toMatchObject({
      tipo: 'existente',
      itemId: contaCorrente.items[0].id,
    });
    expect(plan.grupos[0].itens[1].destino).toMatchObject({ tipo: 'criar' });
  });

  it('propaga ignorados e avisos do parser e soma no resumo', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([], {
        ignorados: [{ linha: 60, label: 'Inflação Pessoal', motivo: 'calculada no app' }],
        avisos: ['aviso do parser'],
      }),
      tree,
    );
    expect(plan.ignorados).toHaveLength(1);
    expect(plan.avisos).toEqual(['aviso do parser']);
    expect(plan.resumo.ignorados).toBe(1);
  });

  it('seção duplicada gera aviso e mantém o mesmo destino', () => {
    const { tree, habitacao } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 1 }))]),
        secao('habitacao', 'Habitação (2)', [flcItem('Condomínio', meses({ 1: 2 }))]),
      ]),
      tree,
    );
    expect(plan.grupos).toHaveLength(2);
    expect(plan.grupos[1].destino).toMatchObject({ tipo: 'existente', groupId: habitacao.id });
    expect(plan.avisos.some((a) => a.includes('mais de uma vez'))).toBe(true);
  });
});
