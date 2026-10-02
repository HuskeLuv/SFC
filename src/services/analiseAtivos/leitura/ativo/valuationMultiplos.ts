/**
 * Valuation · Múltiplos da página do ativo (fatia C). Só o banco (Fase 0 + linhas do Quadro).
 *
 * Cada cartão: valor de 12 meses (Estado), leitura (definição de textosTela), referência = mediana
 * dos pares do segmento (mínimo 3, medianaReferencia; senão 'sem referência de pares' — NUNCA
 * índice de mercado, que não tem fonte) e barra de posição nos anos fiscais FECHADOS (até 10;
 * barraPosicao + textoStatusBarra da Fase 0). Barra oculta com menos de 5 pontos ou quando o
 * valor de proventos está em conferência. O resumo do grupo conta só as barras visíveis.
 * Crescimento = CAGR 5a pelo utilitário único (series.cagrJanela), sem barra; anos com provento
 * em conferência ficam fora. Bancos: o grupo Alavancagem traz a explicação no lugar dos cartões.
 *
 * Também monta os 2 mini-gráficos de múltiplos históricos (ações P/L e P/VP; FIIs P/VP e DY) e os
 * pares (paresAtivo). `montarValuation` é pura; `obterValuation` lê o banco com cache em memória
 * por ticker:versão do Quadro (TTL 30 min).
 */
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { fundamentosVigentes } from '@/services/analiseAtivos/repositorio/acoes';
import { paraData } from '@/services/analiseAtivos/repositorio/conversao';
import { medianaReferencia } from '@/services/analiseAtivos/regras/calculo/pares';
import { lucroParaSequencia } from '@/services/analiseAtivos/regras/calculo/sequencias';
import { deNumero } from '@/services/analiseAtivos/regras/comum/valor';
import { barraPosicao } from '@/services/analiseAtivos/regras/valuation/barraPosicao';
import {
  obterLinhaQuadro,
  obterLinhasQuadroApi,
  versaoQuadro,
} from '@/services/analiseAtivos/leitura/linhasQuadro';
import {
  anosFechados,
  cagrJanela,
  detectarSaltoProvento,
  type MotivoCagr,
} from '@/services/analiseAtivos/leitura/ativo/series';
import {
  TTL_ANALISE_MS,
  anoInicioLeitura,
  anosProventoSuspeito,
  ausenteCom,
  estadoDe,
  fatorCotasApos,
  hojeSaoPaulo,
  naoSeAplicaCom,
  ok,
  semDado,
  type ResultadoLeitura,
} from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import {
  montarParesAtivo,
  type ParesAtivo,
} from '@/services/analiseAtivos/leitura/ativo/paresAtivo';
import { textoStatusBarra } from '@/services/analiseAtivos/textos';
import { TEXTOS_TELA, formatarTexto, textoNaoSeAplica } from '@/services/analiseAtivos/textosTela';
import type { ScoringParams } from '@/services/analiseAtivos/tipos';
import type {
  BarraValuation,
  Estado,
  FormatoAnalise,
  GrupoValuation,
  HistoricoMultiplo,
  ItemValuation,
  LinhaQuadroApi,
  ValuationResposta,
} from '@/types/analiseAtivosApi';

const TV = TEXTOS_TELA.analise.valuation;
export const ANOS_BARRA = 10;
export const ANOS_CAGR = 5;
export const MIN_PARES_REFERENCIA = 3;

// ---------------------------------------------------------------------------
// Entradas (linhas do banco já convertidas para number)
// ---------------------------------------------------------------------------

export interface AtualValuation {
  lpaTtm: number | null;
  vpa: number | null;
  dpa12m: number | null;
  rend12m: number | null;
  vpCota: number | null;
  pl: number | null;
  pvp: number | null;
  pReceita: number | null;
  evEbitda: number | null;
  pFco: number | null;
  pFcl: number | null;
  dy12mPct: number | null;
  payoutPct: number | null;
  margemLiquidaPct: number | null;
  roePct: number | null;
  roaPct: number | null;
  roicPct: number | null;
  divLiqEbitda: number | null;
  divLiqPl: number | null;
  liquidezCorrente: number | null;
  obrigacoesPlPct: number | null;
  naoSeAplica: string[];
}

export interface AnualValuation {
  anoFiscal: number;
  pl: number | null;
  pvp: number | null;
  pReceita: number | null;
  evEbitda: number | null;
  pFco: number | null;
  pFcl: number | null;
  dyPct: number | null;
  payoutPct: number | null;
  margemLiquidaPct: number | null;
  roePct: number | null;
  roaPct: number | null;
  roicPct: number | null;
  divLiqEbitda: number | null;
  divLiqPl: number | null;
  liquidezCorrente: number | null;
  vpCota: number | null;
  rendCota12m: number | null;
  obrigacoesPlPct: number | null;
  vacanciaFisicaCvmPct: number | null;
}

