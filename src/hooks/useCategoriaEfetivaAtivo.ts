'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  CATEGORIA_API_PATH,
  CAMPO_SECAO_NA_LINHA,
  rotuloCategoria,
  rotuloSubgrupo,
  type CategoriaAtivoResponse,
  type CategoriaMovivel,
} from '@/lib/carteiraMover';

/** assetId de catálogo (os do assistente como 'PERSONALIZADO', 'REIT-MANUAL'… não têm aba). */
const ID_DE_CATALOGO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isAssetIdDeCatalogo = (assetId: string | null | undefined): assetId is string =>
  !!assetId && ID_DE_CATALOGO.test(assetId);

type LinhaAba = { id?: string; ticker?: string; planejado?: boolean } & Record<string, unknown>;
type DadosAba = { secoes?: Array<{ ativos?: LinhaAba[] } & Record<string, unknown>> };

export interface SecaoNaCarteira {
  categoria: CategoriaMovivel;
  subgrupo: string;
  /** "FII's › Infra". */
  rotulo: string;
  /** "Infra". */
  rotuloSecao: string;
  planejado: boolean;
}

export interface CategoriaEfetivaAtivo {
  /** Aba efetiva do ativo (override do usuário ou aba base); null = fora das abas movíveis. */
  categoria: CategoriaMovivel | null;
  /** O usuário escolheu a aba (difere da aba base). */
  override: boolean;
  /** Ainda buscando a categoria (a prévia de caixa esconde o nome da aba enquanto isso). */
  carregando: boolean;
  /** Ainda buscando a seção atual na aba. */
  carregandoSecao: boolean;
  /** Onde o ativo está hoje na Carteira, se o usuário já o tem (posição ou planejado). */
  secaoAtual: SecaoNaCarteira | null;
}

/**
 * Categoria efetiva de um ativo do catálogo para o usuário (GET /api/carteira/mover/categoria)
 * e, com o `ticker`, a seção em que ele já está na Carteira — lida do JSON da aba
 * (`queryKeys.assets.type`, a mesma cache das tabelas). Usada pelo assistente de compra: prévia
 * de caixa pela aba efetiva e "Infra · definida por você".
 */
export function useCategoriaEfetivaAtivo(
  assetId: string | null | undefined,
  ticker?: string | null,
): CategoriaEfetivaAtivo {
  const habilitado = isAssetIdDeCatalogo(assetId);
  const categoriaQ = useQuery<CategoriaAtivoResponse>({
    queryKey: queryKeys.carteiraMover.categoria(assetId ?? ''),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ assetId: assetId ?? '' });
      const response = await fetch(`/api/carteira/mover/categoria?${params.toString()}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao consultar a aba do ativo');
      return response.json();
    },
    enabled: habilitado,
    staleTime: 30_000,
    retry: false,
  });

  const categoria = categoriaQ.data?.categoria ?? null;
  const path = categoria ? CATEGORIA_API_PATH[categoria] : null;
  const tickerNorm = (ticker ?? '').trim().toUpperCase();
  const abaQ = useQuery<DadosAba>({
    queryKey: queryKeys.assets.type(path ?? ''),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/carteira/${path}`, { credentials: 'include', signal });
      if (!response.ok) throw new Error('Erro ao carregar a aba');
      return response.json();
    },
    enabled: !!path && !!tickerNorm,
    retry: false,
  });

  let secaoAtual: SecaoNaCarteira | null = null;
  const campo = categoria ? CAMPO_SECAO_NA_LINHA[categoria] : null;
  if (categoria && campo && tickerNorm && abaQ.data?.secoes) {
    for (const secao of abaQ.data.secoes) {
      const linha = secao.ativos?.find((a) => (a.ticker ?? '').toUpperCase() === tickerNorm);
      if (!linha) continue;
      const valor = linha[campo] ?? secao[campo];
      if (typeof valor !== 'string') break;
      const rotuloSecao = rotuloSubgrupo(categoria, valor) ?? valor;
      secaoAtual = {
        categoria,
        subgrupo: valor,
        rotulo: `${rotuloCategoria(categoria)} › ${rotuloSecao}`,
        rotuloSecao,
        planejado: !!linha.planejado,
      };
      break;
    }
  }

  return {
    categoria,
    override: !!categoriaQ.data?.override,
    carregando: habilitado && categoriaQ.isPending,
    carregandoSecao: !!path && !!tickerNorm && abaQ.isPending,
    secaoAtual,
  };
}

export default useCategoriaEfetivaAtivo;
