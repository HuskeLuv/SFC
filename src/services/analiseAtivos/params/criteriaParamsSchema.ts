/**
 * Schema (zod) do CriteriaParams — parâmetros dos Filtros de Fundamentos (v2.4, spec §4.1).
 *
 * Estrito: chave extra = erro (parâmetro digitado errado nunca é ignorado em silêncio). Validado na
 * escrita (seed-criteria-params) e na leitura (obterCriteriaParams). Versões imutáveis: mudar um
 * limite = nova versão em criteria_params, e o job noturno 'criterios' reprocessa criteria_eval.
 * Percentuais em pontos percentuais (10 = 10%); múltiplos em vezes (3 = 3×).
 *
 * Coerências verificadas além dos tipos:
 *  - cada perfil com lista (acao, fii_tijolo, fii_papel) tem EXATAMENTE 6 critérios, ids únicos;
 *  - tipos 'max'/'min' exigem `limite`; os demais não aceitam `limite`;
 *  - `ativo: false` exige `motivoInativo` (D3: vacância, inadimplência e LTV);
 *  - acao_financeira.naoSeAplica ⊂ ids de 'acao', sem repetição (D4: n de 3);
 *  - equivalencias: chave = id de fii_tijolo, valor = id de fii_papel (pares do chip de FII);
 *  - janelaPadrao ∈ janelas.
 *
 * v2.5 (docs/analise-ativos/v25-regras-pedro/desenho.json, fatia 0):
 *  - `serie`/`serieFallback` aceitam o nome LEGADO da v1 e o transformam no nome CANÔNICO da spec
 *    no parse (MAPA_SERIE_LEGADA): o motor só conhece o canônico e a v1 continua válida. Por isso
 *    CriteriaParams (= z.output) tem só nomes canônicos; CriteriaParamsEntrada (= z.input) é o JSON
 *    como foi escrito/gravado;
 *  - acao_financeira.naoSeAplica pode ser VAZIO (v2: "n de 6"), com margemSemReceitaComparavel
 *    ('nao_se_aplica' = regra da v2.4, padrão quando ausente; 'sem_dado' = literal da spec) e
 *    notaEssencial (padrão true = nota da v2.4 no Essencial);
 *  - criterios.margem.receitaMenorQueLucro: 'sem_dado' (regra 15 da v2.4, padrão quando ausente) ou
 *    'valor' (literal da spec: holding com margem > 100% atende);
 *  - criterio.serieFallback (decidido pela JANELA inteira no resolverSeries) e o bloco opcional
 *    `fontes` (prioridade por série, agregação anual, sanidade por camada, séries obrigatórias).
 *    Ausente = só 'cvm' (fontesEfetivas).
 * Os padrões (.default) reproduzem a v2.4: a v1 gravada em produção avalia igual.
 *
 * v3 (Stocks e REITs, docs/analise-ativos/stocks-reits/desenho.json, fatia 0) — tudo OPCIONAL (a v1
 * e a v2 de produção continuam válidas e avaliam igual):
 *  - perfis.stock (6 critérios, mesmos ids das ações), perfis.stock_financeira ({ base: 'stock',
 *    naoSeAplica ⊂ ids de stock, regraPerfil: 'sic_financeira' }; exige perfis.stock) e perfis.reit
 *    (6 critérios; ocup inativa 'sem_fonte_confiavel');
 *  - fontes.prioridade.porMercado (us_stocks/us_reits → ['sec']): vale ANTES de porSerie/padrao
 *    para os ativos daquele mercado; NÃO entra em fontesCitadas (o job BR não muda de caminho);
 *  - universoEua: corte de free float por classe com histerese (decisão do Wellington de 17/10:
 *    stocks ≥ US$ 2 bi, saem abaixo de US$ 1,6 bi; REITs de patrimônio ≥ US$ 2 bi) e a sanidade do
 *    float. Ausente = UNIVERSO_EUA_PADRAO (src/types/analiseAtivosEua.ts).
 *
 * fundamentei-regras (docs/analise-ativos/fundamentei-regras/desenho.json, fatia F0) — tudo
 * OPCIONAL e SEM .default (o parse da v1–v4 sai byte a byte igual ao de antes; os padrões ficam nas
 * funções de leitura abaixo, que o motor da F1 usa):
 *  - tipo 'cagr' (crescimento anual composto > 0; sem limite, como o 'up');
 *  - meses.mesReferencia: 'pagamento' (padrão, mesReferenciaDe) | 'data_com' (v5);
 *  - cagr.baseNaoPositiva: 'fim_positivo' (v5) | 'sem_dado' (padrão, baseNaoPositivaCagrDe);
 *  - criterios.margem.porPerfil.acao_financeira: override da margem da financeira ('valor' |
 *    'sem_dado' | 'nao_se_aplica'); ausente = a regra global receitaMenorQueLucro
 *    (regraMargemDoPerfil);
 *  - tamanho da lista por perfil (TAMANHO_LISTA_PERFIL): reit 5–6 (a v5 tira 'ocup'), demais 6.
 */