export interface PerShareValuation {
  anoFiscal: number;
  lpaAjHoje: number | null;
  vpaAjHoje: number | null;
  dpaAjHoje: number | null;
  payoutDmplPct: number | null;
  rendCota: number | null;
  vpCotaFim: number | null;
}

export interface FyValuation {
  anoFiscal: number;
  receita: number | null;
  lucro: number | null;
}

export interface MensalValuation {
  refMonth: string;
  cotistas: number | null;
  taxaAdmPct: number | null;
  fatorDesdobramento: number | null;
}

/** Dados de UM ativo (o alvo ou um par). */
export interface DadosAtivoValuation {
  linha: LinhaQuadroApi;
  /** régua do score ('acao_financeira' ⇒ bancos/seguradoras) */
  regua: string | null;
  atual: AtualValuation | null;
  anuais: AnualValuation[];
  perShare: PerShareValuation[];
  /** ações: receita e lucro (R$) por ano fiscal */
  fys: FyValuation[];
  /** FIIs: informe mensal (cotistas, taxa de adm., desdobramentos) */
  mensal: MensalValuation[];
}

export interface EntradaValuation {
  hoje: string;
  alvo: DadosAtivoValuation;
  /** pares (sem o alvo), na ordem de exibição */
  pares: DadosAtivoValuation[];
  criterioPares: string;
  params?: ScoringParams;
}

// ---------------------------------------------------------------------------
// Contexto por ativo
// ---------------------------------------------------------------------------

type CampoAtual = Exclude<keyof AtualValuation, 'naoSeAplica'>;
type CampoAnual = Exclude<keyof AnualValuation, 'anoFiscal'>;

interface Ctx {
  d: DadosAtivoValuation;
  hoje: string;
  financeira: boolean;
  /** proventos de 12 meses em conferência (linha do Quadro) */
  conf: boolean;
  /** anos com provento > 2× o anterior (fora da barra e do CAGR) */
  suspeitos: Set<number>;
  anuais: AnualValuation[];
  perShare: PerShareValuation[];
  fatorCota: (ano: number) => number;
}

function ultimosFechados<T extends { ano: number }>(pontos: T[], hoje: string, n: number): T[] {
  return anosFechados(pontos, hoje).slice(-n);
}

function criarCtx(d: DadosAtivoValuation, hoje: string): Ctx {
  const anuais = ultimosFechados(
    d.anuais.map((a) => ({ ...a, ano: a.anoFiscal })),
    hoje,
    ANOS_BARRA,
  );
  const perShare = ultimosFechados(
    d.perShare.map((p) => ({ ...p, ano: p.anoFiscal })),
    hoje,
    ANOS_BARRA + 2,
  );
  const desdobramentos = d.mensal
    .filter((m) => typeof m.fatorDesdobramento === 'number' && m.fatorDesdobramento > 0)
    .map((m) => ({ refMonth: m.refMonth, fator: m.fatorDesdobramento as number }));
  const fatorCota = (ano: number) => fatorCotasApos(`${ano}-12-31`, desdobramentos);
  const suspeitos =
    d.linha.classe === 'fii'
      ? new Set(
          detectarSaltoProvento(
            perShare.map((p) => ({ ano: p.anoFiscal, valor: div(p.rendCota, fatorCota(p.ano)) })),
          ).anosSuspeitos,
        )
      : anosProventoSuspeito(
          perShare.map((p) => ({
            anoFiscal: p.anoFiscal,
            dpa: p.dpaAjHoje,
            payout: p.payoutDmplPct,
          })),
          hoje,
        );
  return {
    d,
    hoje,
    financeira: d.regua === 'acao_financeira',
    conf: d.linha.proventosEmConferencia,
    suspeitos,
    anuais,
    perShare,
    fatorCota,
  };
}

function div(n: number | null | undefined, f: number): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n / f : null;
}

const CAMPOS_PROVENTO: ReadonlySet<CampoAtual> = new Set<CampoAtual>([
  'dpa12m',
  'dy12mPct',
  'payoutPct',
  'rend12m',
]);
const CAMPOS_LUCRO: ReadonlySet<CampoAtual> = new Set<CampoAtual>(['pl', 'payoutPct']);

