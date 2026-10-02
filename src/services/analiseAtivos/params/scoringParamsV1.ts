/**
 * ScoringParams versão 1 — valores da spec v1.3 §4 ajustados pelas decisões de 30/09/2026
 * (docs/analise-ativos/decisoes-fase0.md) e pelas regras de sanidade do relatório da Fase A §4.
 *
 * Idêntico a contratos.scoringParamsV1 de docs/analise-ativos/fase0/spec-fase0.json. Semeado no banco
 * por scripts/analise-ativos/seed-scoring-params.ts; também é o fallback dos jobs de ingestão quando
 * o banco não tem versão ativa. Versões são imutáveis: recalibrar = nova versão (v2), nunca editar v1.
 * Percentuais em pontos percentuais.
 */
import type { ScoringParams } from '@/services/analiseAtivos/params/scoringParamsSchema';

export const SCORING_PARAMS_V1: ScoringParams = {
  versao: 1,
  descricao:
    'Valores da spec v1.3 §4 ajustados pelas decisões de 30/09/2026 (decisoes-fase0.md) e pelas regras de sanidade do relatório §4. Percentuais em pontos percentuais.',
  indice: {
    pesos: {
      lucro: 0.35,
      divida: 0.2,
      rent: 0.2,
      div: 0.15,
      preco: 0.1,
    },
    faixasCor: {
      verde: 8,
      azul: 6,
      laranja: 4,
    },
    redistribuirNaoSeAplica: true,
    ausenteContaZero: true,
    casasDecimais: 2,
  },
  acao: {
    componentes: {
      lucro: {
        metrica: 'anosLucroConsecutivos',
        piso: 0,
        teto: 10,
      },
      divida: {
        metrica: 'divLiqEbitda',
        piso: 6,
        teto: 0,
        financeiras: 'nao_se_aplica',
        ebitdaNaoPositivo: 'zero_se_divida_liquida_positiva_senao_teto',
      },
      rent: {
        metrica: 'roePct',
        piso: 0,
        teto: 25,
        plNaoPositivo: 'zero',
      },
      div: {
        metrica: 'dy12mPct',
        piso: 0,
        teto: 8,
      },
      preco: {
        metrica: 'plVsMedia10aPct',
        piso: 60,
        teto: -30,
        minPontosHistorico: 5,
        plNaoPositivo: 'zero',
        prejuizoUltimoAno: 'zero',
      },
    },
    semaforo: [
      {
        codigo: 'lucros_consecutivos',
        metrica: 'anosLucroConsecutivos',
        direcao: 'maior_melhor',
        atende: 5,
        parcial: 2,
      },
      {
        codigo: 'endividamento',
        metrica: 'divLiqEbitda',
        direcao: 'menor_melhor',
        atende: 3,
        parcial: 6,
        financeiras: 'nao_se_aplica',
        ebitdaNaoPositivo: 'nao_atende_se_divida_liquida_positiva_senao_atende',
      },
      {
        codigo: 'rentabilidade',
        metrica: 'roePct',
        direcao: 'maior_melhor',
        atende: 15,
        parcial: 8,
        plNaoPositivo: 'nao_atende',
      },
      {
        codigo: 'preco_historico',
        metrica: 'plVsMedia10aPct',
        direcao: 'menor_melhor',
        atende: 0,
        parcial: 60,
        plNaoPositivo: 'nao_atende',
        minPontosHistorico: 5,
      },
      {
        codigo: 'dividendos',
        metrica: 'dy12mPct',
        direcao: 'maior_melhor',
        atende: 4,
        parcial: 1,
      },
    ],
  },
  fii: {
    tijolo: {
      componentes: {
        lucro: {
          metrica: 'mesesComRendimento',
          piso: 0,
          teto: 120,
        },
        divida: {
          metrica: 'obrigacoesPlPct',
          piso: 30,
          teto: 0,
        },
        rent: {
          metrica: 'vacanciaFisicaCvmPct',
          piso: 20,
          teto: 0,
          ativo: false,
          motivoInativo: 'decisao_6_validar_20_fundos',
        },
        div: {
          metrica: 'dy12mPct',
          piso: 4,
          teto: 10,
        },
        preco: {
          metrica: 'pvp',
          piso: 1.3,
          teto: 0.85,
        },
      },
      semaforo: [
        {
          codigo: 'renda_recorrente',
          metrica: 'dy12mPct',
          direcao: 'maior_melhor',
          atende: 8,
          parcial: 6,
        },
        {
          codigo: 'vacancia',
          metrica: 'vacanciaFisicaCvmPct',
          direcao: 'menor_melhor',
          atende: 5,
          parcial: 8,
          ativo: false,
        },
        {
          codigo: 'diversificacao_imoveis',
          metrica: 'nImoveisCvm',
          direcao: 'maior_melhor',
          atende: 15,
          parcial: 8,
          ativo: false,
        },
        {
          codigo: 'obrigacoes_pl',
          metrica: 'obrigacoesPlPct',
          direcao: 'menor_melhor',
          atende: 10,
          parcial: 30,
          substitui: 'padrao_construtivo (decisão 5)',
          provisorio: true,
          notaCalibracao:
            'limiares 10/30 sem base na spec (o critério substitui padrão construtivo); coerentes com o piso 30 do C_divida — Pedro calibra',
        },
        {
          codigo: 'preco_vp',
          metrica: 'pvp',
          direcao: 'menor_melhor',
          atende: 1.05,
          parcial: 1.2,
        },
      ],
    },
    papel: {
      componentes: {
        lucro: {
          metrica: 'mesesComRendimento',
          piso: 0,
          teto: 120,
        },
        divida: {
          metrica: 'maiorCriPct',
          piso: 25,
          teto: 5,
          provisorio: true,
          substitui: 'ltv (decisão 4)',
        },
        rent: {
          metrica: 'nCri',
          piso: 5,
          teto: 40,
          provisorio: true,
          substitui: 'inadimplencia (decisão 4)',
        },
        div: {
          metrica: 'dy12mPct',
          piso: 6,
          teto: 13,
        },
        preco: {
          metrica: 'distanciaPvp1',
          piso: 0.25,
          teto: 0,
        },
      },
      semaforo: [
        {
          codigo: 'renda_recorrente',
          metrica: 'dy12mPct',
          direcao: 'maior_melhor',
          atende: 10,
          parcial: 8,
        },
        {
          codigo: 'concentracao_cri',
          metrica: 'maiorCriPct',
          direcao: 'menor_melhor',
          atende: 10,
          parcial: 20,
          provisorio: true,
          substitui: 'ltv',
        },
        {
          codigo: 'inadimplencia',
          metrica: 'inadimplenciaCriPct',
          direcao: 'menor_melhor',
          atende: 1,
          parcial: 4,
          ativo: false,
          motivoInativo: 'sem_fonte_estruturada',
        },
        {
          codigo: 'preco_vp',
          metrica: 'pvp',
          direcao: 'faixa',
          atende: [0.9, 1.05],
          parcial: [0.8, 1.15],
        },
        {
          codigo: 'diversificacao_cri',
          metrica: 'nCri',
          direcao: 'maior_melhor',
          atende: 40,
          parcial: 20,
        },
      ],
    },
    fof: {
      indice: 'fora',
      semaforo: 'fora',
    },
    indefinido: {
      regua: 'fii_tijolo',
      marcarIncompleto: true,
    },
    hibrido: {
      regra: 'imoveisMaisSpe_vs_cri',
      empate: 'fii_tijolo',
    },
    plNaoPositivo: 'fora_do_indice',
    exigirTickerConferido: true,
  },
  fiiTipo: {
    limiarComposicaoPct: 50,
    mesesHisterese: 3,
    recebiveisPapel: ['CRI', 'CRI_CRA'],
    caixaNaoRecebivel: ['LCI', 'LCI_LCA', 'Letras_Hipotecarias', 'LIG'],
    imoveis: [
      'Direitos_Bens_Imoveis',
      'Acoes_Sociedades_Atividades_FII',
      'Cotas_Sociedades_Atividades_FII',
    ],
  },
  financeiras: {
    segmentosFinanceiros: [
      'Bancos',
      'Outros Intermediarios Financeiros',
      'Seguradoras',
      'Resseguradoras',
    ],
    segmentosBanco: ['Bancos'],
    holdingsFinanceirasRaiz: ['ITSA'],
    escopoBancos: 'ind',
    escopoDemais: 'con',
    fallbackSemSetorB3: 'CvmCompany.layoutFinanceiro',
    notaConferencia:
      "conferido no ClassifSetorial real (30/09): por SEGMENTO, não por subsetor — 'Holdings Diversificadas' tem SIMH (Simpar, operacional e alavancada) e 'Previdência e Seguros' tem WIZC (corretora com EBITDA); ITSA entra pela lista de holdings financeiras. Grafia do arquivo: 'Outros Intermediarios Financeiros' sem acento.",
  },
  sanidade: {
    acoes: {
      razaoLpaAceita: [0.8, 1.25],
      razaoLpaAlertaPct: 5,
      escalaLpaMil: [800, 1250],
      escalaLpaMilesimo: [0.0008, 0.00125],
      lpaAbsMax: 1000,
      lucroMinVerificavel: 1000000,
      vizinhancaToleranciaPct: 30,
      fatorImplicitoMaxDistanciaPct: 35,
      limiarMilhares: {
        acoesMax: 20000000,
        plMin: 1000000000,
      },
      saltoAcoes: [0.4, 2.5],
      ttmDivergenciaMaxPct: 2,
      payoutSeloPct: 150,
      payoutAuditoriaPp: 15,
      precoFimAnoMaxDias: 5,
    },
    eventos: {
      tipos: ['DESDOBRAMENTO', 'GRUPAMENTO', 'BONIFICACAO'],
      dedupDias: 30,
      dedupFatorTolPct: 1,
      confirmacaoTolPct: 6,
      anoBaseInicioAnoAte: '02-14',
      anoBaseDezembroSeguinte: true,
      // razão CVM ÷ fator aceita para 'emissao_recompra' (um evento só no ano, mesmo lado de 1)
      emissaoRecompraRazaoFator: [0.5, 2],
      // BRAPI grava a data-com do evento, o Yahoo a data ex (conferido no COTAHIST: VBBR3 EJB 26/11/25)
      convencaoData: { BRAPI: 'com', YAHOO: 'ex' },
      fontePreferidaData: 'BRAPI',
      // subconjunto que só bate nos 6%: tira eventos de fonte única até bater em 1% (SBSP3 2026)
      confirmacaoEstritaTolPct: 1,
    },
    fii: {
      vpCotaTolPct: 1,
      cotasDesdobramentoFator: 5,
      dyMesCvmMaxPct: 5,
      obrigacoesRevisaoPct: 100,
      areaMaxAblM2: 500000,
      cotistasVariacaoAlertaPct: 50,
      cotistasBaseMin: 1000,
      vpCotaSaltoAlertaPct: 30,
      somaPctReceitaMax: 105,
      conferenciaValorMercadoSobrePl: [0.3, 3],
      cvmDivergenciaRendimentoPct: 5,
      cvmDivergenciaMeses: 3,
    },
    b3: {
      liquidezPregoes: 21,
      baixaLiquidezMinPregoes: 15,
      saltoDiarioPct: 40,
      cotahistRecuperarPregoes: 5,
    },
    proventos: {
      tiposAcao: ['DIVIDENDO', 'JCP'],
      tiposFii: ['RENDIMENTO', 'DIVIDENDO'],
      tiposExcluidos: ['AMORTIZACAO', 'REST_CAP'],
      mapaTipos: {
        DIVIDENDO: 'DIVIDENDO',
        Dividendo: 'DIVIDENDO',
        JCP: 'JCP',
        RENDIMENTO: 'RENDIMENTO',
        AMORTIZAÇÃO: 'AMORTIZACAO',
        'REST CAP DIN': 'REST_CAP',
      },
      convencaoDataCom: {
        BRAPI: 'ex',
        YAHOO: 'ex',
      },
      duplicataJanelaPagamentoDias: 5,
      trancheMinDiasEntrePagamentos: 20,
      fontePreferida: 'BRAPI',
      fonteSecundariaSomenteSemPreferidaNoAno: true,
      janelaMesesDy: 12,
      mesCorrenteTolerado: true,
      camposPorFonte: {
        BRAPI: {
          dataEx: 'dataCom',
          dataPagamento: 'date',
        },
        YAHOO: {
          dataEx: 'date',
          dataPagamento: null,
        },
      },
      tipoDesconhecido: 'OUTRO',
      somaDuplicadaTolPct: 1,
      // base de proventos parada ⇒ DY/rendimento 12m e meses com rendimento AUSENTES (fonte_defasada)
      frescor: {
        maxDiasBase: 20,
        maxDias: { acao: 200, fii: 45 },
        recorrenteMinMeses: { acao: 2, fii: 6 },
      },
      // diagnóstico 02/10/2026 (docs/analise-ativos/fase1/diagnostico-dy-absurdo.md)
      duplicataSemPagamento: {
        tolPct: 2,
        premioPreferencialPct: 10,
        premioTolPct: 0.5,
        pregoesDataCom: 1,
      },
      copiaRestituicao: { janelaDias: 3, tolPct: 0.5 },
      plausibilidade: {
        dyMaxPct: { acao: 18, fii: 20 }, // 18%: p95 do Quadro + antecipações de dez/2025
        saltoFator: 2,
        saltoPayoutMaxPct: 150,
        anosSaltoRecente: 1,
      },
    },
  },
  universo: {
    fiiQuadroPregoes: 30,
    fiagroForaDoMvp: true,
    fofForaDoIndice: true,
    classesFase0: ['acao', 'fii'],
  },
  pares: {
    quantidade: 5,
    completarCom: 'subsetor',
    ordem: 'valorMercado_desc',
    referenciaMinPares: 3,
  },
  valuation: {
    premissasPadrao: {
      acao: {
        yieldPct: 6,
        gPct: 8,
        kPct: 13,
        margemPct: 20,
        multiploAlvo: 'media10a',
      },
      stock: {
        yieldPct: 3,
        gPct: 8,
        kPct: 10,
        margemPct: 20,
        multiploAlvo: 'media10a',
      },
      fii: {
        yieldPct: 8,
        margemPct: 10,
        rendaMensal: 1000,
        pvpAlvo: 1,
      },
      reit: {
        yieldPct: 5.5,
        gPct: 3,
        kPct: 8,
        margemPct: 15,
        multiploAlvo: 'media10a',
      },
    },
    limites: {
      yieldPct: [0.1, 30],
      gPct: [0, 20],
      kPct: [1, 30],
      margemPct: [0, 50],
      margemPasso: 5,
    },
    barra: {
      minPontos: 5,
      naMediaPct: 3,
      naMediaPp: 0.15,
      mediaPertoDeZeroAbs: 0.5,
      naMediaPertoDeZeroAbs: 0.05,
      excluirNaoPositivos: ['pl', 'pvp', 'pReceita', 'evEbitda', 'pFco', 'pFcl', 'pffo'],
    },
    arredondamento: {
      monetario: 2,
      vsCotacaoPct: 0,
      barraPct: 0,
      barraPp: 1,
      multiplicador1Casa: ['pl', 'pffo'],
      multiplicador2Casas: ['pvp'],
    },
    metaRendaCasasAntesDoTeto: 9,
  },
  ranking: {
    usoNaFase: 3,
    m: 20,
    nMinimo: 20,
    cPorClasse: 'media_ponderada_votos_validos_do_dia',
    pesoHolder: 1.5,
    pesoContaNova: 0.5,
    contaNovaDias: 30,
    conflitoDePeso: 'menor',
    expiracaoDias: 90,
    limiteVotosDia: 20,
    convergenciaTolerancia: 1,
    convergenciaUsa: 'bayes',
    variacaoMensal: 'posicao_anterior_menos_atual',
    quarentena: {
      votos5Estrelas: 30,
      janelaHoras: 1,
      contaMenorQueDias: 90,
    },
  },
};
