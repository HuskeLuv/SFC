/**
 * Seção 4b (Carteira: TWR x índices, proventos) do Relatório financeiro. Plano Advanced.
 * irRendaVariavel fica null na v1 (o front mostra "em breve").
 *
 *  - TWR: cumulativeReturn de portfolio_performance REBASEADO no último ponto antes do período
 *    ((1+cum)/(1+cum_base) − 1), sem buildPatrimonioHistorico. Carteira que começou dentro do
 *    período rebaseia no 1º ponto dela.
 *  - CDI, IPCA (composto mês a mês, em degrau) e Ibovespa na MESMA data final (o último ponto
 *    com performance), pelas funções de services/market/benchmarks.ts.
 *  - Proventos por tipo (resolveProventoEvents, a fonte do Resumo e do IR): líquido pago
 *    (paymentDay ≤ hoje em SP); em US$ → Exterior pelo câmbio da data de pagamento; JCP; FII; o
 *    resto (ações, ETF, BDR, FIM) em Ações.
 */
import { prisma } from '@/lib/prisma';
import type {
  BlocoCarteiraAvancada,
  ProventosMesRelatorio,
  ValorMensal,
} from '@/types/relatorioFinanceiro';
import { getAssetHistory } from '@/services/pricing/assetPriceService';
import { resolveProventoEvents, type ProventoEvent } from '@/services/portfolio/resolveProventos';
import { carregarSerieCambio, type SerieCambio } from '@/services/market/cambioUsdBrl';
import { serieAcumuladaFatoresPct, serieAcumuladaPrecoPct } from '@/services/market/benchmarks';
import type { ContextoMontador, Insumos, PontoPerformance } from './insumos';
import { montarFgc } from './fgc';

const IBOV_SYMBOL = '^BVSP';
const DIA_MS = 24 * 60 * 60 * 1000;
const BLOQUEADOS = ['RESERVA-EMERG', 'RESERVA-OPORT', 'PERSONALIZADO'];

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const isoDia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mesUtc = (ms: number) => isoDia(ms).slice(0, 7);

/** Meia-noite UTC do 1º dia de um 'YYYY-MM'. */
const inicioDoMesMs = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return Date.UTC(a, m - 1, 1);
};

export interface TwrRebaseado {
  /** Data da base (o 0 da série), ms UTC. */
  baseMs: number;
  /** Datas da série, a 1ª é a base. */
  datasMs: number[];
  /** Acumulado em % desde a base. */
  carteira: number[];
}

/**
 * TWR do período rebaseado (puro): base = último ponto antes de `inicioMs`, senão o 1º ponto do
 * período. null sem pontos suficientes (menos de 2 datas).
 */
export function twrRebaseado(perf: PontoPerformance[], inicioMs: number): TwrRebaseado | null {
  const validos = perf.filter((p) => Number.isFinite(p.cumulativeReturn));
  const antes = validos.filter((p) => p.date.getTime() < inicioMs);
  const dentro = validos.filter((p) => p.date.getTime() >= inicioMs);
  const base = antes.length > 0 ? antes[antes.length - 1] : (dentro[0] ?? null);
  if (!base) return null;
  const pontos = [base, ...dentro.filter((p) => p !== base)];
  if (pontos.length < 2) return null;
  const fb = 1 + base.cumulativeReturn / 100;
  if (fb <= 0) return null;
  return {
    baseMs: base.date.getTime(),
    datasMs: pontos.map((p) => p.date.getTime()),
    carteira: pontos.map((p) => ((1 + p.cumulativeReturn / 100) / fb - 1) * 100),
  };
}

