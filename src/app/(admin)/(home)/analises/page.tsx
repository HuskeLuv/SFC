'use client';
import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import CarteiraAnalise from '@/components/carteira/CarteiraAnalise';

export default function Analises() {
  return (
    <ProtectedRoute>
      <CarteiraAnalise />
    </ProtectedRoute>
  );
}
