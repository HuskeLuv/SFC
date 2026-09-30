/**
 * Schema (zod) do ScoringParams — todos os limiares da Análise de Ativos.
 *
 * Estrito: chave extra = erro (evita parâmetro digitado errado ser ignorado em silêncio). Validado na
 * escrita (seed/scripts de nova versão) e na leitura (obterScoringParams). Percentuais em pontos
 * percentuais. Coerências verificadas além dos tipos:
 *  - pesos do Índice em [0,1] com soma 1;
 *  - faixas de cor decrescentes (verde > azul > laranja);
 *  - semáforo: maior_melhor ⇒ atende ≥ parcial; menor_melhor ⇒ atende ≤ parcial;
 *    faixa ⇒ [atende] contida em [parcial];
 *  - componentes: piso ≠ teto (interpolação aceita piso > teto, "menor é melhor").
 */
import { z } from 'zod';

const faixaNum = z.tuple([z.number(), z.number()]);
const peso = z.number().min(0).max(1);

const componente = z.strictObject({
  metrica: z.string().min(1),
  piso: z.number(),
  teto: z.number(),
  ativo: z.boolean().optional(),
  motivoInativo: z.string().optional(),
  provisorio: z.boolean().optional(),
  substitui: z.string().optional(),
  minPontosHistorico: z.number().int().positive().optional(),
  financeiras: z.literal('nao_se_aplica').optional(),
  ebitdaNaoPositivo: z.string().optional(),
  plNaoPositivo: z.string().optional(),
  prejuizoUltimoAno: z.string().optional(),
});

const criterioSemaforo = z.strictObject({
  codigo: z.string().min(1),
  metrica: z.string().min(1),
  direcao: z.enum(['maior_melhor', 'menor_melhor', 'faixa']),
  atende: z.union([z.number(), faixaNum]),
  parcial: z.union([z.number(), faixaNum]),
  ativo: z.boolean().optional(),
  motivoInativo: z.string().optional(),
  provisorio: z.boolean().optional(),
  substitui: z.string().optional(),
  notaCalibracao: z.string().optional(),
  minPontosHistorico: z.number().int().positive().optional(),
  financeiras: z.literal('nao_se_aplica').optional(),
  ebitdaNaoPositivo: z.string().optional(),
  plNaoPositivo: z.string().optional(),
});

const componentes = z.strictObject({
  lucro: componente,
  divida: componente,
  rent: componente,
  div: componente,
  preco: componente,
});

const reguaFii = z.strictObject({
  componentes,
  semaforo: z.array(criterioSemaforo).min(1),
});

const premissas = z.strictObject({
  yieldPct: z.number(),
  gPct: z.number().optional(),
  kPct: z.number().optional(),
  margemPct: z.number(),
  multiploAlvo: z.literal('media10a').optional(),
  rendaMensal: z.number().optional(),
  pvpAlvo: z.number().optional(),
});