/** Retorno mensal (TWR) em % de cada mês pedido: (1+cum_fim)/(1+cum_fim_anterior) − 1. */
export function twrMensal(perf: PontoPerformance[], meses: string[]): Array<number | null> {
  const ultimoAte = (ms: number): PontoPerformance | null => {
    let achado: PontoPerformance | null = null;
    for (const p of perf) {
      if (p.date.getTime() < ms) achado = p;
      else break;
    }
    return achado;
  };
  return meses.map((mes) => {
    const ini = inicioDoMesMs(mes);
    const [a, m] = mes.split('-').map(Number);
    const fim = Date.UTC(a, m, 1);
    const pFim = ultimoAte(fim);
    if (!pFim || pFim.date.getTime() < ini) return null;
    const pIni = ultimoAte(ini);
    if (!pIni) return null;
    const f0 = 1 + pIni.cumulativeReturn / 100;
    if (f0 <= 0) return null;
    return round4(((1 + pFim.cumulativeReturn / 100) / f0 - 1) * 100);
  });
}

/** Classificação de um provento (puro): USD → exterior; JCP; FII; o resto → ações. */
export function tipoDoProvento(
  e: Pick<ProventoEvent, 'moeda' | 'tipo'>,
  tipoAtivo: string | null | undefined,
): keyof Omit<ProventosMesRelatorio, 'mes'> {
  if (e.moeda === 'USD') return 'exterior';
  const tipo = (e.tipo || '').toLowerCase();
  if (tipo.includes('jcp') || tipo.includes('juros')) return 'jcp';
  if (tipoAtivo === 'fii') return 'fii';
  return 'acao';
}

/** Soma os proventos pagos (puro) nos meses pedidos. Sem câmbio, o provento em US$ fica fora. */
export function proventosPorMes(
  eventos: ProventoEvent[],
  tipoPorSimbolo: Map<string, string | null>,
  meses: string[],
  hojeMs: number,
  cambio: SerieCambio | null,
): ProventosMesRelatorio[] {
  const porMes = new Map<string, ProventosMesRelatorio>(
    meses.map((mes) => [mes, { mes, fii: 0, acao: 0, jcp: 0, exterior: 0 }]),
  );
  for (const e of eventos) {
    if (e.paymentDay > hojeMs) continue;
    if (BLOQUEADOS.some((b) => e.symbol.toUpperCase().startsWith(b))) continue;
    const linha = porMes.get(mesUtc(e.paymentDay));
    if (!linha) continue;
    const slot = tipoDoProvento(e, tipoPorSimbolo.get(e.symbol));
    let valor = e.net;
    if (e.moeda === 'USD') {
      const taxa = cambio?.(e.paymentDay) ?? null;
      if (taxa === null) continue;
      valor = e.net * taxa;
    }
    linha[slot] += valor;
  }
  return meses.map((mes) => {
    const l = porMes.get(mes)!;
    return {
      mes,
      fii: round2(l.fii),
      acao: round2(l.acao),
      jcp: round2(l.jcp),
      exterior: round2(l.exterior),
    };
  });
}

/** Total de cada mês (as 4 linhas somadas). */
export const totalProventos = (p: ProventosMesRelatorio[]): ValorMensal[] =>
  p.map((l) => ({ mes: l.mes, valor: round2(l.fii + l.acao + l.jcp + l.exterior) }));

// Proventos dos 13 meses da janela, uma carga por entrada de cache dos insumos. A saúde (fase 2,
// síncrona) lê o valor já resolvido para a média dos 3 meses fechados.
const proventosCarregando = new WeakMap<Insumos, Promise<ProventosMesRelatorio[]>>();
const proventosProntos = new WeakMap<Insumos, ProventosMesRelatorio[]>();

async function carregarProventos(ctx: ContextoMontador): Promise<ProventosMesRelatorio[]> {
  const { events } = await resolveProventoEvents(ctx.userId);
  const simbolos = [...new Set(events.map((e) => e.symbol))];
  const assets =
    simbolos.length > 0
      ? await prisma.asset.findMany({
          where: { symbol: { in: simbolos } },
          select: { symbol: true, type: true },
        })
      : [];
  const tipoPorSimbolo = new Map<string, string | null>();
  for (const a of assets) if (!tipoPorSimbolo.has(a.symbol)) tipoPorSimbolo.set(a.symbol, a.type);
  const cambio = events.some((e) => e.moeda === 'USD')
    ? await carregarSerieCambio(ctx.insumos.inicioJanela)
    : null;
  const hojeMs = Date.UTC(ctx.hojeSP.ano, ctx.hojeSP.mes0, ctx.hojeSP.dia);
  return proventosPorMes(events, tipoPorSimbolo, ctx.insumos.janela, hojeMs, cambio);
}

