/**
 * Contrato COMPARTILHADO do Bloco D (fatia 0): constantes, rotas, validação zod dos cenários e
 * helpers puros usados por mais de uma fatia (rota B + hooks, C + D, A + hook do CSV). Puro e
 * isomórfico (roda no servidor e no cliente). Mudança aqui = PR na fatia 0.
 *
 * - CenarioPutSchema (B: rota PUT e useSalvarCenario): discriminatedUnion('classe') com objetos
 *   strict; limites de LIMITES_CENARIO (yield/g/k/margem vêm de ScoringParams.valuation.limites;
 *   P/L alvo, P/VP alvo, renda e dados do ativo são da spec do Bloco D). Número em string ("6,5")
 *   é recusado: o cliente converte antes (validarPremissa aceita vírgula).
 * - MAX_CENARIOS_POR_USUARIO (B: 409 no 301º), MAX_ATIVOS_COMPARADOR (C e D; decisão 12).
 * - ROTAS_BLOCO_D (C e D): link do Comparador e das APIs.
 * - Decisão 13: nível Essencial/Raio-X na URL (PARAM_NIVEL_FUNDAMENTOS='fund',
 *   VALOR_NIVEL_RAIO_X='raiox') e nome do CSV `raio-x_<TICKER>_<AAAA-MM-DD>.csv`
 *   (nomeArquivoCsvRaioX; o servidor manda no Content-Disposition, o hook usa como fallback).
 * - Decisão 3: LIMIAR_TAXA_ADM_ANO_PCT — soma anual da taxa de adm. do FII acima disso ⇒ o ano
 *   fica "em conferência" (política 'ocultar') no Raio-X (ex.: XPLG11 2020 = 10,8%).
 */
import { z } from 'zod';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import type { CenarioPutBody, LimitesCenario, NivelFundamentos } from '@/types/analiseAtivosBlocoD';

/** Ticker de ação/FII da B3 (mesmo das rotas da Fase 1: 4 caracteres + 1–2 dígitos). */
export const TICKER_RE = /^[A-Z0-9]{4}\d{1,2}$/;

/** Decisão 12: até 4 ativos por comparação (5 não cabe a 1280px nem no celular). */
export const MAX_ATIVOS_COMPARADOR = 4;
/** Tamanho máximo do parâmetro ?t= do Comparador (zod na rota C). */
export const MAX_CARACTERES_PARAM_T = 80;
/** Cenários salvos por usuário; o 301º (criação) ⇒ 409, contado dentro da transação. */
export const MAX_CENARIOS_POR_USUARIO = 300;
/** Versão do JSON gravado em analise_cenarios.versaoSchema. */
export const VERSAO_SCHEMA_CENARIO = 1;

/**
 * Decisão 3: soma anual de taxaAdmPct (% do PL) acima deste limiar ⇒ ano "em conferência"
 * (política 'ocultar'). Taxas de adm. de FII ficam tipicamente entre 0,2% e 1,5% ao ano; 3% deixa
 * folga para taxa de gestão alta e ainda pega meses fora da escala (XPLG11 2020 = 10,8%).
 */
export const LIMIAR_TAXA_ADM_ANO_PCT = 3;
/** Decisão 3: com menos de 12 meses informados no ano, a taxa anual fica ausente ('—'). */
export const MESES_TAXA_ADM_ANO = 12;

const limitesParams = SCORING_PARAMS_V1.valuation.limites;

/** Limites de validação dos cenários (tela + zod). Percentuais em pontos. */
export const LIMITES_CENARIO: LimitesCenario = {
  yieldPct: [limitesParams.yieldPct[0], limitesParams.yieldPct[1]],
  gPct: [limitesParams.gPct[0], limitesParams.gPct[1]],
  kPct: [limitesParams.kPct[0], limitesParams.kPct[1]],
  margemPct: [limitesParams.margemPct[0], limitesParams.margemPct[1]],
  margemPasso: limitesParams.margemPasso,
  plAlvo: [0.1, 200],
  pvpAlvo: [0.1, 5],
  rendaMensal: [1, 1_000_000],
  dadoAbsMax: 1e6,
};

const faixa = (lim: readonly [number, number]) => z.number().min(lim[0]).max(lim[1]);
const dadoAtivo = z.number().min(-LIMITES_CENARIO.dadoAbsMax).max(LIMITES_CENARIO.dadoAbsMax);
const margem = faixa(LIMITES_CENARIO.margemPct).multipleOf(LIMITES_CENARIO.margemPasso);

export const PremissasAcaoSchema = z.strictObject({
  yieldPct: faixa(LIMITES_CENARIO.yieldPct),
  gPct: faixa(LIMITES_CENARIO.gPct),
  kPct: faixa(LIMITES_CENARIO.kPct),
  margemPct: margem,
  plAlvo: faixa(LIMITES_CENARIO.plAlvo).nullable().optional(),
});

