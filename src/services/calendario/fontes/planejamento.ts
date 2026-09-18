/**
 * Fonte "planejamento": data-alvo dos objetivos (sonhos) e a aposentadoria
 * prevista.
 *
 * Objetivo: a janela de aportes vai de `startDate` (AAAA-MM) por `months`
 * meses — mesma convenção da linha-espelho no fluxo de caixa
 * (sonhoCashflowSync). A data-alvo é o ÚLTIMO DIA do último mês da janela.
 * Objetivo sem `startDate` (ainda não iniciado) não tem data e fica de fora.
 *
 * Aposentadoria: o plano guarda idade atual, idade de aposentadoria e o mês
 * em que o acompanhamento começou — a data prevista é `trackStart` + os anos
 * que faltam.
 */
import prisma from '@/lib/prisma';
import type { EventoAgenda, Periodo } from '../types';
import { diasNoMes, montar } from '../datas';

const LINK = '/planejamento-financeiro';

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface ObjetivoResumido {
  id: string;
  name: string;
  target: number;
  months: number;
  startDate: string | null;
  status: string;
  category: string;
}

export interface AposentadoriaResumida {
  idade: number;
  apos: number;
  trackStartMonth: number;
  trackStartYear: number;
}

/** Último dia do mês que fecha a janela (`startDate` + `months` - 1). */
export function dataAlvoObjetivo(startDate: string, months: number): string {
  const [ano, mes] = startDate.split('-').map(Number);
  // mes é 1-indexado no banco; (mes - 1) + (months - 1) vira o índice 0-based.
  const indice = mes - 1 + Math.max(1, months) - 1;
  const anoAlvo = ano + Math.floor(indice / 12);
  const mesAlvo = ((indice % 12) + 12) % 12;
  return montar(anoAlvo, mesAlvo, diasNoMes(anoAlvo, mesAlvo));
}

export function objetivosComoEventos(
  objetivos: ObjetivoResumido[],
  periodo: Periodo,
): EventoAgenda[] {
  const out: EventoAgenda[] = [];
  for (const o of objetivos) {
    if (!o.startDate) continue;
    const data = dataAlvoObjetivo(o.startDate, o.months);
    if (data < periodo.de || data > periodo.ate) continue;
    out.push({
      id: `planejamento:objetivo:${o.id}`,
      tipo: 'planejamento',
      titulo: `${o.name} · data-alvo`,
      data,
      dataFim: null,
      hora: null,
      valor: round2(o.target),
      descricao: `Fim do prazo de ${o.months} ${o.months === 1 ? 'mês' : 'meses'} do objetivo (${o.status.toLowerCase()}).`,
      link: LINK,
      detalhe: {
        evento: 'objetivo',
        objetivoId: o.id,
        status: o.status,
        meta: round2(o.target),
        months: o.months,
        inicio: o.startDate,
      },
    });
  }
  return out;
}

export function aposentadoriaComoEvento(
  plano: AposentadoriaResumida | null,
  periodo: Periodo,
): EventoAgenda[] {
  if (!plano) return [];
  const anosRestantes = plano.apos - plano.idade;
  if (anosRestantes < 0) return [];
  const anoAlvo = plano.trackStartYear + anosRestantes;
  const data = montar(anoAlvo, plano.trackStartMonth - 1, 1);
  if (data < periodo.de || data > periodo.ate) return [];
  return [
    {
      id: `planejamento:aposentadoria:${anoAlvo}`,
      tipo: 'planejamento',
      titulo: 'Aposentadoria prevista',
      data,
      dataFim: null,
      hora: null,
      valor: null,
      descricao: `Mês em que você completa ${plano.apos} anos no plano de aposentadoria.`,
      link: LINK,
      detalhe: { evento: 'aposentadoria', idadeAlvo: plano.apos, ano: anoAlvo },
    },
  ];
}

export async function eventosPlanejamento(
  userId: string,
  periodo: Periodo,
): Promise<EventoAgenda[]> {
  const [objetivos, plano] = await Promise.all([
    prisma.planejamentoObjetivo.findMany({
      // Concluído não tem mais prazo a cumprir; os demais status (inclusive
      // pausado/atrasado) mantêm a data-alvo à vista.
      where: { userId, status: { not: 'Concluído' }, startDate: { not: null } },
      select: {
        id: true,
        name: true,
        target: true,
        months: true,
        startDate: true,
        status: true,
        category: true,
      },
    }),
    prisma.aposentadoriaPlano.findUnique({
      where: { userId },
      select: { idade: true, apos: true, trackStartMonth: true, trackStartYear: true },
    }),
  ]);

  const resumidos: ObjetivoResumido[] = objetivos.map((o) => ({
    id: o.id,
    name: o.name,
    target: Number(o.target),
    months: o.months,
    startDate: o.startDate,
    status: o.status,
    category: o.category,
  }));

  return [...objetivosComoEventos(resumidos, periodo), ...aposentadoriaComoEvento(plano, periodo)];
}
