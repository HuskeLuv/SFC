import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import LandingPage from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'My Finance — O hub de finanças pessoais',
  description:
    'Orçamento, dívidas, investimentos, aposentadoria, sonhos e educação financeira em um único hub. Análises profissionais (TWR, MWR, proventos, FGC) e curso incluído.',
  openGraph: {
    title: 'My Finance — o hub de finanças pessoais',
    description:
      'Fluxo de caixa, dívidas, carteira de investimentos e educação financeira em um só lugar.',
    type: 'website',
    locale: 'pt_BR',
  },
};

/** Sessão válida → app; caso contrário a página pública. `redirect()` fica fora do try (lança). */
async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get('token')?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

/**
 * Landing pública ligada/desligada. Pedido 03/09/2026 (Pedro): esconder
 * temporariamente para a concorrência não copiar. Enquanto `false`, a raiz
 * se comporta como antes do PR #170 (sem sessão → /signin). Para reativar,
 * trocar para `true` — componentes e prints continuam no repositório.
 */
const LANDING_PUBLICA = false;

export default async function Home() {
  if (await hasValidSession()) {
    redirect('/carteira');
  }
  if (!LANDING_PUBLICA) {
    redirect('/signin');
  }
  return <LandingPage />;
}