import { z } from 'zod';
import {
  MERCADOS_FONTE,
  RE_ID_FONTE,
  SERIES_FUNDAMENTO,
  type AgregacaoAnual,
  type CamadaFonte,
  type IdFonte,
  type MercadoFonte,
  type SerieFundamento,
} from '@/types/analiseAtivosFontes';
import {
  BASE_NAO_POSITIVA_CAGR_PADRAO,
  BASES_NAO_POSITIVAS_CAGR,
  IDS_CRITERIO,
  MES_REFERENCIA_PADRAO,
  MESES_REFERENCIA,
  SERIES_CRITERIO,
  SERIES_CRITERIO_LEGADAS,
  TIPOS_CRITERIO,
  UNIDADES_CRITERIO,
  serieCanonica,
  type BaseNaoPositivaCagr,
  type IdCriterio,
  type MesReferencia,
  type PerfilComLista,
  type PerfilCriterio,
  type SerieCriterio,
} from '@/types/analiseAtivosCriterios';
import { UNIVERSO_EUA_PADRAO, type UniversoEuaParams } from '@/types/analiseAtivosEua';

const janela = z.union([z.literal(3), z.literal(5), z.literal(10)]);

/** Nome de série aceito no JSON (canônico ou legado da v1) → nome canônico (alias no parse). */
const serieCriterio = z
  .enum([...SERIES_CRITERIO, ...SERIES_CRITERIO_LEGADAS])
  .transform((nome): SerieCriterio => serieCanonica(nome) as SerieCriterio);

const idFonte = z.string().regex(RE_ID_FONTE, 'id de fonte inválido');
const listaFontes = z.array(idFonte).min(1);

/**
 * Bloco `fontes` (v2.5). A ORDEM da lista é a prioridade (a primeira fonte com ponto vigente
 * vence). Mudar a prioridade = nova versão de params (o job reprocessa).
 */
const fontesSchema = z.strictObject({
  prioridade: z.strictObject({
    padrao: listaFontes,
    porSerie: z.partialRecord(z.enum(SERIES_FUNDAMENTO), listaFontes),
    /** v3: prioridade por mercado (us_stocks/us_reits → ['sec']); vence porSerie/padrao */
    porMercado: z.partialRecord(z.enum(MERCADOS_FONTE), listaFontes).optional(),
  }),
  /** séries mensais/trimestrais → valor do ano (decisão 4: 'ultimo'); ausente = 'ultimo' */
  agregacaoAnual: z.partialRecord(z.enum(SERIES_FUNDAMENTO), z.enum(['ultimo', 'media'])),
  /** sanidade da §6 (sanidadeFonte, fatia A) nas camadas de aplicaA ('cvm' = literal da spec) */
  sanidade: z.strictObject({
    variacaoRevisaoPct: z.number().positive(),
    divergenciaMaxPct: z.number().positive(),
    confiancaMin: z.number().min(0).max(1),
    aplicaA: z.array(z.enum(['provedor', 'cvm'])).min(1),
  }),
  /** série obrigatória ausente num ponto do provedor → incompleto=true, valor null (§6) */
  obrigatorias: z.partialRecord(z.enum(MERCADOS_FONTE), z.array(z.enum(SERIES_FUNDAMENTO))),
});

