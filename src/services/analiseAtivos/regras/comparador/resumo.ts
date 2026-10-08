/**
 * Resumo numérico do Comparador (Bloco D, fatia C) — PURO e isomórfico. Decisão 9: SEM placar.
 *  (a) Índice MF NA ORDEM DOS SLOTS, '*' no incompleto (+ legenda);
 *  (b) critérios atendidos, também na ordem dos slots;
 *  (c) em conferência: ticker (critérios);
 *  (d) frase de responsabilidade.
 * Nada de ordenar por valor, contar ★ ou dizer "X tem o maior".
 */
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ResumoComparador } from '@/types/analiseAtivosBlocoD';
import type { IndiceLinha } from '@/types/analiseAtivosApi';

const TR = TEXTOS_COMPARADOR.resumo;

export interface EntradaResumo {
  ticker: string;
  indice: Pick<IndiceLinha, 'valor' | 'estado' | 'criteriosAtendidos' | 'criteriosAplicaveis'>;
  /** rótulos dos critérios em conferência deste ativo (ordem da tabela) */
  emConferencia: string[];
}

/** Monta o resumo na ordem recebida (= ordem dos slots). */
export function montarResumo(ativos: readonly EntradaResumo[]): ResumoComparador {
  return {
    indices: ativos.map((a) => ({
      ticker: a.ticker,
      valor:
        a.indice.estado === 'sem_score' || a.indice.estado === 'fora_do_indice'
          ? null
          : a.indice.valor,
      incompleto: a.indice.estado === 'incompleto',
    })),
    criteriosAtendidos: ativos.map((a) => ({
      ticker: a.ticker,
      atende: a.indice.criteriosAtendidos,
      total: a.indice.criteriosAplicaveis,
    })),
    emConferencia: ativos
      .filter((a) => a.emConferencia.length > 0)
      .map((a) => ({ ticker: a.ticker, rotulos: [...new Set(a.emConferencia)] })),
    responsabilidade: TR.responsabilidade,
  };
}

const umaCasa = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface TextosResumo {
  indice: string;
  /** legenda do '*' (só com algum incompleto) */
  legendaIncompleto: string | null;
  criterios: string | null;
  emConferencia: string | null;
  responsabilidade: string;
}

/** Frases prontas do Resumo (a tela só as exibe). */
export function textosResumo(r: ResumoComparador): TextosResumo {
  const indices = r.indices
    .map((i) =>
      formatarTexto(TR.indiceItem, {
        ticker: i.ticker,
        valor: `${i.valor === null ? TEXTOS_COMPARADOR.celula.semDado : umaCasa(i.valor)}${
          i.incompleto ? '*' : ''
        }`,
      }),
    )
    .join(' · ');
  const criterios = r.criteriosAtendidos
    .filter((c) => c.atende !== null && c.total !== null)
    .map((c) =>
      formatarTexto(TR.criteriosItem, {
        ticker: c.ticker,
        atendidos: String(c.atende),
        aplicaveis: String(c.total),
      }),
    )
    .join(' · ');
  const conf = r.emConferencia
    .map((c) =>
      formatarTexto(TR.emConferenciaItem, { ticker: c.ticker, campo: c.rotulos.join(', ') }),
    )
    .join(' · ');
  return {
    indice: formatarTexto(TR.indice, { valor: indices }),
    legendaIncompleto: r.indices.some((i) => i.incompleto) ? TR.legendaIncompleto : null,
    criterios: criterios ? formatarTexto(TR.criterios, { valor: criterios }) : null,
    emConferencia: conf ? formatarTexto(TR.emConferencia, { valor: conf }) : null,
    responsabilidade: r.responsabilidade,
  };
}
