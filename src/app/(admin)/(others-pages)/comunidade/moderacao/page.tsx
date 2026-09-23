'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ModeracaoRoot from '@/components/comunidade/ModeracaoRoot';

export default function ModeracaoComunidadePage() {
  return (
    <ProtectedRoute>
      <ModeracaoRoot />
    </ProtectedRoute>
  );
}
