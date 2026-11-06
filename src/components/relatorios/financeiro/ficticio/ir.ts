/**
 * Dados FIXOS da seção 8 fictícia (desenhada desfocada sob o cadeado no Basic e no Pro).
 * Nunca usar dado real. Textos neutros: estes rótulos vão para o HTML e para os chunks de quem
 * não tem o Advanced (decisão 6).
 */
export const IR_FICTICIO = {
  ano: 2026,
  renda: 162_000,
  salario: 140_000,
  alugueis: 22_000,
  limite: 19_440,
  contribuido: 11_800,
  nContribuicoes: 9,
  economia: 3_245,
  economiaMaxima: 5_346,
  falta: 7_640,
  economiaFalta: 2_101,
  dias: 55,
  inss: 9_870,
  outras: 12_300,
  simplificado: 16_754.34,
  baseCompleta: 128_030,
  baseSimplificada: 145_245.66,
  irTabelaCompleta: 24_303.52,
  irSimplificada: 29_244.71,
  doacoes: 400,
  irCompleta: 23_903.52,
  economiaCompleta: 5_341.19,
  retido: 26_100,
  restituicao: 2_196.48,
  planos: [
    ['Previdência Horizonte 2050', 'Regressivo', '9 mensais', 9_000, 48_200.4],
    ['Previdência Conservadora', 'Regressivo', '1 esporádico', 2_800, 11_320.75],
  ] as [string, string, string, number, number][],
  abatimentos: [
    ['Saúde', 'Sem limite', 'good', 'Plano de saúde, consultas, exames e internações', 5_200],
    ['Educação', 'Por pessoa', '', 'Escola, graduação e pós', 3_561.5],
    ['Dependentes', 'Por dependente', '', 'Filhos, cônjuge, pais e avós', 2_275.08],
    ['Previdência', 'INSS integral · 12%', '', 'INSS e previdência complementar', 21_670],
    ['Pensão alimentícia', 'Sem limite', 'good', 'Fixada por decisão judicial', 0],
    ['Livro-caixa (autônomos)', 'Até a receita', 'good', 'Despesas da atividade', 0],
    ['Doações incentivadas', 'Até 6% do imposto', '', 'Fundos e leis de incentivo', 400],
  ] as [string, string, string, string, number][],
};
