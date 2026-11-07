/**
 * Cliente do Stripe (SÓ Node: nunca importar no middleware nem em client components).
 *
 * Singleton em globalThis (padrão do src/lib/prisma.ts). apiVersion fixada no release instalado
 * (stripe 23.1.0 = '2026-10-28.endive'); o endpoint do webhook no Dashboard usa a MESMA versão.
 * Testes: vi.mock('@/lib/stripe') ou definirStripeParaTestes(cliente falso). Nunca rede de verdade.
 */
import Stripe from 'stripe';
import { stripeSecretKey } from '@/lib/assinaturasConfig';

/** Versão da API fixada (a do pacote instalado; trocar só junto com o upgrade do pacote). */
export const STRIPE_API_VERSION = '2026-10-28.endive' as const;

type GlobalStripe = { stripeCliente?: Stripe };

const globalForStripe = globalThis as typeof globalThis & GlobalStripe;

/** Cliente do Stripe; lança se STRIPE_SECRET_KEY não estiver configurada. */
export function obterStripe(): Stripe {
  if (globalForStripe.stripeCliente) return globalForStripe.stripeCliente;
  const chave = stripeSecretKey();
  if (!chave) throw new Error('STRIPE_SECRET_KEY não configurada');
  const cliente = new Stripe(chave, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    appInfo: { name: 'MyFinance' },
    typescript: true,
  });
  globalForStripe.stripeCliente = cliente;
  return cliente;
}

/** Só testes: injeta (ou limpa, com undefined) o cliente devolvido por obterStripe(). */
export function definirStripeParaTestes(cliente: Stripe | undefined): void {
  globalForStripe.stripeCliente = cliente;
}

export type { Stripe };