/** Valor de 12 meses de um campo de asset_multiples_current, com o motivo quando falta. */
function estadoAtual(ctx: Ctx, campo: CampoAtual): Estado<number> {
  const a = ctx.d.atual;
  if (CAMPOS_LUCRO.has(campo) && a?.lpaTtm != null && a.lpaTtm < 0 && a[campo] == null) {
    return ausenteCom(
      'prejuizo',
      campo === 'pl'
        ? TEXTOS_TELA.ausentesPorCampo.plPrejuizo
        : TEXTOS_TELA.motivosPorSufixo.prejuizo,
    );
  }
  if (a?.naoSeAplica.includes(campo) || (ctx.financeira && CAMPOS_FINANCEIRA.has(campo))) {
    return naoSeAplicaCom(ctx.financeira ? 'financeira' : 'base_nao_positiva');
  }
  const v = a?.[campo];
  if (typeof v === 'number' && Number.isFinite(v)) return ok(v);
  if (CAMPOS_PROVENTO.has(campo) && ctx.conf) {
    return semDado(TEXTOS_TELA.ausentesPorCampo.dyEmConferencia);
  }
  return semDado();
}

/** Campos que não se aplicam a bancos/seguradoras/holdings financeiras (régua acao_financeira). */
const CAMPOS_FINANCEIRA: ReadonlySet<CampoAtual> = new Set<CampoAtual>([
  'pReceita',
  'evEbitda',
  'margemLiquidaPct',
  'roicPct',
  'divLiqEbitda',
  'divLiqPl',
  'liquidezCorrente',
]);

type Ponto = { ano: number; valor: number | null };

function historicoAnual(ctx: Ctx, campo: CampoAnual, porCota = false): Ponto[] {
  return ctx.anuais.map((a) => ({
    ano: a.anoFiscal,
    valor: porCota ? div(a[campo], ctx.fatorCota(a.anoFiscal)) : finito(a[campo]),
  }));
}

function historicoPerShare(
  ctx: Ctx,
  campo: 'lpaAjHoje' | 'vpaAjHoje' | 'dpaAjHoje' | 'rendCota' | 'vpCotaFim',
  n: number = ANOS_BARRA,
): Ponto[] {
  const porCota = campo === 'rendCota' || campo === 'vpCotaFim';
  return ctx.perShare.slice(-n).map((p) => ({
    ano: p.anoFiscal,
    valor: porCota ? div(p[campo], ctx.fatorCota(p.anoFiscal)) : finito(p[campo]),
  }));
}

