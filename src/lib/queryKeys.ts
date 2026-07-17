export const queryKeys = {
  carteira: {
    all: ['carteira'] as const,
    resumo: () => [...queryKeys.carteira.all, 'resumo'] as const,
    // startDate entra na key: o servidor REBASEIA a série na janela pedida,
    // então respostas de janelas diferentes não são intercambiáveis no cache.
    historico: (startDate?: number) =>
      [...queryKeys.carteira.all, 'historico', startDate ?? 'inicio'] as const,
    rentabilidade: (startDate?: string) =>
      [...queryKeys.carteira.all, 'rentabilidade', startDate] as const,
    janelas: () => [...queryKeys.carteira.all, 'janelas'] as const,
  },
  assets: {
    all: ['assets'] as const,
    type: (assetType: string) => [...queryKeys.assets.all, assetType] as const,
  },
  cashflow: {
    all: ['cashflow'] as const,
    year: (year: number) => [...queryKeys.cashflow.all, year] as const,
    contaCorrenteAnterior: (year: number) =>
      [...queryKeys.cashflow.all, 'conta-corrente-anterior', year] as const,
    evolucaoPatrimonio: (year: number) =>
      [...queryKeys.cashflow.all, 'evolucao-patrimonio', year] as const,
    investimentos: (year: number) => [...queryKeys.cashflow.all, 'investimentos', year] as const,
    anos: () => [...queryKeys.cashflow.all, 'anos'] as const,
  },
  planejamento: {
    all: ['planejamento'] as const,
    contexto: () => [...queryKeys.planejamento.all, 'contexto'] as const,
  },
  reserva: {
    emergencia: () => ['reserva', 'emergencia'] as const,
    oportunidade: () => ['reserva', 'oportunidade'] as const,
  },
  proventos: {
    all: ['proventos'] as const,
  },
  indices: {
    all: ['indices'] as const,
  },
  instituicao: {
    distribuicao: () => ['instituicao', 'distribuicao'] as const,
  },
  alocacao: {
    config: () => ['alocacao', 'config'] as const,
  },
  riscoRetorno: {
    all: ['riscoRetorno'] as const,
  },
  sensibilidadeCarteira: {
    all: ['sensibilidadeCarteira'] as const,
    window: (windowMonths: number) =>
      [...queryKeys.sensibilidadeCarteira.all, windowMonths] as const,
  },
  coberturaFgc: {
    all: ['coberturaFgc'] as const,
  },
  historicoAlteracoes: {
    all: ['historicoAlteracoes'] as const,
    list: (page: number, section?: string) =>
      [...queryKeys.historicoAlteracoes.all, page, section ?? 'todas'] as const,
  },
  ir: {
    all: ['ir'] as const,
    resumoAnual: (year: number) => [...queryKeys.ir.all, 'resumoAnual', year] as const,
    mensal: () => [...queryKeys.ir.all, 'mensal'] as const,
    stocksUs: () => [...queryKeys.ir.all, 'stocksUs'] as const,
    cripto: () => [...queryKeys.ir.all, 'cripto'] as const,
    comecotas: () => [...queryKeys.ir.all, 'comecotas'] as const,
  },
} as const;
