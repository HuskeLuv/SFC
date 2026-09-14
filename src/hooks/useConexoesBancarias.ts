'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import type {
  BankAccountDTO,
  BankConnectionDTO,
  BankTransactionDTO,
} from '@/app/api/pluggy/_lib/serializer';
import type { PendenteDTO, AplicarResultado } from '@/services/pluggy/caixaEntrada';

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

export interface RegistroResposta {
  connection: BankConnectionDTO;
  /** true = o banco já estava conectado e a conexão existente foi atualizada. */
  reaproveitada: boolean;
  aviso: string | null;
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
  return useMutation<RegistroResposta, ConexaoApiError, { itemId: string }>({
    mutationFn: async ({ itemId }) => {
      const res = await csrfFetch(`${BASE_URL}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) await lancarErro(res, 'Erro ao registrar a conexão');
      return (await res.json()) as RegistroResposta;
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

// ---------------------------------------------------------------------------
// Caixa de entrada (Fase 2c)
// ---------------------------------------------------------------------------

export type { PendenteDTO, AplicarResultado };

export interface CaixaEntradaResposta {
  pendentes: PendenteDTO[];
  total: number;
  page: number;
  totalPages: number;
}

/** Linha do fluxo selecionável: "Despesas Fixas › Habitação › Conta de energia". */
export interface OpcaoLinha {
  itemId: string;
  rotulo: string;
  tipo: string;
}

interface GrupoEstrutura {
  id: string;
  name: string;
  type: string;
  items?: { id: string; name: string; hidden?: boolean }[];
  children?: GrupoEstrutura[];
}

export function achatarEstrutura(grupos: GrupoEstrutura[]): OpcaoLinha[] {
  const out: OpcaoLinha[] = [];
  const walk = (g: GrupoEstrutura, caminho: string[]) => {
    const atual = [...caminho, g.name];
    // grupo de Investimentos não recebe transações do banco (a Carteira é a fonte)
    if (g.type === 'investimento' || g.type === 'saldo') return;
    for (const it of g.items ?? []) {
      if (it.hidden) continue;
      out.push({ itemId: it.id, rotulo: [...atual.slice(1), it.name].join(' › '), tipo: g.type });
    }
    for (const c of g.children ?? []) walk(c, atual);
  };
  for (const g of grupos) walk(g, []);
  return out;
}

function invalidarFluxo(queryClient: ReturnType<typeof useQueryClient>): void {
  invalidarConexoes(queryClient);
  queryClient.invalidateQueries({ queryKey: queryKeys.pluggy.caixaEntrada() });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.historicoAlteracoes.all });
}

export function useCaixaEntrada(page = 1, enabled = true) {
  return useQuery<CaixaEntradaResposta, ConexaoApiError>({
    queryKey: [...queryKeys.pluggy.caixaEntrada(), page],
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${BASE_URL}/caixa-entrada?page=${page}&limit=50`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) await lancarErro(res, 'Erro ao carregar a Caixa de entrada');
      return (await res.json()) as CaixaEntradaResposta;
    },
  });
}

/** Linhas do fluxo do usuário (template + personalizações) para o seletor. */
export function useLinhasFluxo(enabled = true) {
  return useQuery<OpcaoLinha[], ConexaoApiError>({
    queryKey: [...queryKeys.cashflow.all, 'structure', 'linhas'],
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/cashflow/structure', { credentials: 'include', signal });
      if (!res.ok) await lancarErro(res, 'Erro ao carregar as linhas do fluxo');
      return achatarEstrutura((await res.json()) as GrupoEstrutura[]);
    },
  });
}

function mutacaoLote<TVars, TResp>(caminho: string, erro: string) {
  return function useMutacao() {
    const { csrfFetch } = useCsrf();
    const queryClient = useQueryClient();
    return useMutation<TResp, ConexaoApiError, TVars>({
      mutationFn: async (vars) => {
        const res = await csrfFetch(`${BASE_URL}/caixa-entrada/${caminho}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vars),
        });
        if (!res.ok) await lancarErro(res, erro);
        return (await res.json()) as TResp;
      },
      onSuccess: () => invalidarFluxo(queryClient),
    });
  };
}

export const useAplicarTransacoes = mutacaoLote<
  { aplicacoes: Array<{ id: string; itemId: string }> },
  AplicarResultado
>('aplicar', 'Erro ao lançar no fluxo de caixa');
export const useIgnorarTransacoes = mutacaoLote<{ ids: string[] }, { ignoradas: number }>(
  'ignorar',
  'Erro ao ignorar',
);
export const useDesaplicarTransacoes = mutacaoLote<{ ids: string[] }, AplicarResultado>(
  'desaplicar',
  'Erro ao tirar do fluxo de caixa',
);

// ---------------------------------------------------------------------------
// Investimentos e empréstimos importados (Fase 3)
// ---------------------------------------------------------------------------

export interface InvestimentoImportadoDTO {
  id: string;
  banco: string;
  type: string;
  subtype: string | null;
  name: string;
  code: string | null;
  balance: number;
  quantity: number | null;
  amountOriginal: number | null;
  rate: number | null;
  rateType: string | null;
  dueDate: string | null;
  issuer: string | null;
  status: string | null;
  ativo: boolean;
  assetId: string | null;
  portfolioId: string | null;
  importStatus: string;
  importError: string | null;
  importedAt: string | null;
}

export interface EmprestimoImportadoDTO {
  id: string;
  banco: string;
  productName: string;
  type: string | null;
  contractAmount: number | null;
  outstanding: number | null;
  nextInstallmentAmount: number | null;
  cet: number | null;
  amortization: string | null;
  totalInstallments: number | null;
  paidInstallments: number | null;
  dueDate: string | null;
  ativo: boolean;
  dividaId: string | null;
  importStatus: string;
  importError: string | null;
  importedAt: string | null;
}

export interface CarteiraImportadaResposta {
  investimentos: InvestimentoImportadoDTO[];
  emprestimos: EmprestimoImportadoDTO[];
}

export interface ImportacaoResultadoDTO {
  importados: number;
  vinculados: number;
  semSuporte: number;
  ignorados: number;
  erros: number;
}

function invalidarCarteira(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.pluggy.carteira() });
  invalidatePortfolioDerivedQueries(queryClient);
  queryClient.invalidateQueries({ queryKey: queryKeys.dividas.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
}

export function useCarteiraImportada(enabled = true) {
  return useQuery<CarteiraImportadaResposta, ConexaoApiError>({
    queryKey: queryKeys.pluggy.carteira(),
    enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${BASE_URL}/carteira`, { credentials: 'include', signal });
      if (!res.ok) await lancarErro(res, 'Erro ao carregar investimentos e empréstimos importados');
      return (await res.json()) as CarteiraImportadaResposta;
    },
  });
}

export function useImportarCarteira() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<ImportacaoResultadoDTO, ConexaoApiError, void>({
    mutationFn: async () => {
      const res = await csrfFetch(`${BASE_URL}/carteira/importar`, { method: 'POST' });
      if (!res.ok) await lancarErro(res, 'Erro ao importar');
      return (await res.json()) as ImportacaoResultadoDTO;
    },
    onSuccess: () => invalidarCarteira(queryClient),
  });
}

export function useIgnorarInvestimento() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  return useMutation<void, ConexaoApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await csrfFetch(`${BASE_URL}/carteira/ignorar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) await lancarErro(res, 'Erro ao ignorar');
    },
    onSuccess: () => invalidarCarteira(queryClient),
  });
}
