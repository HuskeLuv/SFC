'use client';

import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/ui/button/Button';
import { useAdminOverview } from '@/hooks/useAdminOverview';
import BlocoUsuarios from './BlocoUsuarios';
import BlocoUso from './BlocoUso';
import BlocoAssistente from './BlocoAssistente';
import BlocoSistema from './BlocoSistema';

/**
 * Painel administrativo (11/09/2026) — só leitura, role admin. Quatro blocos:
 * Usuários, Uso por funcionalidade, Assistente de IA, Sistema.
 */
export default function AdminOverviewPage() {
  const { data, loading, isFetching, error, forbidden, refetch, atualizadoEm } = useAdminOverview();

  if (loading) {
    return <LoadingSpinner size="lg" text="Consolidando métricas..." />;
  }

  if (forbidden) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Esta área é restrita a administradores.
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error ?? 'Não foi possível carregar o painel.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Visão somente leitura. Dados consolidados em{' '}
          {new Date(data.geradoEm).toLocaleString('pt-BR')}
          {atualizadoEm && isFetching ? ' · atualizando…' : ''}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          Atualizar
        </Button>
      </div>
      <BlocoUsuarios dados={data.usuarios} />
      <BlocoUso dados={data.uso} />
      <BlocoAssistente dados={data.assistente} />
      <BlocoSistema dados={data.sistema} />
    </div>
  );
}
