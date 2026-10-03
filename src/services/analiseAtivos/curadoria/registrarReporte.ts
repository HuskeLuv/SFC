/**
 * Registro de um relato de dado incorreto (bloco C, fatia D). Usado por
 * POST /api/analise-ativos/reportes.
 *
 * 1) validarCorpoReporte: zod strict; TODO texto passa por sanearTextoLivre (controle, bidi,
 *    zero-width) ANTES da validação de tamanho; texto com cara de HTML → erro 'html' no campo; o
 *    campo tem de estar em CAMPOS_REPORTAVEIS[bloco] (ou ser 'outro'). Erros por campo com códigos
 *    ('obrigatorio' | 'min' | 'max' | 'html' | 'invalido'), que a tela traduz.
 * 2) registrarReporte (uma transação, serializada por usuário com pg_advisory_xact_lock):
 *    - relato ABERTO do mesmo usuário para (symbol, campo, periodo) → 'duplicado' (nada é criado;
 *      HTTP 409 e a tela leva ao relato existente — decisão 7);
 *    - limites da decisão 6, contados no banco: 5 por usuário em 24 h, 3 por usuário × ativo em
 *      1 h, 300 no total em 24 h (este com logger.error);
 *    - caso: o aberto da MESMA chave (chaveCaso); senão um caso de REGRA aberto do symbol cujo
 *      grupo contém o campo (campoPertenceAoGrupo; o caso vira 'misto'); senão caso NOVO de
 *      usuário (upsert pela chaveAberta única, com casoAnteriorId do último fechado do mesmo dado);
 *    - prazo (slaAte) no 1º relato do caso: 5 dias úteis (calendário B3);
 *    - relato com protocolo de 8 caracteres e o RETRATO DO SERVIDOR da linha do Quadro (valores,
 *      flags, motivos, estadoIndice, dataRef, paramsVersion), nReportes++ e evento 'reporte'.
 * O evento do caso NUNCA leva o texto livre do usuário (só o protocolo): a anonimização LGPD
 * (privacidadeReportes.ts) só precisa limpar analise_data_reports.
 *
 * Consultor agindo pelo cliente (decisão 10): autor = consultor (payload.id), clienteId = cliente;
 * os limites contam para o autor. Quem decide isso é a rota; aqui chegam autorId e clienteId.
 */
