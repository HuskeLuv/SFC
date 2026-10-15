/**
 * resolverSeries — junta as fontes de fundamentos de UM ativo em séries anuais para os critérios e
 * o Essencial (v2.5, fatia 0; desenho final.camada_fontes §4). FUNÇÃO PURA: a fatia A orquestra com
 * o banco (FonteCvm.lerLocal + repositorio/fontesFundamentos.lerPontosVigentes) e a B usa no
 * Essencial. Nunca chama terceiros.
 *
 * Regras (params.fontes, ver criteriaParamsSchema.fontesEfetivas):
 *  - para cada série, percorre prioridade.porSerie[serie] ?? prioridade.padrao; por ANO, a primeira
 *    fonte com ponto vigente vence (fonte fora da lista é ignorada);
 *  - ponto vigente = maior versão de (tipoPeriodo, dtFim) dentro da fonte; só 'approved' chega aqui
 *    (o repositório filtra; 'pending'/'rejected' nunca aparecem);
 *  - incompleto (§6) = valor AUSENTE no ano, com a OrigemSerie marcada incompleto (selo na tela);
 *  - valor do ano: o ponto FY do ano fiscal; sem FY, os trimestrais (Q) e, sem eles, os mensais (M)
 *    agregados por agregacaoAnual — 'ultimo' (padrão, decisão 4: o período de dtFim mais recente do
 *    ano) ou 'media' (média dos períodos com valor; algum incompleto = ano incompleto);
 *  - unidade: o ponto vem na unidade do catálogo (BRL em reais); a saída fica na unidade dos
 *    critérios (BRL → R$ mi, ESCALA_CRITERIO).
 * escolherSerieJanela decide a serieFallback pela JANELA INTEIRA (nunca mistura séries entre anos):
 * se todos os anos exigidos têm a série principal, usa a principal; senão, a de fallback em todos.
 */
