/**
 * Textos do card "Dados societários e estatuto" da página da ação (A6, item 6; dona: fatia D).
 * Escritos e congelados na fatia 0; a fatia D pode ACRESCENTAR chaves, sem renomear. Varredura
 * linguagemV2Global.
 *
 * Decisões do Wellington (19/10): dividendo mínimo = texto do FRE 2022 estruturado + "pode ter sido
 * alterado" + link do FRE vigente na CVM (sem PDF); acionistas pessoa física: só nome e %, CPF/CNPJ
 * nunca guardado nem mostrado. Cada parte mostra o exercício do FRE e a data de entrega (DT_RECEB),
 * nunca uma data de referência futura. Tag along com duas bases (segmento B3 × art. 254-A).
 */
export const TEXTOS_SOCIETARIO = {
  titulo: 'Dados societários e estatuto',
  sub: 'fonte CVM · Formulário de Referência',
  /** exercício + entrega, usado em cada parte */
  referencia: 'FRE do exercício {ano} · entregue em {data}',
  acionistas: {
    titulo: 'Principais acionistas',
    sub: 'diretos · FRE do exercício {ano} · entregue em {data} · CVM',
    colunas: {
      acionista: 'Acionista',
      on: '% ON',
      pn: '% PN',
      total: '% total',
    },
    controlador: 'controlador',
    acordo: 'acordo de acionistas',
    outros: 'Outros',
    tesouraria: 'Ações em tesouraria',
    rodape:
      'Só acionistas diretos, até 6 por % do total. "Controlador" e "acordo de acionistas" como marcados no FRE. Sem CPF/CNPJ do acionista.',
    caption: 'Principais acionistas diretos de {ticker}',
    // fatia D (acréscimos)
    /** sem DT_RECEB exibível (ausente ou depois de hoje) */
    subSemData: 'diretos · FRE do exercício {ano} · CVM',
    outrosInclui: '"Outros" soma a linha "Outros" do FRE e os demais acionistas diretos.',
    semPosicao: 'sem dado · o FRE não informa a posição acionária',
    naoEmitePn: 'A companhia não emite PN.',
  },
  circulacao: {
    titulo: 'Ações em circulação',
    sub: 'definição CVM · FRE do exercício {ano}',
    on: 'ON',
    pn: 'PN',
    total: 'Total',
    naoEmite: 'não emite',
    /** {pf}, {pj}, {inst} = contagens já formatadas ('182 mil') */
    acionistas: 'Acionistas: {pf} pessoas físicas · {pj} pessoas jurídicas · {inst} institucionais',
  },
  tagAlong: {
    titulo: 'Tag along',
    sub: 'por espécie',
    colunas: {
      especie: 'Espécie',
      tagAlong: 'Tag along',
      base: 'Base',
    },
    especies: { ON: 'ON', PN: 'PN', UNIT: 'Unit' },
    /** BaseTagAlong */
    bases: {
      segmento_b3: 'regra do segmento de listagem (B3)',
      lei_254a: 'mínimo legal (Lei 6.404, art. 254-A)',
      fre_2022: 'FRE 2022',
      conforme_estatuto: 'conforme estatuto',
      nao_emite: 'não emite',
    },
    rodape:
      'Em Novo Mercado (ON) e Nível 2 (ON e PN) a base é a regra do segmento de listagem (B3). Em Nível 1 e no Tradicional: ON 80% pelo mínimo legal (Lei 6.404, art. 254-A, incluído pela Lei 10.303/2001) e PN "conforme estatuto", ou o valor do FRE 2022 com a fonte.',
    unit: 'Unit: tag along das ações que a compõem.',
    // fatia D (acréscimos)
    /** {classe} = classe da PN no FRE ('A', 'B'…) */
    pnClasse: 'PN classe {classe}',
    /** {segmento} = rótulo de segmentos */
    segmento: 'segmento de listagem: {segmento}',
    segmentos: {
      NM: 'Novo Mercado',
      N2: 'Nível 2',
      N1: 'Nível 1',
      MA: 'Bovespa Mais',
      M2: 'Bovespa Mais Nível 2',
      TRADICIONAL: 'Tradicional',
    },
  },
  dividendoMinimo: {
    titulo: 'Dividendo mínimo do estatuto',
    sub: 'texto do FRE 2022 · pode ter sido alterado',
    sufixo: 'do lucro líquido ajustado',
    semPct: 'sem dado · o FRE remete a outro item',
    trechoRotulo: 'Trecho do FRE 2022',
    semInterpretacao: 'Periodicidade e vantagens da PN: trecho do FRE 2022, sem interpretação.',
    linkFre: 'Ver Formulário de Referência vigente na CVM',
    // fatia D (acréscimos)
    semFre2022: 'sem dado · a companhia não tem FRE 2022 nos dados abertos da CVM',
    /** abre em nova aba (leitor de tela) */
    linkNovaAba: '(abre em nova aba)',
  },
  /** texto do Estado ausente (MotivoSocietario) */
  motivos: {
    sem_fre: 'sem dado · a companhia não tem Formulário de Referência nos dados abertos da CVM',
    sem_distribuicao_capital: 'sem dado · o FRE não informa a distribuição do capital',
    remete_outro_item: 'sem dado · o FRE remete a outro item',
  },
  estados: {
    carregando: 'Carregando: Dados societários e estatuto',
    erro: 'Não foi possível carregar este bloco.',
    tentarNovamente: 'Tentar de novo',
  },
} as const;
