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
 */
import { z } from 'zod';
import {
  IDS_CRITERIO,
  SERIES_CRITERIO,
  type IdCriterio,
  type PerfilComLista,
} from '@/types/analiseAtivosCriterios';

const janela = z.union([z.literal(3), z.literal(5), z.literal(10)]);

const criterio = z
  .strictObject({
    id: z.enum(IDS_CRITERIO),
    rotulo: z.string().min(1),
    definicao: z.string().min(1),
    tipo: z.enum(['up', 'pos', 'max', 'min', 'months']),
    serie: z.enum(SERIES_CRITERIO),
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
        naoSeAplica: z.array(z.enum(IDS_CRITERIO)).min(1),
        regraPerfil: z.literal('ehFinanceira_universo'),
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

export type CriteriaParams = z.infer<typeof criteriaParamsSchema>;
export type DefCriterio = CriteriaParams['perfis']['acao'][number];

/** Lista de critérios de um perfil (a financeira usa a de 'acao' com naoSeAplica). */
export function criteriosDoPerfil(
  params: CriteriaParams,
  perfil: PerfilComLista | 'acao_financeira',
): DefCriterio[] {
  return perfil === 'acao_financeira' ? params.perfis.acao : params.perfis[perfil];
}

/** Ids que não se aplicam ao perfil (só a financeira tem; D4). */
export function idsNaoSeAplica(
  params: CriteriaParams,
  perfil: PerfilComLista | 'acao_financeira',
): IdCriterio[] {
  return perfil === 'acao_financeira' ? [...params.perfis.acao_financeira.naoSeAplica] : [];
}
