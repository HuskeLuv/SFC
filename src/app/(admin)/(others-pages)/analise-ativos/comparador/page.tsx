import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import Comparador from '@/components/analiseAtivos/comparador/Comparador';
import {
  analiseAtivosComparadorHabilitado,
  analiseAtivosVisualV2Habilitado,
} from '@/lib/analiseAtivosConfig';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${TEXTOS_COMPARADOR.titulo} · Análise de Ativos`,
  description: TEXTOS_COMPARADOR.subtitulo,
};

/**
 * Comparador isonômico (v2.4, fatia D): /analise-ativos/comparador?t=WEGE3,ITUB4&janela=5. O gate
 * da área (flag + beta) fica no layout; aqui, a flag do recurso: desligada ⇒ 404 da raiz (fica
 * desligada em produção até o jurídico). Estado na URL (?t= e ?janela=); nada é gravado.
 */
export default function ComparadorPage() {
  if (!analiseAtivosComparadorHabilitado()) notFound();
  return (
    <AnaliseAtivosShell visualV2={analiseAtivosVisualV2Habilitado()} variante="comparador">
      <Suspense fallback={null}>
        <Comparador />
      </Suspense>
    </AnaliseAtivosShell>
  );
}
