import { prisma } from '@/lib/prisma';
import { assinaturasHabilitadas, limiteDoPlano } from '@/lib/assinaturasConfig';
import { NOME_PLANO, type Plano } from '@/lib/planos';
import { planoDoUsuario } from '@/services/planos/resolverPlano';
import { ApiError } from '@/utils/apiErrorHandler';
import type { ErroLimitePlano } from '@/types/assinatura';

/**
 * Limite de conexões Open Finance por plano (assinaturas F2, ClickUp 86e2zkhe2; decisão 2 de
 * 07/11: 1/3/6, ajustável por ASSINATURAS_LIMITE_CONEXOES_*). Só com ASSINATURAS_HABILITADAS
 * ligada; desligada não consulta nada (sem limite, como hoje). Conta as conexões do usuário que
 * não estão desconectadas (status 'DELETED' = STATUS_DESCONECTADA de services/pluggy/sync, aqui
 * literal para não puxar o sync). Cair de plano não apaga nada: o limite só barra conexão NOVA.
 * Conexões são do próprio cliente (o consultor não chega aqui), então a cota é a do dono.
 */
const STATUS_DESCONECTADA = 'DELETED';

export function erroLimiteConexoes(plano: Plano, limite: number): ApiError {
  const extra: Omit<ErroLimitePlano, 'error'> = {
    codigo: 'limite_plano',
    plano,
    limite,
    recurso: 'conexoes',
  };
  const conexoes = limite === 1 ? '1 conexão bancária' : `${limite} conexões bancárias`;
  return new ApiError(
    403,
    `O plano ${NOME_PLANO[plano]} permite ${conexoes}. Exclua uma conexão ou mude de plano.`,
    undefined,
    extra,
  );
}

/** Lança 403 limite_plano quando o usuário já usa todas as conexões do plano. */
export async function exigirVagaConexao(userId: string): Promise<void> {
  if (!assinaturasHabilitadas()) return;
  const plano = await planoDoUsuario(userId);
  const limite = limiteDoPlano('conexoes', plano);
  const usadas = await prisma.bankConnection.count({
    where: { userId, status: { not: STATUS_DESCONECTADA } },
  });
  if (usadas >= limite) throw erroLimiteConexoes(plano, limite);
}
