'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SaudeFinanceiraRoot from '@/components/saude-financeira/SaudeFinanceiraRoot';

export default function SaudeFinanceiraPage() {
  return (
    <ProtectedRoute>
      <SaudeFinanceiraRoot />
    </ProtectedRoute>
  );
}
