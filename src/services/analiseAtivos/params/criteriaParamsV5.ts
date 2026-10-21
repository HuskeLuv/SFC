/**
 * CriteriaParams v5 — v4 + as regras dos critérios alinhadas à ideia do Fundamentei (só a regra; nunca
 * valores de terceiros). Desenho: docs/analise-ativos/fundamentei-regras/desenho.json (versao_criterios,
 * fatia F1) e decisões do Wellington de 20/10/2026 (decisoes.md: todas = recomendações).
 *
 * Diferenças para a v4 (o resto é o MESMO objeto; teste criteriaParamsV5.test):
 *  - acao: rec, luc e fcl de 'up' para 'cagr' (crescimento anual composto > 0 na janela); 'luc' com a
 *    série net_income SEM serieFallback (um lucro líquido só, A4.e: sai o "descontado" e a obs
 *    lucro_sem_descontado); o id 'ebitda' FICA (?c=ebitda e filtros salvos continuam), com a série
 *    'ebit', tipo 'cagr' e o rótulo do lucro operacional (EBIT) — "ebitda" é só o nome interno; mg e
 *    dl iguais. n de 6;
 *  - acao_financeira: naoSeAplica ebitda/dl/fcl, notaEssencial true, margemSemReceitaComparavel e
 *    criterios.margem.porPerfil.acao_financeira 'nao_se_aplica' — banco/seguradora "n de 3" (rec,
 *    luc, mg); holding e banco cujo individual tem receita ≤ lucro "n de 2";
 *  - fii_tijolo: o 'alav' sobre o ativo da v4 (LIMITE_ALAV_ATIVO_V5_PCT = 15, decisão 1); fii_tijolo e
 *    fii_papel com o 'mes' pelo mês da data-com (meses.mesReferencia 'data_com'). n de 6;
 *  - stock: as mesmas mudanças das ações ('ebitda' = a série 'ebit' da SEC pelo degrau). n de 6;
 *  - stock_financeira: naoSeAplica ebitda/dl/fcl (o job EUA para de forçar 'sem dado'). n de 3;
 *  - reit: rec vira 'cagr'; fco_acao (mesmo id) sobre o caixa operacional AJUSTADO pela remuneração em
 *    ações e pay (mesmo id) = dividendos ÷ caixa operacional ajustado ≤ 90, ambos com serieFallback
 *    na série sem ajuste (obs 'sbc_indisponivel' quando algum ano da janela não tem a SBC); dpa segue
 *    'up'; 'ocup' sai (sem fonte). n de 5;
 *  - cagr.baseNaoPositiva 'fim_positivo' (decisão 2: com o primeiro ano ≤ 0, atende se o último for
 *    positivo, com o fato "taxa anual não se calcula com base negativa ou zero").
 * Rótulos em PORTUGUÊS (textosCriterios.criteriosV5); os rótulos em inglês dos critérios EUA ficam em
 * textosEuaEn.ts e são escolhidos na LEITURA (chave ANALISE_ATIVOS_EUA_ROTULOS_EN_HABILITADO).
 *
 * Ativação (desenho ativacao_prod): seed-criteria-params --versao=5 insere com validFrom 2099-01-01
 * FIXO (inerte); 'criterios --sem-aplicar --versao-params=5' e 'criterios-eua --sem-aplicar
 * --versao-params=5' geram o antes × depois; só então o validFrom é adiantado. CRITERIA_PARAMS_CODIGO
 * passa para a v5 em PR à parte, depois do OK. A v4 nunca é ativada (histórico imutável).
 * Valores imutáveis: recalibrar = nova versão.
 */
import {
  criteriaParamsSchema,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V4_JSON } from '@/services/analiseAtivos/params/criteriaParamsV4';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { LIMITE_ALAV_ATIVO_V5_PCT } from '@/types/analiseAtivosCriterios';

const T = TEXTOS_CRITERIOS.criteriosV5;
const V4 = CRITERIA_PARAMS_V4_JSON;

/** Definição de um critério 'cagr' com a regra do cálculo (tooltip). */
const comRegra = (definicao: string) => `${definicao}; ${T.regraCagr}`;

