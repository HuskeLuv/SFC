import type { PlanejamentoStatus } from '@/hooks/usePlanejamentoSonhos';
import type { MobileStatusTone } from '@/components/ui/mobile/MobileStatusPill';

export interface SonhoSituacao {
  label: string;
  tone: MobileStatusTone;
}

/**
 * Selo do objetivo no cartão do celular (PWA fase 3, P4): ponto + palavra, sem verde.
 *
 * Deriva SÓ do status que a tabela e o cartão do desktop já mostram (StatusBadge) — nenhuma regra
 * nova de "no prazo": o status é o que o usuário escolheu no cadastro.
 * - Iniciado → "No ritmo" (azul, ok);
 * - Concluído → "Concluído" (azul, ok);
 * - Atrasado → "Atrasado" (âmbar, atenção);
 * - Pausado / Em espera → a própria palavra (neutro).
 */
export function sonhoSituacao(objetivo: { status: PlanejamentoStatus }): SonhoSituacao {
  switch (objetivo.status) {
    case 'Iniciado':
      return { label: 'No ritmo', tone: 'ok' };
    case 'Concluído':
      return { label: 'Concluído', tone: 'ok' };
    case 'Atrasado':
      return { label: 'Atrasado', tone: 'atencao' };
    case 'Pausado':
      return { label: 'Pausado', tone: 'neutro' };
    case 'Em espera':
      return { label: 'Em espera', tone: 'neutro' };
    default:
      return { label: String(objetivo.status), tone: 'neutro' };
  }
}
