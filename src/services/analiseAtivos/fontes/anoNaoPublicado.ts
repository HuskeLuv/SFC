/**
 * Virada do ano nos arquivos anuais da CVM (DFP, ITR, FCA, IPE, Informe Mensal e Trimestral de FII).
 *
 * A CVM só cria o arquivo do ano (ex.: dfp_cia_aberta_2027.zip) quando chega o PRIMEIRO documento
 * daquele ano; antes disso a URL dá 404 (Wayback Machine, backtest de 18/10/2026, item M13). Sem
 * tratamento, a partir de 01/01 os jobs de DFP/ITR/FII/IPE terminariam em 'falha' todo dia (tela com
 * "atualização em atraso" e alerta diário aos admins) — o DFP até ~maio, o ITR até ~abril/maio.
 *
 * Regra: 404 de arquivo do ano CORRENTE (ou futuro) = "ainda não publicado": o job segue (status ok)
 * com um alerta de nível 'aviso'. 404 de ano já passado continua falha (o arquivo existia e sumiu, ou
 * a URL mudou). O COTAHIST diário tem tratamento próprio (b3/sincronizarCotahist).
 */
import { ErroFonte } from '@/services/analiseAtivos/fontes/erros';
import type { AlertaJob } from '@/services/analiseAtivos/tipos';

export const CODIGO_ALERTA_ANO_NAO_PUBLICADO = 'arquivo_ano_nao_publicado';

/** Erro de download com HTTP 404 (ErroFonte 'http_erro'). */
export function ehHttp404(e: unknown): boolean {
  return e instanceof ErroFonte && e.codigo === 'http_erro' && e.httpStatus === 404;
}

/** O arquivo do `ano` pode ainda não existir em `hoje` (AAAA-MM-DD): ano corrente ou futuro. */
export function anoPodeNaoEstarPublicado(ano: number, hoje: string): boolean {
  return ano >= Number(hoje.slice(0, 4));
}

/** 404 do arquivo de um ano que ainda pode não ter sido criado pela CVM. */
export function ehAnoNaoPublicado(e: unknown, ano: number, hoje: string): boolean {
  return ehHttp404(e) && anoPodeNaoEstarPublicado(ano, hoje);
}

/** Alerta do arquivo do ano ainda não publicado (nível aviso: o job termina 'ok'). */
export function alertaAnoNaoPublicado(url: string, ano: number): AlertaJob {
  return {
    codigo: CODIGO_ALERTA_ANO_NAO_PUBLICADO,
    nivel: 'aviso',
    mensagem: `arquivo de ${ano} ainda não publicado pela CVM (HTTP 404): a CVM só cria o arquivo do ano quando chega o primeiro documento`,
    ref: url,
  };
}
