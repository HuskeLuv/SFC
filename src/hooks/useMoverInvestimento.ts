'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import {
  CATEGORIA_API_PATH,
  abaIdDaCategoria,
  isCategoriaMovivel,
  rotuloCategoria,
  rotuloSubgrupo,
  type CategoriaMovivel,
  type MoverInvestimentoInput,
  type MoverOpcoesResponse,
  type MoverPosicaoAba,
  type MoverResponse,
} from '@/lib/carteiraMover';
import {
  isMoverAlvoCompleto,
  type MoverAlvo,
  type MoverAlvoRef,
  type MoverParams,
  type UseMoverInvestimento,
} from '@/types/carteiraMover';
import {
  moverLinhaEntreSecoes,
  removerLinha,
  type DadosAba,
} from '@/components/carteira/mover/moverOptimistic';
import { mostrarToastMover } from '@/components/carteira/mover/moverToast';
import { CARTEIRA_ABA_PARAM } from '@/components/carteira/carteiraTabsConfig';

/**
 * Evento disparado por "Ver em <aba>". Quem mostra as abas (CarteiraResumo) pode ouvir, trocar
 * a aba e chamar `preventDefault()`; sem ninguém ouvindo, a página navega para /carteira?aba=.
 */
export const EVENTO_VER_ABA = 'mf:carteira:ver-aba';

export function irParaAbaDaCarteira(abaId: string) {
  if (typeof window === 'undefined') return;
  const evento = new CustomEvent(EVENTO_VER_ABA, { detail: { abaId }, cancelable: true });
  const tratado = !window.dispatchEvent(evento);
  if (!tratado) window.location.assign(`/carteira?${CARTEIRA_ABA_PARAM}=${abaId}`);
}

/** Erro do POST /api/carteira/mover (status 4xx = recusa com motivo; sem status = rede). */
export class MoverErro extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MoverErro';
    this.status = status;
  }
}

/** Realce da linha no destino depois do sucesso (protótipo D7). */
export const REALCE_MS = 1600;

type Variaveis =
  | { acao: 'mover'; alvo: MoverAlvo | MoverAlvoRef; categoria: CategoriaMovivel; subgrupo: string }
  | { acao: 'restaurar'; alvo: MoverAlvo | MoverAlvoRef };

interface Contexto {
  chave?: readonly unknown[];
  anterior?: unknown;
}

export interface UseMoverInvestimentoOptions {
  /**
   * Toast de erro com "Tentar de novo" (padrão: sim). O diálogo e o painel do celular desligam:
   * eles mostram o erro dentro deles, com a escolha preservada.
   */
  toastErro?: boolean;
  /** Página do ativo: o aviso de sucesso traz "Ver na Carteira" (em vez de "Ver em <aba>"). */
  verNaCarteira?: boolean;
}

export interface UseMoverInvestimentoResult extends UseMoverInvestimento {
  /** id da linha que acabou de chegar (realce de 1,6s; troca só de seção). */
  realceId?: string;
}

const onde = (categoria: string, subgrupo: string | null | undefined): string => {
  const aba = rotuloCategoria(categoria as CategoriaMovivel);
  const secao = isCategoriaMovivel(categoria) ? rotuloSubgrupo(categoria, subgrupo) : null;
  return secao ? `${aba} › ${secao}` : aba;
};

const opcoesNoCache = (queryClient: QueryClient, alvo: MoverAlvo | MoverAlvoRef) =>
  queryClient.getQueryData<MoverOpcoesResponse>(queryKeys.carteiraMover.opcoes(alvo.tipo, alvo.id));

const rotuloDoAlvo = (queryClient: QueryClient, alvo: MoverAlvo | MoverAlvoRef): string =>
  (isMoverAlvoCompleto(alvo) ? alvo.label : opcoesNoCache(queryClient, alvo)?.item.ticker) ||
  'O ativo';

