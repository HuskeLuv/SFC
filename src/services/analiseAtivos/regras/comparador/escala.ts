/**
 * Mini-gráficos do Comparador (Bloco D, fatia C) — PURO.
 *
 * Base 100 nos anos FECHADOS (até 10), na MESMA escala para todos os ativos:
 *  - Ações: lucro líquido (serie10a da linha do Quadro). Ano com a escala dos demonstrativos em
 *    conferência ('fundamentos_escala@ano', política 'ocultar') = sem ponto, marcado em conferência.
 *  - FIIs: VP por cota no fim do ano ÷ fatorCotasApos (base de cotas de hoje, sem o salto do
 *    desdobramento). Anos com salto per-share (salto_acoes_sem_evento / dados_incompletos) = null.
 *  - Base = 1º ano com valor > 0; prejuízo fica abaixo de zero; anos antes da base = null.
 *  - Escala: min = min(mínimo global, 100), max = máximo global (nunca abaixo de 100).
 *  - Menos de 3 pontos ⇒ 'histórico insuficiente'.
 */
import { fatorCotasApos } from '@/services/analiseAtivos/leitura/ativo/fundamentosEssencial';
import type { GraficosComparador } from '@/types/analiseAtivosBlocoD';

export const MAX_ANOS_GRAFICO = 10;
export const MIN_PONTOS_GRAFICO = 3;
/** Flags per-share que tiram o ano da série (decisão 1). */
export const FLAGS_SALTO_PER_SHARE = ['salto_acoes_sem_evento', 'dados_incompletos'] as const;

export interface PontoBruto {
  ano: number;
  valor: number | null;
  emConferencia?: boolean;
}

export interface SerieBruta {
  ticker: string;
  pontos: PontoBruto[];
}

/** Anos fechados (< ano de hoje) presentes em alguma série, os últimos MAX_ANOS_GRAFICO. */
export function anosDoGrafico(series: readonly SerieBruta[], anoAtual: number): number[] {
  const anos = new Set<number>();
  for (const s of series) for (const p of s.pontos) if (p.ano < anoAtual) anos.add(p.ano);
  return [...anos].sort((a, b) => a - b).slice(-MAX_ANOS_GRAFICO);
}

const um = (n: number) => Math.round(n * 10) / 10;

/** Monta séries base 100 na mesma escala (sem título: quem chama põe o texto). */
export function montarEscalaBase100(
  series: readonly SerieBruta[],
  anoAtual: number,
): Omit<GraficosComparador, 'tipo' | 'titulo'> {
  const anos = anosDoGrafico(series, anoAtual);
  const saida: GraficosComparador['series'] = series.map((s) => {
    const porAno = new Map(s.pontos.map((p) => [p.ano, p]));
    const valores = anos.map((a) => porAno.get(a)?.valor ?? null);
    const emConferencia = anos.map((a) => porAno.get(a)?.emConferencia === true);
    const iBase = valores.findIndex((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    const base = iBase >= 0 ? (valores[iBase] as number) : null;
    const pontos = valores.map((v, i) =>
      base === null || i < iBase || v === null || !Number.isFinite(v) ? null : um((v / base) * 100),
    );
    const n = pontos.filter((p) => p !== null).length;
    return { ticker: s.ticker, pontos, emConferencia, insuficiente: n < MIN_PONTOS_GRAFICO };
  });
  const todos = saida.flatMap((s) => s.pontos.filter((p): p is number => p !== null));
  const escala =
    todos.length === 0
      ? { min: 100, max: 100 }
      : { min: Math.min(100, ...todos), max: Math.max(100, ...todos) };
  return { anos, escala, series: saida };
}

/** Lucro líquido anual (serie10a) → pontos; `anosOcultos` = escala em conferência no ano. */
export function serieLucroAcao(
  serie10a: ReadonlyArray<{ ano: number; valor: number | null }>,
  anosOcultos: ReadonlySet<number>,
): PontoBruto[] {
  return serie10a.map((p) =>
    anosOcultos.has(p.ano)
      ? { ano: p.ano, valor: null, emConferencia: true }
      : { ano: p.ano, valor: p.valor },
  );
}

/** VP/cota do fim do ano na base de cotas de hoje; ano com salto per-share = null. */
export function serieVpCotaFii(
  perShare: ReadonlyArray<{
    anoFiscal: number;
    vpCotaFim: number | null;
    flags: readonly string[];
  }>,
  desdobramentos: ReadonlyArray<{ refMonth: string; fator: number }>,
): PontoBruto[] {
  return perShare.map((p) => {
    const salto = FLAGS_SALTO_PER_SHARE.some((f) => p.flags.includes(f));
    if (salto) return { ano: p.anoFiscal, valor: null, emConferencia: true };
    const v = p.vpCotaFim;
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ano: p.anoFiscal, valor: null };
    return { ano: p.anoFiscal, valor: v / fatorCotasApos(`${p.anoFiscal}-12-31`, desdobramentos) };
  });
}