function finito(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Definição dos cartões
// ---------------------------------------------------------------------------

type CodigoItem = keyof typeof TV.itens;
type CodigoLeitura = keyof typeof TEXTOS_TELA.leituras;

interface DefItem {
  codigo: CodigoItem;
  formato: FormatoAnalise;
  leitura: CodigoLeitura;
  atual: (ctx: Ctx) => Estado<number>;
  /** histórico anual (anos fechados); sem ele, não há barra */
  historico?: (ctx: Ctx) => Ponto[];
  tipoBarra?: 'multiplo' | 'percentual';
  excluirNaoPositivos?: boolean;
  /** cartão de proventos: barra oculta com valor em conferência; anos suspeitos fora da barra */
  proventos?: boolean;
}

function campo(
  codigo: CodigoItem,
  formato: FormatoAnalise,
  leitura: CodigoLeitura,
  atualCampo: CampoAtual,
  anualCampo: CampoAnual | null,
  extra: Partial<DefItem> = {},
): DefItem {
  const percentual = formato === 'pct';
  return {
    codigo,
    formato,
    leitura,
    atual: (ctx) => estadoAtual(ctx, atualCampo),
    historico: anualCampo ? (ctx) => historicoAnual(ctx, anualCampo) : undefined,
    tipoBarra: percentual ? 'percentual' : 'multiplo',
    ...extra,
  };
}

function estadoCagr(pct: number | null, motivo: MotivoCagr | null): Estado<number> {
  if (pct !== null) return ok(pct);
  if (motivo === 'extremo_em_conferencia') {
    return ausenteCom(motivo, TEXTOS_TELA.ativo.cagrForaConferencia);
  }
  if (motivo === 'base_nao_positiva') {
    return ausenteCom(motivo, textoNaoSeAplica('base_nao_positiva'));
  }
  return ausenteCom('historico_curto', TEXTOS_TELA.motivosPorSufixo.historico_curto);
}

/** CAGR 5a de uma série de anos fechados (utilitário único da 0a). */
function cagrDe(pontos: Ponto[], hoje: string, suspeitos?: Set<number>): Estado<number> {
  const serie = anosFechados(pontos, hoje).map((p) =>
    suspeitos?.has(p.ano) ? { ...p, suspeito: true } : p,
  );
  const r = cagrJanela(serie, ANOS_CAGR);
  return estadoCagr(r.pct, r.motivo);
}

function cagrItem(
  codigo: CodigoItem,
  serie: (ctx: Ctx) => Ponto[] | null,
  usaSuspeitos = false,
): DefItem {
  return {
    codigo,
    formato: 'pctSinal',
    leitura: 'cagr',
    atual: (ctx) => {
      const s = serie(ctx);
      if (s === null) return naoSeAplicaCom('financeira');
      return cagrDe(s, ctx.hoje, usaSuspeitos ? ctx.suspeitos : undefined);
    },
  };
}

function dyMedio5a(ctx: Ctx): Estado<number> {
  const xs = ctx.anuais
    .slice(-ANOS_CAGR)
    .filter((a) => !ctx.suspeitos.has(a.anoFiscal))
    .map((a) => a.dyPct)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (xs.length < 3) {
    return ausenteCom('historico_curto', TEXTOS_TELA.motivosPorSufixo.historico_curto);
  }
  return ok(xs.reduce((a, b) => a + b, 0) / xs.length);
}

function cotistasDezembro(ctx: Ctx): Ponto[] {
  return ctx.d.mensal
    .filter((m) => m.refMonth.slice(5, 7) === '12')
    .map((m) => ({ ano: Number(m.refMonth.slice(0, 4)), valor: m.cotistas }));
}

function ultimaTaxaAdm(ctx: Ctx): Estado<number> {
  const m = [...ctx.d.mensal]
    .sort((a, b) => a.refMonth.localeCompare(b.refMonth))
    .reverse()
    .find((x) => typeof x.taxaAdmPct === 'number' && Number.isFinite(x.taxaAdmPct));
  return estadoDe(m?.taxaAdmPct);
}

interface DefGrupo {
  codigo: keyof typeof TV.grupos;
  itens: DefItem[];
  /** grupo sem barra (Crescimento): resumo próprio */
  semBarra?: boolean;
  explicacao?: (ctx: Ctx) => string | null;
}

const MULT = { excluirNaoPositivos: true } as const;

const GRUPOS_ACAO: DefGrupo[] = [
  {
    codigo: 'preco',
    itens: [
      campo('pl', 'numero', 'pl', 'pl', 'pl', MULT),
      campo('pvp', 'numero2', 'pvp', 'pvp', 'pvp', MULT),
      campo('pReceita', 'numero2', 'pReceita', 'pReceita', 'pReceita', MULT),
      campo('evEbitda', 'numero', 'evEbitda', 'evEbitda', 'evEbitda', MULT),
      campo('pFco', 'numero', 'pFco', 'pFco', 'pFco', MULT),
      campo('pFcl', 'numero', 'pFcl', 'pFcl', 'pFcl', MULT),
      campo('lpa', 'moeda', 'lpa', 'lpaTtm', null, {
        historico: (ctx) => historicoPerShare(ctx, 'lpaAjHoje'),
      }),
      campo('vpa', 'moeda', 'vpa', 'vpa', null, {
        historico: (ctx) => historicoPerShare(ctx, 'vpaAjHoje'),
      }),
    ],
  },
  {
    codigo: 'proventos',
    itens: [
      campo('dpa12m', 'moeda', 'dpa12m', 'dpa12m', null, {
        historico: (ctx) => historicoPerShare(ctx, 'dpaAjHoje'),
        proventos: true,
      }),
      campo('dy12m', 'pct', 'dy12m', 'dy12mPct', 'dyPct', { proventos: true }),
      { codigo: 'dyMedio5a', formato: 'pct', leitura: 'dyMedio5a', atual: dyMedio5a },
      campo('payout', 'pct', 'payout', 'payoutPct', 'payoutPct', { proventos: true }),
    ],
  },
  {
    codigo: 'lucratividade',
    itens: [
      campo('margemLiquida', 'pct', 'margemLiquida', 'margemLiquidaPct', 'margemLiquidaPct'),
      campo('roe', 'pct', 'roe', 'roePct', 'roePct'),
      campo('roa', 'pct', 'roa', 'roaPct', 'roaPct'),
      campo('roic', 'pct', 'roic', 'roicPct', 'roicPct'),
    ],
  },
  {
    codigo: 'crescimento',
    semBarra: true,
    itens: [
      cagrItem('cagrReceita', (ctx) =>
        ctx.financeira ? null : ctx.d.fys.map((f) => ({ ano: f.anoFiscal, valor: f.receita })),
      ),
      cagrItem('cagrLucro', (ctx) => ctx.d.fys.map((f) => ({ ano: f.anoFiscal, valor: f.lucro }))),
      cagrItem('cagrLpa', (ctx) => historicoPerShare(ctx, 'lpaAjHoje', ANOS_BARRA + 2)),
      cagrItem('cagrDividendo', (ctx) => historicoPerShare(ctx, 'dpaAjHoje', ANOS_BARRA + 2), true),
    ],
  },
  {
    codigo: 'alavancagem',
    itens: [
      campo('divLiqEbitda', 'numero2', 'divLiqEbitda', 'divLiqEbitda', 'divLiqEbitda'),
      campo('divLiqPl', 'numero2', 'divLiqPl', 'divLiqPl', 'divLiqPl'),
      campo(
        'liquidezCorrente',
        'numero2',
        'liquidezCorrente',
        'liquidezCorrente',
        'liquidezCorrente',
      ),
    ],
    explicacao: (ctx) => (ctx.financeira ? TV.explicacaoFinanceira : null),
  },
];

const GRUPOS_FII: DefGrupo[] = [
  {
    codigo: 'preco',
    itens: [
      campo('pvp', 'numero2', 'pvp', 'pvp', 'pvp', MULT),
      campo('vpCota', 'moeda', 'vpCota', 'vpCota', null, {
        historico: (ctx) => historicoAnual(ctx, 'vpCota', true),
      }),
    ],
  },
  {
    codigo: 'proventos',
    itens: [
      campo('rendCota12m', 'moeda', 'rendCota12m', 'rend12m', null, {
        historico: (ctx) => historicoAnual(ctx, 'rendCota12m', true),
        proventos: true,
      }),
      campo('dy12m', 'pct', 'dy12m', 'dy12mPct', 'dyPct', { proventos: true }),
      { codigo: 'dyMedio5a', formato: 'pct', leitura: 'dyMedio5a', atual: dyMedio5a },
    ],
  },
  {
    codigo: 'qualidadeRenda',
    itens: [
      {
        codigo: 'vacanciaCvm',
        formato: 'pct',
        leitura: 'vacanciaCvm',
        atual: (ctx) => ctx.d.linha.vacanciaCvm,
        historico: (ctx) => historicoAnual(ctx, 'vacanciaFisicaCvmPct'),
        tipoBarra: 'percentual',
      },
    ],
    explicacao: (ctx) => (ctx.d.linha.fiiTipo === 'papel' ? TV.explicacaoPapel : null),
  },
  {
    codigo: 'crescimento',
    semBarra: true,
    itens: [
      cagrItem('cagrRendimento', (ctx) => historicoPerShare(ctx, 'rendCota', ANOS_BARRA + 2), true),
      cagrItem('cagrVpCota', (ctx) => historicoPerShare(ctx, 'vpCotaFim', ANOS_BARRA + 2)),
      cagrItem('cagrCotistas', cotistasDezembro),
    ],
  },
  {
    codigo: 'alavancagem',
    itens: [
      campo('obrigacoesPl', 'pct', 'obrigacoesPl', 'obrigacoesPlPct', 'obrigacoesPlPct'),
      { codigo: 'taxaAdm', formato: 'pct', leitura: 'taxaAdm', atual: ultimaTaxaAdm },
      {
        codigo: 'liquidez21',
        formato: 'moedaCompacta',
        leitura: 'liquidez21',
        atual: (ctx) => estadoDe(ctx.d.linha.liquidezMedia21),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

/** 4 casas bastam para a tela (formatos de 0 a 2 casas) e cortam o JSON pela metade. */
export function enxugar(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function enxugarOuNull(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? enxugar(n) : null;
}

function enxugarEstado(e: Estado<number>): Estado<number> {
  return e.estado === 'ok' ? { estado: 'ok', valor: enxugar(e.valor) } : e;
}

function enxugarPontos(pontos: Ponto[]): Ponto[] {
  return pontos.map((p) => ({ ano: p.ano, valor: enxugarOuNull(p.valor) }));
}

function barraOculta(nPontos: number, statusTexto: string): BarraValuation {
  return { visivel: false, min: null, media: null, max: null, nPontos, statusTexto, extremo: null };
}

export function montarBarra(
  atual: Estado<number>,
  historico: Ponto[] | null,
  def: Pick<DefItem, 'tipoBarra' | 'excluirNaoPositivos' | 'proventos'>,
  ctx: Pick<Ctx, 'conf' | 'suspeitos'>,
  params: ScoringParams = SCORING_PARAMS_V1,
): BarraValuation {
  if (!historico || !def.tipoBarra) return barraOculta(0, '');
  const pontos = historico
    .filter((p) => !(def.proventos && ctx.suspeitos.has(p.ano)))
    .map((p) => p.valor)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (def.proventos && ctx.conf) return barraOculta(pontos.length, TV.barraConferencia);
  if (atual.estado !== 'ok') return barraOculta(pontos.length, '');
  const b = barraPosicao(atual.valor, pontos, def.tipoBarra, params, {
    excluirNaoPositivos: def.excluirNaoPositivos,
  });
  if (!b.visivel) {
    return barraOculta(
      b.nPontos,
      b.nPontos === 0 ? TV.semHistorico : TEXTOS_TELA.ativo.barraOculta,
    );
  }
  if (!b.status) return barraOculta(b.nPontos, TV.barraForaComparacao);
  return {
    visivel: true,
    min: enxugarOuNull(b.min),
    media: enxugarOuNull(b.media),
    max: enxugarOuNull(b.max),
    nPontos: b.nPontos,
    statusTexto: textoStatusBarra(b.status, b.nPontos),
    extremo: b.status.extremo ?? null,
  };
}

function referencia(def: DefItem, pares: Ctx[]): ItemValuation['referencia'] {
  const valores = pares.map((p) => def.atual(p));
  const okCount = valores.filter((v) => v.estado === 'ok').length;
  const med = medianaReferencia(
    valores.map((v) => (v.estado === 'ok' ? deNumero(v.valor) : deNumero(null))),
    MIN_PARES_REFERENCIA,
  );
  if (med.estado !== 'ok') return { valor: null, rotulo: TEXTOS_TELA.ativo.semReferenciaPares };
  return {
    valor: enxugar(med.valor),
    rotulo: formatarTexto(TEXTOS_TELA.ativo.referenciaPares, { pares: okCount }),
  };
}

function montarItem(def: DefItem, alvo: Ctx, pares: Ctx[], params: ScoringParams): ItemValuation {
  const atual = def.atual(alvo);
  const historico = def.historico ? def.historico(alvo) : null;
  return {
    codigo: def.codigo,
    rotulo: TV.itens[def.codigo],
    atual: enxugarEstado(atual),
    formato: def.formato,
    leitura: TEXTOS_TELA.leituras[def.leitura].definicao,
    referencia: referencia(def, pares),
    barra: montarBarra(atual, historico, def, alvo, params),
    historico: def.tipoBarra && historico ? enxugarPontos(historico) : [],
  };
}

function resumoGrupo(g: DefGrupo, itens: ItemValuation[]): string {
  const rotulo = TV.grupos[g.codigo].toLowerCase();
  if (g.semBarra) return TV.resumoCrescimento;
  const comBarra = itens.filter((i) => i.barra.visivel && i.atual.estado === 'ok');
  if (comBarra.length === 0) {
    const emConferencia = itens.some((i) => i.barra.statusTexto === TV.barraConferencia);
    return formatarTexto(emConferencia ? TV.resumoConferencia : TV.resumoSemBarra, {
      valor: rotulo,
    });
  }
  const abaixo = comBarra.filter(
    (i) => i.atual.estado === 'ok' && i.barra.media !== null && i.atual.valor < i.barra.media,
  ).length;
  return formatarTexto(TV.resumoAbaixo, { n: abaixo, total: comBarra.length, valor: rotulo });
}

function mediaPontos(pontos: Ponto[], soPositivos: boolean): number | null {
  const xs = pontos
    .map((p) => p.valor)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .filter((v) => !soPositivos || v > 0);
  return xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function montarHistoricos(alvo: Ctx): HistoricoMultiplo[] {
  const defs: Array<{ codigo: CodigoItem; campo: CampoAnual; formato: FormatoAnalise }> =
    alvo.d.linha.classe === 'fii'
      ? [
          { codigo: 'pvp', campo: 'pvp', formato: 'numero2' },
          { codigo: 'dy12m', campo: 'dyPct', formato: 'pct' },
        ]
      : [
          { codigo: 'pl', campo: 'pl', formato: 'numero' },
          { codigo: 'pvp', campo: 'pvp', formato: 'numero2' },
        ];
  return defs.map((d) => {
    const pontos = historicoAnual(alvo, d.campo);
    return {
      codigo: d.codigo,
      rotulo: TV.itens[d.codigo],
      formato: d.formato,
      media: enxugarOuNull(mediaPontos(pontos, d.campo !== 'dyPct')),
      pontos: enxugarPontos(pontos),
    };
  });
}

/**
 * Linha do Quadro para a tabela de pares: números com 4 casas e sem a série de 10 anos (a tabela
 * não a usa; o Quadro e o topo trazem a série completa). Mantém o contrato LinhaQuadroApi.
 */
export function linhaParEnxuta(l: LinhaQuadroApi): LinhaQuadroApi {
  return {
    ...l,
    variacaoDiaPct: enxugarOuNull(l.variacaoDiaPct),
    roe: enxugarEstado(l.roe),
    pl: enxugarEstado(l.pl),
    pvp: enxugarEstado(l.pvp),
    dy12m: enxugarEstado(l.dy12m),
    margemLiquida: enxugarEstado(l.margemLiquida),
    divLiqEbitda: enxugarEstado(l.divLiqEbitda),
    payout: enxugarEstado(l.payout),
    vacanciaCvm: enxugarEstado(l.vacanciaCvm),
    obrigacoesPl: enxugarEstado(l.obrigacoesPl),
    serie10a: [],
    serieUlt12m: enxugarOuNull(l.serieUlt12m),
  };
}

export function montarValuation(e: EntradaValuation): ValuationResposta {
  const params = e.params ?? SCORING_PARAMS_V1;
  const alvo = criarCtx(e.alvo, e.hoje);
  const pares = e.pares.map((p) => criarCtx(p, e.hoje));
  const defs = e.alvo.linha.classe === 'fii' ? GRUPOS_FII : GRUPOS_ACAO;

  const grupos: GrupoValuation[] = [];
  for (const g of defs) {
    const explicacao = g.explicacao?.(alvo) ?? null;
    const itens = explicacao
      ? []
      : g.itens
          .map((def) => montarItem(def, alvo, pares, params))
          .filter((i) => !(i.atual.estado === 'nao_se_aplica' && i.atual.motivo === 'financeira'));
    if (itens.length === 0 && !explicacao) continue;
    grupos.push({
      codigo: g.codigo,
      rotulo: TV.grupos[g.codigo],
      resumo: explicacao ? '' : resumoGrupo(g, itens),
      explicacao,
      itens,
    });
  }

  const linhasPares: ParesAtivo['itens'] = [e.alvo.linha, ...e.pares.map((p) => p.linha)].map(
    linhaParEnxuta,
  );
  return {
    grupos,
    historicos: montarHistoricos(alvo),
    pares: { criterio: e.criterioPares, itens: linhasPares },
    nota: TV.notaReferencia,
  };
}

// ---------------------------------------------------------------------------
// Leitura do banco
// ---------------------------------------------------------------------------

const cache = getTtlCache<ValuationResposta>('analiseAtivosValuation');

/** Só para testes. */
export function _limparCacheValuation(ticker: string, versao: string): void {
  cache.del(`${ticker}:${versao}`);
}

const SELECT_ATUAL = {
  symbol: true,
  lpaTtm: true,
  vpa: true,
  dpa12m: true,
  rend12m: true,
  vpCota: true,
  pl: true,
  pvp: true,
  pReceita: true,
  evEbitda: true,
  pFco: true,
  pFcl: true,
  dy12mPct: true,
  payoutPct: true,
  margemLiquidaPct: true,
  roePct: true,
  roaPct: true,
  roicPct: true,
  divLiqEbitda: true,
  divLiqPl: true,
  liquidezCorrente: true,
  obrigacoesPlPct: true,
  naoSeAplica: true,
} as const;

const SELECT_ANUAL = {
  symbol: true,
  anoFiscal: true,
  pl: true,
  pvp: true,
  pReceita: true,
  evEbitda: true,
  pFco: true,
  pFcl: true,
  dyPct: true,
  payoutPct: true,
  margemLiquidaPct: true,
  roePct: true,
  roaPct: true,
  roicPct: true,
  divLiqEbitda: true,
  divLiqPl: true,
  liquidezCorrente: true,
  vpCota: true,
  rendCota12m: true,
  obrigacoesPlPct: true,
  vacanciaFisicaCvmPct: true,
} as const;

const SELECT_PER_SHARE = {
  symbol: true,
  anoFiscal: true,
  lpaAjHoje: true,
  vpaAjHoje: true,
  dpaAjHoje: true,
  payoutDmplPct: true,
  rendCota: true,
  vpCotaFim: true,
} as const;

function agrupar<T extends { symbol: string }>(linhas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const l of linhas) m.set(l.symbol, [...(m.get(l.symbol) ?? []), l]);
  return m;
}

/** null = ticker fora da área (a rota responde 404). */
export async function obterValuation(
  ticker: string,
  hoje: string = hojeSaoPaulo(),
): Promise<ResultadoLeitura<ValuationResposta> | null> {
  const symbol = ticker.toUpperCase();
  const linhaDb = await obterLinhaQuadro(symbol);
  if (!linhaDb) return null;
  const versao = await versaoQuadro();
  const chave = `${symbol}:${versao}`;
  const emCache = cache.get(chave);
  if (emCache) return { dados: emCache, cache: true };

  const linhasApi = await obterLinhasQuadroApi(undefined, { incluirForaDoQuadro: true });
  const alvoApi = linhasApi.find((l) => l.ticker === symbol);
  if (!alvoApi) return null;
  const pares = montarParesAtivo(alvoApi, linhasApi);
  const symbols = pares.itens.map((l) => l.ticker);
  const linhasDb = await Promise.all(symbols.map((s) => obterLinhaQuadro(s)));
  const cnpjPorSymbol = new Map<string, string>();
  const reguaPorSymbol = new Map<string, string | null>();
  linhasDb.forEach((l, i) => {
    if (!l) return;
    cnpjPorSymbol.set(symbols[i], l.cnpj);
    reguaPorSymbol.set(symbols[i], l.regua);
  });
  const cnpjs = [...new Set(cnpjPorSymbol.values())];
  const desdeAno = anoInicioLeitura(hoje);
  const desde = `${desdeAno}-01-01`;
  const fii = alvoApi.classe === 'fii';

  const [atuais, anuais, perShare, fys, mensal] = await Promise.all([
    prisma.assetMultiplesCurrent.findMany({
      where: { symbol: { in: symbols } },
      select: SELECT_ATUAL,
    }),
    prisma.assetMultiplesYearly.findMany({
      where: { symbol: { in: symbols }, anoFiscal: { gte: desdeAno } },
      select: SELECT_ANUAL,
    }),
    prisma.assetPerShareYearly.findMany({
      where: { symbol: { in: symbols }, anoFiscal: { gte: desdeAno } },
      select: SELECT_PER_SHARE,
    }),
    fii ? Promise.resolve([]) : fundamentosVigentes(prisma, cnpjs, { tipos: ['FY'], desde }),
    fii
      ? prisma.fiiMonthly.findMany({
          where: { cnpj: { in: cnpjs }, refMonth: { gte: new Date(`${desde}T00:00:00Z`) } },
          select: {
            cnpj: true,
            refMonth: true,
            cotistas: true,
            taxaAdmPct: true,
            fatorDesdobramento: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const atualPorSymbol = new Map(atuais.map((a) => [a.symbol, a]));
  const anuaisPorSymbol = agrupar(anuais);
  const psPorSymbol = agrupar(perShare);
  const fysPorCnpj = new Map<string, FyValuation[]>();
  for (const f of fys) {
    const lucro = lucroParaSequencia(f);
    fysPorCnpj.set(f.emissorId, [
      ...(fysPorCnpj.get(f.emissorId) ?? []),
      {
        anoFiscal: f.anoFiscal,
        receita: f.receita,
        lucro: lucro.estado === 'ok' ? lucro.valor : null,
      },
    ]);
  }
  const mensalPorCnpj = new Map<string, MensalValuation[]>();
  for (const m of mensal) {
    mensalPorCnpj.set(m.cnpj, [
      ...(mensalPorCnpj.get(m.cnpj) ?? []),
      {
        refMonth: paraData(m.refMonth),
        cotistas: m.cotistas,
        taxaAdmPct: m.taxaAdmPct,
        fatorDesdobramento: m.fatorDesdobramento,
      },
    ]);
  }

  const dadosDe = (linha: LinhaQuadroApi): DadosAtivoValuation => {
    const cnpj = cnpjPorSymbol.get(linha.ticker) ?? '';
    return {
      linha,
      regua: reguaPorSymbol.get(linha.ticker) ?? null,
      atual: atualPorSymbol.get(linha.ticker) ?? null,
      anuais: anuaisPorSymbol.get(linha.ticker) ?? [],
      perShare: psPorSymbol.get(linha.ticker) ?? [],
      fys: fysPorCnpj.get(cnpj) ?? [],
      mensal: mensalPorCnpj.get(cnpj) ?? [],
    };
  };

  const dados = montarValuation({
    hoje,
    alvo: dadosDe(alvoApi),
    pares: pares.itens.slice(1).map(dadosDe),
    criterioPares: pares.criterio,
  });
  cache.set(chave, dados, TTL_ANALISE_MS);
  return { dados, cache: false };
}
