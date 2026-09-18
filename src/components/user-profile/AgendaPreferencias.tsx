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
  const [icalToken, setIcalToken] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mexendoNoLink, setMexendoNoLink] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch('/api/agenda/preferencias', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { lembretes?: boolean; icalToken?: string | null } | null) => {
        if (!ativo || !d) return;
        setLembretes(d.lembretes !== false);
        setIcalToken(d.icalToken ?? null);
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

  const urlDoFeed = icalToken
    ? `${typeof window === 'undefined' ? '' : window.location.origin}/api/calendar/ical?token=${icalToken}`
    : null;

  const gerarLink = useCallback(
    async (regerando: boolean) => {
      if (mexendoNoLink) return;
      if (
        regerando &&
        !window.confirm('Gerar um link novo faz o antigo parar de funcionar. Continuar?')
      ) {
        return;
      }
      setMexendoNoLink(true);
      setErro(null);
      try {
        const res = await csrfFetch('/api/agenda/preferencias/ical', { method: 'POST' });
        if (!res.ok) throw new Error('Não consegui gerar o link.');
        const d = (await res.json()) as { icalToken?: string | null };
        setIcalToken(d.icalToken ?? null);
        setCopiado(false);
      } catch (error: unknown) {
        setErro(error instanceof Error ? error.message : 'Não consegui gerar o link.');
        logger.error('Erro ao gerar link do iCal:', error);
      } finally {
        setMexendoNoLink(false);
      }
    },
    [csrfFetch, mexendoNoLink],
  );

  const revogarLink = useCallback(async () => {
    if (mexendoNoLink) return;
    if (!window.confirm('Revogar o link? Os calendários que já assinaram param de atualizar.')) {
      return;
    }
    setMexendoNoLink(true);
    setErro(null);
    try {
      const res = await csrfFetch('/api/agenda/preferencias/ical', { method: 'DELETE' });
      if (!res.ok) throw new Error('Não consegui revogar o link.');
      setIcalToken(null);
    } catch (error: unknown) {
      setErro(error instanceof Error ? error.message : 'Não consegui revogar o link.');
      logger.error('Erro ao revogar link do iCal:', error);
    } finally {
      setMexendoNoLink(false);
    }
  }, [csrfFetch, mexendoNoLink]);

  const copiar = useCallback(async () => {
    if (!urlDoFeed) return;
    try {
      await navigator.clipboard.writeText(urlDoFeed);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro('Não consegui copiar. Selecione o endereço e copie à mão.');
    }
  }, [urlDoFeed]);

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

      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Ver a agenda no seu calendário
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Um endereço para assinar no Google Agenda, Apple Calendário ou Outlook. Ele mostra{' '}
          <strong>datas e títulos, sem valores</strong> — quem tiver o link vê sua agenda, então
          trate como senha.
        </p>

        {urlDoFeed ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={urlDoFeed}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Endereço do feed da Agenda"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
              <button
                type="button"
                onClick={copiar}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
              >
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                onClick={() => gerarLink(true)}
                disabled={mexendoNoLink}
                className="text-brand-500 underline disabled:opacity-60"
              >
                Gerar link novo
              </button>
              <button
                type="button"
                onClick={revogarLink}
                disabled={mexendoNoLink}
                className="text-error-600 underline disabled:opacity-60 dark:text-error-400"
              >
                Revogar
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => gerarLink(false)}
            disabled={carregando || mexendoNoLink}
            className="mt-3 rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            {mexendoNoLink ? 'Gerando…' : 'Gerar link da agenda'}
          </button>
        )}
      </div>
    </div>
  );
}
