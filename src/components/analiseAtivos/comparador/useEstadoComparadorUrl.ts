'use client';

/**
 * Estado do Comparador NA URL (fatia C): `?t=WEGE3,ITUB4` é a fonte da verdade (compartilhável pelo
 * "Copiar link"); a aba vem da classe do 1º ticker (a API decide). Sem tickers, a aba escolhida fica
 * em `?c=fii` (Ações = sem parâmetro). Trocar de aba limpa a seleção.
 *
 * As funções puras (ler/escrever/adicionar/remover) são testadas sem React.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { MAX_ATIVOS_COMPARADOR, TICKER_RE } from '@/services/analiseAtivos/cenarios/contrato';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

export const PARAM_TICKERS = 't';
export const PARAM_CLASSE = 'c';

export interface EstadoComparadorUrl {
  /** tickers válidos do ?t=, maiúsculos, sem repetição, na ordem dada */
  tickers: string[];
  /** aba escolhida sem tickers (?c=); null = não informada */
  classe: ClasseQuadro | null;
}

interface LeitorParams {
  get(nome: string): string | null;
}

export function lerEstadoComparador(params: LeitorParams): EstadoComparadorUrl {
  const tickers: string[] = [];
  for (const bruto of (params.get(PARAM_TICKERS) ?? '').split(',')) {
    const t = bruto.trim().toUpperCase();
    if (TICKER_RE.test(t) && !tickers.includes(t)) tickers.push(t);
  }
  const c = params.get(PARAM_CLASSE);
  return { tickers, classe: c === 'fii' || c === 'acao' ? c : null };
}

/** Query sem o '?': com tickers, só o t= (vírgulas literais, legível); sem, c=fii ou nada. */
export function queryComparador(e: EstadoComparadorUrl): string {
  if (e.tickers.length > 0) return `${PARAM_TICKERS}=${e.tickers.join(',')}`;
  return e.classe === 'fii' ? `${PARAM_CLASSE}=fii` : '';
}

export function adicionarTicker(
  slots: readonly string[],
  ticker: string,
  max = MAX_ATIVOS_COMPARADOR,
): string[] {
  const t = ticker.toUpperCase();
  if (slots.includes(t) || slots.length >= max) return [...slots];
  return [...slots, t];
}

export function removerTicker(slots: readonly string[], ticker: string): string[] {
  return slots.filter((t) => t !== ticker);
}

/** URL absoluta do link de compartilhamento (só os tickers dos slots). */
export function urlCompartilhavel(origem: string, caminho: string, slots: readonly string[]) {
  const q = queryComparador({ tickers: [...slots], classe: null });
  return `${origem}${caminho}${q ? `?${q}` : ''}`;
}

export function useEstadoComparadorUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chave = params.toString();
  const estado = useMemo(() => lerEstadoComparador(new URLSearchParams(chave)), [chave]);

  const ir = useCallback(
    (e: EstadoComparadorUrl) => {
      const q = queryComparador(e);
      router.replace(`${pathname}${q ? `?${q}` : ''}`, { scroll: false });
    },
    [router, pathname],
  );

  const setTickers = useCallback(
    (tickers: string[], classe: ClasseQuadro | null = null) => ir({ tickers, classe }),
    [ir],
  );
  const trocarClasse = useCallback((classe: ClasseQuadro) => ir({ tickers: [], classe }), [ir]);

  return { ...estado, setTickers, trocarClasse };
}
