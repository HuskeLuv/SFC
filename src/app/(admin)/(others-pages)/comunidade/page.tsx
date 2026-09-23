'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ComunidadeRoot from '@/components/comunidade/ComunidadeRoot';

export default function ComunidadePage() {
  return (
    <ProtectedRoute>
      <ComunidadeRoot />
    </ProtectedRoute>
  );
}
