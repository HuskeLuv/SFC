/**
 * Fonte "mercado" nova, atrás de ANALISE_ATIVOS_HABILITADA (desligada por padrão): datas de
 * resultado (ITR/DFP — estimadas até a entrega real, decisão 17) e assembleias (AGO/AGE, IPE da CVM)
 * das AÇÕES que o usuário tem em carteira. Dados gravados pelo job cvm-ipe em asset_eventos.
 *
 * Flag desligada ⇒ devolve [] sem nenhuma consulta (o comportamento da Agenda não muda).
 * Fase 1 (fatia D, decisão 10): só quem TEM ACESSO à área vê estas datas — vale o acesso do DONO
 * da agenda (o conteúdo é a carteira dele; a role é buscada por podeAcessarAnaliseAtivos).
 * Estimado já substituído pela data real não aparece (o real aparece no lugar).
 * Link: página do ativo '/analise-ativos/<1º símbolo em ordem>' (o título mantém 'PETR3/PETR4').
 */
import prisma from '@/lib/prisma';
import { analiseAtivosHabilitada } from '@/lib/analiseAtivosConfig';
import { podeAcessarAnaliseAtivos } from '@/services/analiseAtivos/acesso/acessoAnalise';
import {
  descricaoAssembleia,
  descricaoResultado,
  tituloAssembleia,
  tituloResultado,
} from '@/services/analiseAtivos/eventos/textosEventos';
import { listarTickersAcoes } from '@/services/analiseAtivos/repositorio/universo';
import type { EventoAgenda, Periodo } from '../types';
import { dataCivil, deDataCivil } from '../datas';

export interface AssetEventoAgenda {
  id: string;
  cnpj: string;
  tipo: string;
  subtipo: string;
  periodoRef: string | null;
  data: Date;
  estimado: boolean;
}

export function assetEventosComoAgenda(
  eventos: AssetEventoAgenda[],
  symbolsPorCnpj: Map<string, string[]>,
  periodo: Periodo,
): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const e of eventos) {
    const data = dataCivil(e.data);
    if (data < periodo.de || data > periodo.ate) continue;
    const symbols = symbolsPorCnpj.get(e.cnpj);
    if (!symbols || symbols.length === 0) continue;
    // PETR3 e PETR4 na carteira ⇒ um evento só ('PETR3/PETR4'): a assembleia é do emissor
    const ordenados = [...symbols].sort();
    const symbol = ordenados.join('/');
    const ehAssembleia = e.tipo === 'assembleia';
    const ref = e.periodoRef ?? '';
    out.push({
      id: `mercado:analise-ativos:${e.id}`,
      tipo: 'mercado',
      titulo: ehAssembleia
        ? tituloAssembleia(symbol, e.subtipo)
        : tituloResultado(symbol, ref, e.estimado),
      data,
      dataFim: null,
      hora: null,
      valor: null,
      descricao: ehAssembleia
        ? descricaoAssembleia(e.subtipo)
        : descricaoResultado(e.estimado, ref),
      link: `/analise-ativos/${encodeURIComponent(ordenados[0])}`,
      detalhe: {
        evento: ehAssembleia ? 'assembleia' : 'resultado',
        symbol,
        subtipo: e.subtipo,
        periodoRef: e.periodoRef,
        estimado: e.estimado,
        fonte: 'CVM',
      },
    });
  }
  return out;
}

export async function eventosResultadosAnaliseAtivos(
  userId: string,
  periodo: Periodo,
): Promise<EventoAgenda[]> {
  if (!analiseAtivosHabilitada()) return [];
  if (!(await podeAcessarAnaliseAtivos(userId))) return [];

  const posicoes = await prisma.portfolio.findMany({
    where: { userId, quantity: { gt: 0 }, asset: { symbol: { not: '' } } },
    select: { asset: { select: { symbol: true } } },
  });
  const daCarteira = new Set(
    posicoes.map((p) => p.asset?.symbol?.toUpperCase()).filter((s): s is string => !!s),
  );
  if (daCarteira.size === 0) return [];

  // ticker → emissor pelo cadastro próprio da análise (nunca por Asset.type)
  const tickers = await listarTickersAcoes(prisma);
  const symbolsPorCnpj = new Map<string, string[]>();
  for (const t of tickers) {
    if (!daCarteira.has(t.symbol)) continue;
    const lista = symbolsPorCnpj.get(t.cnpj) ?? [];
    if (!lista.includes(t.symbol)) lista.push(t.symbol);
    symbolsPorCnpj.set(t.cnpj, lista);
  }
  if (symbolsPorCnpj.size === 0) return [];

  const eventos = await prisma.assetEvento.findMany({
    where: {
      cnpj: { in: [...symbolsPorCnpj.keys()] },
      data: { gte: deDataCivil(periodo.de), lte: deDataCivil(periodo.ate) },
      OR: [
        { tipo: { in: ['assembleia', 'resultado'] } },
        { tipo: 'resultado_estimado', substituidoEm: null },
      ],
    },
    select: {
      id: true,
      cnpj: true,
      tipo: true,
      subtipo: true,
      periodoRef: true,
      data: true,
      estimado: true,
    },
    orderBy: [{ data: 'asc' }, { cnpj: 'asc' }],
  });
  return assetEventosComoAgenda(eventos, symbolsPorCnpj, periodo);
}
