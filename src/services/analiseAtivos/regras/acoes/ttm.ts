/**
 * TTM (últimos 12 meses) por dois caminhos (regra 14):
 *   YTD:   FY anterior + YTD atual − YTD do mesmo período do ano anterior
 *   Σ4tri: soma dos 4 últimos trimestres (Q4 = FY − 9M; Q1 = YTD do 1º trimestre)
 * Divergência > ttmDivergenciaMaxPct ⇒ usa o YTD e sinaliza reapresentação (BBAS3, AMER3, HAPV3…).
 * Base no FY (último documento é o DFP) ⇒ TTM = FY ('fy').
 *
 * A fatia A GRAVA o resultado como linha tipoPeriodo='TTM' em AssetFundamentalsPeriod (dtFim do
 * último ITR/DFP, versão do documento base, flags ttm_metodo_* e reapresentacao) — é a única fonte de
 * TTM da fatia D, que nunca importa este arquivo.
 */
import {
  fimDoMesAnterior,
  periodoFiscal,
} from '@/services/analiseAtivos/regras/acoes/periodoFiscal';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

export type MetodoTtm = 'ytd' | 'soma4' | 'fy';

export interface EntradaTtm {
  fyAnterior: number | null;
  ytdAtual: number | null;
  ytdMesmoPeriodoAnoAnterior: number | null;
  ultimos4Trimestres: Array<number | null>;
  trimestreAtual: 1 | 2 | 3 | 4;
}

export interface ResultadoTtm {
  valor: Valor;
  metodo: MetodoTtm;
  divergenciaPct: number | null;
  reapresentacao: boolean;
}

const num = (x: number | null | undefined): x is number =>
  typeof x === 'number' && Number.isFinite(x);

export function calcularTtm(e: EntradaTtm, p: ScoringParams): ResultadoTtm {
  if (e.trimestreAtual === 4) {
    return {
      valor: num(e.fyAnterior) ? ok(e.fyAnterior) : ausente('sem_dado_fonte'),
      metodo: 'fy',
      divergenciaPct: null,
      reapresentacao: false,
    };
  }
  const viaYtd =
    num(e.fyAnterior) && num(e.ytdAtual) && num(e.ytdMesmoPeriodoAnoAnterior)
      ? e.fyAnterior + e.ytdAtual - e.ytdMesmoPeriodoAnoAnterior
      : null;
  const viaSoma =
    e.ultimos4Trimestres.length === 4 && e.ultimos4Trimestres.every(num)
      ? (e.ultimos4Trimestres as number[]).reduce((s, x) => s + x, 0)
      : null;

  if (viaYtd !== null) {
    let divergenciaPct: number | null = null;
    if (viaSoma !== null) {
      const base = Math.abs(viaYtd);
      divergenciaPct =
        base > 0 ? (Math.abs(viaSoma - viaYtd) / base) * 100 : viaSoma === viaYtd ? 0 : Infinity;
    }
    return {
      valor: ok(viaYtd),
      metodo: 'ytd',
      divergenciaPct,
      reapresentacao:
        divergenciaPct !== null && divergenciaPct > p.sanidade.acoes.ttmDivergenciaMaxPct,
    };
  }
  if (viaSoma !== null) {
    return { valor: ok(viaSoma), metodo: 'soma4', divergenciaPct: null, reapresentacao: false };
  }
  return {
    valor: ausente('sem_dado_fonte'),
    metodo: 'ytd',
    divergenciaPct: null,
    reapresentacao: false,
  };
}

// ---------------------------------------------------------------- montagem a partir dos períodos

/** Um período já gravado (FY, YTD ou 3M) de um emissor e escopo, com os campos de fluxo. */
export interface PeriodoFluxo {
  tipoPeriodo: 'FY' | 'YTD' | '3M';
  dtFim: string;
  valores: Partial<Record<CampoFluxo, number | null>>;
}

/** Campos de fluxo (DRE/DFC) somados no TTM; os de balanço vêm do documento base. */
export const CAMPOS_FLUXO = [
  'receita',
  'lucroBruto',
  'ebit',
  'depreciacaoAmortizacao',
  'lucroLiquido',
  'lucroAtribuivel',
  'fco',
  'fci',
  'fcf',
  'capex',
  'dividendosJcpPagos',
] as const;
export type CampoFluxo = (typeof CAMPOS_FLUXO)[number];

