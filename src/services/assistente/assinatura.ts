/**
 * Assinatura das propostas do assistente.
 *
 * A proposta vai e volta pelo cliente sem estado no servidor: o payload
 * viaja em base64url junto de um HMAC. Sem a chave não dá para forjar, e o
 * `userId`/validade ficam DENTRO do payload — quem verifica confere os dois.
 *
 * Compartilhado por `lancamento.ts` (fluxo de caixa) e `evento.ts` (agenda).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function segredo(): string {
  const s = process.env.ASSISTENTE_SECRET ?? process.env.JWT_SECRET;
  if (!s) throw new Error('ASSISTENTE_SECRET/JWT_SECRET não configurado');
  return s;
}

function hmac(payload: string): string {
  return createHmac('sha256', segredo()).update(payload).digest('base64url');
}

export function assinarPayload(obj: unknown): string {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  return `${payload}.${hmac(payload)}`;
}

/**
 * Devolve o objeto se a assinatura confere. NÃO valida conteúdo — quem chama
 * confere dono, validade e formato (o que muda por tipo de proposta).
 */
export function abrirPayload<T>(token: string): T | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