const criterio = z
  .strictObject({
    id: z.enum(IDS_CRITERIO),
    rotulo: z.string().min(1),
    definicao: z.string().min(1),
    tipo: z.enum(TIPOS_CRITERIO),
    serie: serieCriterio,
    /**
     * v2.5: série usada na janela INTEIRA quando a principal não tem todos os anos (ex.: 'luc' =
     * net_income_adjusted → net_income), com obs 'lucro_sem_descontado' no resultado.
     */
    serieFallback: serieCriterio.optional(),
    limite: z.number().optional(),
    formato: z.enum(['n', 'n1', 'n2', '%', 'x']),
    unidade: z.enum(UNIDADES_CRITERIO).optional(),
    /** false = critério sempre 'sem_dado' com motivoInativo (D3); ausente = true */
    ativo: z.boolean().optional(),
    motivoInativo: z.literal('sem_fonte_confiavel').optional(),
  })
  .superRefine((c, ctx) => {
    const precisaLimite = c.tipo === 'max' || c.tipo === 'min';
    if (precisaLimite && c.limite === undefined) {
      ctx.addIssue({ code: 'custom', path: ['limite'], message: `tipo '${c.tipo}' exige limite` });
    }
    if (!precisaLimite && c.limite !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['limite'], message: `tipo '${c.tipo}' sem limite` });
    }
    if (c.serieFallback !== undefined && c.serieFallback === c.serie) {
      ctx.addIssue({
        code: 'custom',
        path: ['serieFallback'],
        message: 'serieFallback igual à serie',
      });
    }
    if (c.ativo === false && !c.motivoInativo) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivoInativo'],
        message: 'critério inativo exige motivoInativo',
      });
    }
  });

/**
 * Tamanho da lista de critérios por perfil com lista (fundamentei-regras F0): o REIT aceita 5 ou 6
 * (a v5 tira a ocupação, que não tem fonte: "n de 5"); os demais, exatamente 6 (v1–v4 iguais).
 */
export const TAMANHO_LISTA_PERFIL: Record<PerfilComLista, { min: number; max: number }> = {
  acao: { min: 6, max: 6 },
  fii_tijolo: { min: 6, max: 6 },
  fii_papel: { min: 6, max: 6 },
  stock: { min: 6, max: 6 },
  reit: { min: 5, max: 6 },
};

function listaCriterios(perfil: PerfilComLista) {
  const { min, max } = TAMANHO_LISTA_PERFIL[perfil];
  return z
    .array(criterio)
    .min(min)
    .max(max)
    .superRefine((lista, ctx) => {
      const vistos = new Set<string>();
      lista.forEach((c, i) => {
        if (vistos.has(c.id)) {
          ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `id duplicado: ${c.id}` });
        }
        vistos.add(c.id);
      });
    });
}

/** Corte de free float de uma classe EUA: entra ≥ entrada; sai < saida (histerese). */
const corteFloat = z
  .strictObject({
    floatEntradaUsd: z.number().positive(),
    floatSaidaUsd: z.number().positive(),
  })
  .refine((c) => c.floatSaidaUsd <= c.floatEntradaUsd, {
    message: 'floatSaidaUsd deve ser ≤ floatEntradaUsd (histerese)',
    path: ['floatSaidaUsd'],
  });

/** v3: universo EUA (sec-cadastro, fatia A). Ausente = UNIVERSO_EUA_PADRAO. */
const universoEuaSchema = z.strictObject({
  stock: corteFloat,
  reit: corteFloat,
  sanidadeFloat: z
    .strictObject({
      maxUsd: z.number().positive(),
      precoImplicitoMinUsd: z.number().positive(),
      precoImplicitoMaxUsd: z.number().positive(),
    })
    .refine((s) => s.precoImplicitoMinUsd < s.precoImplicitoMaxUsd, {
      message: 'precoImplicitoMinUsd deve ser < precoImplicitoMaxUsd',
      path: ['precoImplicitoMinUsd'],
    }),
});

