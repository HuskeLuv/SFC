/**
 * Prazo de resgate declarado pelo usuário ("D+0", "D+30", "Imediata") → dias.
 *
 * Usado pra fundos (aba Fundos) e reservas: o texto é livre no wizard e na
 * edição inline, então o parser aceita as grafias comuns e devolve null pra
 * qualquer coisa que não seja um prazo reconhecível ("—", "", "a combinar").
 */

/** Exibido quando o usuário ainda não informou o prazo. */
export const LIQUIDEZ_NAO_INFORMADA = '—';

export function parsePrazoDias(label: string | null | undefined): number | null {
  if (label == null) return null;
  const s = String(label).trim().toLowerCase();
  if (!s || s === LIQUIDEZ_NAO_INFORMADA) return null;
  if (/^imediat[ao]$/.test(s) || s === 'no dia' || s === 'à vista' || s === 'a vista') return 0;
  // "D+30", "d + 30", "D30", "+30"
  const dPlus = s.match(/^d?\s*\+?\s*(\d{1,4})$/);
  if (dPlus) return Number(dPlus[1]);
  // "30 dias", "30 dias úteis", "30du"
  const dias = s.match(/^(\d{1,4})\s*(dias?|du|d\.u\.)?(\s+.*)?$/);
  if (dias) return Number(dias[1]);
  return null;
}

/**
 * Prazo total até o dinheiro cair na conta = cotização + liquidação.
 * null quando nenhum dos dois é reconhecível (liquidez não informada).
 */
export function liquidezTotalDias(
  cotizacao: string | null | undefined,
  liquidacao: string | null | undefined,
): number | null {
  const cot = parsePrazoDias(cotizacao);
  const liq = parsePrazoDias(liquidacao);
  if (cot == null && liq == null) return null;
  return (cot ?? 0) + (liq ?? 0);
}

export interface LiquidezDeclarada {
  cotizacaoResgate?: string;
  liquidacaoResgate?: string;
}

/**
 * Resolve o prazo declarado a partir das notes das compras, da mais recente
 * pra mais antiga, campo a campo: um aporte (também 'compra', sem os campos)
 * não apaga o prazo informado na compra original.
 */
export function pickLiquidezDeclarada(notesNewestFirst: ReadonlyArray<unknown>): LiquidezDeclarada {
  const out: LiquidezDeclarada = {};
  for (const notes of notesNewestFirst) {
    if (!notes || typeof notes !== 'object') continue;
    const rec = notes as Record<string, unknown>;
    for (const campo of ['cotizacaoResgate', 'liquidacaoResgate'] as const) {
      const v = rec[campo];
      if (out[campo] === undefined && typeof v === 'string' && v.trim()) out[campo] = v.trim();
    }
    if (out.cotizacaoResgate !== undefined && out.liquidacaoResgate !== undefined) break;
  }
  return out;
}
