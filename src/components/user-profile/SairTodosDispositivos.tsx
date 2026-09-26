'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCsrf } from '@/hooks/useCsrf';

/**
 * "Sair de todos os dispositivos" (PWA fase 0, decisão 2 do Wellington).
 *
 * Chama DELETE /api/profile/sessoes, que incrementa o sessionVersion: todas
 * as sessões deixam de valer (as outras em até 1 minuto) e este aparelho
 * também sai. Confirmação em linha antes de executar.
 *
 * PWA fase 3: `embedded` (sheet "Sessões ativas" do Perfil no celular) tira o cartão e o título
 * (o sheet já tem) e deixa os botões com 44px e largura total. Mesmo texto, mesma confirmação em
 * dois passos, foco no Cancelar. Sem `embedded` o DOM é o de hoje.
 */
export default function SairTodosDispositivos({ embedded = false }: { embedded?: boolean } = {}) {
  const { csrfFetch } = useCsrf();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Ao abrir a confirmação, o foco vai para "Cancelar" (opção segura).
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await csrfFetch('/api/profile/sessoes', { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Não foi possível sair dos dispositivos');
      }
      window.location.href = '/signin';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível sair dos dispositivos');
      setLoading(false);
    }
  };

  const noSheet = (base: string, extra: string) => (embedded ? `${base} ${extra}` : base);

  const conteudo = (
    <>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        Encerra o acesso em todos os aparelhos e navegadores onde você entrou, inclusive este. Use
        se perdeu o celular ou entrou em um computador que não é seu.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className={noSheet(
            'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
            'min-h-11 w-full',
          )}
        >
          Sair de todos os dispositivos
        </button>
      ) : (
        <div
          role="alertdialog"
          aria-labelledby="sair-todos-titulo"
          aria-describedby="sair-todos-descricao"
          className="rounded-xl border border-red-200 bg-red-50/40 p-4 dark:border-red-900/40 dark:bg-red-900/10"
        >
          <p
            id="sair-todos-titulo"
            className="text-sm font-semibold text-gray-800 dark:text-white/90"
          >
            Sair de todos os dispositivos?
          </p>
          <p id="sair-todos-descricao" className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            Você também sairá deste aparelho e precisará entrar de novo com e-mail e senha.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className={noSheet(
                'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60',
                'min-h-11 flex-1',
              )}
            >
              {loading ? 'Saindo…' : 'Sim, sair de todos'}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={loading}
              className={noSheet(
                'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800',
                'min-h-11 flex-1',
              )}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );

  if (embedded) return <div data-sair-todos="">{conteudo}</div>;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <h3 className="mb-2 text-base font-semibold text-gray-800 dark:text-white/90">
        Sessões ativas
      </h3>
      {conteudo}
    </section>
  );
}
