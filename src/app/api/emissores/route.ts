import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/utils/apiErrorHandler';

export const GET = withErrorHandler(async () => {
  // Modelo Emissor não existe no schema atual
  // Retornar array vazio por enquanto
  return NextResponse.json({ emissores: [] });
});
