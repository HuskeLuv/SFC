'use client';

import React from 'react';
import { accessLevelLabel } from '@/utils/accessLevel';
import { COMUNIDADE_REQUIRED_LEVEL } from '@/constants/comunidade';
import { useComunidadeMe } from '@/hooks/useComunidade';
import type { MeComunidadeResponse } from '@/types/comunidade';
import { EntradaComunidade } from './EntradaComunidade';
import { CARD_CLASS } from './shared';

/** Carrega /me e resolve os estados antes da comunidade: trava de plano e termo. */
export function ComunidadeGate({
  children,
}: {
  children: (me: MeComunidadeResponse) => React.ReactNode;
}) {
  const { data: me, isLoading, error } = useComunidadeMe();

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Carregando comunidade…</p>;
  }
  if (error || !me) {
    return (
      <div className={`${CARD_CLASS} text-sm text-error-600`}>
        {error?.message ?? 'Não foi possível carregar a comunidade.'}
      </div>
    );
  }
  if (!me.acesso) {
    return (
      <div className={`${CARD_CLASS} mx-auto max-w-xl text-center`}>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Comunidade exclusiva
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          A comunidade está disponível a partir do plano{' '}
          {accessLevelLabel(COMUNIDADE_REQUIRED_LEVEL)}.
        </p>
      </div>
    );
  }
  if (!me.membro) return <EntradaComunidade me={me} />;
  return <>{children(me)}</>;
}

export function AvisoSuspensao({ me }: { me: MeComunidadeResponse }) {
  if (!me.suspenso || !me.perfil?.suspensoAte) return null;
  const ate = new Date(me.perfil.suspensoAte).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  });
  return (
    <div className="rounded-xl border border-warning-300 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/40 dark:bg-warning-500/10 dark:text-warning-300">
      Sua participação está suspensa até {ate}. Você pode ler a comunidade, mas não publicar,
      comentar ou curtir.
    </div>
  );
}
