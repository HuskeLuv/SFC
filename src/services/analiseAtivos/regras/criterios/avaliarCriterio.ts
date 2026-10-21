/**
 * Avaliação de UM critério numa janela — port do evalCriteria/fmtC do screen.js do Pedro
 * (prototipo-pedro-v2.html) com as 3 correções da spec §4.1:
 *  1. 'up' usa J + 1 valores (o ano anterior à janela) e J comparações; empate NÃO conta;
 *  2. só os anos da janela são exigidos (o screen.js pedia a série inteira de 10 anos): ano
 *     ausente DENTRO da janela = 'sem_dado' (conta como não atende; nunca atende por falta);
 *  3. 'months' trata dado ausente (mesesJanela.avaliarMeses).
 * pos/max/min usam J valores. Mais as decisões de 13/10:
 *  - D3: critério com ativo:false = 'sem_dado' com motivo 'sem_fonte_confiavel' (texto por id);
 *  - D4: id em naoSeAplica do perfil financeiro = 'nao_se_aplica' (e a margem de financeira sem
 *    receita comparável ao lucro, avaliarAtivo.margemNaoComparavel);
 *  - Dív.líq/EBITDA: caixa líquido conta como dentro; com exibirNegativoComoZero o fato mostra
 *    máx(0, máx) ('máx. 0,0×' quando o máximo real é −0,3); EBITDA ≤ 0 com DL > 0 vem da série como
 *    +Infinity (seriesAcao) e dá 'nao_atende' com o fato 'EBITDA ≤ 0 em AAAA'.
 * Fatos com formatarValorCriterio (fmtC: |v| < 0,05 vira 0, exceto n2) e TEXTOS_CRITERIOS.fatos.
 * v2.5: a série chega já escolhida para a janela (avaliarAtivo + resolverSeries.escolherSerieJanela:
 * fallback do lucro descontado pela janela inteira); fonte/obs do resultado são postos por
 * avaliarAtivo. 'sem dado' é sempre o mesmo texto (sem a nota dos informes de FII).
 *
 * fundamentei-regras (F1): tipo 'cagr' — lê os J + 1 anos como o 'up', exige todos e calcula a taxa
 * anual composta (fim ÷ início)^(1/J) − 1; atende com taxa > 0. Último ano ≤ 0 = não atende em
 * qualquer modo; primeiro ano ≤ 0 (taxa não se calcula) pela regra criteria_params.cagr
 * .baseNaoPositiva ('fim_positivo' = atende com o último ano > 0 e o fato da base; 'sem_dado' =
 * motivo 'base_nao_positiva'). n/de seguem a regra do card (atende ⇔ n === de): n = J quando
 * atende, 0 quando não. Só a v5 usa o tipo; v1–v4 avaliam igual.
 * Função pura.
 */
