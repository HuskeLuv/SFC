/**
 * Leitura da fila de curadoria (bloco C, fatia C): lista com filtros e contadores, detalhe do caso e
 * o resumo do card do /admin. SOMENTE LEITURA. Quem grava: acoesCuradoria.ts (curador),
 * sincronizarCasos.ts (job) e registrarReporte.ts (relato, fatia D).
 *
 * Ordem padrão: vencidos primeiro (prazo mais antigo), depois o prazo mais próximo; casos sem prazo
 * (só de regra) por idade, os mais antigos primeiro. Fechados: os resolvidos mais recentes primeiro.
 *
 * Contadores (sempre sobre casos NÃO fechados e fora da revisão, exceto `revisao`):
 *  - aberto     = com usuário esperando (origem usuario|misto; status aberto ou em_analise)
 *  - em_analise = status em_analise
 *  - venceHoje  = prazo hoje · vencido = prazo antes de hoje
 *  - vencendo   = prazo de hoje até 2 dias úteis (decisão 14) · soRegra = só de regra (sem prazo)
 *  - revisao    = casos de revisão abertos (aba própria; nada muda na tela — decisões 1 e 2)
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { REGRAS_REVISAO } from '@/services/analiseAtivos/regras/comum/conferencia';
import {
  SLA_ALERTA_DIAS_UTEIS,
  dataCivilSaoPaulo,
  diasUteisRestantes,
  idadeDiasUteis,
  slaAte as calcularSlaAte,
  type EfeitoTela,
  type OrigemCaso,
  type ResolucaoCaso,
  type StatusCaso,
  type TipoEventoCaso,
} from '@/services/analiseAtivos/curadoria/contrato';
import type {
  BlocoReporte,
  CampoReporte,
  CasoDetalheResposta,
  CasoListaItem,
  CasosListaQuery,
  CasosListaResposta,
  TipoCaso,
} from '@/types/analiseAtivosCuradoria';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

// ===========================================================================
// Filtros
// ===========================================================================

/** Atalhos da tela (contadores e abas). Acrescentados ao CasosListaQuery do contrato. */
export const FILAS = [
  'principal',
  'pendentes',
  'em_analise',
  'vencendo',
  'vencidos',
  'so_regra',
  'revisao',
  'fechados',
] as const;
export type FilaCuradoria = (typeof FILAS)[number];

export type CasosListaFiltro = CasosListaQuery & { fila?: FilaCuradoria };

export interface ContagensFila {
  aberto: number;
  em_analise: number;
  venceHoje: number;
  vencido: number;
  vencendo: number;
  soRegra: number;
  revisao: number;
}

/** Resposta da lista: o contrato + os contadores extras da tela. */
export type CasosListaRespostaFila = Omit<CasosListaResposta, 'contagens'> & {
  contagens: ContagensFila;
};

export const LIMITE_LISTA_PADRAO = 50;

const CODIGOS_REVISAO = Object.keys(REGRAS_REVISAO);
const ABERTOS: StatusCaso[] = ['aberto', 'em_analise'];
const FECHADOS: StatusCaso[] = ['corrigido', 'rejeitado'];

/** Caso de revisão = aberto por uma regra rev: (sem efeito na tela). */
export function tipoDoCaso(regraCodigo: string | null): TipoCaso {
  return regraCodigo && CODIGOS_REVISAO.includes(regraCodigo) ? 'revisao' : 'bloqueante';
}

const WHERE_REVISAO: Prisma.AnaliseCasoDadoWhereInput = { regraCodigo: { in: CODIGOS_REVISAO } };
const WHERE_NAO_REVISAO: Prisma.AnaliseCasoDadoWhereInput = {
  OR: [{ regraCodigo: null }, { regraCodigo: { notIn: CODIGOS_REVISAO } }],
};

