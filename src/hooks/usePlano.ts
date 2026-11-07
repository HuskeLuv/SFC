'use client';

import { createContext, useContext } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { ehPlano, temAcesso, type Plano } from '@/lib/planos';
import { ASSINATURA_ME_DESLIGADA, type AssinaturaMe } from '@/types/assinatura';

/**
 * Plano efetivo do usuário logado para o front (assinaturas, ClickUp 86e2zkhe2), lido de
 * GET /api/assinaturas/me.
 *
 * Chave ASSINATURAS_HABILITADAS desligada, rota ausente (404), erro de rede ou resposta estranha:
 * ASSINATURA_ME_DESLIGADA (plano 'adv', habilitado false). Ou seja, sem a chave nenhum cadeado
 * aparece e o app fica igual ao de hoje.
 */
export const PLANO_QUERY_KEY = ['assinaturas', 'me'] as const;

/**
 * Chave ASSINATURAS_HABILITADAS lida no RootLayout (force-dynamic, em tempo de execução) e
 * entregue pelos Providers. Padrão false: fora do provider (testes) e com a chave desligada o
 * usePlano nem chama o /me — zero requisição a mais e nenhuma espera nas páginas, como hoje.
 */
export const AssinaturasChaveContext = createContext<boolean>(false);

let clienteReserva: QueryClient | null = null;
/** Cliente ocioso para quando não há QueryClientProvider (a query fica desligada). */
function obterClienteReserva(): QueryClient {
  clienteReserva ??= new QueryClient();
  return clienteReserva;
}

/** Resposta de /me validada o bastante para as telas (plano conhecido e habilitado booleano). */
function ehAssinaturaMe(v: unknown): v is AssinaturaMe {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return ehPlano(o.plano) && typeof o.habilitado === 'boolean';
}

/**
 * Busca /api/assinaturas/me (com `session_id` na volta do Checkout). Nunca lança: qualquer falha
 * vira ASSINATURA_ME_DESLIGADA.
 */
export async function buscarAssinaturaMe(
  opts: { sessionId?: string | null; signal?: AbortSignal } = {},
): Promise<AssinaturaMe> {
  const qs = opts.sessionId ? `?session_id=${encodeURIComponent(opts.sessionId)}` : '';
  try {
    const res = await fetch(`/api/assinaturas/me${qs}`, {
      credentials: 'include',
      signal: opts.signal,
    });
    if (!res.ok) return ASSINATURA_ME_DESLIGADA;
    const body: unknown = await res.json();
    if (!ehAssinaturaMe(body)) return ASSINATURA_ME_DESLIGADA;
    // Chave desligada no servidor: o plano é sempre 'adv', seja o que for que veio.
    return body.habilitado ? body : { ...ASSINATURA_ME_DESLIGADA, ...body, plano: 'adv' };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return ASSINATURA_ME_DESLIGADA;
  }
}

export interface UsePlanoResultado {
  /** Plano efetivo ('adv' com a chave desligada ou enquanto não houver resposta válida). */
  plano: Plano;
  /** Chave ligada no servidor (só então há cadeados, /planos e Minha assinatura). */
  habilitado: boolean;
  assinatura: AssinaturaMe;
  /** Primeira busca ainda em andamento (os gates esperam para não montar o que vai dar 403). */
  carregando: boolean;
  /** O plano efetivo libera `need`? Sempre true com a chave desligada; false enquanto carrega. */
  libera: (need: Plano) => boolean;
}

export function usePlano(): UsePlanoResultado {
  const chaveLigada = useContext(AssinaturasChaveContext);
  const clienteDoContexto = useContext(QueryClientContext);
  const query = useQuery<AssinaturaMe>(
    {
      queryKey: PLANO_QUERY_KEY,
      queryFn: ({ signal }) => buscarAssinaturaMe({ signal }),
      staleTime: 60_000,
      retry: false,
      enabled: chaveLigada,
    },
    clienteDoContexto ?? obterClienteReserva(),
  );
  const assinatura = (chaveLigada ? query.data : undefined) ?? ASSINATURA_ME_DESLIGADA;
  const habilitado = assinatura.habilitado === true;
  const plano: Plano = habilitado ? assinatura.plano : 'adv';
  const carregando = chaveLigada && query.isPending;
  return {
    plano,
    habilitado,
    assinatura,
    carregando,
    // Com a chave ligada e o /me ainda a caminho, nada é liberado: quem usa `libera` para decidir
    // uma busca (proventos no fluxo, prévia da Saúde, carteira importada) espera a resposta em vez
    // de disparar uma rota que daria 403.
    libera: (need: Plano) => !carregando && (!habilitado || temAcesso(plano, need)),
  };
}
