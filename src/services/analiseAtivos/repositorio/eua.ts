/**
 * Repositório do cadastro SEC (sec_companies + sec_company_tickers) — Stocks e REITs.
 *
 * DONO: fatia A (grava: sec-cadastro/sec-fundamentos acrescentam aqui as escritas). Criado na fatia
 * 0 com as LEITURAS de assinatura FINAL que B (motor/Quadro EUA), C (página/busca) e D (Carteira)
 * importam sem editar este arquivo:
 *  - listarUniversoEua: empresas no universo de uma classe, com o ticker vigente na forma da Análise;
 *  - lerCadastroEua: cadastro por symbol da Análise (topo da página, busca, Comparador);
 *  - cikPorSymbolNorm: CIK pelo ticker normalizado (casa BRK-B, BRK.B e BRKB; Carteira).
 * Só banco: nenhum provedor externo no caminho da requisição.
 */
import type { PrismaClient } from '@prisma/client';
import type { ClasseEua } from '@/types/analiseAtivosApi';
import {
  BOLSAS_EUA,
  SEGMENTOS_REIT,
  normalizarTickerEua,
  symbolAnaliseDaSec,
  symbolSecDaAnalise,
  type BolsaEua,
  type SegmentoReit,
} from '@/types/analiseAtivosEua';

/** Empresa EUA como B/C/D leem (ticker já na forma da Análise: BRK.B). */
export interface EmpresaEua {
  cik: string;
  /** forma da Análise (BRK.B) */
  symbol: string;
  /** forma da SEC (BRK-B) */
  symbolSec: string;
  symbolNorm: string;
  /** ticker principal do CIK (o primeiro do arquivo da SEC) */
  principal: boolean;
  nome: string;
  classe: ClasseEua;
  sic: number | null;
  ehFinanceira: boolean;
  bolsa: BolsaEua | null;
  segmento: SegmentoReit | null;
  exercicioFimMmdd: string | null;
  publicFloatUsd: number | null;
  publicFloatData: string | null;
  /** CIK que tem o histórico de 10-K (XOM) ou o próprio */
  cikFundamentos: string;
  noUniverso: boolean;
}

type Delegados = Pick<PrismaClient, 'secCompany' | 'secCompanyTicker'>;

const ehBolsa = (v: string | null): v is BolsaEua =>
  v !== null && (BOLSAS_EUA as readonly string[]).includes(v);
const ehSegmento = (v: string | null): v is SegmentoReit =>
  v !== null && (SEGMENTOS_REIT as readonly string[]).includes(v);

interface LinhaCompany {
  cik: string;
  nome: string;
  classe: string | null;
  sic: number | null;
  ehFinanceira: boolean;
  bolsa: string | null;
  segmento: string | null;
  exercicioFimMmdd: string | null;
  publicFloatUsd: { toNumber(): number } | null;
  publicFloatData: Date | null;
  cikHistorico: string | null;
  noUniverso: boolean;
}

function empresaDe(
  c: LinhaCompany,
  t: { symbol: string; symbolNorm: string; principal: boolean },
): EmpresaEua | null {
  if (c.classe !== 'stock' && c.classe !== 'reit') return null;
  return {
    cik: c.cik,
    symbol: symbolAnaliseDaSec(t.symbol),
    symbolSec: t.symbol,
    symbolNorm: t.symbolNorm,
    principal: t.principal,
    nome: c.nome,
    classe: c.classe,
    sic: c.sic,
    ehFinanceira: c.ehFinanceira,
    bolsa: ehBolsa(c.bolsa) ? c.bolsa : null,
    segmento: ehSegmento(c.segmento) ? c.segmento : null,
    exercicioFimMmdd: c.exercicioFimMmdd,
    publicFloatUsd: c.publicFloatUsd ? c.publicFloatUsd.toNumber() : null,
    publicFloatData: c.publicFloatData ? c.publicFloatData.toISOString().slice(0, 10) : null,
    cikFundamentos: c.cikHistorico ?? c.cik,
    noUniverso: c.noUniverso,
  };
}

const SELECT_COMPANY = {
  cik: true,
  nome: true,
  classe: true,
  sic: true,
  ehFinanceira: true,
  bolsa: true,
  segmento: true,
  exercicioFimMmdd: true,
  publicFloatUsd: true,
  publicFloatData: true,
  cikHistorico: true,
  noUniverso: true,
} as const;

/**
 * Empresas NO UNIVERSO das classes pedidas, uma entrada por ticker VIGENTE (validTo null) — todo
 * ticker listado de um CIK vira uma linha (GOOGL/GOOG, BRK-A/BRK-B), como PETR3/PETR4.
 */
export async function listarUniversoEua(
  prisma: Delegados,
  classes: readonly ClasseEua[],
): Promise<EmpresaEua[]> {
  if (classes.length === 0) return [];
  const empresas = await prisma.secCompany.findMany({
    where: { noUniverso: true, classe: { in: [...classes] } },
    select: SELECT_COMPANY,
    orderBy: { cik: 'asc' },
  });
  if (empresas.length === 0) return [];
  const tickers = await prisma.secCompanyTicker.findMany({
    where: { cik: { in: empresas.map((e) => e.cik) }, validTo: null },
    select: { cik: true, symbol: true, symbolNorm: true, principal: true },
    orderBy: [{ cik: 'asc' }, { symbol: 'asc' }],
  });
  const porCik = new Map(empresas.map((e) => [e.cik, e]));
  const out: EmpresaEua[] = [];
  for (const t of tickers) {
    const c = porCik.get(t.cik);
    const e = c ? empresaDe(c, t) : null;
    if (e) out.push(e);
  }
  return out;
}

/**
 * Cadastro por symbol da ANÁLISE (BRK.B; também aceita BRK-B), dentro ou fora do universo — a
 * página do ativo decide o 404 pelo noUniverso. Ticker sem cadastro fica fora do mapa.
 */
export async function lerCadastroEua(
  prisma: Delegados,
  symbols: readonly string[],
): Promise<Map<string, EmpresaEua>> {
  const out = new Map<string, EmpresaEua>();
  if (symbols.length === 0) return out;
  const daSec = [...new Set(symbols.map(symbolSecDaAnalise))];
  const tickers = await prisma.secCompanyTicker.findMany({
    where: { symbol: { in: daSec }, validTo: null },
    select: { cik: true, symbol: true, symbolNorm: true, principal: true },
  });
  if (tickers.length === 0) return out;
  const empresas = await prisma.secCompany.findMany({
    where: { cik: { in: [...new Set(tickers.map((t) => t.cik))] } },
    select: SELECT_COMPANY,
  });
  const porCik = new Map(empresas.map((e) => [e.cik, e]));
  for (const t of tickers) {
    const c = porCik.get(t.cik);
    const e = c ? empresaDe(c, t) : null;
    if (e) out.set(e.symbol, e);
  }
  return out;
}

/** CIK pelo ticker normalizado (BRKB ↔ BRK-B ↔ BRK.B), só tickers vigentes; null se não há. */
export async function cikPorSymbolNorm(
  prisma: Pick<PrismaClient, 'secCompanyTicker'>,
  ticker: string,
): Promise<string | null> {
  const t = await prisma.secCompanyTicker.findFirst({
    where: { symbolNorm: normalizarTickerEua(ticker), validTo: null },
    select: { cik: true },
    orderBy: { principal: 'desc' },
  });
  return t?.cik ?? null;
}
