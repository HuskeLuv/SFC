'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DividasRoot from '@/components/dividas/DividasRoot';

export default function DividasPage() {
  return (
    <ProtectedRoute>
      <DividasRoot />
    </ProtectedRoute>
  );
}
