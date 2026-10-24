/**
 * Retornos acumulados da cotação (A6, item 5; fatia C) — função PURA, sem banco.
 *
 * RETORNO TOTAL (igual ao Fundamentei, 24/10/2026): fechamento cru do COTAHIST ajustado por
 * desdobramentos, grupamentos e bonificações que ajustam série (eventoAjustaSerie: 'confirmado' |
 * 'emissao_recompra') E por proventos reinvestidos na data-ex: cada provento multiplica os preços
 * anteriores à data-ex por (1 − valor ÷ fechamento do pregão anterior à data-ex). Valor e fechamento
 * na base da época (crus), então o fator não depende de evento de ações. Provento com valor fora de
 * (0; 50%) do fechamento é ignorado (dado ruim não vira retorno).
 *
 * - Data-alvo de cada janela = último pregão (ateData) − 1/12/60/120 meses (dia limitado ao fim do
 *   mês). Preço na data-alvo = último pregão da série ≤ alvo, aceito só se estiver a no máximo
 *   TOLERANCIA_PREGOES_RETORNO pregões do alvo (calendário B3 de regras/comum/pregoes). Sem pregão
 *   ≤ alvo (série curta, troca de ticker) ou fora da tolerância ⇒ janela nula + flag
 *   'serie_curta_<janela>'.
 * - Ajuste: preço-base ÷ fatorEventosEntre(eventos, dataBase, ateData) — o mesmo para ação e FII. No
 *   FII, os eventos de asset_corporate_action_checks já trazem a data EX real (pela cotação; inclusive
 *   os 'cvm_cotas'), então o ajuste da cota diária é por data, como o gráfico do topo
 *   (seriesGrafico/fatorAjusteAte). O ajustarSerieCotaFii vale para séries MENSAIS do informe (VP e
 *   rendimento por cota), não para a cotação diária.
 * - 5a e 10a anualizados: (1 + r)^(1/anos) − 1.
 * - Máxima de fechamento AJUSTADA desde INICIO_MAXIMA_RETORNOS (empate: a data mais recente) e a
 *   distância do preço até ela ((preço ÷ máxima − 1), sempre ≤ 0; máxima no último pregão ⇒ 0).
 * - Evento NÃO confirmado ('nao_validavel') com data dentro do período usado ⇒ flag
 *   'evento_nao_confirmado': 12m, 5a, 10a e a distância da máxima ficam nulos (o salto de um evento
 *   não ajustado distorceria a conta); o 1m também, se o evento cair no último mês. 'descartado' é
 *   ignorado.
 * - Último pregão a mais de PREGOES_SEM_COTACAO_RECENTE pregões de `hoje` ⇒ flag
 *   'sem_cotacao_recente' (os números são calculados até o último pregão; a leitura decide o texto).
 */
import { fatorEventosEntre } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { distanciaEmPregoes } from '@/services/analiseAtivos/regras/comum/pregoes';
import type { EventoCorporativoVerificado } from '@/services/analiseAtivos/tipos';
import type { ClasseBr } from '@/types/analiseAtivosApi';
import {
  FLAGS_RETORNO,
  INICIO_MAXIMA_RETORNOS,
  JANELAS_RETORNO,
  TOLERANCIA_PREGOES_RETORNO,
  type FlagRetorno,
  type JanelaRetorno,
  type RetornosCalculados,
} from '@/types/analiseAtivosComplementos';

/** Meses de cada janela. */
export const MESES_JANELA_RETORNO: Readonly<Record<JanelaRetorno, number>> = {
  '1m': 1,
  '12m': 12,
  '5a': 60,
  '10a': 120,
};

/** Último pregão mais velho que isto (em pregões até `hoje`) ⇒ 'sem_cotacao_recente'. */
export const PREGOES_SEM_COTACAO_RECENTE = 10;

