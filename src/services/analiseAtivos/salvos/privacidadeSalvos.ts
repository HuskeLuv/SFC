/**
 * LGPD do bloco 1 (fatia A): exportação (Art. 18, V) e eliminação (Art. 18, VI) de Salvos,
 * filtros salvos, comparações salvas e da trilha dos avisos.
 *
 * - paraExportacao(userId): listas (com itens), filtros, comparações e os envios de aviso dos
 *   últimos RETENCAO_AVISOS_DIAS (tipo, symbol, chave, data). Entra em analiseAtivos do
 *   /api/profile/export (as Notification já saem inteiras no bloco `notifications` do export).
 * - apagarSalvosDoUsuario(userId): o DELETE /api/profile ANONIMIZA o User (o onDelete Cascade nunca
 *   roda), então tudo é apagado aqui, explicitamente e numa transação — inclusive as Notification
 *   type ANALISE_SALVOS_ALERTA_TYPE (o texto do aviso cita os ativos que a pessoa acompanha).
 */
import { prisma } from '@/lib/prisma';
import {
  ANALISE_SALVOS_ALERTA_TYPE,
  RETENCAO_AVISOS_DIAS,
} from '@/services/analiseAtivos/salvos/contrato';
import type { ExportacaoSalvos } from '@/types/analiseAtivosSalvos';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Bloco do export LGPD (só o usuário logado; consultor não chega aqui). */
export async function paraExportacao(
  userId: string,
  agora: Date = new Date(),
): Promise<ExportacaoSalvos> {
  const desde = new Date(agora.getTime() - RETENCAO_AVISOS_DIAS * DIA_MS);
  const [listas, filtros, comparacoes, envios] = await Promise.all([
    prisma.analiseLista.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        nome: true,
        alertaResultado: true,
        alertaProvento: true,
        alertaCriterios: true,
        createdAt: true,
        itens: {
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { symbol: true, classe: true, createdAt: true },
        },
      },
    }),
    prisma.analiseFiltroSalvo.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        nome: true,
        classe: true,
        estado: true,
        createdAt: true,
        updatedAt: true,
        ultimoUsoEm: true,
      },
    }),
    prisma.analiseComparacao.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        nome: true,
        classe: true,
        tickers: true,
        janela: true,
        tipoFii: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.analiseAlertaEnvio.findMany({
      where: { userId, createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
      select: { tipo: true, symbol: true, chave: true, createdAt: true },
    }),
  ]);
  return {
    listas: listas.map((l) => ({
      nome: l.nome,
      alertas: {
        resultado: l.alertaResultado,
        provento: l.alertaProvento,
        criterios: l.alertaCriterios,
      },
      criadaEm: l.createdAt.toISOString(),
      itens: l.itens.map((i) => ({
        ticker: i.symbol,
        classe: i.classe,
        adicionadoEm: i.createdAt.toISOString(),
      })),
    })),
    filtrosSalvos: filtros.map((f) => ({
      nome: f.nome,
      classe: f.classe,
      estado: f.estado,
      criadoEm: f.createdAt.toISOString(),
      atualizadoEm: f.updatedAt.toISOString(),
      ultimoUsoEm: f.ultimoUsoEm ? f.ultimoUsoEm.toISOString() : null,
    })),
    comparacoes: comparacoes.map((c) => ({
      nome: c.nome,
      classe: c.classe,
      tickers: c.tickers,
      janela: c.janela,
      tipoFii: c.tipoFii,
      criadaEm: c.createdAt.toISOString(),
      atualizadaEm: c.updatedAt.toISOString(),
    })),
    alertasEnviados: envios.map((e) => ({
      tipo: e.tipo,
      symbol: e.symbol,
      chave: e.chave,
      data: e.createdAt.toISOString(),
    })),
  };
}

export interface ContagemApagados {
  itens: number;
  listas: number;
  filtros: number;
  comparacoes: number;
  envios: number;
  notificacoes: number;
}

/** Exclusão de conta: apaga tudo do bloco 1 do usuário numa transação. */
export async function apagarSalvosDoUsuario(userId: string): Promise<ContagemApagados> {
  const [itens, listas, filtros, comparacoes, envios, notificacoes] = await prisma.$transaction([
    prisma.analiseListaItem.deleteMany({ where: { userId } }),
    prisma.analiseLista.deleteMany({ where: { userId } }),
    prisma.analiseFiltroSalvo.deleteMany({ where: { userId } }),
    prisma.analiseComparacao.deleteMany({ where: { userId } }),
    prisma.analiseAlertaEnvio.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId, type: ANALISE_SALVOS_ALERTA_TYPE } }),
  ]);
  return {
    itens: itens.count,
    listas: listas.count,
    filtros: filtros.count,
    comparacoes: comparacoes.count,
    envios: envios.count,
    notificacoes: notificacoes.count,
  };
}
