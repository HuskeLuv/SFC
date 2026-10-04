/**
 * LGPD dos relatos de dado incorreto (bloco C, fatia D; decisão 19).
 *
 * - Exclusão de conta (DELETE /api/profile, que ANONIMIZA o User — o cascade nunca roda):
 *   anonimizarReportesDoUsuario limpa o texto livre dos relatos que o usuário ESCREVEU
 *   (mensagem = '[removido]', valorEsperado/fonteEsperada = null) e tira o vínculo de cliente
 *   (clienteId = null) dos relatos feitos por um consultor agindo por ele.
 * - Retenção (cron lgpd-retention): anonimizarReportesRetencao faz o mesmo com os relatos de casos
 *   FECHADOS há mais de 12 meses. O caso e a auditoria (eventos) ficam.
 * - Export (GET /api/profile/export): relatosParaExportacao devolve os relatos do usuário com o
 *   status do caso como ele o vê (rejeitado = "conferido, sem alteração").
 *
 * O contextoServidor (retrato da linha do Quadro) não tem dado pessoal; o evento do caso só leva o
 * protocolo. Cada caso afetado ganha um evento 'anonimizado' (sem texto do usuário).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  RETENCAO_MESES_APOS_FECHAR,
  STATUS_FECHADOS,
  TEXTO_ANONIMIZADO,
  casoFechado,
  ehStatusCaso,
  statusParaUsuario,
} from '@/services/analiseAtivos/curadoria/contrato';

type Db = PrismaClient | Prisma.TransactionClient;

const LIMPEZA = {
  mensagem: TEXTO_ANONIMIZADO,
  valorEsperado: null,
  fonteEsperada: null,
} as const;

async function registrarEventos(db: Db, casoIds: string[], motivo: string): Promise<void> {
  const unicos = [...new Set(casoIds)];
  if (unicos.length === 0) return;
  await db.analiseCasoEvento.createMany({
    data: unicos.map((casoId) => ({ casoId, autorId: null, tipo: 'anonimizado', texto: motivo })),
  });
}

export interface ResultadoAnonimizacao {
  /** relatos do usuário com o texto livre limpo */
  anonimizados: number;
  /** relatos em que o usuário era o cliente (vínculo removido) */
  desvinculados: number;
}

/** Exclusão de conta: limpa o texto livre e o vínculo de cliente. Idempotente. */
export async function anonimizarReportesDoUsuario(
  db: Db,
  userId: string,
  agora: Date = new Date(),
): Promise<ResultadoAnonimizacao> {
  const doUsuario = await db.analiseDataReport.findMany({
    where: { userId, anonimizadoEm: null },
    select: { casoId: true },
  });
  const anonimizados = await db.analiseDataReport.updateMany({
    where: { userId, anonimizadoEm: null },
    data: { ...LIMPEZA, anonimizadoEm: agora },
  });
  const desvinculados = await db.analiseDataReport.updateMany({
    where: { clienteId: userId },
    data: { clienteId: null },
  });
  await registrarEventos(
    db,
    doUsuario.map((r) => r.casoId),
    'exclusão de conta',
  );
  return { anonimizados: anonimizados.count, desvinculados: desvinculados.count };
}

/** Corte da retenção: 12 meses antes de `agora` (mesmo dia do mês, em UTC). */
export function corteRetencao(agora: Date): Date {
  const d = new Date(agora.getTime());
  d.setUTCMonth(d.getUTCMonth() - RETENCAO_MESES_APOS_FECHAR);
  return d;
}

/** Retenção: relatos de casos fechados há mais de 12 meses. Idempotente. */
export async function anonimizarReportesRetencao(
  db: Db,
  agora: Date = new Date(),
): Promise<{ anonimizados: number; corte: Date }> {
  const corte = corteRetencao(agora);
  const where: Prisma.AnaliseDataReportWhereInput = {
    anonimizadoEm: null,
    caso: { status: { in: [...STATUS_FECHADOS] }, resolvidoEm: { lt: corte } },
  };
  const alvos = await db.analiseDataReport.findMany({ where, select: { id: true, casoId: true } });
  if (alvos.length === 0) return { anonimizados: 0, corte };
  const r = await db.analiseDataReport.updateMany({
    where: { id: { in: alvos.map((a) => a.id) }, anonimizadoEm: null },
    data: { ...LIMPEZA, anonimizadoEm: agora },
  });
  await registrarEventos(
    db,
    alvos.map((a) => a.casoId),
    'retenção de 12 meses',
  );
  return { anonimizados: r.count, corte };
}

/** Relatos do usuário para o export de portabilidade (Art. 18, V). */
export async function relatosParaExportacao(db: Db, userId: string) {
  const relatos = await db.analiseDataReport.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      protocolo: true,
      symbol: true,
      bloco: true,
      campo: true,
      periodo: true,
      valorExibido: true,
      valorEsperado: true,
      fonteExibida: true,
      frescorExibido: true,
      mensagem: true,
      fonteEsperada: true,
      clienteId: true,
      createdAt: true,
      respondidoEm: true,
      anonimizadoEm: true,
      caso: {
        select: { status: true, resolucao: true, respostaPublica: true, resolvidoEm: true },
      },
    },
  });
  return relatos.map(({ caso, clienteId, ...r }) => {
    const fechado = casoFechado(caso.status);
    return {
      ...r,
      agindoPeloCliente: clienteId !== null,
      caso: {
        status: ehStatusCaso(caso.status) ? statusParaUsuario(caso.status) : caso.status,
        resolucao: fechado ? caso.resolucao : null,
        respostaPublica: fechado ? caso.respostaPublica : null,
        resolvidoEm: fechado ? caso.resolvidoEm : null,
      },
    };
  });
}