/** Proventos por mês dos 13 meses da janela (memo por insumos). */
export function proventosDaJanela(ctx: ContextoMontador): Promise<ProventosMesRelatorio[]> {
  let p = proventosCarregando.get(ctx.insumos);
  if (!p) {
    p = carregarProventos(ctx).then(
      (lista) => {
        proventosProntos.set(ctx.insumos, lista);
        return lista;
      },
      (erro: unknown) => {
        proventosCarregando.delete(ctx.insumos);
        throw erro;
      },
    );
    proventosCarregando.set(ctx.insumos, p);
  }
  return p;
}

/** Os proventos da janela se já carregados (fase 2); null senão. */
export function proventosDaJanelaCarregados(insumos: Insumos): ProventosMesRelatorio[] | null {
  return proventosProntos.get(insumos) ?? null;
}

async function carregarBenchmarks(baseMs: number, fimMs: number) {
  const desde = new Date(baseMs - 40 * DIA_MS);
  const ate = new Date(fimMs);
  const [cdi, ipca, ibov] = await Promise.all([
    prisma.economicIndex.findMany({
      where: { indexType: 'CDI', date: { gt: new Date(baseMs), lte: ate } },
      orderBy: { date: 'asc' },
      select: { date: true, value: true },
    }),
    prisma.economicIndex.findMany({
      where: { indexType: 'IPCA', date: { gt: new Date(baseMs), lte: ate } },
      orderBy: { date: 'asc' },
      select: { date: true, value: true },
    }),
    getAssetHistory(IBOV_SYMBOL, desde, ate).catch(() => []),
  ]);
  return { cdi, ipca, ibov };
}

export async function montarCarteiraAvancada(
  ctx: ContextoMontador,
): Promise<BlocoCarteiraAvancada> {
  const [perf, proventos13m, fgc] = await Promise.all([
    ctx.insumos.performance13m(),
    proventosDaJanela(ctx),
    montarFgc(ctx),
  ]);
  const periodo = new Set(ctx.mesesDoPeriodo);
  const proventos = proventos13m.filter((p) => periodo.has(p.mes));

  const twr = twrRebaseado(perf, inicioDoMesMs(ctx.periodo.inicio));
  if (!twr) {
    return {
      retornoDiario: { datas: [], carteira: [], ibov: [], cdi: [], ipca: [] },
      twr: null,
      cdi: null,
      ipca: null,
      ibov: null,
      proventos,
      fgc,
      irRendaVariavel: null,
    };
  }

  const fimMs = twr.datasMs[twr.datasMs.length - 1];
  const bench = await carregarBenchmarks(twr.baseMs, fimMs);
  const cdi = serieAcumuladaFatoresPct(bench.cdi, twr.baseMs, twr.datasMs);
  const ipca = serieAcumuladaFatoresPct(bench.ipca, twr.baseMs, twr.datasMs);
  const ibovBruto = serieAcumuladaPrecoPct(bench.ibov, twr.baseMs, twr.datasMs);
  const temIbov = ibovBruto.some((v) => v !== null) && bench.ibov.length >= 2;
  const ibov = ibovBruto.map((v) => round4(v ?? 0));
  const ultimo = (s: number[]) => round4(s[s.length - 1]);

  return {
    retornoDiario: {
      datas: twr.datasMs.map(isoDia),
      carteira: twr.carteira.map(round4),
      ibov,
      cdi: cdi.map(round4),
      ipca: ipca.map(round4),
    },
    twr: ultimo(twr.carteira),
    cdi: bench.cdi.length > 0 ? ultimo(cdi) : null,
    ipca: bench.ipca.length > 0 ? ultimo(ipca) : null,
    ibov: temIbov ? ultimo(ibov) : null,
    proventos,
    fgc,
    irRendaVariavel: null,
  };
}
