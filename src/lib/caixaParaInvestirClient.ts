/**
 * Cliente do "Caixa para Investir" (bolso total com reservas por aba).
 * Os três hooks que gravam o caixa (useCarteira, useAssetData, useRendaFixa)
 * passam por aqui pra tratar igual o 409 de regra de negócio.
 */
export type CaixaSaveOptions = {
  /** Sobe o bolso total junto quando a reserva da aba não cabe nele. */
  ajustarTotal?: boolean;
};

/** Recusa por regra (409) — a UI mostra `message` e, se houver, oferece a saída. */
export type CaixaSaveFailure = {
  ok: false;
  message: string;
  code?: 'RESERVA_EXCEDE_TOTAL' | 'TOTAL_ABAIXO_DAS_RESERVAS';
  /** Total que faria a reserva caber (só em RESERVA_EXCEDE_TOTAL). */
  totalNecessario?: number;
};

/** `true` = salvo; `false` = falha genérica; objeto = recusa com motivo. */
export type CaixaSaveResult = boolean | CaixaSaveFailure;

export type SaveCaixaFn = (valor: number, opts?: CaixaSaveOptions) => Promise<CaixaSaveResult>;

type CsrfFetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function postCaixaParaInvestir(
  csrfFetch: CsrfFetch,
  path: string,
  valor: number,
  opts?: CaixaSaveOptions,
): Promise<true | CaixaSaveFailure> {
  const response = await csrfFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caixaParaInvestir: valor,
      ...(opts?.ajustarTotal ? { ajustarTotal: true } : {}),
    }),
  });

  if (response.ok) return true;

  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: CaixaSaveFailure['code'];
      totalNecessario?: number;
    } | null;
    if (body?.error) {
      return {
        ok: false,
        message: body.error,
        code: body.code,
        totalNecessario: body.totalNecessario,
      };
    }
  }
  throw new Error('Erro ao atualizar caixa para investir');
}