export const criteriaParamsSchema = z
  .strictObject({
    versao: z.number().int().positive(),
    descricao: z.string(),
    janelas: z.array(janela).min(1),
    janelaPadrao: janela,
    /** anoFim = ano − 1 a partir deste mês (1–12); antes, ano − 2 (ancoraJanela, fatia A) */
    ancoraAno: z.strictObject({ mesLiberaAnoAnterior: z.number().int().min(1).max(12) }),
    perfis: z.strictObject({
      acao: listaCriterios('acao'),
      acao_financeira: z.strictObject({
        base: z.literal('acao'),
        /** v2.5: pode ser vazio ("n de 6"); religar = nova versão com os ids */
        naoSeAplica: z.array(z.enum(IDS_CRITERIO)),
        regraPerfil: z.literal('ehFinanceira_universo'),
        /**
         * Margem de financeira sem nenhum ano com margem e com lucro (holding/banco no
         * individual): 'nao_se_aplica' (v2.4) ou 'sem_dado' (literal da spec, v2).
         */
        margemSemReceitaComparavel: z.enum(['sem_dado', 'nao_se_aplica']).default('nao_se_aplica'),
        /** nota 'não se aplicam a bancos…' no Essencial da financeira (v2.4 = true; v2 = false) */
        notaEssencial: z.boolean().default(true),
      }),
      fii_tijolo: listaCriterios('fii_tijolo'),
      fii_papel: listaCriterios('fii_papel'),
      /** v3 (EUA): mesmos ids das ações (rec/luc/ebitda/mg/dl/fcl) */
      stock: listaCriterios('stock').optional(),
      /** v3 (EUA): financeira por SIC 6000–6799 exceto 6798 (+ override por CIK); n de 6 com [] */
      stock_financeira: z
        .strictObject({
          base: z.literal('stock'),
          naoSeAplica: z.array(z.enum(IDS_CRITERIO)),
          regraPerfil: z.literal('sic_financeira'),
        })
        .optional(),
      /** v3 (EUA): rec, dpa, fco_acao, dl (6×), pay (90), ocup (inativa); v5: sem ocup (5) */
      reit: listaCriterios('reit').optional(),
    }),
    /** par do chip de FII: id de tijolo → id de papel */
    equivalencias: z.partialRecord(z.enum(IDS_CRITERIO), z.enum(IDS_CRITERIO)),
    regraHibrido: z.strictObject({
      limiarImoveisPlPct: z.number().min(0).max(100),
      aplicaA: z.array(z.enum(['hibrido', 'indefinido', 'fof', 'sem_tipo'])).min(1),
    }),
    dlEbitda: z.strictObject({
      caixaLiquido: z.literal('atende'),
      exibirNegativoComoZero: z.boolean(),
      ebitdaNaoPositivo: z.literal('nao_atende_se_dl_positiva'),
    }),
    meses: z.strictObject({
      ancora: z.literal('fim_anoFim'),
      mesesBaseCurta: z.enum(['sem_dado', 'nao_atende']),
      /** F0 fundamentei-regras: mês que conta no 'mes' (ausente = 'pagamento'; v5 = 'data_com') */
      mesReferencia: z.enum(MESES_REFERENCIA).optional(),
    }),
    /** F0 fundamentei-regras: regra do 'cagr' com início ≤ 0 (ausente = 'sem_dado') */
    cagr: z.strictObject({ baseNaoPositiva: z.enum(BASES_NAO_POSITIVAS_CAGR) }).optional(),
    /** v2.5: regras finas por critério (padrões = v2.4) */
    criterios: z
      .strictObject({
        margem: z.strictObject({
          /** receita ≤ lucro: 'sem_dado' (regra 15, v2.4) | 'valor' (literal da spec, v2) */
          receitaMenorQueLucro: z.enum(['valor', 'sem_dado']),
          /**
           * F0 fundamentei-regras: override por perfil (v5: acao_financeira 'nao_se_aplica').
           * Ausente = a regra global acima (regraMargemDoPerfil).
           */
          porPerfil: z
            .strictObject({
              acao_financeira: z.enum(['valor', 'sem_dado', 'nao_se_aplica']).optional(),
            })
            .optional(),
        }),
      })
      .default({ margem: { receitaMenorQueLucro: 'sem_dado' } }),
    /** v2.5: camada de fontes; ausente = só 'cvm' (fontesEfetivas) */
    fontes: fontesSchema.optional(),
    /** v3: universo EUA; ausente = UNIVERSO_EUA_PADRAO (universoEuaDe) */
    universoEua: universoEuaSchema.optional(),
  })
  .superRefine((p, ctx) => {
    if (!p.janelas.includes(p.janelaPadrao)) {
      ctx.addIssue({ code: 'custom', path: ['janelaPadrao'], message: 'fora de janelas' });
    }
    const idsAcao = new Set(p.perfis.acao.map((c) => c.id));
    const nsa = p.perfis.acao_financeira.naoSeAplica;
    nsa.forEach((id, i) => {
      if (!idsAcao.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['perfis', 'acao_financeira', 'naoSeAplica', i],
          message: `id fora de perfis.acao: ${id}`,
        });
      }
    });
    if (new Set(nsa).size !== nsa.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['perfis', 'acao_financeira', 'naoSeAplica'],
        message: 'ids repetidos',
      });
    }
    const sf = p.perfis.stock_financeira;
    if (sf) {
      if (!p.perfis.stock) {
        ctx.addIssue({
          code: 'custom',
          path: ['perfis', 'stock_financeira'],
          message: 'stock_financeira exige perfis.stock',
        });
      }
      const idsStock = new Set((p.perfis.stock ?? []).map((c) => c.id));
      sf.naoSeAplica.forEach((id, i) => {
        if (!idsStock.has(id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['perfis', 'stock_financeira', 'naoSeAplica', i],
            message: `id fora de perfis.stock: ${id}`,
          });
        }
      });
      if (new Set(sf.naoSeAplica).size !== sf.naoSeAplica.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['perfis', 'stock_financeira', 'naoSeAplica'],
          message: 'ids repetidos',
        });
      }
    }
    const idsTijolo = new Set(p.perfis.fii_tijolo.map((c) => c.id));
    const idsPapel = new Set(p.perfis.fii_papel.map((c) => c.id));
    for (const [de, para] of Object.entries(p.equivalencias)) {
      if (!idsTijolo.has(de as IdCriterio) || !idsPapel.has(para as IdCriterio)) {
        ctx.addIssue({
          code: 'custom',
          path: ['equivalencias', de],
          message: `equivalência deve ligar um id de fii_tijolo a um de fii_papel (${de}→${para})`,
        });
      }
    }
  });

