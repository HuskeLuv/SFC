/**
 * Mapas de rótulos por entidade — usados como allowlist pelo diffFields.
 * As chaves devem bater com os campos dos objetos comparados (modelo Prisma
 * ou payload da API, conforme o call site). NUNCA incluir campos sensíveis
 * (senha, hash, segredo TOTP, códigos de recuperação): o que não está no
 * mapa não entra no histórico.
 */

/** StockTransaction */
export const TRANSACTION_FIELD_LABELS: Record<string, string> = {
  type: 'Tipo',
  quantity: 'Quantidade',
  price: 'Preço',
  total: 'Total',
  date: 'Data',
  fees: 'Taxas',
  notes: 'Observações',
};

/** PortfolioProvento */
export const PROVENTO_FIELD_LABELS: Record<string, string> = {
  tipo: 'Tipo',
  dataCom: 'Data com',
  dataPagamento: 'Data de pagamento',
  valorTotal: 'Valor total',
  quantidadeBase: 'Quantidade base',
  impostoRenda: 'Imposto de renda',
};

/** Payload da API de células/itens do fluxo de caixa */
export const CASHFLOW_FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  descricao: 'Descrição',
  significado: 'Significado',
  rank: 'Ordem de importância',
  value: 'Valor',
  monthlyValue: 'Valor mensal',
  annualTotal: 'Total anual',
  color: 'Cor',
  comment: 'Comentário',
};

/** PlanejamentoObjetivo (sonho) */
export const SONHO_FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  target: 'Valor meta',
  months: 'Prazo (meses)',
  startDate: 'Início',
  available: 'Valor disponível',
  rate: 'Rentabilidade mensal',
  priority: 'Prioridade',
  status: 'Status',
  notes: 'Observações',
};

/** AposentadoriaPlano */
export const APOSENTADORIA_FIELD_LABELS: Record<string, string> = {
  idade: 'Idade atual',
  apos: 'Idade de aposentadoria',
  vida: 'Expectativa de vida',
  rentNom: 'Rentabilidade nominal a.a.',
  inflacao: 'Inflação esperada a.a.',
  rentNomRetiro: 'Taxa na aposentadoria',
  patrimonio: 'Patrimônio inicial',
  aporteM: 'Aporte mensal',
  renda: 'Renda desejada',
  trackStartMonth: 'Mês de início',
  trackStartYear: 'Ano de início',
};

/** User (perfil) */
export const PERFIL_FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
};
