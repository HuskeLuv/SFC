import SignUpForm from '@/components/auth/SignUpForm';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '',
  description: '',
  // other metadata
};

// Lê REGISTRATION_DISABLED em runtime (não no build) pra a UI acompanhar o
// mesmo toggle do env que o /api/auth/register usa, sem precisar rebuild.
export const dynamic = 'force-dynamic';

export default function SignUp() {
  const registrationDisabled = process.env.REGISTRATION_DISABLED === 'true';
  return <SignUpForm registrationDisabled={registrationDisabled} />;
}
