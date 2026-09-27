'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarApi } from '@fullcalendar/core';
import { MobileActionSheet, MobileMoreButton } from '@/components/ui/sheet/MobileActionSheet';
import { EDGE_TO_EDGE, STICKY_UNDER_HEADER } from '@/lib/ui/mobile';

/**
 * Corte da lista da Agenda (decisão do Wellington, fase 3): abaixo de 768px a Agenda é a lista do
 * mês com este cabeçalho; de 768 a 1023 o tablet mantém a grade de mês de hoje.
 */
export const AGENDA_LISTA_QUERY = '(max-width: 767.98px)';

/** Altura da barra do mês (a mesma da variável --agenda-bar-h do agenda-mobile.css). */
const BARRA_ALTURA = '3.5rem';

interface AgendaMobileHeaderProps {
  /** API do FullCalendar (null enquanto o calendário carrega). */
  api: CalendarApi | null;
  /** Título do período visível (api.view.title, atualizado no datesSet). */
  titulo: string;
  /** O período visível contém hoje ("Hoje" fica desabilitado, como no FullCalendar). */
  contemHoje: boolean;
  /** Tipos disponíveis desligados nos filtros. */
  ocultos: number;
  /** Eventos visíveis no período. */
  totalEventos: number;
  podeCriar: boolean;
  onNovo: () => void;
  onFiltros: () => void;
}

const capitalizar = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const SETA = 'M15 6l-6 6 6 6';

/**
 * Cabeçalho próprio da Agenda no celular (PWA fase 3): barra do mês fixa sob o cabeçalho do app
 * (‹ mês ›, Hoje) e, abaixo, Filtros, "+ Novo" (só o cliente — o consultor vê o aviso de hoje) e
 * o ⋯ com o atalho para "Lembretes e iCal" do Perfil. Substitui a toolbar do FullCalendar.
 */
export default function AgendaMobileHeader({
  api,
  titulo,
  contemHoje,
  ocultos,
  totalEventos,
  podeCriar,
  onNovo,
  onFiltros,
}: AgendaMobileHeaderProps) {
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);

  const botaoSeta =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-700 active:bg-gray-200 disabled:opacity-40 dark:text-gray-200 dark:active:bg-white/10';

  return (
    <div data-mf-mobile="" className="space-y-2">
      <div
        data-mf-agenda-barra=""
        className={`${STICKY_UNDER_HEADER} ${EDGE_TO_EDGE} flex items-center gap-1 bg-gray-50 px-3 dark:bg-gray-900`}
        style={{ height: BARRA_ALTURA }}
      >
        <button
          type="button"
          onClick={() => api?.prev()}
          disabled={!api}
          aria-label="Mês anterior"
          className={botaoSeta}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d={SETA}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <p
          data-mf-agenda-titulo=""
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-center text-base font-semibold text-gray-900 dark:text-white/90"
        >
          {capitalizar(titulo) || ' '}
        </p>
        <button
          type="button"
          onClick={() => api?.next()}
          disabled={!api}
          aria-label="Próximo mês"
          className={botaoSeta}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d={SETA}
              transform="rotate(180 12 12)"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* Pílula de 36px visível; o ::before estende a área de toque para 48px. */}
        <button
          type="button"
          onClick={() => api?.today()}
          disabled={!api || contemHoje}
          className="relative ml-1 inline-flex h-9 shrink-0 items-center rounded-full border border-gray-300 px-3.5 text-sm font-semibold text-mf-patrimonio before:absolute before:-inset-1.5 before:content-[''] disabled:opacity-45 dark:border-gray-700 dark:text-mf-tranquilidade"
        >
          Hoje
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onFiltros}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16M7 12h10M10 18h4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Filtros
          {ocultos > 0 ? (
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
              · {ocultos} oculto{ocultos !== 1 ? 's' : ''}
            </span>
          ) : null}
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {totalEventos} evento{totalEventos !== 1 ? 's' : ''}
        </span>
        {podeCriar ? (
          <button
            type="button"
            onClick={onNovo}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-mf-seguranca px-4 text-sm font-semibold text-white dark:bg-mf-patrimonio"
          >
            <span aria-hidden="true">+</span> Novo
          </button>
        ) : null}
        <MobileMoreButton onClick={() => setMenuAberto(true)} label="Mais ações da Agenda" />
      </div>

      <MobileActionSheet
        isOpen={menuAberto}
        onClose={() => setMenuAberto(false)}
        title="Agenda"
        actions={[
          {
            id: 'lembretes',
            label: 'Lembretes e iCal',
            hint: 'No Perfil: avisos da Agenda e o link para o calendário do celular',
            onSelect: () => router.push('/profile'),
          },
        ]}
      />
    </div>
  );
}
