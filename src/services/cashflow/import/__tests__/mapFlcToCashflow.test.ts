import { describe, expect, it } from 'vitest';
import type { CashflowGroup, CashflowItem, CashflowValue } from '@/types/cashflow';
import { mapFlcToCashflow } from '../mapFlcToCashflow';
import type { FlcParseResult, FlcSecao } from '../parseFlcXlsx';

// ---------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

const valor = (month: number, value: number, comment?: string): CashflowValue => ({
  id: uid('val'),
  itemId: 'x',
  userId: 'user-1',
  year: 2026,
  month,
  value,
  ...(comment !== undefined && { comment }),
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
  const entradasFixas = grupo('Entradas Fixas', {
    type: 'entrada',
    items: [item('Salário'), item("Receita Proventos FII's")],
  });
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
  const educacao = grupo('Educação', {
    items: [item('Escola/Faculdade'), item('Cursos'), item('Material escolar')],
  });
  const dependentes = grupo('Despesas com Dependentes', {
    items: [item('Escola / Faculdade'), item('Cursos'), item('Pensão'), item('Vestuário')],
  });
  const despesasFinanceiras = grupo('Despesas Financeiras', {
    items: [item('Taxas Bancárias'), item('Cheque Especial'), item('Anuidade cartão de crédito')],
  });
  const despesasFixas = grupo('Despesas Fixas', {
    children: [habitacao, educacao, dependentes, despesasFinanceiras],
  });
  const despesasVariaveis = grupo('Despesas Variáveis');
  const despesas = grupo('Despesas', { children: [despesasFixas, despesasVariaveis] });

  const contaCorrente = grupo('Conta Corrente', { type: 'saldo', items: [item('Banco 1')] });

  return {
    tree: [entradas, despesas, contaCorrente],
    entradasFixas,
    entradasVariaveis,
    semTributacao,
    habitacao,
    educacao,
    dependentes,
    despesasFinanceiras,
    despesasFixas,
    despesasVariaveis,
    contaCorrente,
  };
};

const meses = (porMes: Record<number, number> = {}): (number | null)[] =>
  Array.from({ length: 12 }, (_, m) => porMes[m] ?? null);

const comentarios = (porMes: Record<number, string> = {}): (string | null)[] =>
  Array.from({ length: 12 }, (_, m) => porMes[m] ?? null);

const secao = (chave: FlcSecao['chave'], nome: string, itens: FlcSecao['itens']): FlcSecao => ({
  chave,
  nome,
  linha: 1,
  itens,
});

const cores = (porMes: Record<number, string> = {}): (string | null)[] =>
  Array.from({ length: 12 }, (_, m) => porMes[m] ?? null);

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
  comentarios: comentarios(),
  cores: cores(),
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
    expect(plan.grupos[0].destino).toEqual({ groupId: habitacao.id, nome: 'Habitação' });
    const itemPlano = plan.grupos[0].itens[0];
    expect(itemPlano.destino).toEqual({
      tipo: 'existente',
      itemId: habitacao.items[0].id,
      nome: 'Aluguel',
      significado: null,
      rank: null,
    });
    expect(itemPlano.escritas).toEqual([{ mes: 0, valor: 1500 }]);
    expect(plan.resumo).toMatchObject({ itensNovos: 0, celulas: 1, conflitos: 0 });
  });

  it('acha grupo renomeado pelo usuário via templateName', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.name = 'Casa';
    habitacao.templateName = 'Habitação';

    const plan = mapFlcToCashflow(
      parseResult([secao('habitacao', 'Habitação', [flcItem('Aluguel', meses({ 0: 100 }))])]),
      tree,
    );
    expect(plan.grupos[0].destino).toMatchObject({ groupId: habitacao.id });
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

  it('Despesas Financeiras importa para o grupo template homônimo (ticket 20/08/2026)', () => {
    // Antes (§4.1, decisão 31/07/2026) a seção era descartada inteira — o
    // grupo do app nasceu depois (PR #83) e a linha de totais divergia da
    // planilha. Item do template casa como 'existente'; fora do template
    // (ex.: Club Smiles) vira criação.
    const { tree, despesasFinanceiras } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('despesas-financeiras', 'Despesas Financeiras', [
          flcItem('Taxas Bancárias', meses({ 0: 50 })),
          flcItem('Club Smiles', meses({ 1: 30 })),
        ]),
      ]),
      tree,
    );

    expect(plan.ignorados).toHaveLength(0);
    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].destino).toMatchObject({ groupId: despesasFinanceiras.id });
    expect(plan.grupos[0].itens[0].destino).toMatchObject({
      tipo: 'existente',
      itemId: despesasFinanceiras.items[0].id,
    });
    expect(plan.grupos[0].itens[0].escritas).toEqual([{ mes: 0, valor: 50 }]);
    expect(plan.grupos[0].itens[1].destino).toMatchObject({ tipo: 'criar' });
    expect(plan.resumo.itensNovos).toBe(1);
  });

  it('§4.1: Proventos Fii\'s é realocado para "Receita Proventos FII\'s" em Entradas Fixas', () => {
    const { tree, entradasFixas } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('receita-investimentos', 'Receita Investimentos', [
          flcItem("Proventos Fii's", meses({ 0: 320 })),
        ]),
      ]),
      tree,
    );

    // seção sintética de Entradas Fixas criada só para receber o item realocado
    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].chave).toBe('entradas-fixas');
    expect(plan.grupos[0].destino).toMatchObject({ groupId: entradasFixas.id });
    expect(plan.grupos[0].itens[0].destino).toEqual({
      tipo: 'existente',
      itemId: entradasFixas.items[1].id,
      nome: "Receita Proventos FII's",
      significado: null,
      rank: null,
    });
    expect(plan.grupos[0].itens[0].escritas).toEqual([{ mes: 0, valor: 320 }]);
    expect(plan.avisos.some((a) => a.includes('realocada'))).toBe(true);
  });

  it('§4.1: itens sem correspondência direta são ignorados com motivo específico', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('receita-investimentos', 'Receita Investimentos', [
          flcItem('Dividendos / JCP', meses({ 0: 120 })),
          flcItem('Juros Renda Fixa', meses({ 1: 80 })),
          flcItem('Amortização', meses({ 2: 40 })),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos).toHaveLength(0);
    const porLabel = (l: string) => plan.ignorados.find((i) => i.label === l);
    expect(porLabel('Dividendos / JCP')?.motivo).toContain('automático');
    expect(porLabel('Juros Renda Fixa')?.motivo).toContain('Pré/Pós/Híbridos');
    expect(porLabel('Amortização')?.motivo).toContain('sem correspondência direta');
  });

  it('Despesas com dependentes mapeia para o grupo template próprio (fora do regime §4.1)', () => {
    const { tree, dependentes } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('despesas-dependentes', 'Despesas com dependentes', [
          flcItem('Escola / Faculdade', meses({ 0: 1300 })),
          flcItem('Pensão', meses({ 1: 900 })),
          flcItem('Babá', meses({ 2: 700 })),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos).toHaveLength(1);
    expect(plan.grupos[0].chave).toBe('despesas-dependentes');
    expect(plan.grupos[0].destino).toEqual({
      groupId: dependentes.id,
      nome: 'Despesas com Dependentes',
    });

    const porLabel = (l: string) => plan.grupos[0].itens.find((i) => i.label === l);
    expect(porLabel('Escola / Faculdade')?.destino).toEqual({
      tipo: 'existente',
      itemId: dependentes.items[0].id,
      nome: 'Escola / Faculdade',
      significado: null,
      rank: null,
    });
    expect(porLabel('Pensão')?.destino).toMatchObject({ tipo: 'existente' });
    // item personalizado da planilha sem par no template → criação no grupo novo
    expect(porLabel('Babá')?.destino).toMatchObject({ tipo: 'criar' });
    expect(plan.ignorados).toHaveLength(0);
    expect(plan.avisos).toHaveLength(0);
  });

  it('"O SEU PORQUÊ" preenche item existente VAZIO (report 10/08, bug #1)', () => {
    const { tree, habitacao } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses({ 0: 1500 }), { significado: 'Moradia da família', rank: 1 }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].destino).toEqual({
      tipo: 'existente',
      itemId: habitacao.items[0].id,
      nome: 'Aluguel',
      significado: 'Moradia da família',
      rank: '1',
    });
  });

  it('"O SEU PORQUÊ" NÃO sobrescreve significado pré-existente no app', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].significado = 'Já preenchido pelo usuário';
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses({ 0: 1500 }), { significado: 'Da planilha' }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].destino).toMatchObject({ significado: null });
  });

  it('linha só com significado (sem valores) ainda entra no plano para preencher item vazio', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses(), { significado: 'Só o porquê' }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens).toHaveLength(1);
    expect(plan.grupos[0].itens[0].destino).toMatchObject({ significado: 'Só o porquê' });
    expect(plan.grupos[0].itens[0].escritas).toHaveLength(0);
  });

  it('cor da planilha encaixa na legenda e entra no plano (report 10/08, item 4)', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          // vermelho escuro do Excel → snap no vermelho da legenda
          flcItem('Aluguel', meses({ 0: 1500 }), { cores: cores({ 0: '#C00000' }) }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].cores).toEqual([{ mes: 0, cor: '#FF0000', corApp: null }]);
    expect(plan.resumo.cores).toBe(1);
  });

  it('cor igual à do app é omitida; divergente carrega corApp (conflito)', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].values = [
      { ...valor(0, 1500), color: '#FF0000' },
      { ...valor(1, 1500), color: '#76933C' },
    ];
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses(), {
            cores: cores({ 0: '#FF0000', 1: '#FF0000' }),
          }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].cores).toEqual([{ mes: 1, cor: '#FF0000', corApp: '#76933C' }]);
  });

  it('cor DOMINANTE é tinta de digitação da planilha, não status (só desvios importam)', () => {
    // Modelo FLC formata todas as células de entrada em azul; status são os
    // desvios esparsos (verificado nos arquivos reais em 10/08/2026).
    const { tree } = arvorePadrao();
    const azulEmTudo = cores(
      Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m, '#0000FF'])),
    );
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses({ 0: 1 }), { cores: azulEmTudo }),
          flcItem('Condomínio', meses({ 0: 1 }), { cores: azulEmTudo }),
          flcItem('Jardineiro', meses({ 0: 1 }), {
            cores: cores({
              ...Object.fromEntries(Array.from({ length: 12 }, (_, m) => [m, '#0000FF'])),
              0: '#FF0000',
            }),
          }),
        ]),
      ]),
      tree,
    );

    // 36 células coloridas, 35 azuis (>50%) → azul vira tinta padrão
    expect(plan.avisos.some((a) => a.includes('tinta de digitação'))).toBe(true);
    const todasCores = plan.grupos[0].itens.flatMap((i) => i.cores);
    expect(todasCores).toEqual([{ mes: 0, cor: '#FF0000', corApp: null }]);
    expect(plan.resumo.cores).toBe(1);
  });

  it('poucas células coloridas (< 24) não disparam a regra da dominante', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses({ 0: 1 }), { cores: cores({ 0: '#0000FF', 1: '#0000FF' }) }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].cores).toHaveLength(2);
    expect(plan.avisos.some((a) => a.includes('tinta de digitação'))).toBe(false);
  });

  it('quase-branco é descartado e linha só com cor descartada não entra no plano', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses(), { cores: cores({ 0: '#FFFFFF' }) }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0]?.itens ?? []).toHaveLength(0);
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

    expect(plan.grupos[0].destino).toMatchObject({ groupId: contaCorrente.id });
    expect(plan.grupos[0].itens[0].destino).toMatchObject({
      tipo: 'existente',
      itemId: contaCorrente.items[0].id,
    });
    expect(plan.grupos[0].itens[1].destino).toMatchObject({ tipo: 'criar' });
  });

  it('itens homônimos na mesma seção são somados mês a mês (linhas "Banco")', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('conta-corrente', 'Conta Corrente', [
          flcItem('Banco', meses({ 0: 100 }), { linha: 267 }),
          flcItem('Banco', meses({ 0: 50, 1: 30 }), { linha: 268 }),
          flcItem('Banco', meses(), { linha: 269 }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens).toHaveLength(1);
    expect(plan.grupos[0].itens[0].escritas).toEqual([
      { mes: 0, valor: 150 },
      { mes: 1, valor: 30 },
    ]);
    expect(plan.resumo.itensNovos).toBe(1);
    expect(plan.avisos.some((a) => a.includes('homônimos'))).toBe(true);
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

  it('comentário da planilha entra no plano; igual ao do app é omitido; diferente carrega o textoApp', () => {
    const { tree, habitacao } = arvorePadrao();
    habitacao.items[0].values = [
      valor(0, 1500, 'Reajuste em março'), // igual ao da planilha
      valor(1, 1500, 'Comentário antigo do app'), // diferente
    ];

    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses({ 0: 1500, 1: 1500, 2: 1500 }), {
            comentarios: comentarios({
              0: 'Reajuste em março',
              1: 'Comentário novo da planilha',
              2: 'Célula sem comentário no app',
            }),
          }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens[0].comentarios).toEqual([
      { mes: 1, texto: 'Comentário novo da planilha', textoApp: 'Comentário antigo do app' },
      { mes: 2, texto: 'Célula sem comentário no app', textoApp: null },
    ]);
    expect(plan.resumo.comentarios).toBe(2);
  });

  it('item existente só com comentário (sem valores) entra no plano; item novo só com comentário é criado', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('habitacao', 'Habitação', [
          flcItem('Aluguel', meses(), { comentarios: comentarios({ 5: 'Contrato renegociado' }) }),
          flcItem('Jardineiro', meses(), { comentarios: comentarios({ 3: 'Começa em abril' }) }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens).toHaveLength(2);
    const porLabel = (l: string) => plan.grupos[0].itens.find((i) => i.label === l);
    expect(porLabel('Aluguel')?.escritas).toEqual([]);
    expect(porLabel('Aluguel')?.comentarios).toEqual([
      { mes: 5, texto: 'Contrato renegociado', textoApp: null },
    ]);
    expect(porLabel('Jardineiro')?.destino).toMatchObject({ tipo: 'criar' });
    expect(plan.ignorados).toHaveLength(0);
  });

  it('itens homônimos somados mesclam comentários mês a mês', () => {
    const { tree } = arvorePadrao();
    const plan = mapFlcToCashflow(
      parseResult([
        secao('conta-corrente', 'Conta Corrente', [
          flcItem('Banco', meses({ 0: 100 }), {
            linha: 267,
            comentarios: comentarios({ 0: 'Itaú' }),
          }),
          flcItem('Banco', meses({ 0: 50 }), {
            linha: 268,
            comentarios: comentarios({ 0: 'Nubank', 1: 'Só a partir de fev' }),
          }),
        ]),
      ]),
      tree,
    );

    expect(plan.grupos[0].itens).toHaveLength(1);
    expect(plan.grupos[0].itens[0].comentarios).toEqual([
      { mes: 0, texto: 'Itaú\nNubank', textoApp: null },
      { mes: 1, texto: 'Só a partir de fev', textoApp: null },
    ]);
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
    expect(plan.grupos[1].destino).toMatchObject({ groupId: habitacao.id });
    expect(plan.avisos.some((a) => a.includes('mais de uma vez'))).toBe(true);
  });
});
