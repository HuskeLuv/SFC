'use client';

import React, { useMemo } from 'react';
import { formatBRL } from '@/utils/format';
import { useAgenda, type EventoAgenda, type TipoEvento } from '@/hooks/useAgenda';
import { corDoTipo, formatarDataCivil } from './agendaTipos';
import { periodoProximosDias, proximosEventos, resumoDoPeriodo } from './agendaResumo';

const DIAS_PROXIMOS = 30;

interface LinhaResumo {
  label: string;
  total: number;
  itens: number;
  /** Cor do marcador — segue a cor do tipo de evento que alimenta a linha. */
  tipo: TipoEvento;
  sinal: '+' | '-' | '';
}

function CardResumo({
  eventos,
  tipos,
  theme,
}: {
  eventos: EventoAgenda[];
  tipos: Set<TipoEvento>;
  theme: 'light' | 'dark';
}) {
  const resumo = useMemo(() => resumoDoPeriodo(eventos, tipos), [eventos, tipos]);

  const linhas: LinhaResumo[] = (
    [
      { label: 'A pagar', ...resumo.aPagar, tipo: 'divida', sinal: '-' },
      { label: 'A receber', ...resumo.aReceber, tipo: 'provento', sinal: '+' },
      { label: 'Vencendo (renda fixa)', ...resumo.vencimentosRf, tipo: 'rf', sinal: '' },
      { label: 'Impostos', ...resumo.impostos, tipo: 'ir', sinal: '-' },
      { label: 'Já pago', ...resumo.jaPago, tipo: 'divida', sinal: '' },
    ] satisfies LinhaResumo[]
  ).filter((l) => l.itens > 0);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
        Resumo do período
      </h3>
      {linhas.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Nada previsto no período que está aparecendo.
        </p>
      ) : (
        <ul className="space-y-2">
          {linhas.map((l) => (
            <li key={l.label} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-gray-600 dark:text-gray-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: corDoTipo(l.tipo, theme) }}
                />
                <span className="truncate">{l.label}</span>
                <span className="shrink-0 text-xs text-gray-400">({l.itens})</span>
              </span>
              <span className="shrink-0 font-medium text-gray-800 tabular-nums dark:text-white/90">
                {l.sinal}
                {formatBRL(l.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CardProximos({
  tipos,
  theme,
  onSelecionar,
}: {
  tipos: Set<TipoEvento>;
  theme: 'light' | 'dark';
  onSelecionar: (evento: EventoAgenda) => void;
}) {
  // Janela fixa a partir de hoje — independente do mês que o calendário mostra.
  const periodo = useMemo(() => periodoProximosDias(DIAS_PROXIMOS), []);
  const agenda = useAgenda(periodo);
  const eventos = useMemo(
    () => proximosEventos(agenda.data?.eventos ?? [], tipos),
    [agenda.data, tipos],
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">
        Próximos {DIAS_PROXIMOS} dias
      </h3>
      {agenda.isLoading ? (
        <p className="text-xs text-gray-400">Carregando…</p>
      ) : eventos.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Nada nos próximos {DIAS_PROXIMOS} dias.
        </p>
      ) : (
        <ul className="space-y-2">
          {eventos.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelecionar(e)}
                className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: corDoTipo(e.tipo, theme) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-700 dark:text-gray-200">
                    {e.titulo}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatarDataCivil(e.data)}
                    {e.valor != null ? ` · ${formatBRL(e.valor)}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Painel lateral da Agenda: o que o período visível concentra (resumo) e o
 * que vem pela frente nos próximos 30 dias, contando a partir de hoje.
 */
export default function AgendaPainel({
  eventos,
  tipos,
  theme,
  onSelecionar,
}: {
  eventos: EventoAgenda[];
  tipos: Set<TipoEvento>;
  theme: 'light' | 'dark';
  onSelecionar: (evento: EventoAgenda) => void;
}) {
  return (
    <>
      <CardResumo eventos={eventos} tipos={tipos} theme={theme} />
      <CardProximos tipos={tipos} theme={theme} onSelecionar={onSelecionar} />
    </>
  );
}
