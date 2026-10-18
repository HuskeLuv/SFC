/**
 * Cadeias de conceitos XBRL por campo (SEC companyfacts) — Stocks e REITs, fatia A.
 *
 * Cada campo tem uma CADEIA de passos tentados em ordem, POR ANO: vale o primeiro passo que tem
 * valor naquele exercício, e o conceito usado vai para sourceConcept (troca de conceito entre anos
 * vira a flag informativa 'troca_conceito'). Um passo pode somar termos ('A+B'); termo com '?' no
 * fim é opcional (ausente = 0) e termo com '-' na frente subtrai. O primeiro termo de uma soma é
 * sempre obrigatório.
 *
 * Decisões do desenho (docs/analise-ativos/stocks-reits/desenho.json → final.criterios):
 * - EBITDA em 3 degraus (extrairFundamentosSec): (1) OperatingIncomeLoss + D&A; (2) lucro antes do
 *   IR + juros + D&A (flag ebitda_pre_ir); (3) lucro líquido + IR + juros + D&A (flag ebitda_lucro).
 *   Juros = InterestExpense → InterestExpenseNonoperating → InterestExpenseDebt →
 *   InterestExpenseBorrowings → InterestExpenseOperating (acréscimos da fatia A: WELL, O, INVH). No degrau 3 o IR é opcional
 *   (REIT não recolhe imposto de renda corporativo; ARE/BXP/AMH não têm IncomeTaxExpenseBenefit).
 * - D&A SEM DepreciationAndAmortizationOfRealEstate (404 nos frames, 0/22 companyfacts).
 * - Capex com PaymentsToAcquireOtherPropertyPlantAndEquipment (LLY 2009–2025).
 * - Dividendos pagos com PaymentsOfCapitalDistribution (PSA).
 * - DPA: CashPaid → Declared → derivado (dividendos pagos ÷ média diluída, selo "calculado").
 * - Receita com RealEstateRevenueNet → OperatingLeasesIncomeStatementLeaseRevenue no fim (REITs),
 *   e, acréscimo da fatia A medido na amostra, OperatingLeaseLeaseIncome → LeaseIncome (ASC 842).
 * - Dívida com ConvertibleNotesPayable → ConvertibleLongTermNotesPayable no fim (acréscimo da
 *   fatia A). Sem conceito de dívida no ano = null (a leitura decide se vale zero).
 *
 * Todo conceito daqui existe na taxonomia us-gaap/dei: a lista é conferida contra os frames da SEC
 * (fixture conceitos-validados.json, gerada por relatorio-cobertura-eua --validar-conceitos).
 */

export type TipoFatoSec = 'duracao' | 'instante';
export type UnidadeSec = 'USD' | 'USD/shares' | 'shares';
export type TaxonomiaSec = 'us-gaap' | 'dei';

export interface TermoCadeia {
  taxonomia: TaxonomiaSec;
  conceito: string;
  sinal: 1 | -1;
  opcional: boolean;
}

export interface PassoCadeia {
  /** como está escrito na cadeia ('LongTermDebtNoncurrent+LongTermDebtCurrent?') */
  rotulo: string;
  termos: TermoCadeia[];
}

export const CAMPOS_SEC = [
  'receita',
  'lucroControladora',
  'lucroConsolidado',
  'lucroOperacional',
  'lucroAntesIr',
  'impostoRenda',
  'juros',
  'depreciacaoAmortizacao',
  'dividaBruta',
  'caixa',
  'aplicacoesCp',
  'fco',
  'capex',
  'dividendosPagos',
  'recompras',
  'dpaCashPaid',
  'dpaDeclared',
  'acoesMediaDiluida',
  'lpaDiluido',
  'plControladora',
  'plTotal',
  'ativoTotal',
] as const;
export type CampoSec = (typeof CAMPOS_SEC)[number];

export interface CadeiaCampo {
  campo: CampoSec;
  tipo: TipoFatoSec;
  unidade: UnidadeSec;
  passos: PassoCadeia[];
}

/** 'Conceito', 'A+B?', 'A+-B', 'dei:Conceito' → passo. */
export function passo(rotulo: string): PassoCadeia {
  const termos = rotulo.split('+').map((bruto, i): TermoCadeia => {
    let s = bruto.trim();
    let sinal: 1 | -1 = 1;
    if (s.startsWith('-')) {
      sinal = -1;
      s = s.slice(1);
    }
    let opcional = false;
    if (s.endsWith('?')) {
      if (i === 0) throw new Error(`primeiro termo não pode ser opcional: ${rotulo}`);
      opcional = true;
      s = s.slice(0, -1);
    }
    let taxonomia: TaxonomiaSec = 'us-gaap';
    if (s.includes(':')) {
      const [t, c] = s.split(':');
      if (t !== 'us-gaap' && t !== 'dei') throw new Error(`taxonomia desconhecida: ${rotulo}`);
      taxonomia = t;
      s = c;
    }
    if (!/^[A-Z][A-Za-z0-9]+$/.test(s)) throw new Error(`conceito inválido: ${rotulo}`);
    return { taxonomia, conceito: s, sinal, opcional };
  });
  return { rotulo, termos };
}

const cadeia = (
  campo: CampoSec,
  tipo: TipoFatoSec,
  unidade: UnidadeSec,
  passos: string[],
): CadeiaCampo => ({ campo, tipo, unidade, passos: passos.map(passo) });

