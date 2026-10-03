import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import MeusRelatos from '@/components/analiseAtivos/reporte/MeusRelatos';
import { analiseAtivosReporteHabilitado } from '@/lib/analiseAtivosConfig';

export const metadata: Metadata = {
  title: 'Meus relatos · Análise de Ativos',
  description: 'Os dados que você reportou na Análise de Ativos e as respostas da equipe.',
};

export const dynamic = 'force-dynamic';

/**
 * Meus relatos (bloco C, fatia D). O gate da área (flag + beta) fica no layout; aqui, a flag do
 * relato (ANALISE_ATIVOS_REPORTE_HABILITADO) desligada → 404.
 */
export default function MeusRelatosPage() {
  if (!analiseAtivosReporteHabilitado()) notFound();
  return (
    <AnaliseAtivosShell variante="ativo">
      <MeusRelatos />
    </AnaliseAtivosShell>
  );
}
