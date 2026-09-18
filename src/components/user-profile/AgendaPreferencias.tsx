'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useCsrf } from '@/hooks/useCsrf';
import { logger } from '@/lib/logger';

/**
 * Card do perfil: liga/desliga os lembretes da Agenda. Sem registro no banco
 * o padrão é ligado — o toggle só grava quando o usuário muda algo.
 */
export default function AgendaPreferencias() {
  const { csrfFetch } = useCsrf();
  const [lembretes, setLembretes] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch('/api/agenda/preferencias', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { lembretes?: boolean } | null) => {
        if (ativo && d) setLembretes(d.lembretes !== false);
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const alternar = useCallback(async () => {
    if (salvando) return;
    const novo = !lembretes;
    setSalvando(true);
    setErro(null);
    setLembretes(novo); // otimista: o toggle responde na hora
    try {
      const res = await csrfFetch('/api/agenda/preferencias', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lembretes: novo }),
      });
      if (!res.ok) throw new Error('Não consegui salvar a preferência.');
    } catch (error: unknown) {
      setLembretes(!novo); // desfaz
      setErro(error instanceof Error ? error.message : 'Não consegui salvar a preferência.');
      logger.error('Erro ao salvar preferência da agenda:', error);
    } finally {
      setSalvando(false);
    }
  }, [csrfFetch, lembretes, salvando]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">Agenda</h3>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Avisos do que está por vencer, no sininho do app. Tudo continua aparecendo na{' '}
        <Link href="/calendario" className="text-brand-500 underline">
          Agenda
        </Link>{' '}
        mesmo com o aviso desligado.
      </p>

      {erro ? (
        <p className="mb-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-600 dark:bg-error-500/10">
          {erro}
        </p>
      ) : null}

      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span className="text-sm text-gray-700 dark:text-gray-200">
          Receber lembretes
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
            Parcela, vencimento de renda fixa, prazo de imposto e compromisso marcado avisam na
            véspera. Provento avisa no dia em que cai na conta.
          </span>
        </span>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300"
          checked={lembretes}
          disabled={carregando || salvando}
          onChange={alternar}
          aria-label="Receber lembretes da Agenda"
        />
      </label>
    </div>
  );
}
