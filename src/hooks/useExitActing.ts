'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';
import { useCsrf } from '@/hooks/useCsrf';

/**
 * Encerra a personificação do consultor (DELETE /api/consultant/acting) e volta ao painel do
 * consultor. Compartilhado entre o rodapé da sidebar (desktop) e a faixa "Vendo como" do
 * cabeçalho mobile.
 */
export function useExitActing(): { exitActing(): Promise<void>; leaving: boolean } {
  const { actingClient, checkAuth, user } = useAuth();
  const { csrfFetch } = useCsrf();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const exitActing = useCallback(async () => {
    if (!actingClient || leaving) return;
    try {
      setLeaving(true);
      const response = await csrfFetch('/api/consultant/acting', { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        throw new Error('Falha ao encerrar visão do cliente');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      await checkAuth();
      router.refresh();
      if (user?.role === 'consultant') {
        router.push('/dashboard/consultor');
      }
    } catch (error) {
      logger.error('Erro ao sair da visão do cliente:', error);
    } finally {
      setLeaving(false);
    }
  }, [actingClient, leaving, csrfFetch, checkAuth, router, user?.role]);

  return { exitActing, leaving };
}
