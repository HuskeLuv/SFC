/**
 * Fonte "provento": data-com e pagamento de cada provento da carteira,
 * inclusive provisionados (anunciados, ainda não pagos). Reaproveita
 * resolveProventoEvents (mesma fonte da aba Proventos e da rentabilidade),
 * cacheado 5 min por usuário porque percorre o histórico inteiro.
 */
import prisma from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { resolveProventoEvents, type ProventoEvent } from '@/services/portfolio/resolveProventos';
import type { EventoAgenda, Periodo } from '../types';
import { dataCivil, hojeCivil } from '../datas';

const CACHE_NS = 'agenda-proventos';
const CACHE_TTL_MS = 5 * 60 * 1000;

const round2 = (v: number) => Math.round(v * 100) / 100;

export function proventosComoEventos(
  eventos: ProventoEvent[],
  periodo: Periodo,
  linkPorSymbol: Map<string, string>,
  hoje: string = hojeCivil(),
): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const e of eventos) {
    const dataPagamento = dataCivil(new Date(e.paymentDay));
    const dataCom = dataCivil(new Date(e.bookingDay));
    const provisionado = dataPagamento > hoje;
    const link = linkPorSymbol.get(e.symbol) ?? '/carteira';
    const base = {
      symbol: e.symbol,
      tipoProvento: e.tipo,
      bruto: round2(e.gross),
      liquido: round2(e.net),
      dataCom,
      dataPagamento,
      provisionado,
    };
    if (dataPagamento >= periodo.de && dataPagamento <= periodo.ate) {
      out.push({
        id: `provento:${e.symbol}:${e.tipo}:${dataPagamento}:pagamento`,
        tipo: 'provento',
        titulo: `${e.symbol} · ${e.tipo}`,
        data: dataPagamento,
        dataFim: null,
        hora: null,
        valor: round2(e.net),
        descricao: provisionado ? 'Pagamento previsto (provisionado)' : 'Pagamento',
        link,
        detalhe: { ...base, evento: 'pagamento' },
      });
    }
    if (dataCom !== dataPagamento && dataCom >= periodo.de && dataCom <= periodo.ate) {
      out.push({
        id: `provento:${e.symbol}:${e.tipo}:${dataPagamento}:data-com`,
        tipo: 'provento',
        titulo: `${e.symbol} · data-com`,
        data: dataCom,
        dataFim: null,
        hora: null,
        // Sem valor: o dinheiro entra na data de pagamento (evita contar 2×).
        valor: null,
        descricao: `${e.tipo}: último dia com direito; paga em ${dataPagamento.split('-').reverse().join('/')}`,
        link,
        detalhe: { ...base, evento: 'data-com' },
      });
    }
  }
  return out;
}

async function eventosResolvidos(userId: string): Promise<ProventoEvent[]> {
  const cache = getTtlCache<ProventoEvent[]>(CACHE_NS);
  const hit = cache.get(userId);
  if (hit) return hit;
  const { events } = await resolveProventoEvents(userId);
  cache.set(userId, events, CACHE_TTL_MS);
  return events;
}

export async function eventosProventos(userId: string, periodo: Periodo): Promise<EventoAgenda[]> {
  const eventos = await eventosResolvidos(userId);
  if (eventos.length === 0) return [];
  const symbols = [...new Set(eventos.map((e) => e.symbol))];
  const posicoes = await prisma.portfolio.findMany({
    where: { userId, asset: { symbol: { in: symbols } } },
    select: { id: true, asset: { select: { symbol: true } } },
  });
  const linkPorSymbol = new Map<string, string>();
  for (const p of posicoes) {
    if (p.asset?.symbol) linkPorSymbol.set(p.asset.symbol, `/ativos/${p.id}`);
  }
  return proventosComoEventos(eventos, periodo, linkPorSymbol);
}
