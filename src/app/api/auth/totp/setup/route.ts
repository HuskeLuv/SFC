/**
 * POST /api/auth/totp/setup — inicia o setup do 2FA TOTP (LGPD #12).
 *
 * Gera secret base32 + QR Code otpauth e devolve pro client. O secret
 * AINDA NÃO é considerado ativo: persistimos com `totpEnabled=false`.
 * O user precisa confirmar com um código válido via /api/auth/totp/verify
 * pra ativar.
 *
 * Re-execução substitui o secret pendente — útil quando o user perdeu
 * o QR antes de confirmar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { requireAuthWithActing } from '@/utils/auth';
import prisma from '@/lib/prisma';
import { withErrorHandler } from '@/utils/apiErrorHandler';

const ISSUER = 'MyFinance';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const { payload } = await requireAuthWithActing(req);
  const me = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  if (me.totpEnabled) {
    return NextResponse.json(
      { error: '2FA já está ativo. Desative antes de gerar novo segredo.' },
      { status: 409 },
    );
  }

  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: ISSUER, label: me.email, secret });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  await prisma.user.update({
    where: { id: me.id },
    data: { totpSecret: secret, totpEnabled: false },
  });

  return NextResponse.json({
    secret, // mostrar em texto pra cópia manual em apps que não escaneiam QR
    qrCodeDataUrl: qrDataUrl,
    otpauthUrl,
  });
});
