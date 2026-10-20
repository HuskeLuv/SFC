/**
 * Leitura dos retornos acumulados da cotação para o topo da página do ativo (A6, item 5; fatia C):
 * asset_retornos_cotacao (PK symbol) → RetornosCotacaoApi (AtivoTopoResposta.retornos).
 *
 * montarTopoAtivo só chama com ANALISE_ATIVOS_RETORNOS_HABILITADO e trata falha como null (o topo
 * nunca quebra por causa disto). Sem linha ⇒ null (o card não aparece).
 *
 * Estado por janela (textos em TEXTOS_RETORNOS), sem cor e só preço:
 *  - 'sem_cotacao_recente' ⇒ todas as janelas e a distância da máxima ausentes ('sem_cotacao');
 *  - 'serie_curta_<janela>' ⇒ ausente 'serie_curta' (texto da janela: 'menos de N … neste código');
 *  - 'evento_nao_confirmado' ⇒ 12m/5a/10a e a distância da máxima ausentes com o motivo (o 1m
 *    também, quando o job o deixou nulo pelo mesmo evento);
 *  - valor nulo sem flag (não acontece pelo job) ⇒ ausente 'serie_curta'.
 */
import type { PrismaClient } from '@prisma/client';
import { lerRetornosSimbolo } from '@/services/analiseAtivos/repositorio/retornos';
import { TEXTOS_RETORNOS } from '@/services/analiseAtivos/textosRetornos';
import type { ClasseBr, Estado } from '@/types/analiseAtivosApi';
import {
  JANELAS_RETORNO,
  JANELAS_RETORNO_ANUALIZADAS,
  type JanelaRetorno,
  type MotivoRetorno,
  type RetornosCalculados,
  type RetornosCotacaoApi,
} from '@/types/analiseAtivosComplementos';

const CAMPO_JANELA: Readonly<
  Record<JanelaRetorno, 'ret1mPct' | 'ret12mPct' | 'ret5aAaPct' | 'ret10aAaPct'>
> = {
  '1m': 'ret1mPct',
  '12m': 'ret12mPct',
  '5a': 'ret5aAaPct',
  '10a': 'ret10aAaPct',
};

function ausente(motivo: MotivoRetorno, texto: string): Estado<number> {
  return { estado: 'ausente', motivo, texto };
}

const okOu = (v: number | null, senao: Estado<number>): Estado<number> =>
  typeof v === 'number' && Number.isFinite(v) ? { estado: 'ok', valor: v } : senao;

/** Pura: linha calculada → contrato da tela. */
export function paraRetornosApi(r: RetornosCalculados, classe: ClasseBr): RetornosCotacaoApi {
  const flags = new Set(r.flags);
  const semRecente = flags.has('sem_cotacao_recente');
  const evento = flags.has('evento_nao_confirmado');
  const M = TEXTOS_RETORNOS.motivos;
  const estadoSemCotacao = ausente('sem_cotacao', M.sem_cotacao);
  const estadoEvento = ausente('evento_nao_confirmado', M.evento_nao_confirmado);

  const janelas = JANELAS_RETORNO.map((janela) => {
    const serieCurta = ausente('serie_curta', TEXTOS_RETORNOS.serieCurta[janela]);
    let valor: Estado<number>;
    if (semRecente) valor = estadoSemCotacao;
    else if (flags.has(`serie_curta_${janela}`)) valor = serieCurta;
    else if (evento && (janela !== '1m' || r.ret1mPct === null)) valor = estadoEvento;
    else valor = okOu(r[CAMPO_JANELA[janela]], serieCurta);
    return { janela, valor, anualizado: JANELAS_RETORNO_ANUALIZADAS.includes(janela) };
  });

  const distanciaMaxima: Estado<number> = semRecente
    ? estadoSemCotacao
    : evento
      ? estadoEvento
      : okOu(r.distMaxPct, ausente('serie_curta', TEXTOS_RETORNOS.semDado));
  const maxima =
    distanciaMaxima.estado === 'ok' && r.precoMaxAjustado !== null && r.dataMax
      ? { preco: r.precoMaxAjustado, data: r.dataMax }
      : null;

  return {
    classe,
    ateData: r.asOf,
    janelas,
    distanciaMaxima,
    maxima,
    inicioSerie: r.inicioSerie,
    flags: [...r.flags],
  };
}

export async function lerRetornosAtivo(
  db: PrismaClient,
  ticker: string,
  classe: ClasseBr,
): Promise<RetornosCotacaoApi | null> {
  const r = await lerRetornosSimbolo(db, ticker);
  return r ? paraRetornosApi(r, classe) : null;
}
