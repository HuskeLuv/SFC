/**
 * Fonte "manual": eventos escritos pelo usuário (tabela Event), com a
 * recorrência mensal/anual expandida em ocorrências dentro do período.
 */
import prisma from '@/lib/prisma';
import type { Event } from '@prisma/client';
import type { EventoAgenda, Periodo } from '../types';
import { camposDoEvento, type CamposEvento } from '../eventoManual';
import { deDataCivil, diasNoMes, diffDias, montar, partes, somarDias } from '../datas';

type Base = Pick<CamposEvento, 'data' | 'dataFim' | 'recorrencia'>;

/** Dias de cada ocorrência (base ou repetida) dentro do período. */
export function datasDasOcorrencias(base: Base, periodo: Periodo): string[] {
  const duracao = base.dataFim ? Math.max(0, diffDias(base.data, base.dataFim)) : 0;
  const cabe = (inicio: string) =>
    inicio <= periodo.ate && somarDias(inicio, duracao) >= periodo.de && inicio >= base.data;

  if (base.recorrencia !== 'mensal' && base.recorrencia !== 'anual') {
    return cabe(base.data) ? [base.data] : [];
  }

  const b = partes(base.data);
  const de = partes(periodo.de);
  const ate = partes(periodo.ate);
  const out: string[] = [];
  if (base.recorrencia === 'mensal') {
    // Um mês antes do período, para pegar ocorrência de vários dias que começou antes.
    let ano = de.ano;
    let mes = de.mes - 1;
    while (ano < ate.ano || (ano === ate.ano && mes <= ate.mes)) {
      const dia = Math.min(b.dia, diasNoMes(ano, mes));
      const d = montar(ano, mes, dia);
      if (cabe(d)) out.push(d);
      mes += 1;
      if (mes > 11) {
        mes = 0;
        ano += 1;
      }
    }
  } else {
    for (let ano = de.ano - 1; ano <= ate.ano; ano += 1) {
      const dia = Math.min(b.dia, diasNoMes(ano, b.mes));
      const d = montar(ano, b.mes, dia);
      if (cabe(d)) out.push(d);
    }
  }
  return out;
}

export function expandirEvento(e: Event, periodo: Periodo): EventoAgenda[] {
  const campos = camposDoEvento(e);
  const duracao = campos.dataFim ? Math.max(0, diffDias(campos.data, campos.dataFim)) : 0;
  return datasDasOcorrencias(campos, periodo).map((data) => ({
    id: `manual:${e.id}:${data}`,
    tipo: 'manual',
    titulo: campos.titulo,
    data,
    dataFim: duracao > 0 ? somarDias(data, duracao) : null,
    hora: campos.hora,
    valor: null,
    descricao: campos.descricao,
    link: null,
    detalhe: {
      eventoId: e.id,
      categoria: campos.categoria,
      recorrencia: campos.recorrencia,
      lembrete: campos.lembrete,
      ocorrencia: data !== campos.data,
    },
  }));
}

export async function eventosManuais(userId: string, periodo: Periodo): Promise<EventoAgenda[]> {
  const de = deDataCivil(periodo.de);
  const ate = deDataCivil(periodo.ate);
  const eventos = await prisma.event.findMany({
    where: {
      userId,
      date: { lte: ate },
      OR: [
        { date: { gte: de } },
        { endDate: { gte: de } },
        { recorrencia: { in: ['mensal', 'anual'] } },
      ],
    },
    orderBy: { date: 'asc' },
    take: 1000,
  });
  return eventos.flatMap((e) => expandirEvento(e, periodo));
}
