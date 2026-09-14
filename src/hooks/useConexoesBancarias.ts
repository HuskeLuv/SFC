'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import type {
  BankAccountDTO,
  BankConnectionDTO,
  BankTransactionDTO,
} from '@/app/api/pluggy/_lib/serializer';

export type { BankAccountDTO, BankConnectionDTO, BankTransactionDTO };

const BASE_URL = '/api/pluggy';

export interface PluggyConfig {
  habilitado: boolean;
  incluiSandbox: boolean;
}

export interface ConnectTokenResposta {
  accessToken: string;
  includeSandbox: boolean;
  products: string[];
}

export interface ExtratoResposta {
  transactions: BankTransactionDTO[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** Erro com o status HTTP — a tela distingue 503 (desligado) e 429 (cooldown). */
export class ConexaoApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function lancarErro(res: Response, fallback: string): Promise<never> {
  const text = await res.text().catch(() => '');
  let message = text;
  try {
    message = (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {}
  throw new ConexaoApiError(message || `${fallback} (${res.status})`, res.status);
}

function invalidarConexoes(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.pluggy.conexoes() });
  queryClient.invalidateQueries({ queryKey: [...queryKeys.pluggy.all, 'extrato'] });
}

/** Flag da integração (menu e página). Cache longo: só muda com restart do servidor. */
export function usePluggyConfig() {
  return useQuery<PluggyConfig, Error>({
    queryKey: queryKeys.pluggy.config(),
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${BASE_URL}/config`, { credentials: 'include', signal });
      if (!res.ok) return { habilitado: false, incluiSandbox: false };
      return (await res.json()) as PluggyConfig;
    },
  });
}

export function useConexoes(enabled = true) {
  return useQuery<BankConnectionDTO[], ConexaoApiError>({
    queryKey: queryKeys.pluggy.conexoes(),
    enabled,
    staleTime: 30_000,
    // Enquanto alguma conexão está sincronizando no Pluggy, re-consulta.
    refetchInterval: (query) =>
      query.state.data?.some((c) => c.status === 'UPDATING') ? 10_000 : false,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${BASE_URL}/connections`, { credentials: 'include', signal });
      if (!res.ok) await lancarErro(res, 'Erro ao carregar as conexões');
      return ((await res.json()) as { connections: BankConnectionDTO[] }).connections;
    },
  });
}

/** Token de 30 min para abrir o widget (itemId = reconectar uma conexão). */
export function useConnectToken() {
  const { csrfFetch } = useCsrf();
  return useMutation<ConnectTokenResposta, ConexaoApiError, { itemId?: string } | void>({
    mutationFn: async (vars) => {
      const res = await csrfFetch(`${BASE_URL}/connect-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars ?? {}),
      });
      if (!res.ok) await lancarErro(res, 'Erro ao preparar a conexão');
      return (await res.json()) as ConnectTokenResposta;
    },
  });
}

/** Depois do widget concluir: registra o item e faz a primeira carga. */
export function useRegistrarConexao() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<BankConnectionDTO, ConexaoApiError, { itemId: string }>({
    mutationFn: async ({ itemId }) => {
      const res = await csrfFetch(`${BASE_URL}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) await lancarErro(res, 'Erro ao registrar a conexão');
      return ((await res.json()) as { connection: BankConnectionDTO }).connection;
    },
    onSuccess: () => invalidarConexoes(queryClient),
  });
}

export function useAtualizarConexao() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<BankConnectionDTO, ConexaoApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await csrfFetch(`${BASE_URL}/connections/${id}/sync`, { method: 'POST' });
      if (!res.ok) await lancarErro(res, 'Erro ao pedir a atualização');
      return ((await res.json()) as { connection: BankConnectionDTO }).connection;
    },
    onSuccess: () => invalidarConexoes(queryClient),
  });
}

export function useExcluirConexao() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<void, ConexaoApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await csrfFetch(`${BASE_URL}/connections/${id}`, { method: 'DELETE' });
      if (!res.ok) await lancarErro(res, 'Erro ao excluir a conexão');
    },
    onSuccess: () => invalidarConexoes(queryClient),
  });
}

export function useExtrato(accountId: string | null, page = 1, limit = 50) {
  return useQuery<ExtratoResposta, ConexaoApiError>({
    queryKey: accountId
      ? queryKeys.pluggy.extrato(accountId, page)
      : [...queryKeys.pluggy.all, 'extrato', 'nenhum'],
    enabled: accountId !== null,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({
        accountId: accountId!,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`${BASE_URL}/transactions?${qs}`, { credentials: 'include', signal });
      if (!res.ok) await lancarErro(res, 'Erro ao carregar o extrato');
      return (await res.json()) as ExtratoResposta;
    },
  });
}
