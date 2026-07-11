import type { FieldLabelMap } from './types';

/**
 * Mapas de rótulos por entidade — usados como allowlist pelo diffFields.
 * As chaves devem bater com os campos dos objetos comparados (modelo Prisma
 * ou payload da API, conforme o call site). NUNCA incluir campos sensíveis
 * (senha, hash, segredo TOTP, códigos de recuperação): o que não está no
 * mapa não entra no histórico.
 *
 * O `format` é uma dica de renderização pro cliente (moeda, data, %) — a
 * ausência mantém a heurística padrão do renderChange.
 */

/** StockTransaction */
export const TRANSACTION_FIELD_LABELS: FieldLabelMap = {
  type: 'Tipo',
  quantity: { label: 'Quantidade', format: 'number' },
  price: { label: 'Preço', format: 'currency' },
  total: { label: 'Total', format: 'currency' },
  date: { label: 'Data', format: 'date' },
  fees: { label: 'Taxas', format: 'currency' },
  notes: 'Observações',
};

/** PortfolioProvento */
export const PROVENTO_FIELD_LABELS: FieldLabelMap = {
  tipo: 'Tipo',
  dataCom: { label: 'Data com', format: 'date' },
  dataPagamento: { label: 'Data de pagamento', format: 'date' },
  valorTotal: { label: 'Valor total', format: 'currency' },
  quantidadeBase: { label: 'Quantidade base', format: 'number' },
  impostoRenda: { label: 'Imposto de renda', format: 'currency' },
};

/** Payload da API de células/itens do fluxo de caixa */
export const CASHFLOW_FIELD_LABELS: FieldLabelMap = {
  name: 'Nome',
  descricao: 'Descrição',
  significado: 'Significado',
  rank: { label: 'Ordem de importância', format: 'number' },
  value: { label: 'Valor', format: 'currency' },
  monthlyValue: { label: 'Valor mensal', format: 'currency' },
  annualTotal: { label: 'Total anual', format: 'currency' },
  color: 'Cor',
  comment: 'Comentário',
};

/** PlanejamentoObjetivo (sonho) */
export const SONHO_FIELD_LABELS: FieldLabelMap = {
  name: 'Nome',
  target: { label: 'Valor meta', format: 'currency' },
  months: { label: 'Prazo (meses)', format: 'number' },
  startDate: 'Início',
  available: { label: 'Valor disponível', format: 'currency' },
  // rate é fração (0.01 = 1% a.m.) — sem format pra não renderizar "0,01%"
  rate: 'Rentabilidade mensal',
  priority: 'Prioridade',
  status: 'Status',
  notes: 'Observações',
};

/** PlanejamentoObjetivoEntry (registro mensal de um sonho) */
export const SONHO_ENTRY_FIELD_LABELS: FieldLabelMap = {
  month: 'Mês',
  aporte: { label: 'Aporte no mês', format: 'currency' },
  balance: { label: 'Saldo ao fim do mês', format: 'currency' },
};

/** AposentadoriaPlano */
export const APOSENTADORIA_FIELD_LABELS: FieldLabelMap = {
  idade: { label: 'Idade atual', format: 'number' },
  apos: { label: 'Idade de aposentadoria', format: 'number' },
  vida: { label: 'Expectativa de vida', format: 'number' },
  rentNom: { label: 'Rentabilidade nominal a.a.', format: 'percent' },
  inflacao: { label: 'Inflação esperada a.a.', format: 'percent' },
  rentNomRetiro: { label: 'Taxa na aposentadoria', format: 'percent' },
  patrimonio: { label: 'Patrimônio inicial', format: 'currency' },
  aporteM: { label: 'Aporte mensal', format: 'currency' },
  renda: { label: 'Renda desejada', format: 'currency' },
  trackStartMonth: { label: 'Mês de início', format: 'number' },
  trackStartYear: { label: 'Ano de início', format: 'number' },
};

/** AposentadoriaPlanoEntry (registro mensal do acompanhamento) */
export const APOSENTADORIA_ENTRY_FIELD_LABELS: FieldLabelMap = {
  aporteReal: { label: 'Aporte realizado', format: 'currency' },
  patFinal: { label: 'Patrimônio ao fim do mês', format: 'currency' },
};

/** User (perfil) */
export const PERFIL_FIELD_LABELS: FieldLabelMap = {
  name: 'Nome',
  email: 'E-mail',
};

/** DashboardData "caixa para investir" (por classe de ativo e consolidado) */
export const CAIXA_INVESTIR_FIELD_LABELS: FieldLabelMap = {
  value: { label: 'Caixa para investir', format: 'currency' },
};

/** Resumo da carteira (DashboardData: meta de patrimônio / caixa consolidado) */
export const RESUMO_FIELD_LABELS: FieldLabelMap = {
  metaPatrimonio: { label: 'Meta de patrimônio', format: 'currency' },
  caixaParaInvestir: { label: 'Caixa para investir', format: 'currency' },
};

/** Campos editáveis inline de renda fixa (valor + metadados em notes) */
export const RENDA_FIXA_FIELD_LABELS: FieldLabelMap = {
  valorAtualizado: { label: 'Valor atualizado', format: 'currency' },
  cotizacaoResgate: 'Cotização do resgate',
  liquidacaoResgate: 'Liquidação do resgate',
  benchmark: 'Benchmark',
  observacoes: 'Observações',
};

/** Edição manual de "valor atualizado" (FIM/FIA sem cota CVM, imóveis e bens) */
export const ATIVO_VALOR_FIELD_LABELS: FieldLabelMap = {
  valorAtualizado: { label: 'Valor atualizado', format: 'currency' },
};

/** Objetivo (%) de um ativo dentro da classe (rotas objetivo/objetivo-classe) */
export const OBJETIVO_CLASSE_FIELD_LABELS: FieldLabelMap = {
  objetivo: { label: 'Objetivo', format: 'percent' },
};

/** Posição consolidada de um Portfolio (resumo gravado na remoção do ativo) */
export const ATIVO_POSICAO_FIELD_LABELS: FieldLabelMap = {
  quantity: { label: 'Quantidade', format: 'number' },
  avgPrice: { label: 'Preço médio', format: 'currency' },
  totalInvested: { label: 'Total investido', format: 'currency' },
};
