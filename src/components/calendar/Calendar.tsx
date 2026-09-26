'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { CalendarApi } from '@fullcalendar/core';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useTheme } from '@/context/ThemeContext';
import { useAuthOptional } from '@/context/AuthContext';
import {
  useAgenda,
  useCriarEvento,
  useEditarEvento,
  useExcluirEvento,
  type EventoAgenda,
  type EventoManualPayload,
  type Periodo,
  type TipoEvento,
} from '@/hooks/useAgenda';
import AgendaEventoModal, { FORM_VAZIO, type EventoFormValores } from './AgendaEventoModal';
import AgendaDetalheModal from './AgendaDetalheModal';
import AgendaPainel, { CardResumo } from './AgendaPainel';
import AgendaMobileHeader, { AGENDA_LISTA_QUERY } from './mobile/AgendaMobileHeader';
import AgendaFiltrosSheet from './mobile/AgendaFiltrosSheet';
import { resumoDoPeriodo } from './agendaResumo';
import { MobileCollapsible } from '@/components/ui/mobile/MobileCollapsible';
import { useResponsiveConfirm } from '@/components/ui/sheet/useResponsiveConfirm';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatBRL } from '@/utils/format';
import {
  TIPOS_DISPONIVEIS,
  TIPOS_META,
  corDoTipo,
  gravarTiposVisiveis,
  lerTiposVisiveis,
  metaDoTipo,
  paraFullCalendar,
  tiposPadrao,
} from './agendaTipos';

const AgendaFullCalendar = dynamic(() => import('./AgendaFullCalendar'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center">
      <LoadingSpinner text="Carregando o calendário…" />
    </div>
  ),
});

type ModalEstado =
  | { modo: 'novo'; inicial: EventoFormValores }
  | { modo: 'editar'; eventoId: string; inicial: EventoFormValores }
  | { modo: 'detalhe'; evento: EventoAgenda }
  | null;

function formDoEvento(e: EventoAgenda): EventoFormValores {
  const d = e.detalhe;
  return {
    titulo: e.titulo,
    data: typeof d.dataBase === 'string' ? d.dataBase : e.data,
    dataFim: typeof d.dataFimBase === 'string' ? d.dataFimBase : (e.dataFim ?? ''),
    hora: e.hora ?? '',
    categoria: String(d.categoria ?? 'pessoal'),
    recorrencia: String(d.recorrencia ?? 'nenhuma'),
    lembrete: d.lembrete === true,
    descricao: e.descricao ?? '',
  };
}

/**
 * Agenda financeira (página /calendario): eventos calculados (dívidas,
 * proventos, renda fixa, IR, planejamento, mercado) + eventos do usuário, com
 * filtros por tipo, painel lateral (resumo do período + próximos 30 dias),
 * criação/edição com histórico e detalhe com atalho para a tela de origem.
 *
 * PWA fase 3: abaixo de 768px (decisão do Wellington; de 768 a 1023 fica a grade) a Agenda é a
 * lista do mês com cabeçalho próprio (AgendaMobileHeader: ‹ mês ›, Hoje, Filtros, + Novo), o
 * resumo do período recolhível acima, os tipos num sheet (AgendaFiltrosSheet) e sem o painel
 * lateral. Excluir evento confirma em sheet abaixo de lg. Desktop igual.
 */