import { z } from 'zod';
import type { AnaliseQuadroLinha, Prisma, PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import {
  BLOCOS_REPORTE,
  CAMPO_OUTRO,
  LIMITES,
  campoPertenceAoGrupo,
  campoReportavel,
  chaveCaso,
  contemHtml,
  gerarProtocolo,
  sanearTextoLivreComContagem,
  slaAte as calcularSlaAte,
  type BlocoReporte,
  type StatusCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import {
  campoEmConferencia,
  ehCampoTela,
  type CampoConferencia,
} from '@/services/analiseAtivos/regras/comum/conferencia';
import type { ReportePostBody, ReportePostResposta } from '@/types/analiseAtivosCuradoria';

// ===========================================================================
// Validação do corpo
// ===========================================================================

export type CodigoErroCampo = 'obrigatorio' | 'min' | 'max' | 'html' | 'invalido';

const RE_TICKER = /^[A-Z0-9]{4,12}$/;

/** Campos de texto do corpo e o limite de cada um (depois de saneado). */
const TEXTOS: Record<
  Exclude<keyof ReportePostBody, 'ticker' | 'bloco' | 'campo'>,
  { max: number; min?: number; obrigatorio: boolean }
> = {
  valorExibido: { max: LIMITES.valorExibido, obrigatorio: false },
  periodo: { max: LIMITES.periodo, obrigatorio: false },
  fonteExibida: { max: LIMITES.fonteExibida, obrigatorio: false },
  frescorExibido: { max: LIMITES.frescorExibido, obrigatorio: false },
  versao: { max: LIMITES.versao, obrigatorio: true },
  mensagem: { min: LIMITES.mensagemMin, max: LIMITES.mensagemMax, obrigatorio: true },
  valorEsperado: { max: LIMITES.valorEsperado, obrigatorio: false },
  fonteEsperada: { max: LIMITES.fonteEsperada, obrigatorio: false },
};

/**
 * Forma do corpo (zod strict: chave desconhecida = 400). Os tamanhos ficam para depois do
 * saneamento; aqui só um teto bruto (4× o limite) contra corpo gigante.
 */
const textoBruto = (max: number) => z.string().max(max * 4);
const CorpoBrutoSchema = z
  .object({
    ticker: z.string().max(16),
    bloco: z.enum(BLOCOS_REPORTE),
    campo: z.string().max(40),
    valorExibido: textoBruto(LIMITES.valorExibido).nullish(),
    periodo: textoBruto(LIMITES.periodo).nullish(),
    fonteExibida: textoBruto(LIMITES.fonteExibida).nullish(),
    frescorExibido: textoBruto(LIMITES.frescorExibido).nullish(),
    versao: textoBruto(LIMITES.versao),
    mensagem: textoBruto(LIMITES.mensagemMax),
    valorEsperado: textoBruto(LIMITES.valorEsperado).nullish(),
    fonteEsperada: textoBruto(LIMITES.fonteEsperada).nullish(),
  })
  .strict();

/** Corpo saneado (opcionais vazios viram null). */
export interface CorpoReporte {
  ticker: string;
  bloco: BlocoReporte;
  campo: string;
  valorExibido: string | null;
  periodo: string | null;
  fonteExibida: string | null;
  frescorExibido: string | null;
  versao: string;
  mensagem: string;
  valorEsperado: string | null;
  fonteEsperada: string | null;
}

export type ResultadoValidacao =
  | { ok: true; corpo: CorpoReporte; removidos: number }
  | { ok: false; erros: Record<string, CodigoErroCampo[]> };

export function validarCorpoReporte(bruto: unknown): ResultadoValidacao {
  const forma = CorpoBrutoSchema.safeParse(bruto);
  if (!forma.success) {
    const erros: Record<string, CodigoErroCampo[]> = {};
    for (const i of forma.error.issues) {
      const k = i.path.length > 0 ? String(i.path[0]) : 'corpo';
      const codigo: CodigoErroCampo =
        i.code === 'too_big' ? 'max' : i.code === 'invalid_type' ? 'obrigatorio' : 'invalido';
      (erros[k] ??= []).push(codigo);
    }
    return { ok: false, erros };
  }
  const d = forma.data;
  const erros: Record<string, CodigoErroCampo[]> = {};
  let removidos = 0;
  const textos: Partial<Record<keyof typeof TEXTOS, string | null>> = {};
  for (const [k, regra] of Object.entries(TEXTOS) as Array<
    [keyof typeof TEXTOS, (typeof TEXTOS)[keyof typeof TEXTOS]]
  >) {
    const valor = d[k];
    if (valor === null || valor === undefined) {
      if (regra.obrigatorio) erros[k] = ['obrigatorio'];
      textos[k] = null;
      continue;
    }
    const s = sanearTextoLivreComContagem(valor);
    removidos += s.removidos;
    if (contemHtml(s.texto)) {
      erros[k] = ['html'];
      continue;
    }
    if (s.texto.length === 0) {
      if (regra.obrigatorio) erros[k] = [regra.min ? 'min' : 'obrigatorio'];
      textos[k] = null;
      continue;
    }
    if (regra.min && s.texto.length < regra.min) erros[k] = ['min'];
    else if (s.texto.length > regra.max) erros[k] = ['max'];
    textos[k] = s.texto;
  }
  const ticker = d.ticker.trim().toUpperCase();
  if (!RE_TICKER.test(ticker)) erros.ticker = ['invalido'];
  if (!campoReportavel(d.bloco, d.campo)) erros.campo = ['invalido'];
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    removidos,
    corpo: {
      ticker,
      bloco: d.bloco,
      campo: d.campo,
      valorExibido: textos.valorExibido ?? null,
      periodo: textos.periodo ?? null,
      fonteExibida: textos.fonteExibida ?? null,
      frescorExibido: textos.frescorExibido ?? null,
      versao: textos.versao as string,
      mensagem: textos.mensagem as string,
      valorEsperado: textos.valorEsperado ?? null,
      fonteEsperada: textos.fonteEsperada ?? null,
    },
  };
}

// ===========================================================================
// Retrato do servidor
// ===========================================================================

type Numerico = { toString(): string } | number | null | undefined;

function num(v: Numerico): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

function dataCivil(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Conferência do campo na linha (null para 'outro' ou campo sem conferência). */
export function conferenciaDoCampo(
  linha: Pick<AnaliseQuadroLinha, 'flags' | 'motivosIncompleto' | 'classe'>,
  campo: string,
): CampoConferencia | null {
  if (!ehCampoTela(campo)) return null;
  const classe = linha.classe === 'fii' ? 'fii' : 'acao';
  return campoEmConferencia(linha.flags ?? [], linha.motivosIncompleto ?? [], campo, classe);
}

/**
 * O que o SERVIDOR tinha na linha do Quadro no momento do relato (o curador compara com o que o
 * usuário diz ter visto). Só dados de mercado; nada pessoal.
 */
export function retratoServidor(linha: AnaliseQuadroLinha, campo: string, removidos: number) {
  const conf = conferenciaDoCampo(linha, campo);
  return {
    symbol: linha.symbol,
    classe: linha.classe,
    dataRef: dataCivil(linha.dataRef),
    geradoEm: linha.geradoEm ? linha.geradoEm.toISOString() : null,
    paramsVersion: linha.paramsVersion ?? null,
    estadoIndice: linha.estadoIndice,
    indiceMf: num(linha.indiceMf),
    flags: linha.flags ?? [],
    motivosIncompleto: linha.motivosIncompleto ?? [],
    naoSeAplica: linha.naoSeAplica ?? [],
    valores: {
      preco: num(linha.preco),
      precoData: dataCivil(linha.precoData),
      valorMercado: num(linha.valorMercado),
      patrimonio: num(linha.patrimonio),
      pl: num(linha.pl),
      pvp: num(linha.pvp),
      dy12mPct: num(linha.dy12mPct),
      roePct: num(linha.roePct),
      margemLiquidaPct: num(linha.margemLiquidaPct),
      divLiqEbitda: num(linha.divLiqEbitda),
      divLiqPl: num(linha.divLiqPl),
      payoutPct: num(linha.payoutPct),
      vacanciaFisicaCvmPct: num(linha.vacanciaFisicaCvmPct),
      obrigacoesPlPct: num(linha.obrigacoesPlPct),
      cotistas: num(linha.cotistas),
      nImoveisCvm: num(linha.nImoveisCvm),
      nCri: num(linha.nCri),
      anosLucroConsecutivos: num(linha.anosLucroConsecutivos),
      mesesComRendimento: num(linha.mesesComRendimento),
      serieUlt12m: num(linha.serieUlt12m),
    },
    conferencia: conf ? { ...conf } : null,
    saneamento: { removidos },
  };
}

// ===========================================================================
// Registro
// ===========================================================================

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const ABERTOS: StatusCaso[] = ['aberto', 'em_analise'];
const FECHADOS: StatusCaso[] = ['corrigido', 'rejeitado'];
const TENTATIVAS_PROTOCOLO = 5;

export type LimiteReporte = 'dia' | 'hora_ativo' | 'global';

export type ResultadoRegistro =
  | {
      tipo: 'criado';
      resposta: ReportePostResposta;
      /** caso aberto agora por este relato */
      casoNovo: boolean;
      /** 1º relato de usuário do caso (caso de regra que passou a ter relato, ou caso novo) */
      primeiroRelato: boolean;
      caso: { id: string; symbol: string; campo: string; slaAte: string | null };
    }
  | { tipo: 'duplicado'; casoId: string; reporteId: string }
  | { tipo: 'limite'; limite: LimiteReporte; voltaEm: string | null };

export interface EntradaRegistro {
  /** autor logado (o consultor, quando age pelo cliente) */
  autorId: string;
  /** cliente quando o consultor age por ele; null no uso normal */
  clienteId: string | null;
  corpo: CorpoReporte;
  /** linha do Quadro do ticker (já conferida pela rota) */
  linha: AnaliseQuadroLinha;
  /** caracteres invisíveis removidos no saneamento (vai no retrato) */
  removidos: number;
  agora?: Date;
}

type Tx = Prisma.TransactionClient;

function paraDataDb(civil: string): Date {
  return new Date(`${civil}T00:00:00Z`);
}

async function voltaEmDe(
  tx: Tx,
  where: Prisma.AnaliseDataReportWhereInput,
  janelaMs: number,
): Promise<string | null> {
  const maisAntigo = await tx.analiseDataReport.findFirst({
    where,
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  return maisAntigo ? new Date(maisAntigo.createdAt.getTime() + janelaMs).toISOString() : null;
}

async function verificarLimites(
  tx: Tx,
  autorId: string,
  symbol: string,
  agora: Date,
): Promise<{ limite: LimiteReporte; voltaEm: string | null } | null> {
  const desdeDia = new Date(agora.getTime() - DIA_MS);
  const desdeHora = new Date(agora.getTime() - HORA_MS);

  const whereDia = { userId: autorId, createdAt: { gte: desdeDia } };
  if ((await tx.analiseDataReport.count({ where: whereDia })) >= LIMITES.porDia) {
    return { limite: 'dia', voltaEm: await voltaEmDe(tx, whereDia, DIA_MS) };
  }
  const whereHora = { userId: autorId, symbol, createdAt: { gte: desdeHora } };
  if ((await tx.analiseDataReport.count({ where: whereHora })) >= LIMITES.porHoraAtivo) {
    return { limite: 'hora_ativo', voltaEm: await voltaEmDe(tx, whereHora, HORA_MS) };
  }
  const global = await tx.analiseDataReport.count({ where: { createdAt: { gte: desdeDia } } });
  if (global >= LIMITES.globalDia) {
    logger.error('[analise-ativos][relatos] limite global de relatos em 24 h atingido', {
      global,
      limite: LIMITES.globalDia,
    });
    return { limite: 'global', voltaEm: null };
  }
  return null;
}

async function protocoloLivre(tx: Tx): Promise<string> {
  for (let i = 0; i < TENTATIVAS_PROTOCOLO; i += 1) {
    const p = gerarProtocolo();
    const existe = await tx.analiseDataReport.findUnique({
      where: { protocolo: p },
      select: { id: true },
    });
    if (!existe) return p;
  }
  throw new Error('Não foi possível gerar um protocolo único');
}

interface CasoAlvo {
  id: string;
  status: string;
  origem: string;
  slaAte: Date | null;
  nReportes: number;
}

const SELECT_CASO = {
  id: true,
  status: true,
  origem: true,
  slaAte: true,
  nReportes: true,
  grupo: true,
} as const;

/** Caso que recebe o relato (ver cabeçalho). */
async function casoDoRelato(
  tx: Tx,
  e: EntradaRegistro,
  agora: Date,
): Promise<{ caso: CasoAlvo; casoNovo: boolean }> {
  const { corpo, linha } = e;
  const symbol = corpo.ticker;
  const chave = chaveCaso({ symbol, campo: corpo.campo, periodo: corpo.periodo });

  const mesmaChave = await tx.analiseCasoDado.findUnique({
    where: { chaveAberta: chave },
    select: SELECT_CASO,
  });
  if (mesmaChave) return { caso: mesmaChave, casoNovo: false };

  if (corpo.campo !== CAMPO_OUTRO) {
    const deRegra = await tx.analiseCasoDado.findMany({
      where: { symbol, status: { in: ABERTOS }, origem: { in: ['regra', 'misto'] } },
      orderBy: { abertoEm: 'desc' },
      select: SELECT_CASO,
    });
    const doGrupo = deRegra.find((c) => campoPertenceAoGrupo(corpo.campo, c.grupo));
    if (doGrupo) return { caso: doGrupo, casoNovo: false };
  }

  const anterior = await tx.analiseCasoDado.findFirst({
    where: {
      symbol,
      campo: corpo.campo,
      periodo: corpo.periodo,
      status: { in: FECHADOS },
    },
    orderBy: { resolvidoEm: 'desc' },
    select: { id: true },
  });
  const conf = conferenciaDoCampo(linha, corpo.campo);
  const caso = await tx.analiseCasoDado.upsert({
    where: { chaveAberta: chave },
    update: {},
    create: {
      symbol,
      cnpj: linha.cnpj ?? null,
      classe: linha.classe,
      grupo: conf?.grupo ?? 'outro',
      campo: corpo.campo,
      periodo: corpo.periodo,
      origem: 'usuario',
      chaveAberta: chave,
      status: 'aberto',
      slaAte: paraDataDb(calcularSlaAte(agora)),
      contexto: {
        abertoPor: 'relato',
        bloco: corpo.bloco,
        conferencia: conf ? { ...conf } : null,
      },
      casoAnteriorId: anterior?.id ?? null,
      abertoEm: agora,
    },
    select: SELECT_CASO,
  });
  const casoNovo = caso.nReportes === 0;
  if (casoNovo) {
    await tx.analiseCasoEvento.create({
      data: { casoId: caso.id, autorId: null, tipo: 'aberto', para: 'aberto', texto: 'relato' },
    });
  }
  return { caso, casoNovo };
}

export async function registrarReporte(
  db: PrismaClient,
  e: EntradaRegistro,
): Promise<ResultadoRegistro> {
  const agora = e.agora ?? new Date();
  const { corpo, autorId } = e;
  const symbol = corpo.ticker;

  return db.$transaction(async (tx) => {
    // Serializa os relatos do MESMO autor (duplicado e limites sem corrida entre abas).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`analise_reporte:${autorId}`}))`;

    const existente = await tx.analiseDataReport.findFirst({
      where: {
        userId: autorId,
        symbol,
        campo: corpo.campo,
        periodo: corpo.periodo,
        caso: { status: { in: ABERTOS } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, casoId: true },
    });
    if (existente) {
      return { tipo: 'duplicado', casoId: existente.casoId, reporteId: existente.id } as const;
    }

    const limite = await verificarLimites(tx, autorId, symbol, agora);
    if (limite) return { tipo: 'limite', ...limite } as const;

    const { caso, casoNovo } = await casoDoRelato(tx, e, agora);
    const primeiroRelato = caso.nReportes === 0;
    const slaCivil = caso.slaAte ? dataCivil(caso.slaAte) : calcularSlaAte(agora);
    const protocolo = await protocoloLivre(tx);

    const reporte = await tx.analiseDataReport.create({
      data: {
        protocolo,
        casoId: caso.id,
        userId: autorId,
        clienteId: e.clienteId,
        symbol,
        bloco: corpo.bloco,
        campo: corpo.campo,
        periodo: corpo.periodo,
        valorExibido: corpo.valorExibido,
        valorEsperado: corpo.valorEsperado,
        fonteExibida: corpo.fonteExibida,
        frescorExibido: corpo.frescorExibido,
        versaoQuadro: corpo.versao,
        mensagem: corpo.mensagem,
        fonteEsperada: corpo.fonteEsperada,
        contextoServidor: retratoServidor(e.linha, corpo.campo, e.removidos),
        createdAt: agora,
      },
      select: { id: true },
    });

    const atualizado = await tx.analiseCasoDado.update({
      where: { id: caso.id },
      data: {
        nReportes: { increment: 1 },
        ...(caso.slaAte ? {} : { slaAte: paraDataDb(slaCivil as string) }),
        ...(caso.origem === 'regra' ? { origem: 'misto' } : {}),
      },
      select: { status: true, slaAte: true },
    });

    await tx.analiseCasoEvento.create({
      data: {
        casoId: caso.id,
        autorId,
        tipo: 'reporte',
        de: caso.origem === 'regra' ? 'regra' : null,
        para: caso.origem === 'regra' ? 'misto' : null,
        texto: `protocolo ${protocolo}`,
      },
    });

    const slaFinal = atualizado.slaAte ? dataCivil(atualizado.slaAte) : slaCivil;
    return {
      tipo: 'criado',
      casoNovo,
      primeiroRelato,
      caso: { id: caso.id, symbol, campo: corpo.campo, slaAte: slaFinal },
      resposta: {
        id: reporte.id,
        casoId: caso.id,
        protocolo,
        status: atualizado.status as StatusCaso,
        slaAte: slaFinal,
      },
    } as const;
  });
}
