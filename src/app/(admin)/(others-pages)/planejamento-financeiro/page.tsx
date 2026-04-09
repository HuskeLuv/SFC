'use client';
import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PlanejamentoFinanceiroTabs from '@/components/planejamento/PlanejamentoFinanceiroTabs';

export default function PlanejamentoFinanceiro() {
  return (
    <ProtectedRoute>
      <PlanejamentoFinanceiroTabs />
    </ProtectedRoute>
  );
}
