import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AnaliseAtivosShell from '@/components/analiseAtivos/shell/AnaliseAtivosShell';
import PaginaSalvos from '@/components/analiseAtivos/salvos/PaginaSalvos';
import {
  analiseAtivosSalvosHabilitado,
  analiseAtivosVisualV2Habilitado,
} from '@/lib/analiseAtivosConfig';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${TEXTOS_SALVOS.pagina.titulo} · Análise de Ativos`,
};

/**
 * Salvos (bloco 1, fatia C): /analise-ativos/salvos?lista=<id>&classe=fii. O gate da área (flag +
 * beta) fica no layout; aqui, a flag do recurso: desligada ⇒ 404 da raiz. Listas pessoais (o
 * consultor agindo por um cliente vê o aviso, nada é lido).
 */
export default function SalvosPage() {
  if (!analiseAtivosSalvosHabilitado()) notFound();
  return (
    <AnaliseAtivosShell visualV2={analiseAtivosVisualV2Habilitado()} variante="salvos">
      <PaginaSalvos />
    </AnaliseAtivosShell>
  );
}
