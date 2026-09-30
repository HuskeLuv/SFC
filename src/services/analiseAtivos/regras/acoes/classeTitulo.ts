/**
 * Classe do título pelo SUFIXO do ticker (regra 18): 3 = ON, 4–8 = PN, 11 = unit. O FCA erra a classe
 * (MGLU3 vem como "Ações Preferenciais"), então a classe gravada nunca vem do FCA.
 *
 * Composição de units: o FCA traz texto livre em `Composicao_BDR_Unit` — formatos medidos na Fase A:
 * '1 ON / 2 PN' (TAEE11), '1 KLBN3 + 4 KLBN4' (KLBN11), '1 ação ordinária e 4 ações preferenciais',
 * '1 ON e 2PNs'.
 */
import type { ClasseTitulo } from '@/services/analiseAtivos/tipos';

const RE_TICKER = /^[A-Z]{4}(\d{1,2})$/;

export function classeDoTicker(ticker: string): ClasseTitulo | null {
  const m = RE_TICKER.exec(ticker.trim().toUpperCase());
  if (!m) return null;
  const sufixo = m[1];
  if (sufixo === '11') return 'UNIT';
  if (sufixo === '3') return 'ON';
  if (/^[4-8]$/.test(sufixo)) return 'PN';
  return null;
}

const RE_ON = /(\d+)\s*(?:ON\b|ONs\b|a[çc](?:[ãa]o|[õo]es)\s+ordin|[A-Z]{4}3\b)/i;
const RE_PN = /(\d+)\s*(?:PN|a[çc](?:[ãa]o|[õo]es)\s+pref|[A-Z]{4}[4-8]\b)/i;

/** Quantidade de ON e PN por unit; null quando o texto não tem nenhum dos formatos conhecidos. */
export function parseComposicaoUnit(
  texto: string | null | undefined,
): { on: number; pn: number } | null {
  if (!texto) return null;
  const on = RE_ON.exec(texto);
  const pn = RE_PN.exec(texto);
  if (!on && !pn) return null;
  const qOn = on ? Number(on[1]) : 0;
  const qPn = pn ? Number(pn[1]) : 0;
  if (qOn + qPn <= 0) return null;
  return { on: qOn, pn: qPn };
}
