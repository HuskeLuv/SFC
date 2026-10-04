/**
 * Ações do curador sobre um caso (bloco C, fatia C) — PATCH /api/admin/analise-ativos/casos/[id].
 *
 *  - 'assumir'  aberto → em_analise (responsável = o admin)
 *  - 'soltar'   em_analise → aberto (sem responsável)
 *  - 'decidir'  status (TRANSICOES; fechado é final) + resolução OBRIGATÓRIA ao fechar e coerente
 *               com o status + efeito na tela ('liberar_valor' só com rejeitado/dado_confirmado:
 *               vale no próximo cálculo diário — decisão 15) + resposta pública (≤ 500, saneada,
 *               sem HTML, varrida por encontrarPalavrasProibidas: termo proibido → 400 com
 *               details.termos) + anotação interna (≤ 2.000). Sem conferência manual (decisão 16).
 *  - 'nota'     só a anotação interna.
 *
 * Concorrência otimista: toda ação leva `atualizadoEmEsperado` (o updatedAt lido). O UPDATE é
 * condicional (id + updatedAt): se outra pessoa alterou antes, nada é gravado e a resposta é 409 com
 * quem alterou e quando. Transição inválida também é 409.
 *
 * Fechar (corrigido|rejeitado): resolvidoEm/resolvidoPorId, chaveAberta=null (um relato novo abre
 * outro caso), conferenciaManual=false, reportes.respondidoEm e UMA Notification por autor distinto
 * (notificacoesCaso), tudo na mesma transação; o push sai depois do commit. Toda ação grava um
 * AnaliseCasoEvento (auditoria).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '@/utils/apiErrorHandler';
import {
  LIMITES,
  casoFechado,
  contemHtml,
  efeitoTelaValido,
  podeTransitar,
  resolucaoValida,
  sanearTextoLivre,
  type EfeitoTela,
  type ResolucaoCaso,
  type StatusCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import {
  enviarPushes,
  notificarAutoresDoCaso,
  type NotificacaoCaso,
} from '@/services/analiseAtivos/curadoria/notificacoesCaso';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/regras/comum/linguagem';
import type { CasoConflito409, CasoPatchBody } from '@/types/analiseAtivosCuradoria';

/** 409 do PATCH (concorrência ou transição inválida): a rota responde com `corpo`. */
export class ConflitoCaso extends Error {
  constructor(public corpo: CasoConflito409) {
    super(corpo.error);
  }
}

export const MSG_CONFLITO =
  'O caso foi alterado por outra pessoa. Recarregue para ver a versão atual.';
export const MSG_TRANSICAO = 'Esta mudança de status não é permitida para o caso.';

export interface ResultadoAcao {
  /** autores avisados (só ao fechar) */
  notificados: number;
}

type Tx = Prisma.TransactionClient;

interface CasoAtual {
  id: string;
  symbol: string;
  status: string;
  responsavelId: string | null;
  updatedAt: Date;
}

/** Texto livre do curador: saneado, sem HTML, dentro do limite. '' vira null. */
export function validarTextoCurador(
  bruto: string | undefined,
  campo: 'respostaPublica' | 'notaCurador',
): string | null | undefined {
  if (bruto === undefined) return undefined;
  const texto = sanearTextoLivre(bruto);
  const max = campo === 'respostaPublica' ? LIMITES.respostaPublica : LIMITES.notaCurador;
  if (contemHtml(texto)) {
    throw new ApiError(400, 'Escreva só texto, sem marcações.', { [campo]: ['html'] });
  }
  if (texto.length > max) {
    throw new ApiError(400, `Use no máximo ${max} caracteres.`, { [campo]: ['tamanho'] });
  }
  if (campo === 'respostaPublica') {
    const termos = encontrarPalavrasProibidas(texto);
    if (termos.length > 0) {
      throw new ApiError(400, `A resposta tem um termo que não pode ser usado: ${termos[0]}.`, {
        termos,
      });
    }
  }
  return texto.length > 0 ? texto : null;
}

async function conflito(tx: Tx | PrismaClient, casoId: string, msg = MSG_CONFLITO) {
  const atual = await tx.analiseCasoDado.findUnique({
    where: { id: casoId },
    select: { updatedAt: true },
  });
  const ultimo = await tx.analiseCasoEvento.findFirst({
    where: { casoId, autorId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { autorId: true },
  });
  let atualizadoPor: CasoConflito409['atualizadoPor'] = null;
  if (ultimo?.autorId) {
    const u = await tx.user.findUnique({
      where: { id: ultimo.autorId },
      select: { id: true, name: true },
    });
    if (u) atualizadoPor = { id: u.id, nome: u.name };
  }
  return new ConflitoCaso({
    error: msg,
    atualizadoEm: (atual?.updatedAt ?? new Date()).toISOString(),
    atualizadoPor,
  });
}

/**
 * UPDATE condicional (id + updatedAt esperado). 0 linhas = alguém alterou antes → 409. O
 * `updatedAt` novo é o `agora` (marcado à mão para os eventos e a resposta usarem o mesmo instante).
 */
async function atualizarCondicional(
  tx: Tx,
  caso: CasoAtual,
  esperado: Date,
  data: Prisma.AnaliseCasoDadoUncheckedUpdateManyInput,
): Promise<void> {
  const r = await tx.analiseCasoDado.updateMany({
    where: { id: caso.id, updatedAt: esperado },
    data,
  });
  if (r.count === 0) throw await conflito(tx, caso.id);
}

function lerEsperado(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, 'atualizadoEmEsperado inválido', { atualizadoEmEsperado: ['iso'] });
  }
  return d;
}

