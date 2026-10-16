/**
 * Leitura da camada de fontes (v2.5, fatia 0; desenho final.camada_fontes §8): pontos VIGENTES de
 * asset_fundamentals_serie e fii_property_quality, SEMPRE 'approved' (nada 'pending' ou 'rejected'
 * chega à tela, §6) e na maior versão de cada ponto (point-in-time: o histórico fica no banco). Série
 * fora do catálogo é ignorada. A renderização só lê o banco; quem grava é a ingestão da fatia A
 * (repositorio/fontesFundamentosEscrita.ts).
 */
import type { PrismaClient } from '@prisma/client';
import { paraData, paraNumero } from '@/services/analiseAtivos/repositorio/conversao';
import {
  ehSerieFundamento,
  type PeriodicidadeSerie,
  type PontoSerieVigente,
  type QualidadeFiiVigente,
  type SerieFundamento,
} from '@/types/analiseAtivosFontes';

type PrismaFontes = Pick<PrismaClient, 'assetFundamentalsSerie' | 'fiiPropertyQuality'>;

const TIPOS_PERIODO: ReadonlySet<string> = new Set(['FY', 'Q', 'M']);

/** Maior versão por chave (pura; exportada para o teste). */
export function maiorVersaoPorChave<T extends { versao: number }>(
  linhas: readonly T[],
  chave: (l: T) => string,
): T[] {
  const porChave = new Map<string, T>();
  for (const l of linhas) {
    const k = chave(l);
    const atual = porChave.get(k);
    if (!atual || l.versao > atual.versao) porChave.set(k, l);
  }
  return [...porChave.values()];
}

/**
 * Pontos vigentes (approved, maior versão por symbol × serie × tipoPeriodo × dtFim × fonte) das
 * séries pedidas, com anoFiscal ≥ desdeAno.
 */
export async function lerPontosVigentes(
  prisma: PrismaFontes,
  symbols: readonly string[],
  series: readonly SerieFundamento[],
  desdeAno: number,
): Promise<PontoSerieVigente[]> {
  if (symbols.length === 0 || series.length === 0) return [];
  const linhas = await prisma.assetFundamentalsSerie.findMany({
    where: {
      symbol: { in: [...symbols] },
      serie: { in: [...series] },
      anoFiscal: { gte: desdeAno },
      reviewStatus: 'approved',
    },
    select: {
      symbol: true,
      serie: true,
      tipoPeriodo: true,
      anoFiscal: true,
      dtFim: true,
      valor: true,
      fonte: true,
      versao: true,
      incompleto: true,
    },
  });
  const pontos: PontoSerieVigente[] = [];
  for (const l of linhas) {
    if (!ehSerieFundamento(l.serie) || !TIPOS_PERIODO.has(l.tipoPeriodo)) continue;
    pontos.push({
      symbol: l.symbol,
      serie: l.serie,
      tipoPeriodo: l.tipoPeriodo as PeriodicidadeSerie,
      anoFiscal: l.anoFiscal,
      dtFim: paraData(l.dtFim),
      valor: paraNumero(l.valor),
      fonte: l.fonte,
      versao: l.versao,
      incompleto: l.incompleto,
    });
  }
  return maiorVersaoPorChave(
    pontos,
    (p) => `${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.dtFim}|${p.fonte}`,
  );
}

/** Linhas vigentes de fii_property_quality (approved, maior versão por cnpj × período × fonte). */
export async function lerQualidadeFiiVigente(
  prisma: PrismaFontes,
  symbols: readonly string[],
  desde: string,
): Promise<QualidadeFiiVigente[]> {
  if (symbols.length === 0) return [];
  const linhas = await prisma.fiiPropertyQuality.findMany({
    where: {
      symbol: { in: [...symbols] },
      periodo: { gte: new Date(`${desde}T00:00:00.000Z`) },
      reviewStatus: 'approved',
    },
  });
  const vigentes = maiorVersaoPorChave(
    linhas,
    (l) => `${l.cnpj}|${paraData(l.periodo)}|${l.fonte}`,
  );
  return vigentes.map((l) => ({
    symbol: l.symbol,
    cnpj: l.cnpj,
    periodo: paraData(l.periodo),
    padAaaPct: l.padAaaPct,
    padAaPct: l.padAaPct,
    padAPct: l.padAPct,
    tenantsCount: l.tenantsCount,
    topTenantPct: l.topTenantPct,
    atypicalPct: l.atypicalPct,
    avgLeaseYears: l.avgLeaseYears,
    criCount: l.criCount,
    indexMix: (l.indexMix as QualidadeFiiVigente['indexMix']) ?? null,
    avgRate: l.avgRate,
    ltvAvg: l.ltvAvg,
    defaultPct: l.defaultPct,
    highYieldPct: l.highYieldPct,
    durationYears: l.durationYears,
    sourceUrl: l.sourceUrl,
    sourcePdfUrl: l.sourcePdfUrl,
    sourcePage: (l.sourcePage as QualidadeFiiVigente['sourcePage']) ?? null,
    confianca: (l.confianca as QualidadeFiiVigente['confianca']) ?? null,
    fonte: l.fonte,
    versao: l.versao,
    incompleto: l.incompleto,
  }));
}

/**
 * Converte fii_property_quality em pontos das séries default_pct e ltv_avg (mensais, dtFim =
 * período) para o resolverSeries. Linha incompleta vira ponto incompleto nas duas séries. Pura.
 */
export function pontosDaQualidadeFii(linhas: readonly QualidadeFiiVigente[]): PontoSerieVigente[] {
  const out: PontoSerieVigente[] = [];
  for (const q of linhas) {
    const base = {
      symbol: q.symbol,
      tipoPeriodo: 'M' as const,
      anoFiscal: Number(q.periodo.slice(0, 4)),
      dtFim: q.periodo,
      fonte: q.fonte,
      versao: q.versao,
      incompleto: q.incompleto,
    };
    // campo nulo sem a marca de incompleto = a linha não fala da série (ex.: tijolo sem CRIs)
    if (q.defaultPct != null || q.incompleto) {
      out.push({ ...base, serie: 'default_pct', valor: q.defaultPct ?? null });
    }
    if (q.ltvAvg != null || q.incompleto) {
      out.push({ ...base, serie: 'ltv_avg', valor: q.ltvAvg ?? null });
    }
  }
  return out;
}
