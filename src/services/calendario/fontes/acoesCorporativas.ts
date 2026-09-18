/**
 * Fonte "mercado": eventos corporativos (desdobramento, grupamento,
 * bonificação) dos ativos que o usuário tem em carteira.
 *
 * A data do AssetCorporateAction é a data EX (lastDatePrior) ou a de
 * aprovação, conforme a fonte — o detalhe mostra de onde veio (`source`),
 * porque BRAPI e Yahoo divergem em eventos antigos.
 */
import prisma from '@/lib/prisma';
import type { EventoAgenda, Periodo } from '../types';
import { dataCivil, deDataCivil } from '../datas';

const TIPO_LABEL: Record<string, string> = {
  DESDOBRAMENTO: 'Desdobramento',
  GRUPAMENTO: 'Grupamento',
  BONIFICACAO: 'Bonificação',
};

export interface AcaoCorporativa {
  id: string;
  symbol: string;
  date: Date;
  type: string;
  factor: number;
  completeFactor: string | null;
  source: string;
}

export function acoesComoEventos(
  acoes: AcaoCorporativa[],
  periodo: Periodo,
  linkPorSymbol: Map<string, string>,
): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const a of acoes) {
    const data = dataCivil(a.date);
    if (data < periodo.de || data > periodo.ate) continue;
    const label = TIPO_LABEL[a.type] ?? a.type;
    const proporcao = a.completeFactor ?? `fator ${a.factor}`;
    out.push({
      id: `mercado:corporativo:${a.id}`,
      tipo: 'mercado',
      titulo: `${a.symbol} · ${label.toLowerCase()}`,
      data,
      dataFim: null,
      hora: null,
      valor: null,
      descricao: `${label} de ${proporcao}. A quantidade e o preço médio são ajustados automaticamente.`,
      link: linkPorSymbol.get(a.symbol) ?? '/carteira',
      detalhe: {
        evento: 'acao-corporativa',
        symbol: a.symbol,
        tipoEvento: a.type,
        factor: a.factor,
        proporcao,
        fonte: a.source,
      },
    });
  }
  return out;
}

export async function eventosAcoesCorporativas(
  userId: string,
  periodo: Periodo,
): Promise<EventoAgenda[]> {
  const posicoes = await prisma.portfolio.findMany({
    where: { userId, quantity: { gt: 0 }, asset: { symbol: { not: '' } } },
    select: { id: true, asset: { select: { symbol: true } } },
  });
  const linkPorSymbol = new Map<string, string>();
  for (const p of posicoes) {
    if (p.asset?.symbol && !linkPorSymbol.has(p.asset.symbol)) {
      linkPorSymbol.set(p.asset.symbol, `/ativos/${p.id}`);
    }
  }
  if (linkPorSymbol.size === 0) return [];

  const acoes = await prisma.assetCorporateAction.findMany({
    where: {
      symbol: { in: [...linkPorSymbol.keys()] },
      date: { gte: deDataCivil(periodo.de), lte: deDataCivil(periodo.ate) },
    },
  });
  return acoesComoEventos(
    acoes.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      date: a.date,
      type: a.type,
      factor: a.factor,
      completeFactor: a.completeFactor,
      source: a.source,
    })),
    periodo,
    linkPorSymbol,
  );
}
