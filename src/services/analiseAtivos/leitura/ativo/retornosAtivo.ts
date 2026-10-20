/**
 * Leitura dos retornos acumulados da cotação para o topo da página do ativo (A6, item 5):
 * asset_retornos_cotacao (PK symbol) → RetornosCotacaoApi (AtivoTopoResposta.retornos).
 *
 * DONO: fatia C (docs/analise-ativos/fundamentei-trazer/desenho.json). Na fatia 0 é STUB: devolve
 * null (o card não aparece) sem tocar no banco. montarTopoAtivo só chama com
 * ANALISE_ATIVOS_RETORNOS_HABILITADO e trata falha como null (o topo nunca quebra por causa disto).
 * A fatia C troca o corpo mantendo a assinatura: Estado por janela (serie_curta / evento_nao_confirmado
 * / sem_cotacao, textos em TEXTOS_RETORNOS), sem cor, só preço.
 */
import type { PrismaClient } from '@prisma/client';
import type { ClasseBr } from '@/types/analiseAtivosApi';
import type { RetornosCotacaoApi } from '@/types/analiseAtivosComplementos';

export async function lerRetornosAtivo(
  _db: PrismaClient,
  _ticker: string,
  _classe: ClasseBr,
): Promise<RetornosCotacaoApi | null> {
  return null;
}
