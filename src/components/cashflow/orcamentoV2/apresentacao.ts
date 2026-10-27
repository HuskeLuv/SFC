/**
 * Peças de apresentação do Orçamento v2 (desktop): tom visual por status, formatação pt-BR e os
 * rótulos de mês. Nada aqui calcula status ou regra — tudo isso chega pronto no payload do GET v2.
 */
import type { StatusOrcamento } from '@/lib/orcamento/regras';
import type { TomOrcamento } from '@/lib/orcamento/tons';
import { formatBRL, formatNumber } from '@/utils/format';
import type { AnoMes, CategoriaV2 } from '@/types/orcamentoV2';

/** Status do payload → tom de `lib/orcamento/tons` (desenho técnico §8). */
export const TOM_DO_STATUS: Record<StatusOrcamento, TomOrcamento> = {
  ok: 'ok',
  warn: 'atencao',
  bad: 'estourou',
  none: 'neutro',
};

/** Etiqueta de status da subcategoria (só os que pedem ação). */
export const ETIQUETA_STATUS: Partial<Record<StatusOrcamento, string>> = {
  bad: 'estouro',
  warn: 'à frente do ritmo',
};

export const MESES_LONGOS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

/** `{2026, 9}` → "set/26" (mês 1–12). */
export const mesCurto = ({ ano, mes }: AnoMes): string =>
  `${MESES_CURTOS[mes - 1]}/${String(ano).slice(-2)}`;

/** `{2026, 10}` → "Outubro 2026" (mês 1–12). */
export const mesLongo = ({ ano, mes }: AnoMes): string => `${MESES_LONGOS[mes - 1]} ${ano}`;

/** Número pt-BR com 2 casas, sem "R$" (colunas da tabela). */
export const num = (n: number): string => formatNumber(n, 2);

/** Percentual pt-BR com `casas` casas ("75,1%"); `null` → "—". */
export const pct = (n: number | null, casas = 1): string =>
  n === null ? '—' : `${formatNumber(n, casas)}%`;

/** Distância do traço (em fração) abaixo da qual o % consumido ganha uma casa decimal. */
export const FAIXA_DECIMAL_RITMO = 0.01;

/**
 * % consumido da coluna/cartão: 0 casas, ou 1 casa quando está a menos de 1 p.p. do traço do
 * ritmo num período em andamento (ritmo < 1). Sem isso, 87,0% (azul) e 87,2% (laranja, já
 * passou do traço) apareciam os dois como "87%" com cores diferentes (QA 27/10).
 */
export function textoConsumido(consumido: number | null, ritmo: number): string {
  if (consumido === null) return '—';
  const perto = ritmo < 1 && Math.abs(consumido - ritmo) < FAIXA_DECIMAL_RITMO;
  return `${formatNumber(consumido * 100, perto ? 1 : 0)}%`;
}

/** Diferença (orçado − realizado): "—" se zero, sinal "−" se negativa. */
export function textoDiferenca(d: number): { texto: string; negativa: boolean } {
  if (Math.abs(d) < 0.005) return { texto: '—', negativa: false };
  return { texto: `${d < 0 ? '−' : ''}${num(Math.abs(d))}`, negativa: d < 0 };
}

/** "1 subcategoria" / "5 subcategorias". */
export const plural = (n: number, um: string, varios: string): string =>
  `${n} ${n === 1 ? um : varios}`;

/** Texto do tooltip Lançado | Consolidado (P1; T30 revisto no Apêndice C do desenho). */
/** Ajuda do KPI "Disponível" (QA 27/10: "Disponível R$ 67" ao lado de 4 estouros intrigava). */
export const TEXTO_DISPONIVEL =
  'Sobra do orçado total (orçado − realizado). O que uma subcategoria passou do orçado é compensado pela folga das outras.';

/**
 * Quanto as subcategorias em estouro passaram do orçado (inclui gasto sem orçado), e quantas são.
 * Soma só as linhas 'bad': dentro da tolerância de arredondamento não conta.
 */
export function excessoDoOrcado(categorias: CategoriaV2[]): { valor: number; qtd: number } {
  let valor = 0;
  let qtd = 0;
  for (const c of categorias)
    for (const s of c.subcategorias)
      if (s.status === 'bad') {
        valor += Math.max(0, s.realizado - s.orcado);
        qtd += 1;
      }
  return { valor: Math.round(valor * 100) / 100, qtd };
}

/** "R$ 425,00 acima do orçado em 4 subcategorias" (null sem estouro). */
export function textoExcesso(categorias: CategoriaV2[]): string | null {
  const { valor, qtd } = excessoDoOrcado(categorias);
  if (qtd === 0) return null;
  return `${formatBRL(valor)} acima do orçado em ${plural(qtd, 'subcategoria', 'subcategorias')}`;
}

export const TEXTO_FONTE_P1 =
  'Lançado: tudo o que está no Fluxo do mês. Consolidado: só valores marcados como Pago/Recebido';
