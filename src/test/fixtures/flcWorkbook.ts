import * as XLSX from 'xlsx';

/**
 * Gera workbooks .xlsx sintéticos com a estrutura da planilha FLC do Pedro
 * (aba "Fluxo de Caixa") para testes do importador. Não contém conteúdo
 * proprietário: rótulos estruturais são o contrato de layout e os valores são
 * inventados. Estrutura verificada contra o arquivo real em 2026-07-31:
 * âncoras de seção têm fórmula nos meses, itens têm literais (zero-preenchidos),
 * col. B = rótulo, C = significado, D = rank, F..Q = Jan..Dez.
 */

export type FixtureLinha =
  | { tipo: 'texto'; label: string }
  | { tipo: 'cabecalho' }
  | { tipo: 'ancora'; label: string }
  | {
      tipo: 'item';
      label: string;
      /** valores por mês, índice 0 = jan; meses ausentes viram literal 0 */
      valores?: Partial<Record<number, number>>;
      significado?: string;
      rank?: number;
      /** não escreve célula alguma em F..Q (linha "vazia" real) */
      semCelulas?: boolean;
      /** escreve fórmula nos 12 meses (linha computada dentro de seção) */
      formula?: boolean;
    };

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const texto = (label: string): FixtureLinha => ({ tipo: 'texto', label });
const ancora = (label: string): FixtureLinha => ({ tipo: 'ancora', label });
const item = (
  label: string,
  extra?: Omit<Extract<FixtureLinha, { tipo: 'item' }>, 'tipo' | 'label'>,
): FixtureLinha => ({ tipo: 'item', label, ...extra });

/** Estrutura padrão espelhando a planilha-modelo (subconjunto representativo de itens). */
export const modeloSpec = (): FixtureLinha[] => [
  texto('Fixture sintética — estrutura FLC'),
  { tipo: 'cabecalho' },
  ancora('Total de Entradas'),
  ancora('Entradas Fixas'),
  item('Salário / Pró-labore Parte 1', {
    valores: Object.fromEntries(MESES.map((_, i) => [i, 5000])),
  }),
  item('Salário / Pró-labore Parte 2'),
  item('Receita 13º Salario'),
  item('Auxilio home office', { semCelulas: true }),
  item('Receita Alugúeis', { valores: { 0: 1000 } }),
  item('Outros'),
  ancora('Entradas Variáveis'),
  ancora('Sem Tributação'),
  item('Venda de Bens', { valores: { 1: 500 } }),
  item('Bônus'),
  item('Férias'),
  item('Outros'),
  ancora('Receita Investimentos'),
  item('Dividendos / JCP', { valores: { 0: 120.5 } }),
  item("Proventos Fii's"),
  item('Juros Renda Fixa'),
  item('Outros'),
  ancora('Com Tributação'),
  item('Empresa 1', { valores: { 2: 7500 } }),
  item('Empresa 2'),
  item('Saldo conta corrente mês anterior', { valores: { 0: 123 } }),
  ancora('Despesas Fixas e Variáveis'),
  item('Inflação Pessoal', { valores: { 0: 0.5 } }),
  ancora('Despesas Fixas'),
  ancora('Habitação'),
  item('Aluguel / Prestação', { valores: { 0: 1000, 1: 1000 }, significado: 'Moradia', rank: 1 }),
  item('Condomínio'),
  item('Conta de energia'),
  item('Supermercado'),
  item('Outros'),
  ancora('Transporte'),
  item('Combustível', { valores: { 0: 400 } }),
  item('Uber'),
  item('Outros'),
  ancora('Saúde'),
  item('Plano de Saúde'),
  item('Medicamentos'),
  ancora('Despesas Pessoais'),
  item('Vestuário'),
  item('Academia'),
  ancora('Lazer'),
  item('Restaurantes'),
  item('Delivery/Ifood'),
  ancora('Educação'),
  item('Cursos'),
  ancora('Animais de Estimação'),
  item('Veterinário'),
  ancora('Despesas Financeiras'),
  item('Taxas Bancárias'),
  item('Seguro de Vida'),
  ancora('Impostos'),
  item('IRRF Salário', { valores: { 0: 150 } }),
  item('Outros', { valores: { 10: -75 } }),
  ancora('Despesas com dependentes'),
  item('Escola / Faculdade'),
  item('Pensão'),
  ancora('Despesas Empresa'),
  item('Fonercedores'),
  item('Despesas Financeiras', { valores: { 3: 89.9 } }),
  item('Outros'),
  ancora('Planejamento Financeiro'),
  item('Objetivo (........................)', { valores: { 0: 300 } }),
  item('Objetivo (........................)'),
  ancora('Despesas Temporárias / Variáveis'),
  item('Manutenção e reparos'),
  item('Presentes do mês'),
  item('Outros'),
  ancora('Saldo do mês'),
  ancora('Indice de poupança mensal'),
  ancora('Conta Corrente'),
  item('Banco', { valores: { 0: 639.9 } }),
  item('Banco'),
  item('Banco'),
  ancora('Aporte/ Resgate Investimentos'),
  item('Reserva Emergência', { formula: true }),
  item('Reserva Oportunidade', { valores: { 0: 2000 } }),
  item('Ações'),
  ancora('Fluxo de caixa livre'),
  item('Evolução do  Patrimônio', { valores: { 0: 10000 } }),
  item('Rendimentos Recebidos', { valores: { 0: 300 } }),
  ancora('índice Paz Financeira'),
  texto('Fixture sintética — rodapé'),
];

export const buildFlcWorkbook = (
  spec: FixtureLinha[] = modeloSpec(),
  sheetName = 'Fluxo de Caixa',
): Buffer => {
  const ws: XLSX.WorkSheet = {};
  let r = 2; // linha 1 fica em branco, como na planilha real

  const set = (addr: string, cell: XLSX.CellObject) => {
    ws[addr] = cell;
  };
  const colMes = (i: number) => XLSX.utils.encode_col(5 + i); // F..Q

  for (const linha of spec) {
    r += 1;
    if (linha.tipo === 'texto') {
      set(`B${r}`, { t: 's', v: linha.label });
      continue;
    }
    if (linha.tipo === 'cabecalho') {
      set(`B${r}`, { t: 's', v: 'Itens' });
      MESES.forEach((m, i) => set(`${colMes(i)}${r}`, { t: 's', v: m }));
      continue;
    }
    if (linha.tipo === 'ancora') {
      r += 1; // linha em branco antes de cada âncora, como no original
      set(`B${r}`, { t: 's', v: linha.label });
      for (let i = 0; i < 12; i++) {
        set(`${colMes(i)}${r}`, { t: 'n', v: 0, f: `SUM(${colMes(i)}1:${colMes(i)}2)` });
      }
      continue;
    }
    set(`B${r}`, { t: 's', v: linha.label });
    if (linha.significado !== undefined) set(`C${r}`, { t: 's', v: linha.significado });
    if (linha.rank !== undefined) set(`D${r}`, { t: 'n', v: linha.rank });
    if (linha.semCelulas) continue;
    for (let i = 0; i < 12; i++) {
      if (linha.formula) {
        set(`${colMes(i)}${r}`, { t: 'n', v: 0, f: `'Outra Aba'!J${i + 2}` });
      } else {
        set(`${colMes(i)}${r}`, { t: 'n', v: linha.valores?.[i] ?? 0 });
      }
    }
  }

  ws['!ref'] = `A1:S${r + 1}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
