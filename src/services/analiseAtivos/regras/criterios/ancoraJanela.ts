/**
 * STUB da fatia 0 — CORPO da fatia A. Âncora GLOBAL das janelas (a mesma para todos os ativos):
 * anoFim = ano − 1 a partir do mês params.ancoraAno.mesLiberaAnoAnterior (maio); antes, ano − 2.
 * A janela J cobre anoFim − J + 1 … anoFim ('up' lê também o ano anterior). Assinatura FINAL.
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { Janela } from '@/types/analiseAtivosCriterios';

/** `hoje` em 'AAAA-MM-DD' (data civil UTC, como JobContexto.hoje). */
export function anoFimGlobal(_hoje: string, _params: CriteriaParams): number {
  throw new Error('anoFimGlobal: não implementado (fatia A)');
}

/** Anos exigidos da janela (com o ano anterior quando `comAnterior`, para 'up'). */
export function anosDaJanela(_anoFim: number, _janela: Janela, _comAnterior: boolean): number[] {
  throw new Error('anosDaJanela: não implementado (fatia A)');
}
