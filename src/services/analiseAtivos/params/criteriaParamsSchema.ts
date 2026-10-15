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
  IDS_CRITERIO,
  SERIES_CRITERIO,
  SERIES_CRITERIO_LEGADAS,
  serieCanonica,
  type IdCriterio,
  type PerfilComLista,
  type SerieCriterio,
} from '@/types/analiseAtivosCriterios';

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
    tipo: z.enum(['up', 'pos', 'max', 'min', 'months']),
    serie: serieCriterio,
    /**
     * v2.5: série usada na janela INTEIRA quando a principal não tem todos os anos (ex.: 'luc' =
     * net_income_adjusted → net_income), com obs 'lucro_sem_descontado' no resultado.
     */
    serieFallback: serieCriterio.optional(),
    limite: z.number().optional(),
    formato: z.enum(['n', 'n1', 'n2', '%', 'x']),
    unidade: z.enum(['R$ mi', 'R$ bi', 'R$']).optional(),
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

const listaCriterios = z
  .array(criterio)
  .length(6)
  .superRefine((lista, ctx) => {
    const vistos = new Set<string>();
    lista.forEach((c, i) => {
      if (vistos.has(c.id)) {
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `id duplicado: ${c.id}` });
      }
      vistos.add(c.id);
    });
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
      acao: listaCriterios,
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
      fii_tijolo: listaCriterios,
      fii_papel: listaCriterios,
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
    }),
    /** v2.5: regras finas por critério (padrões = v2.4) */
    criterios: z
      .strictObject({
        margem: z.strictObject({
          /** receita ≤ lucro: 'sem_dado' (regra 15, v2.4) | 'valor' (literal da spec, v2) */
          receitaMenorQueLucro: z.enum(['valor', 'sem_dado']),
        }),
      })
      .default({ margem: { receitaMenorQueLucro: 'sem_dado' } }),
    /** v2.5: camada de fontes; ausente = só 'cvm' (fontesEfetivas) */
    fontes: fontesSchema.optional(),
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

/** Fontes de uma série, na ordem da prioridade (porSerie[serie] ?? padrao). */
export function prioridadeDaSerie(fontes: FontesParams, serie: SerieFundamento): IdFonte[] {
  return [...(fontes.prioridade.porSerie[serie] ?? fontes.prioridade.padrao)];
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

/** Lista de critérios de um perfil (a financeira usa a de 'acao' com naoSeAplica). */
export function criteriosDoPerfil(
  params: CriteriaParams,
  perfil: PerfilComLista | 'acao_financeira',
): DefCriterio[] {
  return perfil === 'acao_financeira' ? params.perfis.acao : params.perfis[perfil];
}

/** Ids que não se aplicam ao perfil (só a financeira tem; D4; vazio na v2 = "n de 6"). */
export function idsNaoSeAplica(
  params: CriteriaParams,
  perfil: PerfilComLista | 'acao_financeira',
): IdCriterio[] {
  return perfil === 'acao_financeira' ? [...params.perfis.acao_financeira.naoSeAplica] : [];
}
