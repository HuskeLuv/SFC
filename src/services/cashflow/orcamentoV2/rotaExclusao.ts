/**
 * Peças comuns às rotas de exclusão de subcategoria do Orçamento v2 (impacto e DELETE).
 */
import { NextResponse } from 'next/server';
import { ApiError } from '@/utils/apiErrorHandler';
import { estadoAcessoOrcamentoV2 } from './acesso';
import { ErroExclusaoSubcategoria, type MesAno } from './excluirSubcategoria';

/** As Gerais só existem depois da ativação: sem ela, excluir não tem onde fundir (409). */
export async function exigirOrcamentoV2Ativado(userId: string): Promise<void> {
  const { ativado } = await estadoAcessoOrcamentoV2(userId);
  if (!ativado) throw new ApiError(409, 'O Orçamento v2 ainda não foi ativado');
}

/** Mês 0–11 do banco → 1–12 da API. */
export const mesesDaApi = (meses: MesAno[]): MesAno[] =>
  meses.map(({ ano, mes }) => ({ ano, mes: mes + 1 }));

/** Recusa da exclusão → `{error, codigo, meses?}` (meses 1–12, só em `cores_divergentes`). */
export function respostaRecusa(erro: ErroExclusaoSubcategoria): NextResponse {
  return NextResponse.json(
    {
      error: erro.message,
      codigo: erro.codigo,
      ...(erro.meses.length > 0 && { meses: mesesDaApi(erro.meses) }),
    },
    { status: erro.statusCode },
  );
}
