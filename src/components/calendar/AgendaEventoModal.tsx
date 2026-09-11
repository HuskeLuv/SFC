'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import type { EventoManualPayload } from '@/hooks/useAgenda';

export interface EventoFormValores {
  titulo: string;
  data: string;
  dataFim: string;
  hora: string;
  categoria: string;
  recorrencia: string;
  lembrete: boolean;
  descricao: string;
}

export const FORM_VAZIO: EventoFormValores = {
  titulo: '',
  data: '',
  dataFim: '',
  hora: '',
  categoria: 'pessoal',
  recorrencia: 'nenhuma',
  lembrete: false,
  descricao: '',
};

interface Props {
  aberto: boolean;
  modo: 'novo' | 'editar';
  inicial: EventoFormValores;
  salvando: boolean;
  erro: string | null;
  onClose: () => void;
  onSalvar: (payload: EventoManualPayload) => void;
  onExcluir?: () => void;
}

const INPUT =
  'dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800';
const LABEL = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400';

const CATEGORIAS = [
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'recebimento', label: 'Recebimento' },
  { value: 'lembrete', label: 'Lembrete' },
];
const RECORRENCIAS = [
  { value: 'nenhuma', label: 'Não repete' },
  { value: 'mensal', label: 'Todo mês' },
  { value: 'anual', label: 'Todo ano' },
];

/** Converte os valores do formulário no corpo aceito por POST/PATCH /api/calendar. */
export function formParaPayload(v: EventoFormValores): EventoManualPayload {
  return {
    titulo: v.titulo.trim(),
    data: v.data,
    dataFim: v.dataFim || null,
    hora: v.hora || null,
    categoria: v.categoria,
    recorrencia: v.recorrencia,
    lembrete: v.lembrete,
    descricao: v.descricao.trim() || null,
  };
}

export function validarForm(v: EventoFormValores): string | null {
  if (!v.titulo.trim()) return 'Dê um título ao evento.';
  if (!v.data) return 'Escolha a data.';
  if (v.dataFim && v.dataFim < v.data) return 'A data final vem antes da inicial.';
  return null;
}

export default function AgendaEventoModal({
  aberto,
  modo,
  inicial,
  salvando,
  erro,
  onClose,
  onSalvar,
  onExcluir,
}: Props) {
  const [v, setV] = useState<EventoFormValores>(inicial);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  useEffect(() => {
    if (aberto) {
      setV(inicial);
      setErroLocal(null);
      setConfirmandoExclusao(false);
    }
  }, [aberto, inicial]);

  const set = <K extends keyof EventoFormValores>(k: K, valor: EventoFormValores[K]) =>
    setV((prev) => ({ ...prev, [k]: valor }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problema = validarForm(v);
    if (problema) {
      setErroLocal(problema);
      return;
    }
    setErroLocal(null);
    onSalvar(formParaPayload(v));
  };

  return (
    <Modal isOpen={aberto} onClose={onClose} className="max-w-[640px] p-6 lg:p-8">
      <form onSubmit={submit} className="flex flex-col px-1">
        <h5 className="mb-1 text-xl font-semibold text-gray-800 dark:text-white/90">
          {modo === 'editar' ? 'Editar evento' : 'Novo evento'}
        </h5>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Anote um compromisso financeiro. Eventos que se repetem aparecem todo mês ou todo ano.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="agenda-titulo" className={LABEL}>
              Título
            </label>
            <input
              id="agenda-titulo"
              type="text"
              maxLength={120}
              value={v.titulo}
              onChange={(e) => set('titulo', e.target.value)}
              className={INPUT}
              placeholder="Ex.: Renovar seguro do carro"
            />
          </div>
          <div>
            <label htmlFor="agenda-data" className={LABEL}>
              Data
            </label>
            <input
              id="agenda-data"
              type="date"
              value={v.data}
              onChange={(e) => set('data', e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="agenda-hora" className={LABEL}>
              Hora (opcional)
            </label>
            <input
              id="agenda-hora"
              type="time"
              value={v.hora}
              onChange={(e) => set('hora', e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="agenda-data-fim" className={LABEL}>
              Até (opcional, para vários dias)
            </label>
            <input
              id="agenda-data-fim"
              type="date"
              value={v.dataFim}
              min={v.data || undefined}
              onChange={(e) => set('dataFim', e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="agenda-recorrencia" className={LABEL}>
              Repetição
            </label>
            <select
              id="agenda-recorrencia"
              value={v.recorrencia}
              onChange={(e) => set('recorrencia', e.target.value)}
              className={INPUT}
            >
              {RECORRENCIAS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="agenda-categoria" className={LABEL}>
              Categoria
            </label>
            <select
              id="agenda-categoria"
              value={v.categoria}
              onChange={(e) => set('categoria', e.target.value)}
              className={INPUT}
            >
              {CATEGORIAS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label
              htmlFor="agenda-lembrete"
              className="flex cursor-pointer items-center gap-2 pb-3 text-sm text-gray-700 dark:text-gray-300"
            >
              <input
                id="agenda-lembrete"
                type="checkbox"
                checked={v.lembrete}
                onChange={(e) => set('lembrete', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Quero ser lembrado (avisos chegam numa próxima versão)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="agenda-descricao" className={LABEL}>
              Descrição (opcional)
            </label>
            <textarea
              id="agenda-descricao"
              rows={3}
              maxLength={1000}
              value={v.descricao}
              onChange={(e) => set('descricao', e.target.value)}
              className={`${INPUT} h-auto`}
            />
          </div>
        </div>

        {(erroLocal || erro) && (
          <p role="alert" className="mt-4 text-sm text-error-500">
            {erroLocal ?? erro}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {modo === 'editar' && onExcluir ? (
              confirmandoExclusao ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Excluir este evento?</span>
                  <button
                    type="button"
                    onClick={onExcluir}
                    disabled={salvando}
                    className="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Sim, excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(false)}
                    className="text-xs text-gray-500 underline"
                  >
                    Não
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(true)}
                  className="text-sm text-error-500 hover:underline"
                >
                  Excluir evento
                </button>
              )
            ) : null}
          </div>
          <div className="flex gap-3 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60 sm:w-auto"
            >
              {salvando ? 'Salvando…' : modo === 'editar' ? 'Salvar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
