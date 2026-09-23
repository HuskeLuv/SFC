'use client';

import { use } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PostDetalheRoot from '@/components/comunidade/PostDetalheRoot';

export default function PostComunidadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <ProtectedRoute>
      <PostDetalheRoot id={id} />
    </ProtectedRoute>
  );
}