/** Data civil 'AAAA-MM-DD' → Date (meia-noite UTC), o formato das colunas @db.Date. */
export function dataParaDb(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

function dataDeDb(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Limite do "vencendo": o prazo que fica a exatamente 2 dias úteis de hoje. */
export function limiteVencendo(hoje: string): string {
  return calcularSlaAte(hoje, SLA_ALERTA_DIAS_UTEIS);
}

function whereFila(fila: FilaCuradoria, hoje: string): Prisma.AnaliseCasoDadoWhereInput {
  const abertos: Prisma.AnaliseCasoDadoWhereInput = { status: { in: ABERTOS } };
  const hojeDb = dataParaDb(hoje);
  switch (fila) {
    case 'pendentes':
      return { AND: [abertos, WHERE_NAO_REVISAO, { origem: { in: ['usuario', 'misto'] } }] };
    case 'em_analise':
      return { AND: [{ status: 'em_analise' }, WHERE_NAO_REVISAO] };
    case 'vencendo':
      return {
        AND: [
          abertos,
          WHERE_NAO_REVISAO,
          { slaAte: { gte: hojeDb, lte: dataParaDb(limiteVencendo(hoje)) } },
        ],
      };
    case 'vencidos':
      return { AND: [abertos, WHERE_NAO_REVISAO, { slaAte: { lt: hojeDb } }] };
    case 'so_regra':
      return { AND: [abertos, WHERE_NAO_REVISAO, { origem: 'regra' }] };
    case 'revisao':
      return { AND: [abertos, WHERE_REVISAO] };
    case 'fechados':
      return { status: { in: FECHADOS } };
    case 'principal':
    default:
      return { AND: [abertos, WHERE_NAO_REVISAO] };
  }
}

/** WHERE completo: atalho da tela (padrão 'principal', a não ser que venha `status`) + filtros. */
export function montarWhere(
  f: CasosListaFiltro,
  ctx: { hoje: string; adminId: string },
): Prisma.AnaliseCasoDadoWhereInput {
  const e: Prisma.AnaliseCasoDadoWhereInput[] = [];
  if (f.fila) e.push(whereFila(f.fila, ctx.hoje));
  else if (!f.status) e.push(whereFila('principal', ctx.hoje));
  if (f.status) e.push({ status: f.status });
  if (f.origem) e.push({ origem: f.origem });
  if (f.tipo) e.push(f.tipo === 'revisao' ? WHERE_REVISAO : WHERE_NAO_REVISAO);
  if (f.classe) e.push({ classe: f.classe });
  if (f.grupo) e.push({ grupo: f.grupo });
  if (f.q) e.push({ symbol: { contains: f.q.trim().toUpperCase() } });
  if (f.prazo === 'vence_hoje') e.push({ slaAte: dataParaDb(ctx.hoje) });
  if (f.prazo === 'vencido') e.push({ slaAte: { lt: dataParaDb(ctx.hoje) } });
  if (f.responsavel === 'eu') e.push({ responsavelId: ctx.adminId });
  if (f.responsavel === 'ninguem') e.push({ responsavelId: null });
  return e.length === 1 ? e[0] : { AND: e };
}

function ordemDa(fila: FilaCuradoria | undefined, status: StatusCaso | undefined) {
  const fechados = fila === 'fechados' || (status !== undefined && FECHADOS.includes(status));
  if (fechados) {
    return [
      { resolvidoEm: { sort: 'desc', nulls: 'last' } },
      { id: 'asc' },
    ] satisfies Prisma.AnaliseCasoDadoOrderByWithRelationInput[];
  }
  return [
    { slaAte: { sort: 'asc', nulls: 'last' } },
    { abertoEm: 'asc' },
    { id: 'asc' },
  ] satisfies Prisma.AnaliseCasoDadoOrderByWithRelationInput[];
}

// ===========================================================================
// Mapeamento
// ===========================================================================

const SELECT_ITEM = {
  id: true,
  symbol: true,
  classe: true,
  grupo: true,
  campo: true,
  periodo: true,
  origem: true,
  regraCodigo: true,
  regraAtiva: true,
  status: true,
  emConferencia: true,
  conferenciaManual: true,
  nReportes: true,
  slaAte: true,
  abertoEm: true,
  updatedAt: true,
  responsavel: { select: { id: true, name: true } },
} satisfies Prisma.AnaliseCasoDadoSelect;

type LinhaItem = Prisma.AnaliseCasoDadoGetPayload<{ select: typeof SELECT_ITEM }>;

export function paraItemLista(c: LinhaItem, hoje: string): CasoListaItem {
  const slaAte = dataDeDb(c.slaAte);
  return {
    id: c.id,
    symbol: c.symbol,
    classe: c.classe as ClasseQuadro,
    grupo: c.grupo,
    campo: c.campo,
    periodo: c.periodo,
    origem: c.origem as OrigemCaso,
    regraCodigo: c.regraCodigo,
    regraAtiva: c.regraAtiva,
    status: c.status as StatusCaso,
    emConferencia: c.emConferencia,
    // decisão 16: reservado, sempre false nesta fase
    conferenciaManual: false,
    nReportes: c.nReportes,
    slaAte,
    diasUteisRestantes: slaAte ? diasUteisRestantes(slaAte, hoje) : null,
    idadeDiasUteis: idadeDiasUteis(c.abertoEm, hoje),
    responsavel: c.responsavel ? { id: c.responsavel.id, nome: c.responsavel.name } : null,
    abertoEm: c.abertoEm.toISOString(),
    atualizadoEm: c.updatedAt.toISOString(),
  };
}

// ===========================================================================
// Lista
// ===========================================================================

function decodificarCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number.parseInt(cursor, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function contarFila(prisma: PrismaClient, hoje: string): Promise<ContagensFila> {
  const contar = (fila: FilaCuradoria) =>
    prisma.analiseCasoDado.count({ where: whereFila(fila, hoje) });
  const [aberto, emAnalise, venceHoje, vencido, vencendo, soRegra, revisao] = await Promise.all([
    contar('pendentes'),
    contar('em_analise'),
    prisma.analiseCasoDado.count({
      where: {
        AND: [{ status: { in: ABERTOS } }, WHERE_NAO_REVISAO, { slaAte: dataParaDb(hoje) }],
      },
    }),
    contar('vencidos'),
    contar('vencendo'),
    contar('so_regra'),
    contar('revisao'),
  ]);
  return {
    aberto,
    em_analise: emAnalise,
    venceHoje,
    vencido,
    vencendo,
    soRegra,
    revisao,
  };
}

export async function listarCasos(
  prisma: PrismaClient,
  filtro: CasosListaFiltro,
  ctx: { adminId: string; agora?: Date },
): Promise<CasosListaRespostaFila> {
  const hoje = dataCivilSaoPaulo(ctx.agora ?? new Date());
  const limite = Math.min(Math.max(filtro.limite ?? LIMITE_LISTA_PADRAO, 1), 50);
  const pular = decodificarCursor(filtro.cursor);
  const [linhas, contagens] = await Promise.all([
    prisma.analiseCasoDado.findMany({
      where: montarWhere(filtro, { hoje, adminId: ctx.adminId }),
      orderBy: ordemDa(filtro.fila, filtro.status),
      skip: pular,
      take: limite + 1,
      select: SELECT_ITEM,
    }),
    contarFila(prisma, hoje),
  ]);
  const temMais = linhas.length > limite;
  return {
    itens: linhas.slice(0, limite).map((l) => paraItemLista(l, hoje)),
    contagens,
    proximoCursor: temMais ? String(pular + limite) : null,
  };
}

/** Prazos para o resumo diário (só casos com usuário: os de regra e de revisão não têm prazo). */
export async function contarPrazos(
  prisma: PrismaClient,
  hoje: string,
): Promise<{ vencidos: number; vencendo: number }> {
  const [vencidos, vencendo] = await Promise.all([
    prisma.analiseCasoDado.count({ where: whereFila('vencidos', hoje) }),
    prisma.analiseCasoDado.count({ where: whereFila('vencendo', hoje) }),
  ]);
  return { vencidos, vencendo };
}

// ===========================================================================
// Card do /admin (overview)
// ===========================================================================

export interface ResumoCuradoriaAdmin {
  /** com usuário esperando (sem 'rev') */
  abertos: number;
  /** prazo de hoje até 2 dias úteis */
  vencendo: number;
  vencidos: number;
  /** casos abertos com regra bloqueante ativa (conf:) */
  emConferencia: number;
}

export async function resumoCuradoriaAdmin(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<ResumoCuradoriaAdmin> {
  const hoje = dataCivilSaoPaulo(agora);
  const [abertos, vencendo, vencidos, emConferencia] = await Promise.all([
    prisma.analiseCasoDado.count({ where: whereFila('pendentes', hoje) }),
    prisma.analiseCasoDado.count({ where: whereFila('vencendo', hoje) }),
    prisma.analiseCasoDado.count({ where: whereFila('vencidos', hoje) }),
    prisma.analiseCasoDado.count({
      where: { AND: [{ status: { in: ABERTOS } }, WHERE_NAO_REVISAO, { emConferencia: true }] },
    }),
  ]);
  return { abertos, vencendo, vencidos, emConferencia };
}

// ===========================================================================
// Detalhe
// ===========================================================================

const SELECT_DETALHE = {
  ...SELECT_ITEM,
  cnpj: true,
  chaveDeteccao: true,
  resolucao: true,
  efeitoTela: true,
  respostaPublica: true,
  notaCurador: true,
  resolvidoEm: true,
  casoAnteriorId: true,
  contexto: true,
  ultimaDeteccaoEm: true,
  reportes: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      protocolo: true,
      userId: true,
      user: { select: { id: true, name: true, email: true } },
      cliente: { select: { id: true, name: true } },
      bloco: true,
      campo: true,
      periodo: true,
      valorExibido: true,
      valorEsperado: true,
      fonteExibida: true,
      frescorExibido: true,
      versaoQuadro: true,
      mensagem: true,
      fonteEsperada: true,
      contextoServidor: true,
      anonimizadoEm: true,
      createdAt: true,
    },
  },
  eventos: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tipo: true,
      autorId: true,
      de: true,
      para: true,
      texto: true,
      createdAt: true,
    },
  },
} satisfies Prisma.AnaliseCasoDadoSelect;

