import type { DividaStatus } from '@/hooks/useDividas';
import type { MobileStatusTone } from '@/components/ui/mobile/MobileStatusPill';
import { STATUS_LABELS } from '../utils';

/**
 * Situação da dívida no celular (PWA fase 3): o MESMO status de hoje (STATUS_LABELS), em ponto +
 * palavra e sem verde (decisão 4). Iniciada = azul (ok), Pausada = âmbar (atenção), Em espera e
 * Concluída = cinza (neutro).
 */

export interface DividaSituacao {
  tone: MobileStatusTone;
  label: string;
  /** Uma linha no sheet de Situação: o que muda ao escolher. */
  descricao: string;
}

const TONE: Record<DividaStatus, MobileStatusTone> = {
  ativa: 'ok',
  em_espera: 'neutro',
  pausada: 'atencao',
  quitada: 'neutro',
};

const DESCRICAO: Record<DividaStatus, string> = {
  ativa: 'Parcelas correndo; entram na projeção do fluxo de caixa',
  em_espera: 'Ainda não começou a pagar; fica fora da projeção do fluxo',
  pausada: 'Pagamentos suspensos; o saldo continua no passivo',
  quitada: 'Tudo pago; sai do total devido',
};

/** Ordem do sheet de Situação = a do select do desktop. */
export const SITUACOES: DividaStatus[] = Object.keys(STATUS_LABELS) as DividaStatus[];

export function dividaSituacao(status: DividaStatus): DividaSituacao {
  return { tone: TONE[status], label: STATUS_LABELS[status], descricao: DESCRICAO[status] };
}
