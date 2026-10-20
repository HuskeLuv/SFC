/**
 * Seção "Imóveis e composição do fundo" da página do FII (A6, itens 1 e 2; fatia A).
 * GET /api/analise-ativos/ativos/[ticker]/imoveis-fii → ImoveisFiiResposta. Key em
 * queryKeys.analiseAtivos.imoveisFii (sob 'ativo': cai junto com o ativo). Mesmo tempo dos blocos
 * de análise (30 min; dado de informe trimestral/mensal); não repete 4xx (404 = chave desligada,
 * ação ou FII sem informe).
 */
import { useQuery } from '@tanstack/react-query';
import { ErroAnalise, retryAnalise, TEMPOS_ANALISE } from '@/hooks/useAnaliseAtivos';
import { queryKeys } from '@/lib/queryKeys';
import { ROTAS_COMPLEMENTOS, type ImoveisFiiResposta } from '@/types/analiseAtivosComplementos';

async function buscarImoveisFii(ticker: string, signal?: AbortSignal): Promise<ImoveisFiiResposta> {
  const res = await fetch(ROTAS_COMPLEMENTOS.imoveisFii(ticker), {
    credentials: 'include',
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ErroAnalise(
      body?.error ?? `Erro ao carregar os imóveis do fundo (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as ImoveisFiiResposta;
}

export function useImoveisFii(ticker: string, opts: { enabled?: boolean } = {}) {
  return useQuery<ImoveisFiiResposta, Error>({
    queryKey: queryKeys.analiseAtivos.imoveisFii(ticker),
    staleTime: TEMPOS_ANALISE.analise,
    retry: retryAnalise,
    enabled: (opts.enabled ?? true) && ticker.length > 0,
    queryFn: ({ signal }) => buscarImoveisFii(ticker, signal),
  });
}