/** Campos de AnaliseQuadroLinha que vão para o "Linha atual" do detalhe. */
const SELECT_LINHA = {
  dataRef: true,
  geradoEm: true,
  paramsVersion: true,
  estadoIndice: true,
  noQuadro: true,
  preco: true,
  precoData: true,
  valorMercado: true,
  indiceMf: true,
  pl: true,
  pvp: true,
  dy12mPct: true,
  payoutPct: true,
  roePct: true,
  margemLiquidaPct: true,
  divLiqEbitda: true,
  divLiqPl: true,
  obrigacoesPlPct: true,
  vacanciaFisicaCvmPct: true,
  cotistas: true,
  patrimonio: true,
  motivosIncompleto: true,
  flags: true,
} satisfies Prisma.AnaliseQuadroLinhaSelect;

function serializar(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return v;
}

function soDigitos(s: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Fontes oficiais para o curador conferir (links externos, abertos em nova aba). */
export function fontesOficiais(classe: string, cnpj: string | null, symbol: string) {
  const fontes: Array<{ rotulo: string; url: string }> = [];
  if (classe === 'fii') {
    const d = soDigitos(cnpj);
    if (d.length === 14) {
      fontes.push({
        rotulo: 'Documentos do fundo (Fundos.NET)',
        url: `https://fnet.bmfbovespa.com.br/fnet/publico/abrirGerenciadorDocumentosCVM?cnpjFundo=${d}`,
      });
    }
    fontes.push({
      rotulo: 'Dados abertos da CVM (FII)',
      url: 'https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal',
    });
  } else {
    fontes.push({
      rotulo: 'Documentos da companhia (CVM RAD)',
      url: 'https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx',
    });
    fontes.push({
      rotulo: 'Dados abertos da CVM (DFP/ITR)',
      url: 'https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp',
    });
  }
  fontes.push({
    rotulo: `Página da B3 (${symbol})`,
    url: `https://www.b3.com.br/pt_br/market-data-e-indices/servicos-de-dados/market-data/cotacoes/?ticker=${encodeURIComponent(symbol)}`,
  });
  return fontes;
}

function contextoComoObjeto(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export async function detalharCaso(
  prisma: PrismaClient,
  id: string,
  agora: Date = new Date(),
): Promise<CasoDetalheResposta | null> {
  const hoje = dataCivilSaoPaulo(agora);
  const c = await prisma.analiseCasoDado.findUnique({ where: { id }, select: SELECT_DETALHE });
  if (!c) return null;

  const autorIds = [...new Set(c.eventos.map((e) => e.autorId).filter((x): x is string => !!x))];
  const [autores, linha] = await Promise.all([
    autorIds.length
      ? prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    prisma.analiseQuadroLinha.findUnique({ where: { symbol: c.symbol }, select: SELECT_LINHA }),
  ]);
  const nomePorId = new Map(autores.map((a) => [a.id, a.name]));
  const contexto = contextoComoObjeto(c.contexto);
  const primeiro = c.reportes[0] ?? null;

  const linhaAtual = linha
    ? Object.fromEntries(Object.entries(linha).map(([k, v]) => [k, serializar(v)]))
    : null;

  return {
    caso: {
      ...paraItemLista(c, hoje),
      cnpj: c.cnpj,
      resolucao: (c.resolucao as ResolucaoCaso | null) ?? null,
      efeitoTela: (c.efeitoTela as EfeitoTela | null) ?? null,
      respostaPublica: c.respostaPublica,
      notaCurador: c.notaCurador,
      resolvidoEm: c.resolvidoEm ? c.resolvidoEm.toISOString() : null,
      casoAnteriorId: c.casoAnteriorId,
    },
    oQueUsuarioViu: primeiro
      ? {
          bloco: primeiro.bloco as BlocoReporte,
          campo: primeiro.campo as CampoReporte,
          valorExibido: primeiro.valorExibido,
          periodo: primeiro.periodo,
          fonteExibida: primeiro.fonteExibida,
          frescorExibido: primeiro.frescorExibido,
        }
      : null,
    regra: c.regraCodigo
      ? {
          codigo: c.regraCodigo,
          chave: c.chaveDeteccao,
          ativa: c.regraAtiva,
          desde: typeof contexto.regraDesde === 'string' ? contexto.regraDesde : null,
        }
      : null,
    reportes: c.reportes.map((r) => ({
      id: r.id,
      protocolo: r.protocolo,
      autor: { id: r.user.id, nome: r.user.name, email: r.user.email },
      cliente: r.cliente ? { id: r.cliente.id, nome: r.cliente.name } : null,
      bloco: r.bloco as BlocoReporte,
      campo: r.campo as CampoReporte,
      periodo: r.periodo,
      valorExibido: r.valorExibido,
      valorEsperado: r.valorEsperado,
      fonteExibida: r.fonteExibida,
      frescorExibido: r.frescorExibido,
      versaoQuadro: r.versaoQuadro,
      mensagem: r.mensagem,
      fonteEsperada: r.fonteEsperada,
      contextoServidor: contextoComoObjeto(r.contextoServidor),
      criadoEm: r.createdAt.toISOString(),
      anonimizado: r.anonimizadoEm !== null,
    })),
    linhaAtual,
    fontes: fontesOficiais(c.classe, c.cnpj, c.symbol),
    eventos: c.eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo as TipoEventoCaso,
      autor: e.autorId ? { id: e.autorId, nome: nomePorId.get(e.autorId) ?? '—' } : null,
      de: e.de,
      para: e.para,
      texto: e.texto,
      criadoEm: e.createdAt.toISOString(),
    })),
  };
}