import {
  baseNaoPositivaCagrDe,
  type CriteriaParams,
  type DefCriterio,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { anosDaJanela } from '@/services/analiseAtivos/regras/criterios/ancoraJanela';
import {
  avaliarMeses,
  type MesesRendimento,
} from '@/services/analiseAtivos/regras/criterios/mesesJanela';
import {
  formatarTexto,
  formatarValorCriterio,
  TEXTOS_CRITERIOS,
} from '@/services/analiseAtivos/textosCriterios';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type {
  IdCriterio,
  Janela,
  PontoCriterio,
  ResultadoCriterio,
} from '@/types/analiseAtivosCriterios';

export interface EntradaCriterio {
  def: DefCriterio;
  janela: Janela;
  anoFim: number;
  classe: ClasseQuadro;
  /** ano → valor na unidade do critério (ausente = sem dado) */
  serie?: Readonly<Record<number, number | null>>;
  /** só 'months' */
  meses?: MesesRendimento | null;
  /** só 'months' (v2.5): contagens anuais de um provedor (mesesJanela.avaliarMesesPorAno) */
  mesesPorAno?: Readonly<Record<number, number | null>> | null;
  /** D4: critério não se aplica ao perfil (financeira) */
  naoSeAplica?: boolean;
}

const T = TEXTOS_CRITERIOS;

/** Arredonda o ponto gravado (4 casas; o JSON fica menor e estável). */
function arred(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

function textoNaoSeAplica(def: Pick<DefCriterio, 'id' | 'serie'>): string {
  const id = def.id;
  // v5: o 'ebitda' é o lucro operacional (série 'ebit'); v1–v4 seguem o texto de antes
  if (id === 'ebitda' && def.serie === 'ebit') return T.motivos.instituicao_financeira_ebit;
  if (id === 'fcl') return T.motivos.instituicao_financeira_fcl;
  if (id === 'mg') return T.motivos.instituicao_financeira_mg;
  return T.motivos.instituicao_financeira;
}

function textoSemFonte(id: IdCriterio): string {
  const m = T.motivos.sem_fonte_confiavel as Partial<Record<IdCriterio, string>>;
  return m[id] ?? T.fatos.semDado;
}

/** Critérios de FII que os informes da CVM não trazem (só o relatório gerencial do fundo). */
const SO_RELATORIO_GESTOR: ReadonlySet<IdCriterio> = new Set<IdCriterio>(['inad', 'ltv']);

/**
 * Fato de 'sem dado'. QA do Pedro (16/10): diz POR QUE falta o dado quando dá para saber pela
 * própria série — indicador fora dos informes da CVM, ou série que só começa depois do início da
 * janela (empresa/fundo mais novo que a janela) — e cai no texto genérico nos demais casos.
 */
function textoSemDado(
  id: IdCriterio,
  janela: Janela,
  anos: number[] = [],
  brutos: Array<number | null> = [],
): string {
  const primeiro = brutos.findIndex((v) => v !== null);
  if (primeiro === -1 && SO_RELATORIO_GESTOR.has(id)) return T.fatos.semDadoRelatorioGestor;
  if (primeiro > 0 && brutos.slice(primeiro).every((v) => v !== null)) {
    return formatarTexto(T.fatos.semDadoDesde, { ano: anos[primeiro], anos: janela });
  }
  return T.fatos.semDado;
}

function pontos(anos: number[], valores: Array<number | null>): PontoCriterio[] {
  return anos.map((ano, i) => {
    const v = valores[i];
    return { ano, valor: typeof v === 'number' && Number.isFinite(v) ? arred(v) : null };
  });
}

/** 'up' e 'cagr' leem o ano anterior à janela (J + 1 valores). */
export function incluiAnoAnterior(tipo: DefCriterio['tipo']): boolean {
  return tipo === 'up' || tipo === 'cagr';
}

/** Taxa de crescimento anual composto (fração). Início e fim > 0. Pura. */
export function taxaCagr(inicio: number, fim: number, anos: number): number {
  return Math.pow(fim / inicio, 1 / anos) - 1;
}

/** 'cagr' com os J + 1 valores (todos presentes). */
function avaliarCagr(
  id: IdCriterio,
  def: DefCriterio,
  janela: Janela,
  w: number[],
  serie: PontoCriterio[],
  params: Pick<CriteriaParams, 'cagr'>,
): ResultadoCriterio {
  const fmt = (v: number) => formatarValorCriterio(v, def.formato);
  const inicio = w[0];
  const fim = w[w.length - 1];
  const vars = { inicio: fmt(inicio), fim: fmt(fim), total: janela };
  const com = (semUnidade: string, comUnidade: string, extra: Record<string, string> = {}) =>
    def.unidade
      ? formatarTexto(comUnidade, { ...vars, ...extra, unidade: def.unidade })
      : formatarTexto(semUnidade, { ...vars, ...extra });
  // +Infinity/−Infinity nunca chegam a uma série de crescimento; por segurança, fora
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= 0) {
    return {
      id,
      estado: 'nao_atende',
      n: 0,
      de: janela,
      fato: com(T.fatos.cagrFimNaoPositivo, T.fatos.cagrFimNaoPositivoComUnidade),
      serie,
    };
  }
  if (inicio <= 0) {
    const fato = com(T.fatos.cagrBaseNaoPositiva, T.fatos.cagrBaseNaoPositivaComUnidade);
    if (baseNaoPositivaCagrDe(params) === 'fim_positivo') {
      return { id, estado: 'atende', n: janela, de: janela, fato, serie };
    }
    return {
      id,
      estado: 'sem_dado',
      n: null,
      de: null,
      fato,
      motivo: 'base_nao_positiva',
      serie,
    };
  }
  const taxa = taxaCagr(inicio, fim, janela);
  const atende = taxa > 0;
  return {
    id,
    estado: atende ? 'atende' : 'nao_atende',
    n: atende ? janela : 0,
    de: janela,
    fato: com(T.fatos.cagr, T.fatos.cagrComUnidade, {
      taxa: formatarValorCriterio(taxa * 100, '%'),
    }),
    serie,
  };
}

export function avaliarCriterio(e: EntradaCriterio, params: CriteriaParams): ResultadoCriterio {
  const { def, janela, anoFim } = e;
  const id = def.id;
  if (e.naoSeAplica) {
    return {
      id,
      estado: 'nao_se_aplica',
      n: null,
      de: null,
      fato: textoNaoSeAplica(def),
      motivo: 'instituicao_financeira',
      serie: null,
    };
  }
  if (def.ativo === false) {
    return {
      id,
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: textoSemFonte(id),
      motivo: def.motivoInativo ?? 'sem_fonte_confiavel',
      serie: null,
    };
  }
  if (def.tipo === 'months') {
    const r = avaliarMeses(e.meses ?? null, anoFim, janela, params, e.mesesPorAno);
    return {
      id,
      estado: r.estado,
      n: r.n,
      de: r.de,
      fato:
        r.estado === 'sem_dado' && r.motivo === 'sem_dado_demonstracoes'
          ? textoSemDado(id, janela)
          : r.fato,
      ...(r.motivo ? { motivo: r.motivo } : {}),
      serie: null,
    };
  }

  const anos = anosDaJanela(anoFim, janela, incluiAnoAnterior(def.tipo));
  const brutos = anos.map((a) => {
    const v = e.serie?.[a];
    return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  });
  if (brutos.some((v) => v === null)) {
    const algum = brutos.some((v) => v !== null);
    return {
      id,
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: textoSemDado(id, janela, anos, brutos),
      motivo: 'sem_dado_demonstracoes',
      serie: algum ? pontos(anos, brutos) : null,
    };
  }
  const w = brutos as number[];
  const serie = pontos(anos, w);
  const fmt = (v: number) => formatarValorCriterio(v, def.formato);
  let n: number;
  let fato: string;

  if (def.tipo === 'cagr') {
    return avaliarCagr(id, def, janela, w, serie, params);
  }
  if (def.tipo === 'up') {
    n = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[i - 1]) n++;
    const vars = { n, total: janela, inicio: fmt(w[0]), fim: fmt(w[w.length - 1]) };
    fato = def.unidade
      ? formatarTexto(T.fatos.upComUnidade, { ...vars, unidade: def.unidade })
      : formatarTexto(T.fatos.up, vars);
  } else if (def.tipo === 'pos') {
    n = w.filter((v) => v > 0).length;
    fato = formatarTexto(T.fatos.pos, { n, total: janela, min: fmt(Math.min(...w)) });
  } else {
    const limite = def.limite as number;
    // caso 26 ('máx. 0,0×') pelo id do critério, não pelo nome da série (v2.5)
    const ehDl = def.id === 'dl';
    // EBITDA ≤ 0 com dívida líquida positiva (seriesAcao grava +Infinity): fora do limite
    const anosEbitdaNaoPositivo = anos.filter((_, i) => w[i] === Number.POSITIVE_INFINITY);
    if (def.tipo === 'max') {
      n = w.filter((v) => v <= limite).length;
      if (anosEbitdaNaoPositivo.length > 0) {
        return {
          id,
          estado: 'nao_atende',
          n,
          de: janela,
          fato: formatarTexto(T.fatos.ebitdaNaoPositivo, {
            ano: anosEbitdaNaoPositivo[anosEbitdaNaoPositivo.length - 1],
          }),
          motivo: 'ebitda_nao_positivo',
          serie,
        };
      }
      let max = Math.max(...w);
      if (ehDl && params.dlEbitda.exibirNegativoComoZero) max = Math.max(0, max);
      fato = formatarTexto(T.fatos.max, {
        n,
        total: janela,
        max: fmt(max),
        limite: fmt(limite),
      });
    } else {
      n = w.filter((v) => v >= limite).length;
      fato = formatarTexto(T.fatos.min, {
        n,
        total: janela,
        min: fmt(Math.min(...w)),
        limite: fmt(limite),
      });
    }
  }
  return { id, estado: n === janela ? 'atende' : 'nao_atende', n, de: janela, fato, serie };
}
