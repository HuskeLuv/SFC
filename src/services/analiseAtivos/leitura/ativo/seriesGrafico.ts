/**
 * Gráfico do topo da página do ativo (fatia B): Lucro por ação × Cotação (ações, anual) e VP por
 * cota × Cota (FIIs, mensal). O servidor devolve os valores AJUSTADOS por desdobramento/grupamento
 * confirmados (series.fatorAjusteAte); a base 100 é calculada no cliente, por janela
 * (`recortarJanela`), para o 5A e o 10A começarem os dois em 100.
 *
 * - Só anos FECHADOS na série anual; o 'últ. 12m' é um ponto separado (ult12m), nunca na série.
 * - Prejuízo (LPA ≤ 0) = lacuna com nota (base 100 de número negativo não tem leitura).
 * - Menos de 3 pontos → insuficiente ('histórico insuficiente para o gráfico').
 * - Períodos: 5A/10A (decisão 7 do Wellington: 1A/3A dariam 1–3 pontos na série anual).
 */
import { anoDe, baseCem, fatorAjusteAte } from '@/services/analiseAtivos/leitura/ativo/series';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { GraficoAtivo } from '@/types/analiseAtivosApi';

export const PERIODOS_GRAFICO = ['5A', '10A'] as const;
export type PeriodoGrafico = (typeof PERIODOS_GRAFICO)[number];
export const PONTOS_MINIMOS_GRAFICO = 3;
const ANOS_JANELA = 10;

export type EventoAjuste = Parameters<typeof fatorAjusteAte>[1][number];

export interface EntradaGraficoAcao {
  hoje: string;
  /** LPA ajustado à base de hoje por ano fiscal (asset_per_share_yearly.lpaAjHoje) */
  lpaAnual: ReadonlyArray<{ ano: number; lpaAjHoje: number | null }>;
  /** preço CRU de fim de ano (asset_multiples_yearly.precoFimAno) e a data do pregão */
  precoAnual: ReadonlyArray<{ ano: number; preco: number | null; data: string | null }>;
  eventos: readonly EventoAjuste[];
  lpaTtm: number | null;
  precoAtual: number | null;
}

export interface EntradaGraficoFii {
  hoje: string;
  /** informe mensal: refMonth (1º dia do mês) e VP/cota CRU */
  mensal: ReadonlyArray<{ refMonth: string; vpCota: number | null }>;
  /** fechamento CRU do último pregão de cada mês */
  cotacaoMensal: ReadonlyArray<{ data: string; close: number }>;
  eventos: readonly EventoAjuste[];
}