export const CADEIAS_SEC: Record<CampoSec, CadeiaCampo> = {
  receita: cadeia('receita', 'duracao', 'USD', [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'RealEstateRevenueNet',
    'OperatingLeasesIncomeStatementLeaseRevenue',
    // ASC 842 (2019+): REIT residencial que só tagueia a receita de aluguel (AMH, EQR, INVH);
    // conferidos nos frames CY2024 (415 e 141 empresas)
    'OperatingLeaseLeaseIncome',
    'LeaseIncome',
  ]),
  // lucro líquido da controladora
  lucroControladora: cadeia('lucroControladora', 'duracao', 'USD', [
    'NetIncomeLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
    'ProfitLoss',
  ]),
  // lucro consolidado (com minoritários)
  lucroConsolidado: cadeia('lucroConsolidado', 'duracao', 'USD', ['ProfitLoss', 'NetIncomeLoss']),
  lucroOperacional: cadeia('lucroOperacional', 'duracao', 'USD', ['OperatingIncomeLoss']),
  lucroAntesIr: cadeia('lucroAntesIr', 'duracao', 'USD', [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ]),
  impostoRenda: cadeia('impostoRenda', 'duracao', 'USD', ['IncomeTaxExpenseBenefit']),
  juros: cadeia('juros', 'duracao', 'USD', [
    'InterestExpense',
    'InterestExpenseNonoperating',
    'InterestExpenseDebt',
    // WELL 2022+ (sem InterestExpense*): conferido nos frames CY2024 (187 empresas)
    'InterestExpenseBorrowings',
    // REIT com juros dentro das despesas operacionais (O, INVH, AMH 2022+): frames CY2024 (36)
    'InterestExpenseOperating',
  ]),
  depreciacaoAmortizacao: cadeia('depreciacaoAmortizacao', 'duracao', 'USD', [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
    'Depreciation',
  ]),
  dividaBruta: cadeia('dividaBruta', 'instante', 'USD', [
    'LongTermDebt',
    'LongTermDebtNoncurrent+LongTermDebtCurrent?',
    'DebtLongtermAndShorttermCombinedAmount',
    'LongTermDebtAndCapitalLeaseObligations+LongTermDebtAndCapitalLeaseObligationsCurrent?',
    'DebtInstrumentCarryingAmount',
    'SeniorNotes',
    'UnsecuredDebt+SecuredDebt?',
    'NotesPayable',
    // só conversíveis (MIRM 2022+): frames CY2024Q4I (168 e 157 empresas)
    'ConvertibleNotesPayable',
    'ConvertibleLongTermNotesPayable',
  ]),
  caixa: cadeia('caixa', 'instante', 'USD', [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    'Cash',
  ]),
  aplicacoesCp: cadeia('aplicacoesCp', 'instante', 'USD', [
    'ShortTermInvestments',
    'MarketableSecuritiesCurrent',
  ]),
  fco: cadeia('fco', 'duracao', 'USD', [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ]),
  capex: cadeia('capex', 'duracao', 'USD', [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireOtherPropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
  ]),
  dividendosPagos: cadeia('dividendosPagos', 'duracao', 'USD', [
    'PaymentsOfDividendsCommonStock',
    'PaymentsOfDividends',
    'PaymentsOfCapitalDistribution',
  ]),
  recompras: cadeia('recompras', 'duracao', 'USD', ['PaymentsForRepurchaseOfCommonStock']),
  dpaCashPaid: cadeia('dpaCashPaid', 'duracao', 'USD/shares', [
    'CommonStockDividendsPerShareCashPaid',
  ]),
  dpaDeclared: cadeia('dpaDeclared', 'duracao', 'USD/shares', [
    'CommonStockDividendsPerShareDeclared',
  ]),
  acoesMediaDiluida: cadeia('acoesMediaDiluida', 'duracao', 'shares', [
    'WeightedAverageNumberOfDilutedSharesOutstanding',
    'WeightedAverageNumberOfShareOutstandingBasicAndDiluted',
    'WeightedAverageNumberOfSharesOutstandingBasic',
  ]),
  lpaDiluido: cadeia('lpaDiluido', 'duracao', 'USD/shares', [
    'EarningsPerShareDiluted',
    'EarningsPerShareBasicAndDiluted',
    'EarningsPerShareBasic',
  ]),
  plControladora: cadeia('plControladora', 'instante', 'USD', [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ]),
  plTotal: cadeia('plTotal', 'instante', 'USD', [
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'StockholdersEquity',
  ]),
  ativoTotal: cadeia('ativoTotal', 'instante', 'USD', ['Assets']),
};

/** Conceito proibido (não existe nos frames; 0/22 companyfacts). */
export const CONCEITOS_PROIBIDOS = ['DepreciationAndAmortizationOfRealEstate'] as const;

/** Todos os conceitos das cadeias, 'taxonomia:Conceito', sem repetição (validação e recorte). */
export function conceitosDasCadeias(): string[] {
  const s = new Set<string>();
  for (const c of Object.values(CADEIAS_SEC)) {
    for (const p of c.passos) for (const t of p.termos) s.add(`${t.taxonomia}:${t.conceito}`);
  }
  return [...s].sort();
}

/** Unidade XBRL de cada conceito (para recortar fixtures e consultar frames). */
export function unidadesDosConceitos(): Map<string, { unidade: UnidadeSec; tipo: TipoFatoSec }> {
  const m = new Map<string, { unidade: UnidadeSec; tipo: TipoFatoSec }>();
  for (const c of Object.values(CADEIAS_SEC)) {
    for (const p of c.passos) {
      for (const t of p.termos)
        m.set(`${t.taxonomia}:${t.conceito}`, { unidade: c.unidade, tipo: c.tipo });
    }
  }
  return m;
}
