'use client';

import React, { useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import type { EventoAgenda, Periodo } from '@/services/calendario/types';
import { dataCivilLocal, periodoDaVisao } from './agendaTipos';

interface Props {
  eventos: EventInput[];
  podeCriar: boolean;
  onPeriodo: (periodo: Periodo) => void;
  onSelecionarDia: (data: string) => void;
  onClicarEvento: (evento: EventoAgenda) => void;
  onNovo: () => void;
}

function conteudoDoEvento(arg: EventContentArg) {
  const cor = arg.event.extendedProps.cor as string;
  const evento = arg.event.extendedProps.evento as EventoAgenda | undefined;
  const pago = evento?.tipo === 'divida' && evento.detalhe.paga === true;
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs leading-tight ${pago ? 'opacity-60' : ''}`}
      style={{ backgroundColor: `${cor}22`, borderLeft: `3px solid ${cor}` }}
      title={arg.event.title}
    >
      {arg.timeText ? <span className="shrink-0 font-medium">{arg.timeText}</span> : null}
      <span className={`truncate ${pago ? 'line-through' : ''}`}>{arg.event.title}</span>
    </div>
  );
}

const LARGURA_MOBILE = 768;

/**
 * Grade do FullCalendar (mês, semana, lista). Carregado sob demanda pelo
 * container (next/dynamic) para não pesar o bundle inicial.
 *
 * No celular a grade de mês fica ilegível (5 colunas de 60px), então a visão
 * inicial é a LISTA e a barra perde a visão de semana. `initialView` só é lida
 * na montagem — girar o aparelho não troca a visão de propósito, para não
 * perder o que o usuário escolheu.
 */
export default function AgendaFullCalendar({
  eventos,
  podeCriar,
  onPeriodo,
  onSelecionarDia,
  onClicarEvento,
  onNovo,
}: Props) {
  const mobile = useMemo(
    () => typeof window !== 'undefined' && window.innerWidth < LARGURA_MOBILE,
    [],
  );

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => onPeriodo(periodoDaVisao(arg.view.activeStart, arg.view.activeEnd)),
    [onPeriodo],
  );
  const handleSelect = useCallback(
    (arg: DateSelectArg) => {
      if (podeCriar) onSelecionarDia(dataCivilLocal(arg.start));
    },
    [onSelecionarDia, podeCriar],
  );
  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      arg.jsEvent.preventDefault();
      const evento = arg.event.extendedProps.evento as EventoAgenda | undefined;
      if (evento) onClicarEvento(evento);
    },
    [onClicarEvento],
  );

  return (
    <div className="custom-calendar agenda-calendar">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locale={ptBrLocale}
        initialView={mobile ? 'listMonth' : 'dayGridMonth'}
        height="auto"
        headerToolbar={{
          left: podeCriar ? 'prev,next today novoEvento' : 'prev,next today',
          center: 'title',
          right: mobile ? 'dayGridMonth,listMonth' : 'dayGridMonth,timeGridWeek,listMonth',
        }}
        buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', list: 'Lista' }}
        customButtons={{ novoEvento: { text: '+ Novo evento', click: onNovo } }}
        events={eventos}
        selectable={podeCriar}
        dayMaxEvents={4}
        moreLinkText={(n) => `+${n} mais`}
        noEventsText="Nenhum evento neste período"
        datesSet={handleDatesSet}
        select={handleSelect}
        eventClick={handleEventClick}
        eventContent={conteudoDoEvento}
        eventDisplay="block"
        displayEventTime={true}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      />
    </div>
  );
}
