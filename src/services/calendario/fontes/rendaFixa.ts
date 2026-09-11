/**
 * Fonte "rf": vencimento de cada título de renda fixa e Tesouro ainda em
 * carteira (posição com quantidade > 0). Valor mostrado = aplicado.
 */
import prisma from '@/lib/prisma';
import type { EventoAgenda, Periodo } from '../types';
import { dataCivil, deDataCivil } from '../datas';

const round2 = (v: number) => Math.round(v * 100) / 100;

const TIPO_LABEL: Record<string, string> = {
  CDB: 'CDB',
  LCI: 'LCI',
  LCA: 'LCA',
  CRI: 'CRI',
  CRA: 'CRA',
  DEBENTURE: 'Debênture',
  TESOURO_DIRETO: 'Tesouro Direto',
  POUPANCA: 'Poupança',
  LC: 'LC',
  OUTRO: 'Renda fixa',
};

export interface TituloVencendo {
  id: string;
  assetId: string;
  portfolioId: string | null;
  description: string;
  type: string;
  maturityDate: Date;
  investedAmount: number;
  annualRate: number;
  indexer: string | null;
  indexerPercent: number | null;
  taxExempt: boolean;
}

export function taxaLegivel(
  t: Pick<TituloVencendo, 'annualRate' | 'indexer' | 'indexerPercent'>,
): string {
  if (t.indexer === 'CDI' && t.indexerPercent) return `${t.indexerPercent}% do CDI`;
  if (t.indexer === 'IPCA') return `IPCA + ${t.annualRate}% a.a.`;
  if (t.indexer === 'SELIC') return `Selic${t.annualRate ? ` + ${t.annualRate}% a.a.` : ''}`;
  return `${t.annualRate}% a.a.`;
}

export function titulosComoEventos(titulos: TituloVencendo[], periodo: Periodo): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const t of titulos) {
    const data = dataCivil(t.maturityDate);
    if (data < periodo.de || data > periodo.ate) continue;
    const tipo = TIPO_LABEL[t.type] ?? t.type;
    out.push({
      id: `rf:${t.id}`,
      tipo: 'rf',
      titulo: `${t.description} · vencimento`,
      data,
      dataFim: null,
      hora: null,
      valor: round2(t.investedAmount),
      descricao: `${tipo}, ${taxaLegivel(t)}. Valor aplicado.`,
      link: t.portfolioId ? `/ativos/${t.portfolioId}` : '/carteira',
      detalhe: {
        fixedIncomeId: t.id,
        assetId: t.assetId,
        tipoTitulo: t.type,
        taxa: taxaLegivel(t),
        indexer: t.indexer,
        investedAmount: round2(t.investedAmount),
        taxExempt: t.taxExempt,
      },
    });
  }
  return out;
}

export async function eventosRendaFixa(userId: string, periodo: Periodo): Promise<EventoAgenda[]> {
  const titulos = await prisma.fixedIncomeAsset.findMany({
    where: {
      userId,
      maturityDate: { gte: deDataCivil(periodo.de), lte: deDataCivil(periodo.ate) },
    },
  });
  if (titulos.length === 0) return [];
  // Só o que ainda está em carteira (resgatado/vencido zera a posição).
  const posicoes = await prisma.portfolio.findMany({
    where: { userId, assetId: { in: titulos.map((t) => t.assetId) }, quantity: { gt: 0 } },
    select: { id: true, assetId: true },
  });
  const portfolioPorAsset = new Map(posicoes.map((p) => [p.assetId, p.id]));
  const emCarteira: TituloVencendo[] = titulos
    .filter((t) => portfolioPorAsset.has(t.assetId))
    .map((t) => ({
      id: t.id,
      assetId: t.assetId,
      portfolioId: portfolioPorAsset.get(t.assetId) ?? null,
      description: t.description,
      type: String(t.type),
      maturityDate: t.maturityDate,
      investedAmount: t.investedAmount,
      annualRate: t.annualRate,
      indexer: t.indexer ? String(t.indexer) : null,
      indexerPercent: t.indexerPercent,
      taxExempt: t.taxExempt,
    }));
  return titulosComoEventos(emCarteira, periodo);
}
