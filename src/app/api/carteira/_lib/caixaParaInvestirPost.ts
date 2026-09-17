import { NextRequest, NextResponse } from 'next/server';
import {
  CAIXA_ABAS,
  salvarCaixaAba,
  salvarCaixaTotal,
  type CaixaAbaKey,
  type SalvarCaixaErro,
} from '@/services/portfolio/caixaParaInvestir';
import {
  recordCaixaParaInvestirAtualizado,
  recordCaixaTotalAtualizado,
  type RecordChangeParams,
} from '@/services/changeHistory';
import { formatBRL } from '@/utils/format';

type Auth = RecordChangeParams['auth'] & { targetUserId: string };

const invalidValue = () =>
  NextResponse.json(
    { error: 'Caixa para investir deve ser um valor igual ou maior que zero' },
    { status: 400 },
  );

const isValidValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** 409 com o motivo e os números que a UI usa pra oferecer a saída. */
function conflictResponse(erro: SalvarCaixaErro, abaLabel?: string) {
  if (erro.code === 'RESERVA_EXCEDE_TOTAL') {
    return NextResponse.json(
      {
        error:
          `A reserva de ${abaLabel} não cabe no Caixa para Investir total ` +
          `(${formatBRL(erro.total)}). As outras abas já reservam ` +
          `${formatBRL(erro.reservadoOutrasAbas)}, então o máximo aqui é ` +
          `${formatBRL(erro.maximoAba)}.`,
        code: erro.code,
        total: erro.total,
        maximoAba: erro.maximoAba,
        totalNecessario: erro.totalNecessario,
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error:
        `As abas já reservam ${formatBRL(erro.reservado)} deste caixa. ` +
        'Reduza as reservas das abas antes de baixar o total.',
      code: erro.code,
      reservado: erro.reservado,
    },
    { status: 409 },
  );
}

/**
 * Branch "caixaParaInvestir" do POST das rotas de aba (acoes/fii/etf/...):
 * grava a RESERVA da aba dentro do bolso total. `ajustarTotal: true` sobe o
 * total junto quando a reserva não cabe (a UI oferece isso após o 409).
 */
export async function handleCaixaAbaPost(
  request: NextRequest,
  auth: Auth,
  aba: CaixaAbaKey,
  body: { caixaParaInvestir?: unknown; ajustarTotal?: unknown },
): Promise<NextResponse> {
  const valor = body.caixaParaInvestir;
  if (!isValidValue(valor)) return invalidValue();

  const { metric, label } = CAIXA_ABAS[aba];
  const result = await salvarCaixaAba(auth.targetUserId, aba, valor, {
    ajustarTotal: body.ajustarTotal === true,
  });
  if (!result.ok) return conflictResponse(result, label);

  // Total primeiro: o Desfazer é LIFO, então a reserva (gravada por último)
  // volta antes do total e a invariante Σ reservas ≤ total nunca quebra.
  if (result.totalAjustado) {
    await recordCaixaTotalAtualizado(request, auth, {
      valorAnterior: result.totalAjustado.anterior,
      valor: result.totalAjustado.novo,
    });
  }
  await recordCaixaParaInvestirAtualizado(request, auth, {
    classe: label,
    metric,
    valorAnterior: result.valorAnterior,
    valor,
  });

  return NextResponse.json({
    success: true,
    message: 'Caixa para investir atualizado com sucesso',
    caixaParaInvestir: valor,
    ...(result.totalAjustado ? { caixaTotal: result.totalAjustado.novo } : {}),
  });
}

/** Branch "caixaParaInvestir" do POST de /api/carteira/resumo: grava o BOLSO TOTAL. */
export async function handleCaixaTotalPost(
  request: NextRequest,
  auth: Auth,
  valor: unknown,
): Promise<NextResponse> {
  if (!isValidValue(valor)) return invalidValue();

  const result = await salvarCaixaTotal(auth.targetUserId, valor);
  if (!result.ok) return conflictResponse(result);

  await recordCaixaTotalAtualizado(request, auth, {
    valorAnterior: result.valorAnterior,
    valor,
  });

  return NextResponse.json({
    success: true,
    message: 'Caixa para investir atualizado com sucesso',
    caixaParaInvestir: valor,
  });
}
