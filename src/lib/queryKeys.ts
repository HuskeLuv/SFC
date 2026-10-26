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
    orcamento: (year: number) => [...queryKeys.cashflow.all, 'orcamento', year] as const,
    // Orçamento v2 (86e3v8p3u): tudo sob ['cashflow','orcamento','v2'] — invalidar
    // orcamentoV2Todos() pega todos os anos/meses/visões/fontes (copiar dez→jan, receita de
    // jan–mar que olha o ano anterior). `fonte` 'padrao' = a salva nas prefs. O acesso fica numa
    // chave irmã ('v2-acesso'), fora do prefixo dos dados.
    orcamentoV2Todos: () => [...queryKeys.cashflow.all, 'orcamento', 'v2'] as const,
    orcamentoV2: (
      ano: number,
      mes: number,
      visao: 'mes' | 'ano',
      fonte: 'lancado' | 'consolidado' | 'padrao',
    ) => [...queryKeys.cashflow.orcamentoV2Todos(), ano, mes, visao, fonte] as const,
    orcamentoV2Acesso: () => [...queryKeys.cashflow.all, 'orcamento', 'v2-acesso'] as const,
    anos: () => [...queryKeys.cashflow.all, 'anos'] as const,
  },
  planejamento: {
    all: ['planejamento'] as const,
    contexto: () => [...queryKeys.planejamento.all, 'contexto'] as const,
  },
  agenda: {
    all: ['agenda'] as const,
    periodo: (de: string, ate: string) => [...queryKeys.agenda.all, de, ate] as const,
  },
  pluggy: {
    all: ['pluggy'] as const,
    config: () => [...queryKeys.pluggy.all, 'config'] as const,
    conexoes: () => [...queryKeys.pluggy.all, 'conexoes'] as const,
    consentimentos: () => [...queryKeys.pluggy.all, 'consentimentos'] as const,
    caixaEntrada: () => [...queryKeys.pluggy.all, 'caixa-entrada'] as const,
    carteira: () => [...queryKeys.pluggy.all, 'carteira'] as const,
    /** Escolher o destino na importação (src/lib/pluggyDestinos.ts). */
    destinos: (connectionId?: string) =>
      [...queryKeys.pluggy.all, 'destinos', connectionId ?? 'todas'] as const,
    extrato: (accountId: string, page: number) =>
      [...queryKeys.pluggy.all, 'extrato', accountId, page] as const,
  },
  dividas: {
    all: ['dividas'] as const,
    detail: (id: string) => [...queryKeys.dividas.all, id] as const,
    cronograma: (id: string) => [...queryKeys.dividas.all, id, 'cronograma'] as const,
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
  saudeFinanceira: {
    all: ['saudeFinanceira'] as const,
    evolucao: () => [...queryKeys.saudeFinanceira.all, 'evolucao'] as const,
    seguros: () => [...queryKeys.saudeFinanceira.all, 'seguros'] as const,
  },
  educacao: {
    all: ['educacao'] as const,
    cursos: () => [...queryKeys.educacao.all, 'cursos'] as const,
    curso: (slug: string) => [...queryKeys.educacao.all, 'curso', slug] as const,
  },
  admin: {
    all: ['admin'] as const,
    overview: () => [...queryKeys.admin.all, 'overview'] as const,
  },
  ir: {
    all: ['ir'] as const,
    resumoAnual: (year: number) => [...queryKeys.ir.all, 'resumoAnual', year] as const,
    mensal: () => [...queryKeys.ir.all, 'mensal'] as const,
    stocksUs: () => [...queryKeys.ir.all, 'stocksUs'] as const,
    cripto: () => [...queryKeys.ir.all, 'cripto'] as const,
    comecotas: () => [...queryKeys.ir.all, 'comecotas'] as const,
  },
  // Mover investimentos entre abas/seções (out/2026): opções do diálogo e categoria do ativo
  carteiraMover: {
    all: ['carteiraMover'] as const,
    opcoes: (tipo: 'posicao' | 'planejado', id: string) =>
      [...queryKeys.carteiraMover.all, 'opcoes', tipo, id] as const,
    categoria: (assetId: string) => [...queryKeys.carteiraMover.all, 'categoria', assetId] as const,
  },
  // Análise de Ativos — Fase 1 (dono: 0a). quadro(params) inclui os filtros/ordem na key.
  analiseAtivos: {
    all: ['analiseAtivos'] as const,
    config: () => [...queryKeys.analiseAtivos.all, 'config'] as const,
    quadros: () => [...queryKeys.analiseAtivos.all, 'quadro'] as const,
    quadro: (params: Record<string, string | number | boolean | undefined>) =>
      [...queryKeys.analiseAtivos.quadros(), params] as const,
    busca: () => [...queryKeys.analiseAtivos.all, 'busca'] as const,
    carteira: () => [...queryKeys.analiseAtivos.all, 'carteira'] as const,
    ativo: (ticker: string) => [...queryKeys.analiseAtivos.all, 'ativo', ticker] as const,
    fundamentos: (ticker: string) =>
      [...queryKeys.analiseAtivos.all, 'ativo', ticker, 'fundamentos'] as const,
    valuation: (ticker: string) =>
      [...queryKeys.analiseAtivos.all, 'ativo', ticker, 'valuation'] as const,
    tese: (ticker: string) => [...queryKeys.analiseAtivos.all, 'tese', ticker] as const,
    // Bloco D (fatia 0). raioX fica sob 'ativo' (cai junto com o ativo); cenario é do usuário
    // logado (invalidar só ele ao salvar); comparador usa o conjunto ORDENADO + o 1º slot (que
    // decide a classe quando o link mistura classes); o hook reordena pelos slots.
    raioX: (ticker: string) => [...queryKeys.analiseAtivos.all, 'ativo', ticker, 'raioX'] as const,
    cenario: (ticker: string) => [...queryKeys.analiseAtivos.all, 'cenario', ticker] as const,
    // v2.4: `janela` opcional no fim da chave do comparador (D passa a enviar ?janela=; sem ela a
    // chave fica a de hoje) e sugestões do modal Comparar (C1), por ticker, janela e busca.
    comparador: (tickersOrdenados: readonly string[], primeiro: string, janela?: number) =>
      [
        ...queryKeys.analiseAtivos.all,
        'comparador',
        tickersOrdenados.join(','),
        primeiro,
        ...(janela === undefined ? [] : [janela]),
      ] as const,
    sugestoesComparar: (ticker: string, janela: number, q = '') =>
      [...queryKeys.analiseAtivos.all, 'ativo', ticker, 'sugestoesComparar', janela, q] as const,
    // Bloco 1 (fatia 0): tudo do usuário LOGADO sob 'salvos' (invalidar salvosTodos() cobre tudo).
    // NÃO invalidam a Carteira (listas não mexem em posição).
    salvosTodos: () => [...queryKeys.analiseAtivos.all, 'salvos'] as const,
    listas: () => [...queryKeys.analiseAtivos.salvosTodos(), 'listas'] as const,
    lista: (id: string, params: Record<string, string | number | undefined> = {}) =>
      [...queryKeys.analiseAtivos.listas(), id, params] as const,
    salvosIndice: () => [...queryKeys.analiseAtivos.salvosTodos(), 'indice'] as const,
    filtros: (classe: string) =>
      [...queryKeys.analiseAtivos.salvosTodos(), 'filtros', classe] as const,
    comparacoes: (classe?: string) =>
      [...queryKeys.analiseAtivos.salvosTodos(), 'comparacoes', classe ?? 'todas'] as const,
    alertas: (classe?: string) =>
      [...queryKeys.analiseAtivos.salvosTodos(), 'alertas', classe ?? 'todas'] as const,
    // A6 (fatia 0; hooks das fatias A e D): sob 'ativo' (caem junto com o ativo)
    imoveisFii: (ticker: string) =>
      [...queryKeys.analiseAtivos.all, 'ativo', ticker, 'imoveisFii'] as const,
    societario: (ticker: string) =>
      [...queryKeys.analiseAtivos.all, 'ativo', ticker, 'societario'] as const,
  },
  comunidade: {
    all: ['comunidade'] as const,
    config: () => [...queryKeys.comunidade.all, 'config'] as const,
    me: () => [...queryKeys.comunidade.all, 'me'] as const,
    feeds: () => [...queryKeys.comunidade.all, 'feed'] as const,
    feed: (categoria: string | null, autor: string | null) =>
      [...queryKeys.comunidade.feeds(), categoria ?? 'todas', autor ?? 'todos'] as const,
    post: (id: string) => [...queryKeys.comunidade.all, 'post', id] as const,
    denuncias: () => [...queryKeys.comunidade.all, 'denuncias'] as const,
    equipe: () => [...queryKeys.comunidade.all, 'equipe'] as const,
  },
} as const;