import {
  agregacaoDaSerie,
  prioridadeDaSerie,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { ObsCriterio, SerieCriterio } from '@/types/analiseAtivosCriterios';
import {
  CATALOGO_SERIES,
  type IdFonte,
  type OrigemSerie,
  type PeriodicidadeSerie,
  type PontoSerieVigente,
  type SerieFundamento,
  type UnidadeSerie,
} from '@/types/analiseAtivosFontes';

/** Série anual por nome canônico (ano → valor na unidade dos critérios; null = sem dado). */
export type SeriesResolvidas = Partial<Record<SerieFundamento, Record<number, number | null>>>;

/** Origem por série e ano. */
export type OrigensSeries = Partial<Record<SerieFundamento, Record<number, OrigemSerie>>>;

export interface ResultadoResolverSeries {
  series: SeriesResolvidas;
  origens: OrigensSeries;
}

/** Fator catálogo → unidade dos critérios (BRL em reais → R$ mi; o resto já está na unidade). */
export const ESCALA_CRITERIO: Record<UnidadeSerie, number> = {
  BRL: 1e-6,
  BRL_por_cota: 1,
  pct: 1,
  x: 1,
  contagem: 1,
};

export interface EntradaResolverSeries {
  /** pontos vigentes de UM ativo, de todas as fontes (approved) */
  pontos: readonly PontoSerieVigente[];
  /** séries a resolver (as dos critérios do perfil + fallbacks; o Essencial pede as suas) */
  series: readonly SerieFundamento[];
  fontes: FontesParams;
}

interface ValorAno {
  valor: number | null;
  incompleto: boolean;
}

const ORDEM_GRANULARIDADE: readonly PeriodicidadeSerie[] = ['FY', 'Q', 'M'];

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Valor de um ponto: número finito ou +Infinity (net_debt_ebitda da CVM com EBITDA ≤ 0 e dívida
 * líquida positiva: o motor mostra 'EBITDA ≤ 0 em AAAA'); NaN/−Infinity/null = sem dado.
 */
const numeroOuInfinito = (v: number | null | undefined): number | null =>
  typeof v === 'number' && (Number.isFinite(v) || v === Number.POSITIVE_INFINITY) ? v : null;

/** Maior versão por (tipoPeriodo, dtFim) dentro de uma fonte. */
function vigentesDaFonte(pontos: readonly PontoSerieVigente[]): PontoSerieVigente[] {
  const porChave = new Map<string, PontoSerieVigente>();
  for (const p of pontos) {
    const k = `${p.tipoPeriodo}|${p.dtFim}`;
    const atual = porChave.get(k);
    if (!atual || p.versao > atual.versao) porChave.set(k, p);
  }
  return [...porChave.values()];
}

/** Valor do ano de uma fonte (undefined = a fonte não tem ponto no ano). */
function valorDoAno(
  pontosAno: readonly PontoSerieVigente[],
  agregacao: 'ultimo' | 'media',
): ValorAno | undefined {
  for (const tipo of ORDEM_GRANULARIDADE) {
    const doTipo = pontosAno
      .filter((p) => p.tipoPeriodo === tipo)
      .sort((a, b) => a.dtFim.localeCompare(b.dtFim));
    if (doTipo.length === 0) continue;
    if (tipo === 'FY' || agregacao === 'ultimo') {
      const ultimo = doTipo[doTipo.length - 1];
      return ultimo.incompleto
        ? { valor: null, incompleto: true }
        : { valor: numeroOuInfinito(ultimo.valor), incompleto: false };
    }
    if (doTipo.some((p) => p.incompleto)) return { valor: null, incompleto: true };
    const valores = doTipo.map((p) => p.valor).filter(finito);
    return {
      valor: valores.length > 0 ? valores.reduce((a, v) => a + v, 0) / valores.length : null,
      incompleto: false,
    };
  }
  return undefined;
}

/** Resolve as séries de UM ativo pela prioridade de fontes. Pura. */
export function resolverSeries(e: EntradaResolverSeries): ResultadoResolverSeries {
  const series: SeriesResolvidas = {};
  const origens: OrigensSeries = {};
  for (const serie of new Set(e.series)) {
    const prioridade = prioridadeDaSerie(e.fontes, serie);
    const agregacao = agregacaoDaSerie(e.fontes, serie);
    const escala = ESCALA_CRITERIO[CATALOGO_SERIES[serie].unidade];
    // fonte → ano → pontos vigentes
    const porFonte = new Map<IdFonte, Map<number, PontoSerieVigente[]>>();
    for (const fonte of prioridade) {
      const daFonte = vigentesDaFonte(
        e.pontos.filter((p) => p.serie === serie && p.fonte === fonte),
      );
      const porAno = new Map<number, PontoSerieVigente[]>();
      for (const p of daFonte) {
        const lista = porAno.get(p.anoFiscal);
        if (lista) lista.push(p);
        else porAno.set(p.anoFiscal, [p]);
      }
      porFonte.set(fonte, porAno);
    }
    const anos = [...new Set([...porFonte.values()].flatMap((m) => [...m.keys()]))].sort(
      (a, b) => a - b,
    );
    if (anos.length === 0) continue;
    const valores: Record<number, number | null> = {};
    const orig: Record<number, OrigemSerie> = {};
    for (const ano of anos) {
      for (const fonte of prioridade) {
        const pontosAno = porFonte.get(fonte)?.get(ano);
        if (!pontosAno || pontosAno.length === 0) continue;
        const v = valorDoAno(pontosAno, agregacao);
        if (!v) continue;
        valores[ano] = v.valor === null ? null : v.valor * escala;
        orig[ano] = { fonte, serieUsada: serie, fallback: false, incompleto: v.incompleto };
        break;
      }
    }
    series[serie] = valores;
    origens[serie] = orig;
  }
  return { series, origens };
}

/** Observação do resultado quando a janela usou a serieFallback desta série principal. */
export const OBS_FALLBACK: Partial<Record<SerieCriterio, ObsCriterio>> = {
  net_income_adjusted: 'lucro_sem_descontado',
};

export interface SerieDaJanela {
  /** série efetivamente usada (a principal ou a de fallback) */
  serie: SerieCriterio;
  valores: Readonly<Record<number, number | null>>;
  fallback: boolean;
  /**
   * fontes dos anos exigidos (provedores primeiro, na ordem em que aparecem; 'cvm' por último).
   * Vazio quando a entrada não tem origens (v2.4: só CVM).
   */
  fontes: IdFonte[];
  /** algum ano exigido veio de ponto incompleto */
  incompleto: boolean;
  /** obs do ResultadoCriterio ('lucro_sem_descontado', 'dados_incompletos') */
  obs: ObsCriterio[];
}

const temTodos = (valores: Readonly<Record<number, number | null>> | undefined, anos: number[]) =>
  !!valores && anos.every((a) => finito(valores[a]));

/**
 * Série de um critério numa janela (anos exigidos já com o ano anterior do 'up'). Fallback pela
 * JANELA INTEIRA: com todos os anos da principal, usa a principal; senão, a serieFallback (se o
 * critério tiver) em todos os anos. Pura.
 */
export function escolherSerieJanela(
  series: Readonly<Partial<Record<SerieCriterio, Record<number, number | null>>>>,
  origens: Readonly<OrigensSeries> | undefined,
  def: { serie: SerieCriterio; serieFallback?: SerieCriterio },
  anos: number[],
): SerieDaJanela {
  const principal = series[def.serie];
  const usarFallback = !!def.serieFallback && !temTodos(principal, anos);
  const serie = usarFallback ? (def.serieFallback as SerieCriterio) : def.serie;
  const valores = (usarFallback ? series[serie] : principal) ?? {};
  const origemSerie = origens?.[serie];
  const fontesVistas: IdFonte[] = [];
  let incompleto = false;
  for (const a of anos) {
    const o = origemSerie?.[a];
    if (!o) continue;
    if (!fontesVistas.includes(o.fonte)) fontesVistas.push(o.fonte);
    if (o.incompleto) incompleto = true;
  }
  const fontes = [
    ...fontesVistas.filter((f) => f !== 'cvm'),
    ...fontesVistas.filter((f) => f === 'cvm'),
  ];
  const obs: ObsCriterio[] = [];
  const obsFallback = OBS_FALLBACK[def.serie];
  if (usarFallback && obsFallback) obs.push(obsFallback);
  if (incompleto) obs.push('dados_incompletos');
  return { serie, valores, fallback: usarFallback, fontes, incompleto, obs };
}
