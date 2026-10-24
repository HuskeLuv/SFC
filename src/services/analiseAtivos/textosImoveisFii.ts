/**
 * Textos da seção "Imóveis e composição do fundo" da página do FII (A6, itens 1 e 2; dona da tela:
 * fatia A). Escritos e congelados na fatia 0 (docs/analise-ativos/fundamentei-trazer/desenho.json e
 * prototipo.html); a fatia A pode ACRESCENTAR chaves, sem renomear. Passam pela varredura
 * linguagemV2Global.
 *
 * Regras: sem cor semântica (composição em tons neutros; vacância por imóvel sem cor); percentuais
 * "como informados, sem normalizar"; área "informada à CVM" (não é ABL); inadimplência por imóvel
 * não aparece; locatários por nome = "sem dado" (a CVM não publica); setores só quando reais.
 * Exemplos e fixtures usam o FII fictício XPTO11, nunca valores de terceiros.
 */
export const TEXTOS_IMOVEIS_FII = {
  secao: {
    /** tijolo e híbrido com imóvel de renda: composição (1/3) + lista (2/3) a partir de xl */
    rotuloComLista: 'Imóveis e composição do fundo',
    /** papel e FoF: só a composição, na largura toda */
    rotuloSemLista: 'Composição do fundo',
  },
  composicao: {
    titulo: 'Composição do fundo',
    sub: '% de caixa, imóveis, papéis e fundos',
    ariaBarra: 'Composição do fundo',
    fatias: {
      imoveis: 'Imóveis',
      cri_cra: 'Papéis (CRI/CRA)',
      cotas_fii: 'Fundos (cotas de FII)',
      caixa_renda_fixa: 'Caixa e renda fixa',
    },
    subFatias: {
      imoveis: 'inclui participação em SPE',
    },
    /** legenda de cada fatia: '% · R$ x bi' */
    legendaValor: '{valor} do ativo',
    ativoTotal: 'Ativo total {valor}',
    base: 'Base {valor}',
    rodape:
      'ref. {data} · fonte CVM informe mensal · base: caixa + imóveis + papéis + fundos (fora valores a receber e outros ativos)',
    comoLerTitulo: 'Como ler',
    comoLer:
      'Percentuais sobre a soma de caixa, imóveis, papéis (CRI/CRA) e fundos no último informe mensal; aluguéis e valores a receber e outros ativos ficam fora da conta. "Imóveis" aparece com 0% em vez de sumir, para manter as mesmas fatias em todos os FIIs.',
    semLista: 'Lista de imóveis: não se aplica a fundo de papel nem a fundo de fundos.',
  },
  imoveis: {
    titulo: 'Imóveis do fundo',
    sub: 'ordenado por área · {n} de {total}',
    resumo: {
      imoveisRenda: 'Imóveis de renda',
      outrasClasses: '+ {n} em outras classes',
      area: 'Área informada à CVM',
      areaSub: 'soma das áreas do informe',
      vacancia: 'Vacância física ponderada',
      vacanciaSub: 'mesma célula do Essencial',
      estados: 'Estados',
      estadosSub: 'identificados no endereço (em {x} de {y} imóveis)',
      locatariosRotulo: 'Locatários:',
      locatariosSemDado: 'sem dado · a CVM não publica os locatários por nome',
      setoresRotulo: 'Setores dos locatários',
      setoresSub: '% da receita, como informado',
      setorItem: '{nome} {valor}',
      /** fatia A: setores além dos SETORES_INICIAIS exibidos */
      setoresMais: '+ {n} setores',
    },
    colunas: {
      imovel: 'Imóvel',
      endereco: 'Endereço (CVM)',
      area: 'Área (m²)',
      unidades: 'Unidades',
      vacancia: 'Vacância',
      receita: '% da receita do FII',
      classe: 'Classe',
    },
    uf: 'UF inferida: {valor}',
    ufNaoIdentificada: 'UF inferida: não identificada',
    verTodos: 'Ver os {n} imóveis',
    verMenos: 'Mostrar menos',
    outros: 'Outros imóveis ({n})',
    somaReceitaFora:
      'A receita do fundo inclui outros ativos (CRI, caixa); a soma dos imóveis é {valor}. Percentuais como informados, sem normalizar.',
    rodape:
      'ref. {data} · fonte CVM informe trimestral · informado pelo gestor, pode diferir do relatório gerencial',
    caption: 'Imóveis de renda de {ticker}, ordenados por área',
    rotuloRegiao: 'Imóveis do fundo, role para o lado',
  },
  /** texto do Estado ausente/nao_se_aplica (MotivoComposicaoFii | MotivoListaImoveisFii) */
  motivos: {
    sem_informe_mensal: 'sem dado · o fundo não tem informe mensal recente na CVM',
    composicao_inconsistente: 'sem dado · composição inconsistente no informe',
    cnpj_em_conferencia: 'sem dado · vínculo entre o código e o CNPJ do fundo em conferência',
    sem_informe_trimestral: 'sem dado · o fundo não tem informe trimestral recente na CVM',
    sem_imoveis_renda: 'sem dado · o informe trimestral não lista imóveis de renda',
    nao_se_aplica_tipo: 'não se aplica a fundo de papel nem a fundo de fundos',
  },
  estados: {
    carregando: 'Carregando: Imóveis e composição do fundo',
    erro: 'Não foi possível carregar este bloco.',
    tentarNovamente: 'Tentar de novo',
  },
} as const;
