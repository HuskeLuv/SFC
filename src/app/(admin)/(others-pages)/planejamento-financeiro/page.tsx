'use client';
import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GatePlano from '@/components/planos/GatePlano';
import PlanejamentoFinanceiro from '@/components/planejamento/PlanejamentoFinanceiro';

export default function PlanejamentoFinanceiroPage() {
  return (
    <ProtectedRoute>
      <GatePlano
        need="pro"
        previa="planejamento"
        recurso="O Planejamento"
        descricao="Planeje a independência financeira e acompanhe os seus sonhos com metas e prazos."
      >
        <PlanejamentoFinanceiro />
      </GatePlano>
    </ProtectedRoute>
  );
}
