'use client';

/**
 * Seleção do modo "Comparar" do Quadro (Bloco D, fatia D). Guarda {classe, tickers, ativo} no
 * sessionStorage: voltar do Comparador (ou recarregar) mantém o modo e as caixas marcadas; fechar a
 * aba do navegador esquece. Regras:
 * - só uma classe por vez: trocar de aba (Ações | FIIs) limpa a seleção;
 * - no máximo MAX_ATIVOS_COMPARADOR (decisão 12): com o limite, as demais caixas ficam
 *   desabilitadas e o motivo vai para o texto anunciado (aria-live) da bandeja;
 * - "Comparar" a partir de 1 ativo (decisão 13: o Comparador diz "adicione mais um para ver
 *   destaques").
 * O storage pode faltar ou lançar (aba privada, bloqueio): tudo em try/catch, a tela funciona sem.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_ATIVOS_COMPARADOR, ROTAS_BLOCO_D } from '@/services/analiseAtivos/cenarios/contrato';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

export const CHAVE_SELECAO_COMPARAR = 'analise-ativos:comparar-quadro';

/** Mínimo de ativos para abrir o Comparador pela bandeja (decisão 13). */
export const MIN_ATIVOS_BANDEJA = 1;

export interface SelecaoCompararSalva {
  classe: ClasseQuadro;
  tickers: string[];
  /** modo Comparar ligado */
  ativo: boolean;
}

const TICKER_RE = /^[A-Z0-9]{4,12}$/;

/** Lê o que está salvo; qualquer coisa fora do formato vira null. */
export function lerSelecaoSalva(bruto: string | null): SelecaoCompararSalva | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as Partial<SelecaoCompararSalva>;
    if (v.classe !== 'acao' && v.classe !== 'fii') return null;
    const tickers = Array.isArray(v.tickers)
      ? [
          ...new Set(
            v.tickers.filter((t): t is string => typeof t === 'string' && TICKER_RE.test(t)),
          ),
        ]
      : [];
    return {
      classe: v.classe,
      tickers: tickers.slice(0, MAX_ATIVOS_COMPARADOR),
      ativo: v.ativo === true,
    };
  } catch {
    return null;
  }
}

/** Marca ou desmarca; marcar além do limite não faz nada. Mantém a ordem de marcação. */
export function alternarTicker(
  tickers: readonly string[],
  ticker: string,
  max: number = MAX_ATIVOS_COMPARADOR,
): string[] {
  if (tickers.includes(ticker)) return tickers.filter((t) => t !== ticker);
  if (tickers.length >= max) return [...tickers];
  return [...tickers, ticker];
}

/** Bandeja: "Comparar" habilitado com 1 ou mais (decisão 13). */
export function podeComparar(n: number): boolean {
  return n >= MIN_ATIVOS_BANDEJA && n <= MAX_ATIVOS_COMPARADOR;
}

function lerStorage(): SelecaoCompararSalva | null {
  try {
    return lerSelecaoSalva(window.sessionStorage.getItem(CHAVE_SELECAO_COMPARAR));
  } catch {
    return null;
  }
}

function gravarStorage(v: SelecaoCompararSalva): void {
  try {
    if (!v.ativo && v.tickers.length === 0) {
      window.sessionStorage.removeItem(CHAVE_SELECAO_COMPARAR);
    } else {
      window.sessionStorage.setItem(CHAVE_SELECAO_COMPARAR, JSON.stringify(v));
    }
  } catch {
    /* sem storage: a seleção vale só nesta tela */
  }
}

export interface SelecaoComparar {
  /** modo Comparar ligado (caixas + bandeja) */
  ativo: boolean;
  setAtivo: (ativo: boolean) => void;
  /** na ordem em que foram marcados */
  tickers: string[];
  marcado: (ticker: string) => boolean;
  /** caixa desabilitada: limite atingido e este não está marcado */
  desabilitado: (ticker: string) => boolean;
  alternar: (ticker: string) => void;
  limpar: () => void;
  cheio: boolean;
  podeComparar: boolean;
  /** link do Comparador com os tickers nos slots, na ordem marcada */
  href: string;
}

/**
 * @param classe aba atual do Quadro; trocar de aba limpa a seleção.
 * @param habilitado false (recurso desligado) ⇒ modo sempre desligado e nada é lido nem gravado.
 */
export function useSelecaoComparar(classe: ClasseQuadro, habilitado = true): SelecaoComparar {
  const [estado, setEstado] = useState<SelecaoCompararSalva>({ classe, tickers: [], ativo: false });
  const [carregado, setCarregado] = useState(false);

  // sessionStorage só no cliente, depois da hidratação (o SSR não tem storage)
  useEffect(() => {
    if (!habilitado || carregado) return;
    const salvo = lerStorage();
    setCarregado(true);
    if (!salvo) return;
    setEstado(salvo.classe === classe ? salvo : { classe, tickers: [], ativo: salvo.ativo });
  }, [habilitado, carregado, classe]);

  // trocar de aba limpa (o modo continua como estava)
  useEffect(() => {
    setEstado((e) => (e.classe === classe ? e : { classe, tickers: [], ativo: e.ativo }));
  }, [classe]);

  useEffect(() => {
    if (!habilitado || !carregado) return;
    gravarStorage(estado);
  }, [estado, habilitado, carregado]);

  const tickers = useMemo(
    () => (habilitado && estado.classe === classe ? estado.tickers : []),
    [habilitado, estado, classe],
  );
  const ativo = habilitado && estado.ativo;
  const cheio = tickers.length >= MAX_ATIVOS_COMPARADOR;

  const setAtivo = useCallback(
    (a: boolean) => setEstado((e) => ({ ...e, classe, ativo: a })),
    [classe],
  );
  const alternar = useCallback(
    (ticker: string) =>
      setEstado((e) => ({
        classe,
        ativo: e.ativo,
        tickers: alternarTicker(e.classe === classe ? e.tickers : [], ticker),
      })),
    [classe],
  );
  const limpar = useCallback(() => setEstado((e) => ({ ...e, classe, tickers: [] })), [classe]);
  const marcado = useCallback((t: string) => tickers.includes(t), [tickers]);
  const desabilitado = useCallback((t: string) => cheio && !tickers.includes(t), [cheio, tickers]);

  return {
    ativo,
    setAtivo,
    tickers,
    marcado,
    desabilitado,
    alternar,
    limpar,
    cheio,
    podeComparar: podeComparar(tickers.length),
    href: ROTAS_BLOCO_D.comparar(tickers),
  };
}