function fimDoMes(refMonth: string): string {
  const [a, m] = refMonth.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

function contarCompletos(g: Pick<GraficoAtivo, 'serieA' | 'serieB'>): number {
  return g.serieA.pontos.filter((p, i) => p.valor !== null && g.serieB.pontos[i]?.valor != null)
    .length;
}

export function montarGraficoAcao(e: EntradaGraficoAcao): GraficoAtivo {
  const t = TEXTOS_TELA.ativo;
  const anoAtual = anoDe(e.hoje);
  const desde = anoAtual - ANOS_JANELA;
  const lpa = new Map(e.lpaAnual.map((p) => [p.ano, p.lpaAjHoje]));
  const preco = new Map(e.precoAnual.map((p) => [p.ano, p]));
  const anos = [...new Set([...lpa.keys(), ...preco.keys()])]
    .filter((a) => a >= desde && a < anoAtual)
    .sort((a, b) => a - b);

  const lacunas: GraficoAtivo['lacunas'] = [];
  const pontosA: GraficoAtivo['serieA']['pontos'] = [];
  const pontosB: GraficoAtivo['serieB']['pontos'] = [];
  for (const ano of anos) {
    const chave = String(ano);
    const l = lpa.get(ano);
    let a: number | null = null;
    if (typeof l === 'number' && Number.isFinite(l)) {
      if (l > 0) a = l;
      else lacunas.push({ chave, texto: t.lacunaPrejuizo });
    }
    const p = preco.get(ano);
    let b: number | null = null;
    if (p && typeof p.preco === 'number' && p.preco > 0) {
      b = p.preco / fatorAjusteAte(p.data ?? `${ano}-12-31`, e.eventos);
    }
    if (a === null && b === null && !lacunas.some((x) => x.chave === chave)) continue;
    pontosA.push({ chave, valor: a });
    pontosB.push({ chave, valor: b });
  }

  const g: GraficoAtivo = {
    titulo: TEXTOS_TELA.blocos.graficoAcao,
    figcaption: t.grafico.figcaptionAcao,
    granularidade: 'anual',
    periodos: [...PERIODOS_GRAFICO],
    serieA: { rotulo: t.grafico.serieLpa, pontos: pontosA },
    serieB: { rotulo: t.grafico.serieCotacaoAno, pontos: pontosB },
    ult12m:
      e.precoAtual !== null || (e.lpaTtm !== null && e.lpaTtm > 0)
        ? {
            a: typeof e.lpaTtm === 'number' && e.lpaTtm > 0 ? e.lpaTtm : null,
            b: typeof e.precoAtual === 'number' && e.precoAtual > 0 ? e.precoAtual : null,
          }
        : null,
    lacunas,
    insuficiente: false,
  };
  g.insuficiente = contarCompletos(g) < PONTOS_MINIMOS_GRAFICO;
  return g;
}

export function montarGraficoFii(e: EntradaGraficoFii): GraficoAtivo {
  const t = TEXTOS_TELA.ativo;
  const anoAtual = anoDe(e.hoje);
  const desde = `${anoAtual - ANOS_JANELA}-${e.hoje.slice(5, 7)}`;
  const cot = new Map<string, number>();
  for (const c of e.cotacaoMensal) {
    if (!(c.close > 0)) continue;
    cot.set(c.data.slice(0, 7), c.close / fatorAjusteAte(c.data, e.eventos));
  }
  const pontosA: GraficoAtivo['serieA']['pontos'] = [];
  const pontosB: GraficoAtivo['serieB']['pontos'] = [];
  const meses = [...new Set(e.mensal.map((m) => m.refMonth.slice(0, 7)))]
    .filter((m) => m > desde)
    .sort();
  const vp = new Map(e.mensal.map((m) => [m.refMonth.slice(0, 7), m]));
  for (const mes of meses) {
    const m = vp.get(mes);
    const v =
      m && typeof m.vpCota === 'number' && m.vpCota > 0
        ? m.vpCota / fatorAjusteAte(fimDoMes(m.refMonth), e.eventos)
        : null;
    pontosA.push({ chave: mes, valor: v });
    pontosB.push({ chave: mes, valor: cot.get(mes) ?? null });
  }
  const g: GraficoAtivo = {
    titulo: TEXTOS_TELA.blocos.graficoFii,
    figcaption: t.grafico.figcaptionFii,
    granularidade: 'mensal',
    periodos: [...PERIODOS_GRAFICO],
    serieA: { rotulo: t.grafico.serieVpCota, pontos: pontosA },
    serieB: { rotulo: t.grafico.serieCota, pontos: pontosB },
    ult12m: null,
    lacunas: [],
    insuficiente: false,
  };
  g.insuficiente = contarCompletos(g) < PONTOS_MINIMOS_GRAFICO;
  return g;
}

// ---------------------------------------------------------------------------
// Cliente: recorte por janela + base 100
// ---------------------------------------------------------------------------

export interface PontoJanela {
  chave: string;
  /** valores ajustados (para a tabela) */
  a: number | null;
  b: number | null;
  /** base 100 no primeiro ponto > 0 da janela */
  a100: number | null;
  b100: number | null;
  lacuna: string | null;
}

export interface JanelaGrafico {
  pontos: PontoJanela[];
  /** primeira chave da janela (rótulo 'base 100 em …') */
  base: string | null;
  ult12m: { a100: number | null; b100: number | null } | null;
  insuficiente: boolean;
}

function chavesDaJanela(g: GraficoAtivo, periodo: PeriodoGrafico): number {
  const anos = periodo === '5A' ? 5 : 10;
  return g.granularidade === 'anual' ? anos : anos * 12;
}

/** Recorta a janela (últimos 5 ou 10 anos/meses) e rebaseia as duas séries para 100. */
export function recortarJanela(g: GraficoAtivo, periodo: PeriodoGrafico): JanelaGrafico {
  const n = chavesDaJanela(g, periodo);
  const ini = Math.max(0, g.serieA.pontos.length - n);
  const a = g.serieA.pontos.slice(ini);
  const b = g.serieB.pontos.slice(ini);
  const lac = new Map(g.lacunas.map((l) => [l.chave, l.texto]));
  const a100 = baseCem(a);
  const b100 = baseCem(b);
  const pontos: PontoJanela[] = a.map((p, i) => ({
    chave: p.chave,
    a: p.valor,
    b: b[i]?.valor ?? null,
    a100: a100[i].base100,
    b100: b100[i]?.base100 ?? null,
    lacuna: lac.get(p.chave) ?? null,
  }));
  const baseA = a.find((p) => typeof p.valor === 'number' && p.valor > 0)?.valor ?? null;
  const baseB = b.find((p) => typeof p.valor === 'number' && p.valor > 0)?.valor ?? null;
  const ult12m = g.ult12m
    ? {
        a100: g.ult12m.a !== null && baseA ? (g.ult12m.a / baseA) * 100 : null,
        b100: g.ult12m.b !== null && baseB ? (g.ult12m.b / baseB) * 100 : null,
      }
    : null;
  const completos = pontos.filter((p) => p.a100 !== null && p.b100 !== null).length;
  return {
    pontos,
    base: pontos.find((p) => p.a100 !== null || p.b100 !== null)?.chave ?? null,
    ult12m,
    insuficiente: completos < PONTOS_MINIMOS_GRAFICO,
  };
}
