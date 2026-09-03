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

export default async function Home() {
  if (await hasValidSession()) {
    redirect('/carteira');
  }
  return <LandingPage />;
}
