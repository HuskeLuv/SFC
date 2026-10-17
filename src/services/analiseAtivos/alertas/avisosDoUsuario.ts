/**
 * Leitura dos avisos das listas para a aba Salvos › Alertas e o "Marcar todos como lidos" (bloco 1,
 * fatia D), + a limpeza de 90 dias usada pelo job e pelo lgpd-retention.
 *
 * Sem tabela nova: os avisos SÃO as Notification de type ANALISE_SALVOS_ALERTA_TYPE (o sino já as
 * mostra); tipo, classe e href ficam no metadata (MetadataAvisoSalvos). Toda query filtra pelo
 * userId de quem chamou (a rota passa SEMPRE payload.id; o consultor agindo não chega aqui).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  ANALISE_SALVOS_ALERTA_TYPE,
  RETENCAO_AVISOS_DIAS,
  ROTAS_SALVOS,
  TIPOS_AVISO,
} from '@/services/analiseAtivos/salvos/contrato';
import type {
  AvisoApi,
  ClasseItemSalvo,
  MetadataAvisoSalvos,
  TipoAviso,
} from '@/types/analiseAtivosSalvos';

const DIA_MS = 86_400_000;
/** Teto de avisos devolvidos (90 dias × teto de 5 + resumo por dia ≈ 540). */
export const MAX_AVISOS_LIDOS = 600;

type Db = Pick<PrismaClient, 'notification' | 'analiseAlertaEnvio'>;

export function corteRetencao(agora: Date, dias = RETENCAO_AVISOS_DIAS): Date {
  return new Date(agora.getTime() - dias * DIA_MS);
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const hrefValido = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('/') && !v.startsWith('//');

/** metadata gravado pelo job → MetadataAvisoSalvos (campo ilegível cai num padrão seguro). */
export function lerMetadataAviso(bruto: unknown): MetadataAvisoSalvos {
  const m = ehObjeto(bruto) ? bruto : {};
  const tipo = (TIPOS_AVISO as readonly string[]).includes(String(m.tipo))
    ? (m.tipo as TipoAviso)
    : 'resumo';
  const classe: ClasseItemSalvo | null =
    m.classe === 'acao' || m.classe === 'fii' ? m.classe : null;
  return {
    href: hrefValido(m.href) ? m.href : ROTAS_SALVOS.paginaAlertas,
    symbol: typeof m.symbol === 'string' ? m.symbol : '*',
    tipo,
    classe,
    eventoId: typeof m.eventoId === 'string' ? m.eventoId : '',
  };
}

/** Filtro da classe: os avisos da classe + os resumos (que valem para as duas). */
function whereAvisos(userId: string, desde: Date, classe?: ClasseItemSalvo) {
  const base: Prisma.NotificationWhereInput = {
    userId,
    type: ANALISE_SALVOS_ALERTA_TYPE,
    createdAt: { gte: desde },
  };
  if (!classe) return base;
  return {
    ...base,
    OR: [
      { metadata: { path: ['classe'], equals: classe } },
      { metadata: { path: ['tipo'], equals: 'resumo' } },
    ],
  } satisfies Prisma.NotificationWhereInput;
}

export interface OpcoesAvisos {
  classe?: ClasseItemSalvo;
  /** 1..90 (padrão 90) */
  dias?: number;
  agora?: Date;
}

/** GET /alertas: avisos do usuário (mais novos primeiro) + quantos não lidos no mesmo filtro. */
export async function listarAvisos(
  db: Db,
  userId: string,
  opts: OpcoesAvisos = {},
): Promise<{ avisos: AvisoApi[]; naoLidos: number }> {
  const desde = corteRetencao(opts.agora ?? new Date(), opts.dias ?? RETENCAO_AVISOS_DIAS);
  const where = whereAvisos(userId, desde, opts.classe);
  const [linhas, naoLidos] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_AVISOS_LIDOS,
      select: {
        id: true,
        title: true,
        message: true,
        metadata: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return {
    avisos: linhas.map((n) => {
      const m = lerMetadataAviso(n.metadata);
      return {
        id: n.id,
        titulo: n.title,
        mensagem: n.message,
        href: m.href,
        symbol: m.symbol,
        tipo: m.tipo,
        classe: m.classe,
        criadoEm: n.createdAt.toISOString(),
        lido: n.readAt !== null,
      };
    }),
    naoLidos,
  };
}

/** POST /alertas/lidos: readAt nos avisos não lidos do usuário (ids ausente = todos os 90 dias). */
export async function marcarAvisosLidos(
  db: Db,
  userId: string,
  ids?: readonly string[],
  agora: Date = new Date(),
): Promise<number> {
  const r = await db.notification.updateMany({
    where: {
      userId,
      type: ANALISE_SALVOS_ALERTA_TYPE,
      readAt: null,
      createdAt: { gte: corteRetencao(agora) },
      ...(ids ? { id: { in: [...ids] } } : {}),
    },
    data: { readAt: agora },
  });
  return r.count;
}

/**
 * Retenção ÚNICA de 90 dias (o texto da tela diz "ficam aqui por 90 dias"): apaga os envios e as
 * Notification de aviso mais velhos. Usada pelo job (redundância) e pelo lgpd-retention.
 */
export async function apagarAvisosVencidos(
  db: Db,
  agora: Date = new Date(),
): Promise<{ envios: number; notificacoes: number; corte: Date }> {
  const corte = corteRetencao(agora);
  const [envios, notificacoes] = await Promise.all([
    db.analiseAlertaEnvio.deleteMany({ where: { createdAt: { lt: corte } } }),
    db.notification.deleteMany({
      where: { type: ANALISE_SALVOS_ALERTA_TYPE, createdAt: { lt: corte } },
    }),
  ]);
  return { envios: envios.count, notificacoes: notificacoes.count, corte };
}
