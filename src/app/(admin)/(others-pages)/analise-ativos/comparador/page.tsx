import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import Comparador from '@/components/analiseAtivos/comparador/Comparador';
import { analiseAtivosComparadorHabilitado } from '@/lib/analiseAtivosConfig';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${TEXTOS_COMPARADOR.titulo} · Análise de Ativos`,
  description: TEXTOS_COMPARADOR.subtitulo,
};

/**
 * Comparador (Bloco D, fatia C): /analise-ativos/comparador?t=WEGE3,ITUB4. O gate da área (flag +
 * beta) fica no layout; aqui, a flag do recurso: desligada ⇒ 404 da raiz. Estado na URL (?t=).
 */
export default function ComparadorPage() {
  if (!analiseAtivosComparadorHabilitado()) notFound();
  return (
    <AnaliseAtivosShell variante="comparador">
      <Suspense fallback={null}>
        <Comparador />
      </Suspense>
    </AnaliseAtivosShell>
  );
}
