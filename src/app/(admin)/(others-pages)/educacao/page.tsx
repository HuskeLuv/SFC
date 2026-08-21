'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import EducacaoRoot from '@/components/educacao/EducacaoRoot';

export default function EducacaoPage() {
  return (
    <ProtectedRoute>
      <EducacaoRoot />
    </ProtectedRoute>
  );
}