const baseSchema = z.strictObject({
  versao: z.number().int().positive(),
  descricao: z.string(),
  indice: z.strictObject({
    pesos: z.strictObject({ lucro: peso, divida: peso, rent: peso, div: peso, preco: peso }),
    faixasCor: z.strictObject({ verde: z.number(), azul: z.number(), laranja: z.number() }),
    redistribuirNaoSeAplica: z.boolean(),
    ausenteContaZero: z.boolean(),
    casasDecimais: z.number().int().min(0).max(6),
  }),
  acao: z.strictObject({
    componentes,
    semaforo: z.array(criterioSemaforo).min(1),
  }),
  fii: z.strictObject({
    tijolo: reguaFii,
    papel: reguaFii,
    fof: z.strictObject({ indice: z.literal('fora'), semaforo: z.literal('fora') }),
    indefinido: z.strictObject({
      regua: z.enum(['fii_tijolo', 'fii_papel']),
      marcarIncompleto: z.boolean(),
    }),
    hibrido: z.strictObject({
      regra: z.literal('imoveisMaisSpe_vs_cri'),
      empate: z.enum(['fii_tijolo', 'fii_papel']),
    }),
    plNaoPositivo: z.literal('fora_do_indice'),
    exigirTickerConferido: z.boolean(),
  }),
  fiiTipo: z.strictObject({
    limiarComposicaoPct: z.number().min(0).max(100),
    mesesHisterese: z.number().int().min(1),
    recebiveisPapel: z.array(z.string()).min(1),
    caixaNaoRecebivel: z.array(z.string()),
    imoveis: z.array(z.string()).min(1),
  }),
  financeiras: z.strictObject({
    segmentosFinanceiros: z.array(z.string()).min(1),
    segmentosBanco: z.array(z.string()).min(1),
    holdingsFinanceirasRaiz: z.array(z.string().regex(/^[A-Z0-9]{4}$/)),
    escopoBancos: z.enum(['con', 'ind']),
    escopoDemais: z.enum(['con', 'ind']),
    fallbackSemSetorB3: z.literal('CvmCompany.layoutFinanceiro'),
    notaConferencia: z.string().optional(),
  }),
  sanidade: z.strictObject({
    acoes: z.strictObject({
      razaoLpaAceita: faixaNum,
      razaoLpaAlertaPct: z.number().positive(),
      escalaLpaMil: faixaNum,
      escalaLpaMilesimo: faixaNum,
      lpaAbsMax: z.number().positive(),
      lucroMinVerificavel: z.number().nonnegative(),
      vizinhancaToleranciaPct: z.number().positive(),
      fatorImplicitoMaxDistanciaPct: z.number().positive(),
      limiarMilhares: z.strictObject({ acoesMax: z.number().positive(), plMin: z.number() }),
      saltoAcoes: faixaNum,
      ttmDivergenciaMaxPct: z.number().nonnegative(),
      payoutSeloPct: z.number().positive(),
      payoutAuditoriaPp: z.number().positive(),
      precoFimAnoMaxDias: z.number().int().nonnegative(),
    }),
    eventos: z.strictObject({
      tipos: z.array(z.enum(['DESDOBRAMENTO', 'GRUPAMENTO', 'BONIFICACAO'])).min(1),
      dedupDias: z.number().int().nonnegative(),
      dedupFatorTolPct: z.number().nonnegative(),
      confirmacaoTolPct: z.number().nonnegative(),
      anoBaseInicioAnoAte: z.string().regex(/^\d{2}-\d{2}$/),
      anoBaseDezembroSeguinte: z.boolean(),
      // campos acrescentados na correção de 30/09 (default = valor da v1: JSON gravado antes continua
      // válido e com o mesmo comportamento do código)
      emissaoRecompraRazaoFator: faixaNum.default([0.5, 2]),
      convencaoData: z
        .record(z.string(), z.enum(['com', 'ex']))
        .default({ BRAPI: 'com', YAHOO: 'ex' }),
      fontePreferidaData: z.string().default('BRAPI'),
      confirmacaoEstritaTolPct: z.number().nonnegative().default(1),
    }),
    fii: z.strictObject({
      vpCotaTolPct: z.number().nonnegative(),
      cotasDesdobramentoFator: z.number().positive(),
      dyMesCvmMaxPct: z.number().positive(),
      obrigacoesRevisaoPct: z.number().positive(),
      areaMaxAblM2: z.number().positive(),
      cotistasVariacaoAlertaPct: z.number().positive(),
      cotistasBaseMin: z.number().int().nonnegative(),
      vpCotaSaltoAlertaPct: z.number().positive(),
      somaPctReceitaMax: z.number().positive(),
      conferenciaValorMercadoSobrePl: faixaNum,
      cvmDivergenciaRendimentoPct: z.number().nonnegative(),
      cvmDivergenciaMeses: z.number().int().positive(),
    }),
    b3: z.strictObject({
      liquidezPregoes: z.number().int().positive(),
      baixaLiquidezMinPregoes: z.number().int().nonnegative(),
      saltoDiarioPct: z.number().positive(),
      cotahistRecuperarPregoes: z.number().int().nonnegative(),
    }),
    proventos: z.strictObject({
      tiposAcao: z.array(z.string()).min(1),
      tiposFii: z.array(z.string()).min(1),
      tiposExcluidos: z.array(z.string()),
      mapaTipos: z.record(z.string(), z.string()),
      convencaoDataCom: z.record(z.string(), z.enum(['ex', 'com'])),
      duplicataJanelaPagamentoDias: z.number().int().nonnegative(),
      trancheMinDiasEntrePagamentos: z.number().int().nonnegative(),
      fontePreferida: z.string(),
      fonteSecundariaSomenteSemPreferidaNoAno: z.boolean(),
      janelaMesesDy: z.number().int().positive(),
      mesCorrenteTolerado: z.boolean(),
      camposPorFonte: z.record(
        z.string(),
        z.strictObject({
          dataEx: z.enum(['dataCom', 'date']),
          dataPagamento: z.enum(['date']).nullable(),
        }),
      ),
      tipoDesconhecido: z.string(),
      somaDuplicadaTolPct: z.number().nonnegative(),
    }),
  }),
  universo: z.strictObject({
    fiiQuadroPregoes: z.number().int().positive(),
    fiagroForaDoMvp: z.boolean(),
    fofForaDoIndice: z.boolean(),
    classesFase0: z.array(z.enum(['acao', 'fii', 'stock', 'reit'])).min(1),
  }),
  pares: z.strictObject({
    quantidade: z.number().int().positive(),
    completarCom: z.enum(['subsetor', 'setor']),
    ordem: z.literal('valorMercado_desc'),
    referenciaMinPares: z.number().int().positive(),
  }),
  valuation: z.strictObject({
    premissasPadrao: z.strictObject({
      acao: premissas,
      stock: premissas,
      fii: premissas,
      reit: premissas,
    }),
    limites: z.strictObject({
      yieldPct: faixaNum,
      gPct: faixaNum,
      kPct: faixaNum,
      margemPct: faixaNum,
      margemPasso: z.number().positive(),
    }),
    barra: z.strictObject({
      minPontos: z.number().int().positive(),
      naMediaPct: z.number().nonnegative(),
      naMediaPp: z.number().nonnegative(),
      mediaPertoDeZeroAbs: z.number().nonnegative(),
      naMediaPertoDeZeroAbs: z.number().nonnegative(),
      excluirNaoPositivos: z.array(z.string()),
    }),
    arredondamento: z.strictObject({
      monetario: z.number().int().nonnegative(),
      vsCotacaoPct: z.number().int().nonnegative(),
      barraPct: z.number().int().nonnegative(),
      barraPp: z.number().int().nonnegative(),
      multiplicador1Casa: z.array(z.string()),
      multiplicador2Casas: z.array(z.string()),
    }),
    metaRendaCasasAntesDoTeto: z.number().int().nonnegative(),
  }),
  ranking: z.strictObject({
    usoNaFase: z.number().int().positive(),
    m: z.number().positive(),
    nMinimo: z.number().int().positive(),
    cPorClasse: z.string(),
    pesoHolder: z.number().positive(),
    pesoContaNova: z.number().positive(),
    contaNovaDias: z.number().int().positive(),
    conflitoDePeso: z.enum(['menor', 'maior']),
    expiracaoDias: z.number().int().positive(),
    limiteVotosDia: z.number().int().positive(),
    convergenciaTolerancia: z.number().nonnegative(),
    convergenciaUsa: z.enum(['bayes', 'media']),
    variacaoMensal: z.literal('posicao_anterior_menos_atual'),
    quarentena: z.strictObject({
      votos5Estrelas: z.number().int().positive(),
      janelaHoras: z.number().positive(),
      contaMenorQueDias: z.number().int().positive(),
    }),
  }),
});

