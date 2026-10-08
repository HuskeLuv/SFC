import type { BankConnectionDTO } from '@/hooks/useConexoesBancarias';

export type StatusVisual = {
  rotulo: string;
  cor: 'success' | 'info' | 'warning' | 'error' | 'light';
  /** Precisa do usuário reabrir o widget (credencial/consentimento/MFA). */
  precisaReconectar: boolean;
  /** Está sincronizando no provedor: botão "Atualizar" desabilitado. */
  sincronizando: boolean;
};

/**
 * Status nosso (não é do Pluggy): o item foi apagado lá — autorização revogada no banco, vencida
 * ou removida. O histórico importado fica; "Reconectar" abre uma conexão nova com o mesmo banco.
 */
export const STATUS_DESCONECTADA = 'DELETED';

/** Traduz o status do item do Pluggy para o que o usuário precisa saber/fazer. */
export function statusConexao(
  c: Pick<BankConnectionDTO, 'status' | 'lastSyncError'> &
    Partial<Pick<BankConnectionDTO, 'avisos'>>,
): StatusVisual {
  switch (c.status) {
    case STATUS_DESCONECTADA:
      return {
        rotulo: 'Desconectada pelo banco',
        cor: 'error',
        precisaReconectar: true,
        sincronizando: false,
      };
    case 'UPDATED':
      if (c.lastSyncError) {
        return {
          rotulo: 'Erro ao importar',
          cor: 'error',
          precisaReconectar: false,
          sincronizando: false,
        };
      }
      return (c.avisos?.length ?? 0) > 0
        ? {
            rotulo: 'Sincronizada, com avisos',
            cor: 'warning',
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

const NOME_PRODUTO: Record<string, string> = {
  accounts: 'contas',
  creditCards: 'cartões',
  transactions: 'transações',
  investments: 'investimentos',
  investmentTransactions: 'movimentações dos investimentos',
  loans: 'empréstimos',
  paymentData: 'detalhes de pagamento',
  identity: 'dados cadastrais',
};

/**
 * Explica o que ficou de fora numa sincronização parcial ("Investimentos e empréstimos não vieram
 * na última atualização…"). null = nada a avisar. Causa mais comum: limite mensal do Open Finance.
 */
export function textoAvisos(avisos: BankConnectionDTO['avisos'] | undefined): string | null {
  const nomes = [...new Set((avisos ?? []).map((a) => NOME_PRODUTO[a.produto] ?? a.produto))];
  if (nomes.length === 0) return null;
  const lista =
    nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  const verbo = nomes.length === 1 && !nomes[0].endsWith('s') ? 'não veio' : 'não vieram';
  return `${lista.charAt(0).toUpperCase()}${lista.slice(1)} ${verbo} na última atualização do banco. Os dados anteriores continuam valendo e o banco tenta de novo na próxima atualização automática.`;
}

/** Texto do card quando o banco encerrou a autorização. */
export const TEXTO_DESCONECTADA =
  'O banco encerrou esta autorização (revogada, vencida ou removida). O que já foi importado continua aqui; reconecte para voltar a receber dados novos.';

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