/** Onde o item está antes da mutação (texto do erro: "Ele continua em …"). */
const ondeEstava = (queryClient: QueryClient, alvo: MoverAlvo | MoverAlvoRef): string | null => {
  if (isMoverAlvoCompleto(alvo)) {
    return `${rotuloCategoria(alvo.categoria)} › ${rotuloSubgrupo(alvo.categoria, alvo.secaoAtual) ?? alvo.secaoAtual}`;
  }
  const atual = opcoesNoCache(queryClient, alvo)?.atual;
  if (!atual) return null;
  return atual.subgrupoLabel
    ? `${rotuloCategoria(atual.categoria)} › ${atual.subgrupoLabel}`
    : rotuloCategoria(atual.categoria);
};

async function postMover(
  csrfFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  body: MoverInvestimentoInput,
): Promise<MoverResponse> {
  let response: Response;
  try {
    response = await csrfFetch('/api/carteira/mover', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new MoverErro('Sem conexão');
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new MoverErro(
      typeof json?.error === 'string' ? json.error : 'Erro ao mover',
      response.status,
    );
  }
  return json as MoverResponse;
}

/**
 * Mover um item da Carteira para outra seção ou aba (POST /api/carteira/mover), com:
 * - atualização otimista do cache da aba de origem (mesma aba: a linha muda de seção a 60%,
 *   "Movendo…"; outra aba: sai da origem) e rollback no erro;
 * - aviso de sucesso com Desfazer (8s; Ctrl/Cmd+Z) e "Ver em <aba>" quando a aba muda;
 * - invalidação das caches derivadas da carteira, do histórico e das opções no fim.
 *
 * `mover`/`restaurar` rejeitam no erro (quem chama decide se mostra algo além do toast).
 */
export function useMoverInvestimento(
  options: UseMoverInvestimentoOptions = {},
): UseMoverInvestimentoResult {
  const { toastErro = true, verNaCarteira = false } = options;
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [realceId, setRealceId] = useState<string | undefined>();
  const realceTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(realceTimer.current), []);

  const invalidarTudo = useCallback(() => {
    invalidatePortfolioDerivedQueries(queryClient);
    void queryClient.invalidateQueries({ queryKey: queryKeys.historicoAlteracoes.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.carteiraMover.all });
  }, [queryClient]);

  const desfazer = useCallback(
    async (historicoId: string, rotulo: string, origem: MoverPosicaoAba) => {
      try {
        const response = await csrfFetch(`/api/historico-alteracoes/${historicoId}/undo`, {
          method: 'POST',
          credentials: 'include',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof body?.error === 'string' ? body.error : 'Não foi possível desfazer',
          );
        }
        mostrarToastMover({
          tipo: 'info',
          mensagem: `Movimento desfeito. ${rotulo} voltou para ${onde(origem.categoria, origem.subgrupo)}.`,
        });
      } catch (error: unknown) {
        mostrarToastMover({
          tipo: 'erro',
          mensagem:
            error instanceof Error && error.message
              ? `Não foi possível desfazer: ${error.message}`
              : 'Não foi possível desfazer.',
        });
      } finally {
        invalidarTudo();
      }
    },
    [csrfFetch, invalidarTudo],
  );

  const mutation = useMutation<MoverResponse, Error, Variaveis, Contexto>({
    // Offline, o padrão ('online') PAUSA a mutação: o sheet ficava em "Movendo…" sem saída e o
    // POST saía sozinho quando a conexão voltava. 'always' deixa o fetch falhar (erro de rede).
    networkMode: 'always',
    mutationFn: (vars) =>
      postMover(
        csrfFetch,
        vars.acao === 'mover'
          ? {
              acao: 'mover',
              tipo: vars.alvo.tipo,
              id: vars.alvo.id,
              categoria: vars.categoria,
              subgrupo: vars.subgrupo,
            }
          : { acao: 'restaurar', tipo: vars.alvo.tipo, id: vars.alvo.id },
      ),
    onMutate: async (vars) => {
      setPendingId(vars.alvo.id);
      const { alvo } = vars;
      if (!isMoverAlvoCompleto(alvo)) return {};

      let destino: { categoria: CategoriaMovivel; subgrupo: string | null } | null = null;
      if (vars.acao === 'mover') destino = { categoria: vars.categoria, subgrupo: vars.subgrupo };
      else {
        const original = opcoesNoCache(queryClient, alvo)?.original;
        if (original) destino = { categoria: original.categoria, subgrupo: original.subgrupo };
      }
      if (!destino) return {};

      const chave = queryKeys.assets.type(CATEGORIA_API_PATH[alvo.categoria]);
      await queryClient.cancelQueries({ queryKey: chave });
      const anterior = queryClient.getQueryData(chave);
      if (anterior && typeof anterior === 'object' && 'secoes' in anterior) {
        const dados = anterior as DadosAba;
        const novo =
          destino.categoria === alvo.categoria && destino.subgrupo
            ? moverLinhaEntreSecoes(dados, alvo.categoria, alvo.id, destino.subgrupo)
            : removerLinha(dados, alvo.id);
        queryClient.setQueryData(chave, novo);
      }
      return { chave, anterior };
    },
    onError: (error, vars, ctx) => {
      if (ctx?.chave) queryClient.setQueryData(ctx.chave, ctx.anterior);
      if (!toastErro) return;
      const rotulo = rotuloDoAlvo(queryClient, vars.alvo);
      const estava = ondeEstava(queryClient, vars.alvo);
      const recusa = error instanceof MoverErro && !!error.status && error.status < 500;
      const verbo = vars.acao === 'mover' ? 'mover' : 'voltar';
      mostrarToastMover({
        tipo: 'erro',
        mensagem:
          `Não foi possível ${verbo} ${rotulo}${recusa ? `: ${error.message}` : ''}.` +
          (estava ? ` Ele continua em ${estava}.` : ''),
        tentarDeNovo: recusa
          ? undefined
          : () => {
              mutation.mutateAsync(vars).catch(() => {});
            },
      });
    },
    onSuccess: (resultado, vars) => {
      if (resultado.noop) return;
      const rotulo = rotuloDoAlvo(queryClient, vars.alvo);
      const { origem, destino, objetivoZerado, historicoId } = resultado;
      const mesmaAba = origem.categoria === destino.categoria;
      const objetivo = objetivoZerado ? ' Objetivo voltou a 0%.' : '';
      const mensagem =
        vars.acao === 'restaurar'
          ? `${rotulo} voltou para ${onde(destino.categoria, destino.subgrupo)}.${objetivo}`
          : mesmaAba
            ? `${rotulo} movido para ${rotuloSubgrupo(destino.categoria, destino.subgrupo) ?? destino.subgrupo}.`
            : `${rotulo} movido para ${onde(destino.categoria, destino.subgrupo)}.${objetivo}`;
      const abaId = abaIdDaCategoria(destino.categoria);
      mostrarToastMover({
        tipo: 'ok',
        mensagem,
        desfazer: historicoId ? () => void desfazer(historicoId, rotulo, origem) : undefined,
        ver: verNaCarteira
          ? { label: 'Ver na Carteira', onClick: () => irParaAbaDaCarteira(abaId) }
          : mesmaAba
            ? undefined
            : {
                label: `Ver em ${rotuloCategoria(destino.categoria)}`,
                onClick: () => irParaAbaDaCarteira(abaId),
              },
      });
      if (mesmaAba) {
        window.clearTimeout(realceTimer.current);
        setRealceId(vars.alvo.id);
        realceTimer.current = window.setTimeout(() => setRealceId(undefined), REALCE_MS);
      }
    },
    onSettled: () => {
      setPendingId(undefined);
      invalidarTudo();
    },
  });

  const { mutateAsync } = mutation;

  const mover = useCallback(
    ({ alvo, categoria, subgrupo }: MoverParams) =>
      mutateAsync({ acao: 'mover', alvo, categoria, subgrupo }),
    [mutateAsync],
  );

  const restaurar = useCallback(
    (alvo: MoverAlvo | MoverAlvoRef) => mutateAsync({ acao: 'restaurar', alvo }),
    [mutateAsync],
  );

  return { mover, restaurar, isPending: mutation.isPending, pendingId, realceId };
}

export default useMoverInvestimento;