type CriterioSemaforo = z.infer<typeof criterioSemaforo>;

/** Problemas de coerência de um critério do semáforo (lista vazia = ok). */
export function problemasCriterio(c: CriterioSemaforo): string[] {
  const { direcao, atende, parcial } = c;
  if (direcao === 'faixa') {
    if (!Array.isArray(atende) || !Array.isArray(parcial)) {
      return [`${c.codigo}: direção 'faixa' exige atende/parcial como [min, max]`];
    }
    const out: string[] = [];
    if (atende[0] > atende[1] || parcial[0] > parcial[1]) out.push(`${c.codigo}: faixa invertida`);
    if (parcial[0] > atende[0] || parcial[1] < atende[1]) {
      out.push(`${c.codigo}: faixa 'atende' deve estar contida em 'parcial'`);
    }
    return out;
  }
  if (Array.isArray(atende) || Array.isArray(parcial)) {
    return [`${c.codigo}: direção '${direcao}' exige atende/parcial numéricos`];
  }
  if (direcao === 'maior_melhor' && atende < parcial) {
    return [`${c.codigo}: maior_melhor exige atende ≥ parcial`];
  }
  if (direcao === 'menor_melhor' && atende > parcial) {
    return [`${c.codigo}: menor_melhor exige atende ≤ parcial`];
  }
  return [];
}

export const scoringParamsSchema = baseSchema.superRefine((p, ctx) => {
  const soma = Object.values(p.indice.pesos).reduce((a, b) => a + b, 0);
  if (Math.abs(soma - 1) > 1e-9) {
    ctx.addIssue({
      code: 'custom',
      path: ['indice', 'pesos'],
      message: `soma dos pesos deve ser 1 (é ${soma})`,
    });
  }
  const { verde, azul, laranja } = p.indice.faixasCor;
  if (!(verde > azul && azul > laranja)) {
    ctx.addIssue({
      code: 'custom',
      path: ['indice', 'faixasCor'],
      message: 'faixas de cor devem ser verde > azul > laranja',
    });
  }
  const semaforos: Array<[string[], CriterioSemaforo[]]> = [
    [['acao', 'semaforo'], p.acao.semaforo],
    [['fii', 'tijolo', 'semaforo'], p.fii.tijolo.semaforo],
    [['fii', 'papel', 'semaforo'], p.fii.papel.semaforo],
  ];
  for (const [path, lista] of semaforos) {
    lista.forEach((c, i) => {
      for (const message of problemasCriterio(c)) {
        ctx.addIssue({ code: 'custom', path: [...path, i], message });
      }
    });
  }
  const grupos: Array<[string[], Record<string, { piso: number; teto: number }>]> = [
    [['acao', 'componentes'], p.acao.componentes],
    [['fii', 'tijolo', 'componentes'], p.fii.tijolo.componentes],
    [['fii', 'papel', 'componentes'], p.fii.papel.componentes],
  ];
  for (const [path, comps] of grupos) {
    for (const [nome, c] of Object.entries(comps)) {
      if (c.piso === c.teto) {
        ctx.addIssue({ code: 'custom', path: [...path, nome], message: 'piso = teto' });
      }
    }
  }
});

export type ScoringParams = z.infer<typeof baseSchema>;
