import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SucessoAssinatura from '@/components/planos/SucessoAssinatura';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Assinatura' };

/** Volta do Checkout (success_url = /planos/sucesso?session_id=…). Chave desligada: 404. */
export default function PlanosSucessoRoute() {
  if (!assinaturasHabilitadas()) notFound();
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <SucessoAssinatura />
      </Suspense>
    </ProtectedRoute>
  );
}
