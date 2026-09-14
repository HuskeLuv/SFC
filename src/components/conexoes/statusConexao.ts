import type { BankConnectionDTO } from '@/hooks/useConexoesBancarias';

export type StatusVisual = {
  rotulo: string;
  cor: 'success' | 'info' | 'warning' | 'error' | 'light';
  /** Precisa do usuário reabrir o widget (credencial/consentimento/MFA). */
  precisaReconectar: boolean;
  /** Está sincronizando no provedor: botão "Atualizar" desabilitado. */
  sincronizando: boolean;
};

/** Traduz o status do item do Pluggy para o que o usuário precisa saber/fazer. */
export function statusConexao(
  c: Pick<BankConnectionDTO, 'status' | 'lastSyncError'>,
): StatusVisual {
  switch (c.status) {
    case 'UPDATED':
      return c.lastSyncError
        ? {
            rotulo: 'Erro ao importar',
            cor: 'error',
            precisaReconectar: false,
            sincronizando: false,
          }
        : {
            rotulo: 'Sincronizada',
            cor: 'success',
            precisaReconectar: false,
            sincronizando: false,
          };
    case 'UPDATING':
      return {
        rotulo: 'Sincronizando',
        cor: 'info',
        precisaReconectar: false,
        sincronizando: true,
      };
    case 'LOGIN_ERROR':
      return {
        rotulo: 'Reconectar',
        cor: 'warning',
        precisaReconectar: true,
        sincronizando: false,
      };
    case 'WAITING_USER_INPUT':
      return {
        rotulo: 'Aguardando você',
        cor: 'warning',
        precisaReconectar: true,
        sincronizando: false,
      };
    case 'OUTDATED':
      return {
        rotulo: 'Desatualizada',
        cor: 'error',
        precisaReconectar: false,
        sincronizando: false,
      };
    default:
      return { rotulo: c.status, cor: 'light', precisaReconectar: false, sincronizando: false };
  }
}

export function rotuloConta(a: { type: string; subtype: string | null }): string {
  if (a.type === 'CREDIT') return 'Cartão de crédito';
  if (a.subtype === 'SAVINGS_ACCOUNT') return 'Poupança';
  return 'Conta corrente';
}

/** "há 5 min", "há 3 h", "há 2 dias" — para lastSyncAt. */
export function tempoRelativo(iso: string | null, agora = new Date()): string {
  if (!iso) return 'nunca';
  const diff = Math.max(0, agora.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d === 1 ? '' : 's'}`;
}