/** Os 4 critérios das ações que mudam (mesmos ids). */
function criteriosCrescimento(
  unidade: 'R$ mi' | 'US$ mi',
  textos: {
    rec: { rotulo: string; definicao: string };
    luc: { rotulo: string; definicao: string };
    ebitda: { rotulo: string; definicao: string };
    fcl: { rotulo: string; definicao: string };
  },
) {
  return {
    rec: {
      id: 'rec',
      rotulo: textos.rec.rotulo,
      definicao: comRegra(textos.rec.definicao),
      tipo: 'cagr',
      serie: 'revenue',
      formato: 'n',
      unidade,
    },
    luc: {
      id: 'luc',
      rotulo: textos.luc.rotulo,
      definicao: comRegra(textos.luc.definicao),
      tipo: 'cagr',
      serie: 'net_income',
      formato: 'n',
      unidade,
    },
    ebitda: {
      id: 'ebitda',
      rotulo: textos.ebitda.rotulo,
      definicao: comRegra(textos.ebitda.definicao),
      tipo: 'cagr',
      serie: 'ebit',
      formato: 'n',
      unidade,
    },
    fcl: {
      id: 'fcl',
      rotulo: textos.fcl.rotulo,
      definicao: comRegra(textos.fcl.definicao),
      tipo: 'cagr',
      serie: 'free_cash_flow',
      formato: 'n',
      unidade,
    },
  } as const;
}

const ACAO_V5 = criteriosCrescimento('R$ mi', T);
const STOCK_V5 = criteriosCrescimento('US$ mi', {
  rec: T.recEua,
  luc: T.lucEua,
  ebitda: T.ebitdaEua,
  fcl: T.fclEua,
});

/** Troca os critérios de mesmo id, mantendo a ordem da lista. */
function trocar<C extends { id: string }, N extends { id: string }>(
  lista: readonly C[],
  novos: Readonly<Record<string, N>>,
): Array<C | N> {
  return lista.map((c) => novos[c.id] ?? c);
}

/** 'alav' do fii_tijolo: o da v4, com o limite da constante da v5 (decisão 1). */
const fiiTijoloV5 = V4.perfis.fii_tijolo.map((c) =>
  c.id === 'alav' ? { ...c, limite: LIMITE_ALAV_ATIVO_V5_PCT } : c,
);

const reitV4 = V4.perfis.reit;

export const CRITERIA_PARAMS_V5_JSON = {
  ...V4,
  versao: 5,
  descricao:
    'v5 = v4 + crescimento anual composto (receita, lucro líquido, EBIT, FCL), FII pelo mês da ' +
    'data-com, financeiras "não se aplica", REIT com caixa operacional ajustado pela remuneração em ' +
    'ações e sem ocupação; decisões do Wellington de 20/10/2026 ' +
    '(docs/analise-ativos/fundamentei-regras/desenho.json)',
  perfis: {
    ...V4.perfis,
    acao: trocar(V4.perfis.acao, ACAO_V5),
    acao_financeira: {
      ...V4.perfis.acao_financeira,
      naoSeAplica: ['ebitda', 'dl', 'fcl'],
      margemSemReceitaComparavel: 'nao_se_aplica',
      notaEssencial: true,
    },
    fii_tijolo: fiiTijoloV5,
    stock: trocar(V4.perfis.stock, STOCK_V5),
    stock_financeira: {
      ...V4.perfis.stock_financeira,
      naoSeAplica: ['ebitda', 'dl', 'fcl'],
    },
    reit: trocar(
      reitV4.filter((c) => c.id !== 'ocup'),
      {
        rec: {
          id: 'rec',
          rotulo: T.recReit.rotulo,
          definicao: comRegra(T.recReit.definicao),
          tipo: 'cagr',
          serie: 'revenue',
          formato: 'n',
          unidade: 'US$ mi',
        },
        fco_acao: {
          id: 'fco_acao',
          rotulo: T.fcoAcaoReit.rotulo,
          definicao: T.fcoAcaoReit.definicao,
          tipo: 'up',
          serie: 'ocf_adjusted_per_share',
          serieFallback: 'ocf_per_share',
          formato: 'n2',
          unidade: 'US$',
        },
        pay: {
          id: 'pay',
          rotulo: T.payReit.rotulo,
          definicao: T.payReit.definicao,
          tipo: 'max',
          serie: 'cash_payout_adjusted_pct',
          serieFallback: 'cash_payout_pct',
          limite: 90,
          formato: '%',
        },
      } as const,
    ),
  },
  meses: { ...V4.meses, mesReferencia: 'data_com' },
  cagr: { baseNaoPositiva: 'fim_positivo' },
  criterios: {
    margem: { ...V4.criterios.margem, porPerfil: { acao_financeira: 'nao_se_aplica' } },
  },
} satisfies CriteriaParamsEntrada;

/** v5 validada (o que o motor e as telas usam quando ela for a vigente no banco). */
export const CRITERIA_PARAMS_V5: CriteriaParams =
  criteriaParamsSchema.parse(CRITERIA_PARAMS_V5_JSON);
