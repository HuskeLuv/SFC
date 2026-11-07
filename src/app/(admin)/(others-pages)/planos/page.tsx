import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PlanosPage from '@/components/planos/PlanosPage';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';

// A chave é lida em tempo de execução: o mesmo build serve o e2e principal (desligada) e o do
// projeto "assinaturas" (ligada).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Planos' };

/** /planos (logada; pública só na F4 com a landing). Chave ASSINATURAS_HABILITADAS desligada: 404. */
export default function PlanosRoute() {
  if (!assinaturasHabilitadas()) notFound();
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <PlanosPage />
      </Suspense>
    </ProtectedRoute>
  );
}
