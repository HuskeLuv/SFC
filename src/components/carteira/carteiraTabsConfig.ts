import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Abas de classe da /carteira (PWA fase 1): ids e rótulos IGUAIS aos de sempre, na mesma ordem —
 * os e2e e o desktop usam o nome visível como nome acessível. No celular os chips mostram o mesmo
 * texto (decisão do Wellington, 25/09/2026: sem rótulo curto).
 */

export type CarteiraCategoria =
  | 'reservaEmergencia'
  | 'reservaOportunidade'
  | 'rendaFixaFundos'
  | 'fimFia'
  | 'fiis'
  | 'acoes'
  | 'stocks'
  | 'reits'
  | 'etfs'
  | 'moedasCriptos'
  | 'previdenciaSeguros'
  | 'opcoes'
  | 'imoveisBens';

export interface CarteiraClassTab {
  id: string;
  label: string;
  /** Rótulo curto só visual no celular (não usado: os chips mostram o `label`). */
  mobileLabel?: string;
  /** Chave de `resumo.distribuicao` (null na Carteira Consolidada). */
  categoria: CarteiraCategoria | null;
}

export const CARTEIRA_CLASS_TABS: CarteiraClassTab[] = [
  { id: 'consolidada', label: 'Carteira Consolidada', categoria: null },
  { id: 'reserva-emergencia', label: 'Reserva Emergência', categoria: 'reservaEmergencia' },
  { id: 'reserva-oportunidade', label: 'Reserva Oportunidade', categoria: 'reservaOportunidade' },
  { id: 'renda-fixa', label: 'Renda Fixa', categoria: 'rendaFixaFundos' },
  { id: 'fim-fia', label: 'Fundos', categoria: 'fimFia' },
  { id: 'fiis', label: "FII's", categoria: 'fiis' },
  { id: 'acoes', label: 'Ações', categoria: 'acoes' },
  { id: 'stocks', label: 'Stocks', categoria: 'stocks' },
  { id: 'reit', label: "REIT's", categoria: 'reits' },
  { id: 'etf', label: "ETF's", categoria: 'etfs' },
  { id: 'moedas-criptos', label: 'Moedas, Criptomoedas & outros', categoria: 'moedasCriptos' },
  { id: 'previdencia', label: 'Previdência e Seguros', categoria: 'previdenciaSeguros' },
  { id: 'opcoes', label: 'Opções', categoria: 'opcoes' },
  { id: 'imoveis', label: 'Imóveis & Bens', categoria: 'imoveisBens' },
];

export const DEFAULT_CARTEIRA_CLASS_TAB = 'consolidada';

/** Categoria da alocação → aba (link do nome da classe na tabela de alocação). */
export const CATEGORIA_TO_TAB: Record<string, string> = Object.fromEntries(
  CARTEIRA_CLASS_TABS.filter((t) => t.categoria).map((t) => [t.categoria as string, t.id]),
);

const CLASS_TAB_IDS = new Set(CARTEIRA_CLASS_TABS.map((t) => t.id));

export const isCarteiraClassTab = (id: string | null | undefined): id is string =>
  !!id && CLASS_TAB_IDS.has(id);

// ── Aba na URL (/carteira?aba=acoes) ─────────────────────────────────────────────────────────

/** Parâmetro da aba ativa. Valores válidos: ids de `CARTEIRA_CLASS_TABS` e 'analise'. */
export const CARTEIRA_ABA_PARAM = 'aba';
export const CARTEIRA_ABA_ANALISE = 'analise';

export type CarteiraAba =
  | { main: 'resumo'; tab: string }
  | { main: 'analise'; tab: typeof DEFAULT_CARTEIRA_CLASS_TAB };

/** Lê e VALIDA o `?aba=` (qualquer valor fora da lista é ignorado). */
export function parseCarteiraAba(value: string | null | undefined): CarteiraAba | null {
  if (!value) return null;
  if (value === CARTEIRA_ABA_ANALISE) return { main: 'analise', tab: DEFAULT_CARTEIRA_CLASS_TAB };
  if (isCarteiraClassTab(value)) return { main: 'resumo', tab: value };
  return null;
}

/**
 * URL com o `?aba=` trocado (os outros parâmetros ficam). A aba padrão (Resumo → Carteira
 * Consolidada) tira o parâmetro, para a URL limpa continuar sendo a de sempre.
 */
export function carteiraAbaHref(pathname: string, search: string, aba: string): string {
  const params = new URLSearchParams(search);
  if (!aba || aba === DEFAULT_CARTEIRA_CLASS_TAB) params.delete(CARTEIRA_ABA_PARAM);
  else params.set(CARTEIRA_ABA_PARAM, aba);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Troca o `?aba=` com `router.replace` (decisão do Wellington: sem encher o histórico — Voltar sai
 * da Carteira, não passeia pelas abas). Não faz nada se a URL já está certa.
 */
export function useReplaceCarteiraAba(): (aba: string) => void {
  const router = useRouter();
  return useCallback(
    (aba: string) => {
      if (typeof window === 'undefined') return;
      const { pathname, search } = window.location;
      const href = carteiraAbaHref(pathname, search, aba);
      if (href === `${pathname}${search}`) return;
      router.replace(href, { scroll: false });
    },
    [router],
  );
}