export interface ResultadoTtmPeriodo {
  valores: Record<CampoFluxo, number | null>;
  metodos: Partial<Record<CampoFluxo, MetodoTtm>>;
  divergencias: Partial<Record<CampoFluxo, number>>;
  flags: string[];
}

/**
 * TTM de todos os campos de fluxo na data `base` (fim do último ITR/DFP) a partir dos períodos
 * gravados do emissor (um escopo). `mesFimExercicio` define os trimestres fiscais (regra 19).
 */
export function calcularTtmPeriodo(
  periodos: PeriodoFluxo[],
  base: { tipoPeriodo: 'FY' | 'YTD'; dtFim: string },
  mesFimExercicio: number | null,
  p: ScoringParams,
): ResultadoTtmPeriodo {
  const achar = (tipo: PeriodoFluxo['tipoPeriodo'], dtFim: string) =>
    periodos.find((x) => x.tipoPeriodo === tipo && x.dtFim === dtFim) ?? null;
  const fiscal = periodoFiscal(base.dtFim, mesFimExercicio);
  const trimestreAtual = (base.tipoPeriodo === 'FY' ? 4 : (fiscal.trimestreFiscal ?? 4)) as
    | 1
    | 2
    | 3
    | 4;
  const fimAnoAnterior = fimDoMesAnterior(base.dtFim, 3 * trimestreAtual);
  const mesmoAnoAnterior = fimDoMesAnterior(base.dtFim, 12);

  /** Valor de 3 meses do trimestre que termina em dtFim (Q1 = YTD; Q4 = FY − 9M). */
  const trimestre = (dtFim: string, campo: CampoFluxo): number | null => {
    const f = periodoFiscal(dtFim, mesFimExercicio);
    if (f.trimestreFiscal === null) {
      const fy = achar('FY', dtFim)?.valores[campo];
      const nove = achar('YTD', fimDoMesAnterior(dtFim, 3))?.valores[campo];
      return num(fy) && num(nove) ? fy - nove : null;
    }
    const tres = achar('3M', dtFim)?.valores[campo];
    if (num(tres)) return tres;
    if (f.trimestreFiscal === 1) {
      const ytd = achar('YTD', dtFim)?.valores[campo];
      return num(ytd) ? ytd : null;
    }
    return null;
  };

  const valores = {} as Record<CampoFluxo, number | null>;
  const metodos: Partial<Record<CampoFluxo, MetodoTtm>> = {};
  const divergencias: Partial<Record<CampoFluxo, number>> = {};
  const flags = new Set<string>();
  for (const campo of CAMPOS_FLUXO) {
    const entrada: EntradaTtm =
      trimestreAtual === 4
        ? {
            fyAnterior: achar('FY', base.dtFim)?.valores[campo] ?? null,
            ytdAtual: null,
            ytdMesmoPeriodoAnoAnterior: null,
            ultimos4Trimestres: [],
            trimestreAtual,
          }
        : {
            fyAnterior: achar('FY', fimAnoAnterior)?.valores[campo] ?? null,
            ytdAtual: achar('YTD', base.dtFim)?.valores[campo] ?? null,
            ytdMesmoPeriodoAnoAnterior: achar('YTD', mesmoAnoAnterior)?.valores[campo] ?? null,
            ultimos4Trimestres: [0, 3, 6, 9].map((m) =>
              trimestre(fimDoMesAnterior(base.dtFim, m), campo),
            ),
            trimestreAtual,
          };
    const r = calcularTtm(entrada, p);
    valores[campo] = r.valor.estado === 'ok' ? r.valor.valor : null;
    if (r.valor.estado === 'ok') {
      metodos[campo] = r.metodo;
      flags.add(`ttm_metodo_${r.metodo}`);
    }
    if (r.divergenciaPct !== null) divergencias[campo] = r.divergenciaPct;
    if (r.reapresentacao) flags.add('reapresentacao');
  }
  return { valores, metodos, divergencias, flags: [...flags].sort() };
}
