import prisma from '@/lib/prisma';
import { avaliarExibicaoCsat, type CsatDecisao } from '@/lib/csat/regras';

/**
 * Pesquisa de satisfação (CSAT) — acesso ao banco (ClickUp 86e3vmyv7 / KPI 86e3vmyup).
 *
 * LGPD — finalidade: medir a satisfação dos clientes com o My Finance e orientar o atendimento
 * (Customer Success). Base legal: legítimo interesse na melhoria do serviço; responder é opcional.
 * O comentário é texto livre (pode conter dado pessoal): só o admin o lê, ele sai no export do
 * usuário (GET /api/profile/export) e é apagado na exclusão de conta (DELETE /api/profile).
 */

/** Eventos recentes bastam para as regras (última resposta + "Agora não" seguidos). */
const EVENTOS_RECENTES = 10;

export async function decidirExibicaoCsat(params: {
  userId: string;
  role: string;
  personificando: boolean;
  agora?: Date;
}): Promise<CsatDecisao> {
  const agora = params.agora ?? new Date();
  if (params.personificando) return { mostrar: false, motivo: 'personificacao' };

  const [user, eventos] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      select: { createdAt: true, email: true },
    }),
    prisma.csatResposta.findMany({
      where: { userId: params.userId },
      orderBy: { createdAt: 'desc' },
      take: EVENTOS_RECENTES,
      select: { nota: true, createdAt: true },
    }),
  ]);
  if (!user) return { mostrar: false, motivo: 'cadastro_recente' };

  return avaliarExibicaoCsat({
    agora,
    role: params.role,
    email: user.email,
    personificando: false,
    cadastradoEm: user.createdAt,
    // No app, a própria sessão autenticada é o acesso (quem está vendo o cartão está usando o app).
    ultimoAcesso: agora,
    eventos,
  });
}

export async function registrarRespostaCsat(
  userId: string,
  nota: number,
  comentario: string | null,
) {
  return prisma.csatResposta.create({
    data: { userId, nota, comentario, origem: 'app' },
    select: { id: true, createdAt: true },
  });
}

export async function registrarAdiamentoCsat(userId: string) {
  return prisma.csatResposta.create({
    data: { userId, nota: null, comentario: null, origem: 'app' },
    select: { id: true, createdAt: true },
  });
}

/** Export LGPD (Art. 18, II): respostas e adiamentos do próprio usuário. */
export async function csatParaExportacao(userId: string) {
  return prisma.csatResposta.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { nota: true, comentario: true, origem: true, createdAt: true },
  });
}

/** Exclusão de conta (Art. 18, IV): o User é anonimizado, então o cascade não roda. */
export async function apagarCsatDoUsuario(userId: string) {
  return prisma.csatResposta.deleteMany({ where: { userId } });
}