export const PremissasFiiSchema = z.strictObject({
  yieldPct: faixa(LIMITES_CENARIO.yieldPct),
  margemPct: margem,
  rendaMensal: faixa(LIMITES_CENARIO.rendaMensal),
  pvpAlvo: faixa(LIMITES_CENARIO.pvpAlvo),
});

export const DadosAcaoSchema = z.strictObject({
  lpa: dadoAtivo.optional(),
  vpa: dadoAtivo.optional(),
  dpa: dadoAtivo.optional(),
});

export const DadosFiiSchema = z.strictObject({
  rend12m: dadoAtivo.optional(),
  vpCota: dadoAtivo.optional(),
});

/** Body do PUT /api/analise-ativos/cenarios/[ticker] (strict: campo extra ⇒ 400). */
export const CenarioPutSchema = z.discriminatedUnion('classe', [
  z.strictObject({
    classe: z.literal('acao'),
    premissas: PremissasAcaoSchema,
    dados: DadosAcaoSchema.optional(),
  }),
  z.strictObject({
    classe: z.literal('fii'),
    premissas: PremissasFiiSchema,
    dados: DadosFiiSchema.optional(),
  }),
]);

// O schema e o tipo público (src/types/analiseAtivosBlocoD.ts) têm de andar juntos.
type CenarioPutInferido = z.infer<typeof CenarioPutSchema>;
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaIgualAoTipo: Igual<CenarioPutInferido, CenarioPutBody> = true;
void _schemaIgualAoTipo;

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

/** Parâmetro de URL do nível do card Fundamentos. */
export const PARAM_NIVEL_FUNDAMENTOS = 'fund';
/** Valor que liga o Raio-X; qualquer outro (ou ausente) = Essencial. */
export const VALOR_NIVEL_RAIO_X = 'raiox';

export const ROTAS_BLOCO_D = {
  /** página do Comparador (fatia C) */
  comparador: '/analise-ativos/comparador',
  /** link do Comparador com os tickers nos slots, na ordem dada (D: bandeja e botão) */
  comparar: (tickers: readonly string[]): string =>
    `/analise-ativos/comparador?t=${tickers.join(',')}`,
  /** página do ativo já no nível Raio-X */
  ativoRaioX: (ticker: string): string =>
    `/analise-ativos/${enc(ticker)}?${PARAM_NIVEL_FUNDAMENTOS}=${VALOR_NIVEL_RAIO_X}`,
  api: {
    raioX: (ticker: string): string => `/api/analise-ativos/ativos/${enc(ticker)}/raio-x`,
    raioXCsv: (ticker: string): string =>
      `/api/analise-ativos/ativos/${enc(ticker)}/raio-x?formato=csv`,
    cenarios: (ticker: string): string => `/api/analise-ativos/cenarios/${enc(ticker)}`,
    comparador: (tickers: readonly string[]): string =>
      `/api/analise-ativos/comparador?t=${tickers.map(enc).join(',')}`,
    /** existente: Meta de renda → objetivo no Planejamento (decisão 8) */
    planejamentoSonhos: '/api/planejamento-sonhos',
  },
} as const;

// ---------------------------------------------------------------------------
// Decisão 13: nível na URL e nome do CSV
// ---------------------------------------------------------------------------

/** Lê o nível do card Fundamentos de ?fund=. Sem o recurso, sempre 'essencial'. */
export function nivelFundamentosDaUrl(
  valor: string | null | undefined,
  raioXLigado: boolean,
): NivelFundamentos {
  return raioXLigado && valor === VALOR_NIVEL_RAIO_X ? 'raioX' : 'essencial';
}

/**
 * Nova query string com o nível aplicado, preservando os outros parâmetros (Essencial REMOVE o
 * parâmetro, para a URL de hoje continuar igual). Devolve sem o '?'.
 */
export function queryComNivelFundamentos(atual: string, nivel: NivelFundamentos): string {
  const qs = new URLSearchParams(atual);
  if (nivel === 'raioX') qs.set(PARAM_NIVEL_FUNDAMENTOS, VALOR_NIVEL_RAIO_X);
  else qs.delete(PARAM_NIVEL_FUNDAMENTOS);
  return qs.toString();
}

/** Nome do CSV do Raio-X (decisão 13): raio-x_WEGE3_2026-10-08.csv. `hoje` em AAAA-MM-DD. */
export function nomeArquivoCsvRaioX(ticker: string, hoje: string): string {
  return `raio-x_${ticker}_${hoje}.csv`;
}

/** Formatos aceitos em ?formato= do Raio-X (outro valor ⇒ 400). */
export const FormatoRaioXSchema = z.enum(['json', 'csv']);
