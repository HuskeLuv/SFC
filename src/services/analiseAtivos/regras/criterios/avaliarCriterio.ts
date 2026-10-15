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
 * Função pura.
 */
import type {
  CriteriaParams,
  DefCriterio,
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
  /** D4: critério não se aplica ao perfil (financeira) */
  naoSeAplica?: boolean;
}

const T = TEXTOS_CRITERIOS;

/** Arredonda o ponto gravado (4 casas; o JSON fica menor e estável). */
function arred(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

function textoNaoSeAplica(id: IdCriterio): string {
  if (id === 'fcl') return T.motivos.instituicao_financeira_fcl;
  if (id === 'mg') return T.motivos.instituicao_financeira_mg;
  return T.motivos.instituicao_financeira;
}

function textoSemFonte(id: IdCriterio): string {
  const m = T.motivos.sem_fonte_confiavel as Partial<Record<IdCriterio, string>>;
  return m[id] ?? T.fatos.semDado;
}

/** Fato de 'sem dado' (FII na janela 10: os informes CVM começam em 2016). */
function textoSemDado(classe: ClasseQuadro, janela: Janela): string {
  return classe === 'fii' && janela === 10 ? T.fatos.semDadoFii10 : T.fatos.semDado;
}

function pontos(anos: number[], valores: Array<number | null>): PontoCriterio[] {
  return anos.map((ano, i) => {
    const v = valores[i];
    return { ano, valor: typeof v === 'number' && Number.isFinite(v) ? arred(v) : null };
  });
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
      fato: textoNaoSeAplica(id),
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
    const r = avaliarMeses(e.meses ?? null, anoFim, janela, params);
    return {
      id,
      estado: r.estado,
      n: r.n,
      de: r.de,
      fato:
        r.estado === 'sem_dado' && r.motivo === 'sem_dado_demonstracoes'
          ? textoSemDado(e.classe, janela)
          : r.fato,
      ...(r.motivo ? { motivo: r.motivo } : {}),
      serie: null,
    };
  }

  const anos = anosDaJanela(anoFim, janela, def.tipo === 'up');
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
      fato: textoSemDado(e.classe, janela),
      motivo: 'sem_dado_demonstracoes',
      serie: algum ? pontos(anos, brutos) : null,
    };
  }
  const w = brutos as number[];
  const serie = pontos(anos, w);
  const fmt = (v: number) => formatarValorCriterio(v, def.formato);
  let n: number;
  let fato: string;

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
    const ehDl = def.serie === 'dlEbitda';
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