/** Params JÁ VALIDADOS (nomes de série canônicos e padrões aplicados) — o que o motor recebe. */
export type CriteriaParams = z.output<typeof criteriaParamsSchema>;
/** JSON como é escrito/gravado (aceita os nomes legados da v1 e omite os campos com padrão). */
export type CriteriaParamsEntrada = z.input<typeof criteriaParamsSchema>;
export type DefCriterio = CriteriaParams['perfis']['acao'][number];
export type FontesParams = z.output<typeof fontesSchema>;

/** Sanidade padrão da §6 (40% de variação, 5% de divergência, confiança 0,8; só provedor). */
export const SANIDADE_PADRAO: FontesParams['sanidade'] = {
  variacaoRevisaoPct: 40,
  divergenciaMaxPct: 5,
  confiancaMin: 0.8,
  aplicaA: ['provedor'],
};

/** Bloco `fontes` efetivo: o do params ou, ausente, só 'cvm' com a sanidade padrão. */
export function fontesEfetivas(params: Pick<CriteriaParams, 'fontes'>): FontesParams {
  return (
    params.fontes ?? {
      prioridade: { padrao: ['cvm'], porSerie: {} },
      agregacaoAnual: {},
      sanidade: SANIDADE_PADRAO,
      obrigatorias: {},
    }
  );
}

/**
 * Fontes de uma série, na ordem da prioridade: v3 porMercado[mercado] (EUA) → porSerie[serie] →
 * padrao. Sem `mercado` (chamadas da v2.5, BR) = porSerie[serie] ?? padrao.
 */
export function prioridadeDaSerie(
  fontes: FontesParams,
  serie: SerieFundamento,
  mercado?: MercadoFonte,
): IdFonte[] {
  const doMercado = mercado ? fontes.prioridade.porMercado?.[mercado] : undefined;
  return [...(doMercado ?? fontes.prioridade.porSerie[serie] ?? fontes.prioridade.padrao)];
}

/** Agregação anual de uma série mensal/trimestral (ausente = 'ultimo', decisão 4). */
export function agregacaoDaSerie(fontes: FontesParams, serie: SerieFundamento): AgregacaoAnual {
  return fontes.agregacaoAnual[serie] ?? 'ultimo';
}

/** A sanidade da §6 vale para a camada? */
export function sanidadeAplicaA(fontes: FontesParams, camada: CamadaFonte): boolean {
  return fontes.sanidade.aplicaA.includes(camada);
}

