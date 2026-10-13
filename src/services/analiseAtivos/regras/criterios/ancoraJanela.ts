/**
 * Âncora GLOBAL das janelas dos Filtros de Fundamentos (a mesma para todos os ativos, spec §4.1):
 * anoFim = ano − 1 a partir do mês params.ancoraAno.mesLiberaAnoAnterior (maio: as DFPs do ano
 * anterior já saíram); antes, ano − 2. A janela J cobre anoFim − J + 1 … anoFim; 'up' lê também o
 * ano anterior (J + 1 valores, J comparações). Funções puras.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { Janela } from '@/types/analiseAtivosCriterios';

/** `hoje` em 'AAAA-MM-DD' (data civil UTC, como JobContexto.hoje). */
export function anoFimGlobal(hoje: string, params: Pick<CriteriaParams, 'ancoraAno'>): number {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`anoFimGlobal: data inválida '${hoje}'`);
  }
  return mes >= params.ancoraAno.mesLiberaAnoAnterior ? ano - 1 : ano - 2;
}

/** Primeiro ano da janela (sem o ano anterior do 'up'). */
export function anoInicioJanela(anoFim: number, janela: Janela): number {
  return anoFim - janela + 1;
}

/** Anos exigidos da janela, em ordem (com o ano anterior quando `comAnterior`, para 'up'). */
export function anosDaJanela(anoFim: number, janela: Janela, comAnterior: boolean): number[] {
  const inicio = anoInicioJanela(anoFim, janela) - (comAnterior ? 1 : 0);
  const out: number[] = [];
  for (let a = inicio; a <= anoFim; a++) out.push(a);
  return out;
}
