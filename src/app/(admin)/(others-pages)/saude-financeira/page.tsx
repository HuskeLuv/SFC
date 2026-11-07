'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import GatePlano from '@/components/planos/GatePlano';
import SaudeFinanceiraRoot from '@/components/saude-financeira/SaudeFinanceiraRoot';

export default function SaudeFinanceiraPage() {
  return (
    <ProtectedRoute>
      <GatePlano
        need="adv"
        previa="saude"
        recurso="A Saúde Financeira"
        descricao="Um diagnóstico das suas finanças: reserva, dívidas, seguros e a evolução de cada um."
      >
        <SaudeFinanceiraRoot />
      </GatePlano>
    </ProtectedRoute>
  );
}