/** Séries obrigatórias de um mercado (ausente = nenhuma). */
export function seriesObrigatorias(fontes: FontesParams, mercado: MercadoFonte): SerieFundamento[] {
  return [...(fontes.obrigatorias[mercado] ?? [])];
}

/** Todas as fontes citadas no bloco (padrão + porSerie), sem repetição. */
export function fontesCitadas(fontes: FontesParams): IdFonte[] {
  const todas = [...fontes.prioridade.padrao, ...Object.values(fontes.prioridade.porSerie).flat()];
  return [...new Set(todas)];
}

/**
 * Perfil com lista nesta versão de params? Os BR sempre; os EUA só quando a versão os traz (v3+).
 * O job EUA (fatia B) recusa rodar com uma versão sem os perfis EUA.
 */
export function perfilDisponivel(params: CriteriaParams, perfil: PerfilCriterio): boolean {
  switch (perfil) {
    case 'stock':
      return params.perfis.stock !== undefined;
    case 'stock_financeira':
      return params.perfis.stock !== undefined && params.perfis.stock_financeira !== undefined;
    case 'reit':
      return params.perfis.reit !== undefined;
    default:
      return true;
  }
}

/**
 * Lista de critérios de um perfil (a financeira usa a lista-base com naoSeAplica). Perfil EUA
 * ausente na versão (v1/v2) = lista VAZIA (nunca lança: a leitura de uma linha EUA com params
 * antigos só fica sem rótulos; quem avalia confere perfilDisponivel antes).
 */
export function criteriosDoPerfil(params: CriteriaParams, perfil: PerfilCriterio): DefCriterio[] {
  switch (perfil) {
    case 'acao':
    case 'acao_financeira':
      return params.perfis.acao;
    case 'fii_tijolo':
      return params.perfis.fii_tijolo;
    case 'fii_papel':
      return params.perfis.fii_papel;
    case 'stock':
    case 'stock_financeira':
      return params.perfis.stock ?? [];
    case 'reit':
      return params.perfis.reit ?? [];
  }
}

/** Ids que não se aplicam ao perfil (só as financeiras têm; D4; vazio na v2/v3 = "n de 6"). */
export function idsNaoSeAplica(params: CriteriaParams, perfil: PerfilCriterio): IdCriterio[] {
  if (perfil === 'acao_financeira') return [...params.perfis.acao_financeira.naoSeAplica];
  if (perfil === 'stock_financeira')
    return [...(params.perfis.stock_financeira?.naoSeAplica ?? [])];
  return [];
}

/** Mês que conta no critério 'mes' (F0 fundamentei-regras): ausente = 'pagamento' (v1–v4). */
export function mesReferenciaDe(params: Pick<CriteriaParams, 'meses'>): MesReferencia {
  return params.meses.mesReferencia ?? MES_REFERENCIA_PADRAO;
}

/** Regra do 'cagr' com o primeiro ano ≤ 0 (F0 fundamentei-regras): ausente = 'sem_dado'. */
export function baseNaoPositivaCagrDe(params: Pick<CriteriaParams, 'cagr'>): BaseNaoPositivaCagr {
  return params.cagr?.baseNaoPositiva ?? BASE_NAO_POSITIVA_CAGR_PADRAO;
}

/** Regra da margem com receita ≤ lucro, por perfil (override → regra global). */
export type RegraMargemPerfil = 'valor' | 'sem_dado' | 'nao_se_aplica';

/**
 * Regra da margem do perfil (F0 fundamentei-regras): o override de criterios.margem.porPerfil
 * (só acao_financeira) ou, ausente, a regra global receitaMenorQueLucro (v1–v4 iguais).
 */
export function regraMargemDoPerfil(
  params: Pick<CriteriaParams, 'criterios'>,
  perfil: PerfilCriterio,
): RegraMargemPerfil {
  const margem = params.criterios.margem;
  const override = perfil === 'acao_financeira' ? margem.porPerfil?.acao_financeira : undefined;
  return override ?? margem.receitaMenorQueLucro;
}

/** Universo EUA efetivo: o do params (v3+) ou o padrão do código (UNIVERSO_EUA_PADRAO). */
export function universoEuaDe(params: Pick<CriteriaParams, 'universoEua'>): UniversoEuaParams {
  return params.universoEua ?? UNIVERSO_EUA_PADRAO;
}
