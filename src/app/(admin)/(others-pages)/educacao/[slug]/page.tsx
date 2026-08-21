'use client';

import { use } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import CursoDetalheRoot from '@/components/educacao/CursoDetalheRoot';

export default function CursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <ProtectedRoute>
      <CursoDetalheRoot slug={slug} />
    </ProtectedRoute>
  );
}
