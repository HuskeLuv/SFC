'use client';
import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PlanejamentoFinanceiro from '@/components/planejamento/PlanejamentoFinanceiro';

export default function PlanejamentoFinanceiroPage() {
  return (
    <ProtectedRoute>
      <PlanejamentoFinanceiro />
    </ProtectedRoute>
  );
}