/** Pregão da série (fechamento CRU do COTAHIST, > 0), em ordem crescente de data. */
export interface PregaoRetorno {
  date: string;
  closeRaw: number;
}

export type EventoRetorno = Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>;

/** Provento por ação/cota na base da época (cru), com a data-ex (1º pregão sem o direito). */
export interface ProventoRetorno {
  dataEx: string;
  valor: number;
}

export interface EntradaRetornos {
  symbol: string;
  classe: ClasseBr;
  pregoes: readonly PregaoRetorno[];
  eventos: readonly EventoRetorno[];
  /** proventos válidos (retorno total); ausente = só preço */
  proventos?: readonly ProventoRetorno[];
  /** data civil de referência do job (AAAA-MM-DD), só para 'sem_cotacao_recente' */
  hoje: string;
}

/** `data` − `meses` meses (dia limitado ao fim do mês de destino). */
export function subtrairMeses(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const total = a * 12 + (m - 1) - meses;
  const ano = Math.floor(total / 12);
  const mes = total - ano * 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${String(ano).padStart(4, '0')}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Índice do último pregão com date ≤ alvo (busca binária); −1 se não houver. */
function ultimoAte(pregoes: readonly PregaoRetorno[], alvo: string): number {
  let lo = 0;
  let hi = pregoes.length - 1;
  let res = -1;
  while (lo <= hi) {
    const meio = (lo + hi) >> 1;
    if (pregoes[meio].date <= alvo) {
      res = meio;
      lo = meio + 1;
    } else hi = meio - 1;
  }
  return res;
}

/** Data inicial da carga para o cálculo até `ate` (o menor entre a máxima e o alvo do 10a − folga). */
export function inicioCargaRetornos(ate: string): string {
  const alvo10a = subtrairMeses(ate, MESES_JANELA_RETORNO['10a']);
  // folga de 1 mês para a tolerância de pregões antes do alvo
  const comFolga = subtrairMeses(alvo10a, 1);
  return comFolga < INICIO_MAXIMA_RETORNOS ? comFolga : INICIO_MAXIMA_RETORNOS;
}

const pct = (r: number) => r * 100;

/** Provento acima disto (fração do fechamento da véspera) é dado ruim: fica fora. */
const MAX_PROVENTO_FRACAO = 0.5;

/**
 * Fatores de reinvestimento por data-ex (≤ ate): 1 − valor ÷ fechamento do último pregão antes da
 * data-ex. Sem pregão anterior na série ⇒ fora.
 */
export function fatoresProventos(
  pregoes: readonly PregaoRetorno[],
  proventos: readonly ProventoRetorno[],
  ate: string,
): Array<{ dataEx: string; fator: number }> {
  const out: Array<{ dataEx: string; fator: number }> = [];
  for (const pr of proventos) {
    if (!(pr.valor > 0) || pr.dataEx > ate) continue;
    const i = ultimoAte(pregoes, pr.dataEx);
    const iVespera = i >= 0 && pregoes[i].date === pr.dataEx ? i - 1 : i;
    if (iVespera < 0) continue;
    const fracao = pr.valor / pregoes[iVespera].closeRaw;
    if (!(fracao > 0 && fracao < MAX_PROVENTO_FRACAO)) continue;
    out.push({ dataEx: pr.dataEx, fator: 1 - fracao });
  }
  return out;
}

/** Π dos fatores de proventos com data-ex em (de, ate]. */
function fatorProventosEntre(
  fatores: ReadonlyArray<{ dataEx: string; fator: number }>,
  de: string,
  ate: string,
): number {
  let f = 1;
  for (const x of fatores) if (x.dataEx > de && x.dataEx <= ate) f *= x.fator;
  return f;
}

/** Calcula os retornos de um símbolo; null = sem nenhum pregão válido. */
export function retornosCotacao(e: EntradaRetornos): RetornosCalculados | null {
  const pregoes = e.pregoes.filter((p) => Number.isFinite(p.closeRaw) && p.closeRaw > 0);
  if (pregoes.length === 0) return null;
  const ultimo = pregoes[pregoes.length - 1];
  const ate = ultimo.date;
  const preco = ultimo.closeRaw;
  const flags = new Set<FlagRetorno>();
  const eventos = [...e.eventos];
  const proventos = fatoresProventos(pregoes, e.proventos ?? [], ate);
  /** preço do pregão na base de hoje: ÷ eventos de ações e × reinvestimento dos proventos depois */
  const ajustar = (p: PregaoRetorno) =>
    (p.closeRaw / fatorEventosEntre(eventos, p.date, ate)) *
    fatorProventosEntre(proventos, p.date, ate);

  if (e.hoje > ate && distanciaEmPregoes(ate, e.hoje) > PREGOES_SEM_COTACAO_RECENTE) {
    flags.add('sem_cotacao_recente');
  }

  const alvos = Object.fromEntries(
    JANELAS_RETORNO.map((j) => [j, subtrairMeses(ate, MESES_JANELA_RETORNO[j])]),
  ) as Record<JanelaRetorno, string>;

  // eventos pendentes (não confirmados) dentro do período usado pelas janelas longas / máxima
  const pendentes = eventos.filter((ev) => ev.status === 'nao_validavel' && ev.dataEvento <= ate);
  const inicioLongo = alvos['10a'] < INICIO_MAXIMA_RETORNOS ? alvos['10a'] : INICIO_MAXIMA_RETORNOS;
  const pendenteEm = (de: string) => pendentes.some((ev) => ev.dataEvento > de);
  const eventoPendente = pendenteEm(inicioLongo);
  if (eventoPendente) flags.add('evento_nao_confirmado');

  const valores: Record<JanelaRetorno, number | null> = {
    '1m': null,
    '12m': null,
    '5a': null,
    '10a': null,
  };
  for (const j of JANELAS_RETORNO) {
    const alvo = alvos[j];
    const i = ultimoAte(pregoes, alvo);
    if (i < 0 || distanciaEmPregoes(pregoes[i].date, alvo) > TOLERANCIA_PREGOES_RETORNO) {
      flags.add(`serie_curta_${j}`);
      continue;
    }
    if (j === '1m' ? pendenteEm(alvo) : eventoPendente) continue;
    const r = preco / ajustar(pregoes[i]) - 1;
    const anos = MESES_JANELA_RETORNO[j] / 12;
    valores[j] = pct(j === '5a' || j === '10a' ? Math.pow(1 + r, 1 / anos) - 1 : r);
  }

  // máxima de fechamento ajustada desde INICIO_MAXIMA_RETORNOS
  const desdeMaxima = pregoes.filter((p) => p.date >= INICIO_MAXIMA_RETORNOS);
  let precoMax: number | null = null;
  let dataMax: string | null = null;
  if (!eventoPendente) {
    for (const p of desdeMaxima) {
      const ajustado = ajustar(p);
      if (precoMax === null || ajustado >= precoMax) {
        precoMax = ajustado;
        dataMax = p.date;
      }
    }
  }
  const distMax = precoMax !== null && precoMax > 0 ? Math.min(0, pct(preco / precoMax - 1)) : null;

  return {
    symbol: e.symbol,
    classe: e.classe,
    asOf: ate,
    preco,
    ret1mPct: valores['1m'],
    ret12mPct: valores['12m'],
    ret5aAaPct: valores['5a'],
    ret10aAaPct: valores['10a'],
    precoMaxAjustado: precoMax,
    distMaxPct: distMax,
    dataMax,
    inicioSerie: (desdeMaxima[0] ?? pregoes[0]).date,
    pregoes: pregoes.length,
    // ordem de FLAGS_RETORNO (estável entre execuções)
    flags: FLAGS_RETORNO.filter((f) => flags.has(f)),
  };
}
