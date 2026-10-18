'use client';

/**
 * Estado do Comparador NA URL: `?t=WEGE3,ITUB4&janela=10` é a fonte da verdade (compartilhável pelo
 * "Copiar link"; o Comparador não grava nada, rec. 7). A aba vem da classe do 1º ticker (a API
 * decide). Sem tickers, a aba escolhida fica em `?c=fii` (Ações = sem parâmetro). A janela dos
 * critérios fica em `?janela=` (3 | 5 | 10; o padrão 5 não aparece). Trocar de aba limpa a seleção
 * e mantém a janela.
 *
 * As funções puras (ler/escrever/adicionar/remover) são testadas sem React.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { MAX_ATIVOS_COMPARADOR, TICKER_RE } from '@/services/analiseAtivos/cenarios/contrato';
import { ehClasseQuadro, type ClasseQuadro } from '@/types/analiseAtivosApi';
import { ehTickerEua, symbolAnaliseDaSec } from '@/types/analiseAtivosEua';
import { JANELA_PADRAO, ehJanela, type Janela } from '@/types/analiseAtivosCriterios';

export const PARAM_TICKERS = 't';
export const PARAM_CLASSE = 'c';
export const PARAM_JANELA = 'janela';

export interface EstadoComparadorUrl {
  /** tickers válidos do ?t=, maiúsculos, sem repetição, na ordem dada */
  tickers: string[];
  /** aba escolhida sem tickers (?c=); null = não informada */
  classe: ClasseQuadro | null;
  /** janela dos critérios (?janela=); inválida ou ausente = 5 */
  janela: Janela;
}

interface LeitorParams {
  get(nome: string): string | null;
}

export function lerEstadoComparador(params: LeitorParams): EstadoComparadorUrl {
  const tickers: string[] = [];
  for (const bruto of (params.get(PARAM_TICKERS) ?? '').split(',')) {
    const maiusculo = bruto.trim().toUpperCase();
    // Stocks e REITs (fatia C): ticker EUA também (BRK-B → BRK.B); a API decide pela chave EUA
    const t =
      !TICKER_RE.test(maiusculo) && ehTickerEua(maiusculo)
        ? symbolAnaliseDaSec(maiusculo)
        : maiusculo;
    if ((TICKER_RE.test(t) || ehTickerEua(t)) && !tickers.includes(t)) tickers.push(t);
  }
  const c = params.get(PARAM_CLASSE);
  const j = Number(params.get(PARAM_JANELA));
  return {
    tickers,
    classe: ehClasseQuadro(c) ? c : null,
    janela: ehJanela(j) ? j : JANELA_PADRAO,
  };
}

/**
 * Query sem o '?': com tickers, o t= (vírgulas literais, legível); sem, c=fii ou nada. A janela
 * entra no fim só fora do padrão.
 */
export function queryComparador(e: Omit<EstadoComparadorUrl, 'janela'> & { janela?: Janela }) {
  const partes: string[] = [];
  if (e.tickers.length > 0) partes.push(`${PARAM_TICKERS}=${e.tickers.join(',')}`);
  else if (e.classe && e.classe !== 'acao') partes.push(`${PARAM_CLASSE}=${e.classe}`);
  if (e.janela !== undefined && e.janela !== JANELA_PADRAO) {
    partes.push(`${PARAM_JANELA}=${e.janela}`);
  }
  return partes.join('&');
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

/** URL absoluta do link de compartilhamento (os tickers dos slots e a janela). */
export function urlCompartilhavel(
  origem: string,
  caminho: string,
  slots: readonly string[],
  janela: Janela = JANELA_PADRAO,
) {
  const q = queryComparador({ tickers: [...slots], classe: null, janela });
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
    (tickers: string[], classe: ClasseQuadro | null = null) =>
      ir({ tickers, classe, janela: estado.janela }),
    [ir, estado.janela],
  );
  const trocarClasse = useCallback(
    (classe: ClasseQuadro) => ir({ tickers: [], classe, janela: estado.janela }),
    [ir, estado.janela],
  );
  const setJanela = useCallback(
    (janela: Janela) => ir({ tickers: estado.tickers, classe: estado.classe, janela }),
    [ir, estado.tickers, estado.classe],
  );

  return { ...estado, setTickers, trocarClasse, setJanela };
}