/**
 * Aplica a ação do curador. Lança ApiError(400/404) ou ConflitoCaso (409). Devolve quantos autores
 * foram avisados (o push sai depois do commit).
 */
export async function aplicarAcaoCaso(
  prisma: PrismaClient,
  params: { casoId: string; adminId: string; corpo: CasoPatchBody; agora?: Date },
): Promise<ResultadoAcao> {
  const { casoId, adminId, corpo } = params;
  const agora = params.agora ?? new Date();
  const esperado = lerEsperado(corpo.atualizadoEmEsperado);

  // Validação de texto ANTES da transação (400 não abre transação).
  const resposta =
    corpo.acao === 'decidir'
      ? validarTextoCurador(corpo.respostaPublica, 'respostaPublica')
      : undefined;
  const nota =
    corpo.acao === 'decidir' || corpo.acao === 'nota'
      ? validarTextoCurador(corpo.notaCurador, 'notaCurador')
      : undefined;
  if (corpo.acao === 'nota' && !nota) {
    throw new ApiError(400, 'Escreva a anotação interna.', { notaCurador: ['vazia'] });
  }

  let notificacoes: NotificacaoCaso[] = [];
  await prisma.$transaction(async (tx) => {
    const caso = await tx.analiseCasoDado.findUnique({
      where: { id: casoId },
      select: { id: true, symbol: true, status: true, responsavelId: true, updatedAt: true },
    });
    if (!caso) throw new ApiError(404, 'Caso não encontrado');
    if (caso.updatedAt.getTime() !== esperado.getTime()) throw await conflito(tx, casoId);

    const de = caso.status as StatusCaso;
    const evento = (tipo: string, extra: { de?: string; para?: string; texto?: string | null }) =>
      tx.analiseCasoEvento.create({
        data: {
          casoId,
          autorId: adminId,
          tipo,
          de: extra.de ?? null,
          para: extra.para ?? null,
          texto: extra.texto ? extra.texto.slice(0, LIMITES.notaCurador) : null,
          createdAt: agora,
        },
      });

    if (corpo.acao === 'assumir' || corpo.acao === 'soltar') {
      const para: StatusCaso = corpo.acao === 'assumir' ? 'em_analise' : 'aberto';
      if (!podeTransitar(de, para)) throw await conflito(tx, casoId, MSG_TRANSICAO);
      await atualizarCondicional(tx, caso, esperado, {
        status: para,
        responsavelId: corpo.acao === 'assumir' ? adminId : null,
        updatedAt: agora,
      });
      await evento(corpo.acao === 'assumir' ? 'assumido' : 'solto', { de, para });
      return;
    }

    if (corpo.acao === 'nota') {
      if (casoFechado(de)) throw await conflito(tx, casoId, MSG_TRANSICAO);
      await atualizarCondicional(tx, caso, esperado, { notaCurador: nota, updatedAt: agora });
      await evento('nota', { texto: nota });
      return;
    }

    if (corpo.acao !== 'decidir') return;
    const para = corpo.status;
    if (casoFechado(de)) throw await conflito(tx, casoId, MSG_TRANSICAO);
    if (para !== de && !podeTransitar(de, para)) throw await conflito(tx, casoId, MSG_TRANSICAO);
    const fechar = casoFechado(para);
    if (fechar && !resolucaoValida(para, corpo.resolucao)) {
      throw new ApiError(400, 'Escolha a resolução para fechar o caso.', {
        resolucao: ['obrigatoria'],
      });
    }
    const resolucao = fechar ? (corpo.resolucao as ResolucaoCaso) : null;
    const efeito: EfeitoTela = corpo.efeitoTela;
    if (!efeitoTelaValido(para, resolucao, efeito)) {
      throw new ApiError(400, 'Liberar o valor só vale para dado confirmado.', {
        efeitoTela: ['incoerente'],
      });
    }

    const data: Prisma.AnaliseCasoDadoUncheckedUpdateManyInput = {
      status: para,
      efeitoTela: efeito,
      updatedAt: agora,
    };
    if (resposta !== undefined) data.respostaPublica = resposta;
    if (nota !== undefined) data.notaCurador = nota;
    if (para === 'em_analise' && !caso.responsavelId) data.responsavelId = adminId;
    if (para === 'aberto') data.responsavelId = null;
    if (fechar) {
      Object.assign(data, {
        resolucao,
        resolvidoEm: agora,
        resolvidoPorId: adminId,
        chaveAberta: null,
        // decisão 16: nunca há conferência manual; ao fechar, a coluna reservada fica false
        conferenciaManual: false,
      });
    }
    await atualizarCondicional(tx, caso, esperado, data);
    await evento('decisao', { de, para, texto: resolucao ?? efeito });
    if (nota !== undefined && nota) await evento('nota', { texto: nota });

    if (fechar && resolucao) {
      const reportes = await tx.analiseDataReport.findMany({
        where: { casoId },
        select: { userId: true },
      });
      await tx.analiseDataReport.updateMany({
        where: { casoId, respondidoEm: null },
        data: { respondidoEm: agora },
      });
      notificacoes = await notificarAutoresDoCaso(
        tx,
        { id: casoId, symbol: caso.symbol, resolucao },
        reportes.map((r) => r.userId),
      );
      if (notificacoes.length > 0) {
        await evento('notificado', { texto: String(notificacoes.length) });
      }
    }
  });

  enviarPushes(notificacoes);
  return { notificados: notificacoes.length };
}