export default function Calendar() {
  const { theme } = useTheme();
  const auth = useAuthOptional();
  const podeEscrever = !auth?.actingClient;

  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [tipos, setTipos] = useState<Set<TipoEvento>>(() => tiposPadrao());
  const [modal, setModal] = useState<ModalEstado>(null);
  const [erroMutacao, setErroMutacao] = useState<string | null>(null);
  const lista = useMediaQuery(AGENDA_LISTA_QUERY);
  const [calendarApi, setCalendarApi] = useState<CalendarApi | null>(null);
  const [cabecalho, setCabecalho] = useState({ titulo: '', contemHoje: true });
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const { confirmAndRun, confirmSheet } = useResponsiveConfirm();

  // localStorage só no cliente, depois da hidratação (evita mismatch).
  useEffect(() => {
    setTipos(lerTiposVisiveis());
  }, []);

  const agenda = useAgenda(periodo);
  const criar = useCriarEvento();
  const editar = useEditarEvento();
  const excluir = useExcluirEvento();
  const salvando = criar.isPending || editar.isPending || excluir.isPending;

  const eventos = useMemo(() => agenda.data?.eventos ?? [], [agenda.data]);
  const contagem = useMemo(() => {
    const c = new Map<TipoEvento, number>();
    for (const e of eventos) c.set(e.tipo, (c.get(e.tipo) ?? 0) + 1);
    return c;
  }, [eventos]);
  const eventosFc = useMemo(
    () => eventos.filter((e) => tipos.has(e.tipo)).map((e) => paraFullCalendar(e, theme)),
    [eventos, tipos, theme],
  );

  const alternarTipo = useCallback((tipo: TipoEvento) => {
    setTipos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      gravarTiposVisiveis(next);
      return next;
    });
  }, []);

  const fechar = useCallback(() => {
    setModal(null);
    setErroMutacao(null);
  }, []);

  const abrirNovo = useCallback(
    (data?: string) => {
      if (!podeEscrever) return;
      setErroMutacao(null);
      setModal({ modo: 'novo', inicial: { ...FORM_VAZIO, data: data ?? '' } });
    },
    [podeEscrever],
  );

  const abrirEvento = useCallback((evento: EventoAgenda) => {
    setErroMutacao(null);
    setModal({ modo: 'detalhe', evento });
  }, []);

  const abrirEdicao = useCallback((evento: EventoAgenda) => {
    const id = evento.detalhe.eventoId;
    if (typeof id !== 'string') return;
    setModal({ modo: 'editar', eventoId: id, inicial: formDoEvento(evento) });
  }, []);

  const salvar = useCallback(
    (payload: EventoManualPayload) => {
      if (!modal || modal.modo === 'detalhe') return;
      setErroMutacao(null);
      const fn =
        modal.modo === 'novo'
          ? criar.mutateAsync(payload)
          : editar.mutateAsync({ id: modal.eventoId, payload });
      fn.then(fechar).catch((e: Error) => setErroMutacao(e.message));
    },
    [modal, criar, editar, fechar],
  );

  const excluirAtual = useCallback(() => {
    if (!modal || modal.modo !== 'editar') return;
    setErroMutacao(null);
    excluir
      .mutateAsync(modal.eventoId)
      .then(fechar)
      .catch((e: Error) => setErroMutacao(e.message));
  }, [modal, excluir, fechar]);

  // Celular (abaixo de lg): a confirmação sai do modal (que fica por cima de qualquer sheet) e vem
  // em sheet; cancelar reabre a edição como estava.
  const pedirExclusao = useCallback(() => {
    if (!modal || modal.modo !== 'editar') return;
    const atual = modal;
    setModal(null);
    setErroMutacao(null);
    void confirmAndRun(
      {
        title: 'Excluir este evento?',
        message: atual.inicial.titulo ? `"${atual.inicial.titulo}" some da Agenda.` : undefined,
        confirmLabel: 'Excluir',
        danger: true,
        busyLabel: 'Excluindo…',
      },
      async () => {
        await excluir.mutateAsync(atual.eventoId);
      },
    ).then((ok) => {
      if (!ok) setModal(atual);
    });
  }, [modal, confirmAndRun, excluir]);

  const fontesComErro = agenda.data?.fontesComErro ?? [];
  const ocultos = TIPOS_DISPONIVEIS.filter((t) => !tipos.has(t)).length;
  const resumoMobile = useMemo(
    () => (lista ? resumoDoPeriodo(eventos, tipos) : null),
    [lista, eventos, tipos],
  );

  return (
    <div className="grid grid-cols-1 gap-5 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
      {lista ? (
        <>
          <AgendaMobileHeader
            api={calendarApi}
            titulo={cabecalho.titulo}
            contemHoje={cabecalho.contemHoje}
            ocultos={ocultos}
            totalEventos={eventosFc.length}
            podeCriar={podeEscrever}
            onNovo={() => abrirNovo()}
            onFiltros={() => setFiltrosAbertos(true)}
          />
          {podeEscrever ? null : (
            <p
              data-mf-mobile=""
              className="rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"
            >
              Você está vendo a agenda do cliente. Só o cliente cria e edita eventos.
            </p>
          )}
          <div data-mf-mobile="">
            <MobileCollapsible
              id="agenda-resumo-periodo"
              title="Resumo do período"
              summary={
                resumoMobile && resumoMobile.aPagar.itens > 0
                  ? `${formatBRL(resumoMobile.aPagar.total)} a pagar`
                  : 'nada a pagar'
              }
            >
              <CardResumo eventos={eventos} tipos={tipos} theme={theme} semTitulo />
            </MobileCollapsible>
          </div>
        </>
      ) : null}
      <div className="relative rounded-2xl border border-gray-200 bg-white p-4 max-md:border-0 max-md:bg-transparent max-md:p-0 dark:border-gray-800 dark:bg-white/[0.03] dark:max-md:bg-transparent">
        {agenda.isError && (
          <div
            role="alert"
            className="mb-3 flex items-center justify-between rounded-lg bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10"
          >
            <span>Não consegui carregar a agenda. {agenda.error?.message}</span>
            <button
              type="button"
              onClick={() => agenda.refetch()}
              className="font-medium underline"
            >
              Tentar de novo
            </button>
          </div>
        )}
        {fontesComErro.length > 0 && (
          <p className="mb-3 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
            Uma parte da agenda não carregou:{' '}
            {fontesComErro.map((t) => metaDoTipo(t).label.toLowerCase()).join(', ')}. Os outros
            eventos estão completos.
          </p>
        )}
        {agenda.isFetching && (
          <div
            className="pointer-events-none absolute top-4 right-4 z-10 text-xs text-gray-400"
            aria-live="polite"
          >
            Atualizando…
          </div>
        )}
        <AgendaFullCalendar
          eventos={eventosFc}
          podeCriar={podeEscrever}
          onPeriodo={setPeriodo}
          onSelecionarDia={abrirNovo}
          onClicarEvento={abrirEvento}
          onNovo={() => abrirNovo()}
          lista={lista}
          onApi={setCalendarApi}
          onTitulo={setCabecalho}
        />
      </div>

      {lista ? (
        <p data-mf-mobile="" className="px-1 text-xs text-gray-500 dark:text-gray-400">
          Parcelas, proventos e vencimentos vêm das telas de Dívidas e Carteira e não podem ser
          editados aqui. Eventos criados ou alterados ficam no{' '}
          <Link
            href="/historico-alteracoes"
            className="text-mf-patrimonio underline dark:text-mf-tranquilidade"
          >
            Histórico
          </Link>
          , com Desfazer.
        </p>
      ) : (
        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Mostrar</h3>
            <ul className="space-y-2">
              {TIPOS_META.map((m) => {
                const disponivel = TIPOS_DISPONIVEIS.includes(m.tipo);
                const n = contagem.get(m.tipo) ?? 0;
                return (
                  <li key={m.tipo}>
                    <label
                      className={`flex cursor-pointer items-start gap-2 text-sm ${disponivel ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}
                      title={m.descricao}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300"
                        checked={tipos.has(m.tipo)}
                        disabled={!disponivel}
                        onChange={() => alternarTipo(m.tipo)}
                        aria-label={m.label}
                      />
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: corDoTipo(m.tipo, theme) }}
                      />
                      <span className="flex-1 leading-snug">
                        {m.label}
                        {disponivel && n > 0 ? (
                          <span className="ml-1 text-xs text-gray-400">({n})</span>
                        ) : null}
                        {!disponivel ? <span className="ml-1 text-xs">em breve</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <AgendaPainel eventos={eventos} tipos={tipos} theme={theme} onSelecionar={abrirEvento} />
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            {podeEscrever ? (
              <p>
                Clique num dia para anotar um evento. Parcelas, proventos e vencimentos vêm das
                telas de Dívidas e Carteira e não podem ser editados aqui.
              </p>
            ) : (
              <p>Você está vendo a agenda do cliente. Só o cliente cria e edita eventos.</p>
            )}
            <p className="mt-2">
              Eventos criados ou alterados ficam no{' '}
              <Link href="/historico-alteracoes" className="text-brand-500 underline">
                Histórico
              </Link>
              , com Desfazer.
            </p>
          </div>
        </aside>
      )}

      {modal && modal.modo !== 'detalhe' && (
        <AgendaEventoModal
          aberto={true}
          modo={modal.modo}
          inicial={modal.inicial}
          salvando={salvando}
          erro={erroMutacao}
          onClose={fechar}
          onSalvar={salvar}
          onExcluir={modal.modo === 'editar' ? excluirAtual : undefined}
          onPedirExclusao={modal.modo === 'editar' ? pedirExclusao : undefined}
        />
      )}
      {modal && modal.modo === 'detalhe' && (
        <AgendaDetalheModal
          evento={modal.evento}
          theme={theme}
          podeEditar={podeEscrever}
          onClose={fechar}
          onEditar={abrirEdicao}
        />
      )}
      {lista ? (
        <AgendaFiltrosSheet
          isOpen={filtrosAbertos}
          onClose={() => setFiltrosAbertos(false)}
          tipos={tipos}
          contagem={contagem}
          theme={theme}
          onAlternar={alternarTipo}
          totalVisiveis={eventosFc.length}
        />
      ) : null}
      {confirmSheet}
    </div>
  );
}
