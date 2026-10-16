/**
 * Job 'alertas-salvos' (bloco 1, fatia D) — 11:10 UTC (08:10 BRT, "por volta das 8h"), depois de
 * cvm-ipe, fii-trimestral, criterios, quadro e curadoria. SÓ BANCO: nenhum terceiro é chamado.
 * Desenho: docs/analise-ativos/bloco1-salvos/desenho.json → arquitetura.alertas.
 *
 * 1) Flag ANALISE_ATIVOS_ALERTAS_HABILITADO (que exige SALVOS) ou a área desligada → 'pulado'.
 * 2) Marcos de TODO o Quadro (criteria_eval janela 5 e fii_quarterly) → detectarCriterios e
 *    detectarFiiTrimestral → fatos + marcos novos (globais, sem dado pessoal).
 * 3) Itens das listas com algum aviso ligado → usuário → ativo → tipos (união entre listas); quem
 *    não tem acesso à área (mesma regra de podeAcessarAnaliseAtivos, em lote) é pulado.
 * 4) Lê em lote: AssetEvento (resultado), AssetDividendHistory (provento) e Portfolio (posições:
 *    provento de ativo da carteira fica com a Agenda).
 * 5) Por usuário: um aviso por fato (mesmo ativo em 2 listas = 1; mesma companhia = 1), sem as
 *    chaves já enviadas; mais de MAX_AVISOS_POR_RODADA ⇒ 1 resumo e todos os envios registrados.
 *    Critérios: só se a mudança é posterior ao item mais antigo com o aviso ligado.
 * 6) Notification (ids gerados aqui) + analise_alerta_envios numa transação por lote de usuários,
 *    createMany({skipDuplicates:true}) — o insert nunca quebra por unique. As promessas de push são
 *    juntadas e esperadas (allSettled) no fim: o processo CLI termina logo depois.
 * 7) Upsert dos marcos (não roda em parcial: os fatos voltam na próxima rodada e o envio dedupe).
 * 8) Retenção de 90 dias (igual ao lgpd-retention, por redundância).
 * ctx.aplicar=false (--sem-aplicar) só calcula e relata. ctx.estourouPrazo() → parcial.
 */
import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { analiseAtivosAcesso, analiseAtivosHabilitada } from '@/lib/analiseAtivosConfig';
import { flagsRecursosBlocoD, RECURSO_BETA } from '@/services/analiseAtivos/acesso/acessoAnalise';
import { apagarAvisosVencidos } from '@/services/analiseAtivos/alertas/avisosDoUsuario';
import {
  textoAvisoCriterios,
  textoAvisoFiiTrimestral,
  textoAvisoProvento,
  textoAvisoResultado,
  textoAvisoResumo,
  juntarTickers,
  type TextoAviso,
} from '@/services/analiseAtivos/alertas/textosDoAviso';
import {
  detectarCriterios,
  detectarFiiTrimestral,
  detectarProventos,
  detectarResultados,
  JANELA_ENTREGA_DIAS,
  JANELA_NOVIDADE_DIAS,
  lerMarcoCriterios,
  lerMarcoFiiTrimestral,
  type FatoCriterios,
  type FatoFiiTrimestral,
  type FatoProvento,
  type FatoResultado,
  type MarcoCriterios,
  type MarcoFiiTrimestral,
  type MarcoNovo,
  type RelogioAlertas,
} from '@/services/analiseAtivos/regras/alertas/detectores';
import { deData, paraData } from '@/services/analiseAtivos/repositorio/conversao';
import { paraProventoBruto } from '@/services/analiseAtivos/repositorio/proventos';
import {
  ANALISE_SALVOS_ALERTA_TYPE,
  JANELA_AVISO_CRITERIOS,
  MARCO_CRITERIOS,
  MARCO_FII_TRIMESTRAL,
  MAX_AVISOS_POR_RODADA,
  ROTAS_SALVOS,
} from '@/services/analiseAtivos/salvos/contrato';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import type { NotificacaoCriada } from '@/services/push/enviarPush';
import type { ClasseItemSalvo, MetadataAvisoSalvos, TipoAviso } from '@/types/analiseAtivosSalvos';

const DIA_MS = 86_400_000;
/** Usuários por transação de escrita. */
export const LOTE_USUARIOS = 200;
/** Pushes em paralelo (cada um lê as assinaturas e a preferência do usuário). */
export const PUSH_CONCORRENCIA = 8;
/** Marcos por transação de upsert. */
const LOTE_MARCOS = 200;

export interface RelatorioAlertasSalvos {
  /** usuários com acesso e algum ativo com aviso ligado */
  usuarios: number;
  /** fatos globais detectados nesta rodada (antes de cruzar com as listas) */
  fatos: number;
  /** avisos individuais (Notification) criados */
  avisos: number;
  /** resumos criados ou atualizados */
  resumos: number;
  /** usuários pulados (sem acesso à área) */
  pulados: number;
  erros: number;
  marcos: number;
  removidosRetencao: number;
  push: { enviados: number; falhas: number };
}

export interface DependenciasAlertas {
  enviarPush: (n: NotificacaoCriada) => Promise<void>;
  agora: () => Date;
  novoId: () => string;
}

async function enviarPushPadrao(n: NotificacaoCriada): Promise<void> {
  // import dinâmico: o serviço de push carrega o contrato (que importa serviços de outras áreas)
  const { enviarPushDaNotificacao } = await import('@/services/push/enviarPush');
  await enviarPushDaNotificacao(n);
}

export const DEPENDENCIAS_ALERTAS: DependenciasAlertas = {
  enviarPush: enviarPushPadrao,
  agora: () => new Date(),
  novoId: () => randomUUID(),
};

// ===========================================================================
// Núcleo puro: candidatos de um usuário
// ===========================================================================

export interface AtivoDoUsuario {
  classe: ClasseItemSalvo;
  resultado: boolean;
  provento: boolean;
  criterios: boolean;
  /** createdAt mais antigo dos itens com o aviso de critérios ligado (ISO) */
  criteriosDesde: string | null;
}

export interface FatosDaRodada {
  resultados: FatoResultado[];
  fiiTrimestrais: FatoFiiTrimestral[];
  proventos: FatoProvento[];
  criterios: FatoCriterios[];
}

export interface Candidato extends TextoAviso {
  tipo: Exclude<TipoAviso, 'resumo'>;
  chave: string;
  /** 'PETR3/PETR4' no aviso por companhia */
  symbol: string;
  /** ticker do link (o 1º em ordem alfabética) */
  ticker: string;
  classe: ClasseItemSalvo;
}

/**
 * Os avisos que um usuário receberia nesta rodada (antes de tirar os já enviados), em ordem
 * estável. `posicoes` = símbolos com quantidade > 0 na Carteira do usuário.
 */
export function candidatosDoUsuario(
  ativos: ReadonlyMap<string, AtivoDoUsuario>,
  posicoes: ReadonlySet<string>,
  fatos: FatosDaRodada,
): Candidato[] {
  const out: Candidato[] = [];
  const companhia = (
    fato: FatoResultado | FatoFiiTrimestral,
    textos: (tickers: string[]) => TextoAviso,
  ) => {
    const tickers = fato.tickers.filter((t) => ativos.get(t)?.resultado);
    if (tickers.length === 0) return;
    const ordenados = [...tickers].sort();
    out.push({
      tipo: 'resultado',
      chave: fato.chave,
      symbol: juntarTickers(ordenados),
      ticker: ordenados[0],
      classe:
        ativos.get(ordenados[0])?.classe ?? (fato.origem === 'fii_trimestral' ? 'fii' : 'acao'),
      ...textos(ordenados),
    });
  };
  for (const f of fatos.resultados) companhia(f, (ts) => textoAvisoResultado(ts, f));
  for (const f of fatos.fiiTrimestrais) companhia(f, (ts) => textoAvisoFiiTrimestral(ts, f));
  for (const f of fatos.proventos) {
    const a = ativos.get(f.symbol);
    if (!a?.provento || posicoes.has(f.symbol)) continue;
    out.push({
      tipo: 'provento',
      chave: f.chave,
      symbol: f.symbol,
      ticker: f.symbol,
      classe: a.classe,
      ...textoAvisoProvento(f, a.classe),
    });
  }
  for (const f of fatos.criterios) {
    const a = ativos.get(f.symbol);
    if (!a?.criterios || !a.criteriosDesde) continue;
    // mudança anterior ao item (tirou e salvou de novo) não avisa
    if (Date.parse(f.mudouEm) <= Date.parse(a.criteriosDesde)) continue;
    out.push({
      tipo: 'criterios',
      chave: f.chave,
      symbol: f.symbol,
      ticker: f.symbol,
      classe: a.classe,
      ...textoAvisoCriterios(f),
    });
  }
  return out;
}

const hrefAtivo = (ticker: string) => `/analise-ativos/${encodeURIComponent(ticker)}`;
const chaveResumo = (hoje: string) => `resumo:${hoje}`;
const chaveEnvio = (userId: string, tipo: string, chave: string) => `${userId}|${tipo}|${chave}`;

// ===========================================================================
// Leituras
// ===========================================================================

/** Mesma regra de acessoAnalise.estadoAcessoAnalise, em lote (uma query para N usuários). */
export async function usuariosComAcesso(
  prisma: PrismaClient,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (!analiseAtivosHabilitada() || userIds.length === 0) return new Set();
  if (analiseAtivosAcesso() === 'todos') return new Set(userIds);
  const users = await prisma.user.findMany({
    where: {
      id: { in: [...userIds] },
      OR: [{ role: 'admin' }, { featureBetas: { some: { recurso: RECURSO_BETA } } }],
    },
    select: { id: true },
  });
  return new Set(users.map((u) => u.id));
}

interface ItemComAviso {
  userId: string;
  symbol: string;
  classe: string;
  createdAt: Date;
  lista: { alertaResultado: boolean; alertaProvento: boolean; alertaCriterios: boolean };
}

/** usuário → ativo → avisos (união entre as listas). Classes fora de acao|fii ficam de fora. */
export function agruparItens(
  itens: readonly ItemComAviso[],
): Map<string, Map<string, AtivoDoUsuario>> {
  const out = new Map<string, Map<string, AtivoDoUsuario>>();
  for (const it of itens) {
    if (it.classe !== 'acao' && it.classe !== 'fii') continue;
    const symbol = it.symbol.toUpperCase();
    const doUsuario = out.get(it.userId) ?? new Map<string, AtivoDoUsuario>();
    const a = doUsuario.get(symbol) ?? {
      classe: it.classe,
      resultado: false,
      provento: false,
      criterios: false,
      criteriosDesde: null,
    };
    a.resultado ||= it.lista.alertaResultado;
    a.provento ||= it.lista.alertaProvento;
    if (it.lista.alertaCriterios) {
      a.criterios = true;
      const iso = it.createdAt.toISOString();
      if (!a.criteriosDesde || iso < a.criteriosDesde) a.criteriosDesde = iso;
    }
    doUsuario.set(symbol, a);
    out.set(it.userId, doUsuario);
  }
  return out;
}

// ===========================================================================
// Job
// ===========================================================================

async function emPool<T>(itens: readonly T[], n: number, fn: (t: T) => Promise<void>) {
  const resultados: PromiseSettledResult<void>[] = [];
  let i = 0;
  const trabalhador = async () => {
    while (i < itens.length) {
      const atual = itens[i++];
      const [r] = await Promise.allSettled([fn(atual)]);
      resultados.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  return resultados;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function executarAlertasSalvos(
  ctx: JobContexto,
  deps: DependenciasAlertas = DEPENDENCIAS_ALERTAS,
): Promise<ResultadoJob> {
  if (!analiseAtivosHabilitada() || !flagsRecursosBlocoD().alertas) {
    return {
      pulado:
        'avisos das listas desligados (ANALISE_ATIVOS_ALERTAS_HABILITADO + ANALISE_ATIVOS_SALVOS_HABILITADO)',
    };
  }
  const { prisma } = ctx;
  const agora = deps.agora();
  const agoraIso = agora.toISOString();
  const relogio: RelogioAlertas = { hoje: ctx.hoje, agoraMs: agora.getTime() };
  const desdeNovidade = new Date(agora.getTime() - JANELA_NOVIDADE_DIAS * DIA_MS);
  const rel: RelatorioAlertasSalvos = {
    usuarios: 0,
    fatos: 0,
    avisos: 0,
    resumos: 0,
    pulados: 0,
    erros: 0,
    marcos: 0,
    removidosRetencao: 0,
    push: { enviados: 0, falhas: 0 },
  };

  // --- 2) Quadro + marcos (globais) ---
  const linhas = await prisma.analiseQuadroLinha.findMany({
    select: { symbol: true, classe: true, cnpj: true },
  });
  ctx.contar('linhasLidas', linhas.length);
  const classeDo = new Map<string, ClasseItemSalvo>();
  const tickersPorCnpj = { acao: new Map<string, string[]>(), fii: new Map<string, string[]>() };
  for (const l of linhas) {
    if (l.classe !== 'acao' && l.classe !== 'fii') continue;
    const symbol = l.symbol.toUpperCase();
    classeDo.set(symbol, l.classe);
    const m = tickersPorCnpj[l.classe];
    m.set(l.cnpj, [...(m.get(l.cnpj) ?? []), symbol]);
  }
  const symbolsQuadro = [...classeDo.keys()];
  const cnpjsFii = [...tickersPorCnpj.fii.keys()];

  const [marcosDb, avaliacoes, informes] = await Promise.all([
    prisma.analiseAlertaMarco.findMany({
      where: { tipo: { in: [MARCO_CRITERIOS, MARCO_FII_TRIMESTRAL] } },
      select: { symbol: true, tipo: true, marco: true },
    }),
    symbolsQuadro.length
      ? prisma.criteriaEval.findMany({
          where: { janela: JANELA_AVISO_CRITERIOS, symbol: { in: symbolsQuadro } },
          select: {
            symbol: true,
            atendidos: true,
            aplicaveis: true,
            anoInicio: true,
            anoFim: true,
            paramsVersion: true,
            semDado: true,
          },
        })
      : Promise.resolve([]),
    cnpjsFii.length
      ? prisma.fiiQuarterly.findMany({
          where: {
            cnpj: { in: cnpjsFii },
            refQuarter: { gte: deData(isoMenosDias(ctx.hoje, 400)) },
          },
          select: { cnpj: true, refQuarter: true, fetchedAt: true },
        })
      : Promise.resolve([]),
  ]);
  ctx.contar('linhasLidas', marcosDb.length + avaliacoes.length + informes.length);
  const marcosCriterios = new Map<string, MarcoCriterios>();
  const marcosFii = new Map<string, MarcoFiiTrimestral>();
  for (const m of marcosDb) {
    if (m.tipo === MARCO_CRITERIOS) {
      const lido = lerMarcoCriterios(m.marco);
      if (lido) marcosCriterios.set(m.symbol, lido);
    } else {
      const lido = lerMarcoFiiTrimestral(m.marco);
      if (lido) marcosFii.set(m.symbol, lido);
    }
  }
  const criterios = detectarCriterios(avaliacoes, marcosCriterios, agoraIso, MARCO_CRITERIOS);
  const fii = detectarFiiTrimestral(
    informes.flatMap((i) =>
      (tickersPorCnpj.fii.get(i.cnpj) ?? []).map((symbol) => ({
        symbol,
        cnpj: i.cnpj,
        refQuarter: paraData(i.refQuarter),
        fetchedAt: i.fetchedAt.toISOString(),
      })),
    ),
    marcosFii,
    MARCO_FII_TRIMESTRAL,
  );
  const marcosNovos: MarcoNovo<unknown>[] = [...criterios.marcosNovos, ...fii.marcosNovos];

  // --- 3) Itens com aviso ligado → usuários com acesso ---
  const itens = await prisma.analiseListaItem.findMany({
    where: {
      lista: {
        OR: [{ alertaResultado: true }, { alertaProvento: true }, { alertaCriterios: true }],
      },
    },
    select: {
      userId: true,
      symbol: true,
      classe: true,
      createdAt: true,
      lista: { select: { alertaResultado: true, alertaProvento: true, alertaCriterios: true } },
    },
  });
  ctx.contar('linhasLidas', itens.length);
  const porUsuarioTodos = agruparItens(itens);
  const comAcesso = await usuariosComAcesso(prisma, [...porUsuarioTodos.keys()]);
  const porUsuario = new Map([...porUsuarioTodos].filter(([u]) => comAcesso.has(u)));
  rel.pulados = porUsuarioTodos.size - porUsuario.size;
  rel.usuarios = porUsuario.size;

  // --- 4) Fatos que dependem dos ativos salvos ---
  const salvosResultado = new Set<string>();
  const salvosProvento = new Set<string>();
  for (const ativos of porUsuario.values()) {
    for (const [s, a] of ativos) {
      if (a.resultado) salvosResultado.add(s);
      if (a.provento) salvosProvento.add(s);
    }
  }
  const cnpjsResultado = [...tickersPorCnpj.acao]
    .filter(([, ts]) => ts.some((t) => salvosResultado.has(t)))
    .map(([c]) => c);
  const [eventos, dividendos] = await Promise.all([
    cnpjsResultado.length
      ? prisma.assetEvento.findMany({
          where: {
            cnpj: { in: cnpjsResultado },
            tipo: 'resultado',
            estimado: false,
            fetchedAt: { gte: desdeNovidade },
            data: { gte: deData(isoMenosDias(ctx.hoje, JANELA_ENTREGA_DIAS)) },
          },
          select: {
            id: true,
            cnpj: true,
            tipo: true,
            periodoRef: true,
            data: true,
            estimado: true,
            fetchedAt: true,
          },
        })
      : Promise.resolve([]),
    salvosProvento.size
      ? prisma.assetDividendHistory.findMany({
          where: { symbol: { in: [...salvosProvento] }, createdAt: { gte: desdeNovidade } },
          select: {
            id: true,
            symbol: true,
            date: true,
            dataCom: true,
            tipo: true,
            valorUnitario: true,
            source: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);
  ctx.contar('linhasLidas', eventos.length + dividendos.length);
  const fatos: FatosDaRodada = {
    resultados: detectarResultados(
      eventos.map((e) => ({
        ...e,
        data: paraData(e.data),
        fetchedAt: e.fetchedAt.toISOString(),
      })),
      tickersPorCnpj.acao,
      relogio,
    ),
    fiiTrimestrais: fii.fatos,
    proventos: detectarProventos(
      dividendos.map((d) => ({
        ...paraProventoBruto(d, ctx.params),
        criadoEm: d.createdAt.toISOString(),
      })),
      relogio,
      ctx.params,
    ),
    criterios: criterios.fatos,
  };
  rel.fatos =
    fatos.resultados.length +
    fatos.fiiTrimestrais.length +
    fatos.proventos.length +
    fatos.criterios.length;

  // posições na Carteira (só dos ativos com provento novo)
  const symbolsProventoNovo = [...new Set(fatos.proventos.map((p) => p.symbol))];
  const posicoes = new Map<string, Set<string>>();
  if (symbolsProventoNovo.length && porUsuario.size) {
    const ps = await prisma.portfolio.findMany({
      where: {
        userId: { in: [...porUsuario.keys()] },
        quantity: { gt: 0 },
        asset: { symbol: { in: symbolsProventoNovo } },
      },
      select: { userId: true, asset: { select: { symbol: true } } },
    });
    ctx.contar('linhasLidas', ps.length);
    for (const p of ps) {
      const s = p.asset?.symbol?.toUpperCase();
      if (!s) continue;
      posicoes.set(p.userId, (posicoes.get(p.userId) ?? new Set()).add(s));
    }
  }

  // --- 5) Candidatos por usuário, sem os já enviados ---
  const candidatos = new Map<string, Candidato[]>();
  const todasChaves = new Set<string>([chaveResumo(ctx.hoje)]);
  for (const [userId, ativos] of [...porUsuario].sort(([a], [b]) => a.localeCompare(b))) {
    const cs = candidatosDoUsuario(ativos, posicoes.get(userId) ?? new Set(), fatos);
    if (cs.length === 0) continue;
    candidatos.set(userId, cs);
    for (const c of cs) todasChaves.add(c.chave);
  }
  const jaEnviados = new Map<string, string | null>();
  if (candidatos.size) {
    const envios = await prisma.analiseAlertaEnvio.findMany({
      where: { userId: { in: [...candidatos.keys()] }, chave: { in: [...todasChaves] } },
      select: { userId: true, tipo: true, chave: true, notificationId: true },
    });
    ctx.contar('linhasLidas', envios.length);
    for (const e of envios) jaEnviados.set(chaveEnvio(e.userId, e.tipo, e.chave), e.notificationId);
  }

  // --- 6) Escrita por lote de usuários ---
  const pushes: NotificacaoCriada[] = [];
  let parcial = false;
  const usuarios = [...candidatos.keys()];
  for (let i = 0; i < usuarios.length; i += LOTE_USUARIOS) {
    if (ctx.estourouPrazo()) {
      parcial = true;
      ctx.alertar({
        codigo: 'alertas_salvos_prazo',
        nivel: 'aviso',
        mensagem: `prazo esgotado: ${usuarios.length - i} usuário(s) ficam para a próxima rodada`,
      });
      break;
    }
    const notificacoes: Prisma.NotificationCreateManyInput[] = [];
    const envios: Prisma.AnaliseAlertaEnvioCreateManyInput[] = [];
    const resumosAtualizados: Array<{ id: string; userId: string; total: number }> = [];
    const novasPush: NotificacaoCriada[] = [];
    let avisosLote = 0;
    let resumosLote = 0;
    for (const userId of usuarios.slice(i, i + LOTE_USUARIOS)) {
      const novos = (candidatos.get(userId) ?? []).filter(
        (c) => !jaEnviados.has(chaveEnvio(userId, c.tipo, c.chave)),
      );
      if (novos.length === 0) continue;
      const kResumo = chaveResumo(ctx.hoje);
      const resumoHoje = jaEnviados.get(chaveEnvio(userId, 'resumo', kResumo));
      if (resumoHoje !== undefined || novos.length > MAX_AVISOS_POR_RODADA) {
        // um aviso só: "Novidades em N ativos dos seus Salvos"
        const ativosNovos = new Set(novos.map((c) => c.symbol));
        let notificationId: string;
        if (resumoHoje) {
          notificationId = resumoHoje;
          resumosAtualizados.push({ id: resumoHoje, userId, total: ativosNovos.size });
        } else {
          notificationId = deps.novoId();
          const t = textoAvisoResumo(ativosNovos.size);
          const metadata: MetadataAvisoSalvos = {
            href: ROTAS_SALVOS.paginaAlertas,
            symbol: '*',
            tipo: 'resumo',
            classe: null,
            eventoId: kResumo,
          };
          notificacoes.push({
            id: notificationId,
            userId,
            type: ANALISE_SALVOS_ALERTA_TYPE,
            title: t.titulo,
            message: t.mensagem,
            metadata: json(metadata),
          });
          envios.push({ userId, tipo: 'resumo', symbol: '*', chave: kResumo, notificationId });
          novasPush.push({
            id: notificationId,
            userId,
            type: ANALISE_SALVOS_ALERTA_TYPE,
            title: t.titulo,
            metadata,
          });
        }
        resumosLote++;
        for (const c of novos) {
          envios.push({ userId, tipo: c.tipo, symbol: c.symbol, chave: c.chave, notificationId });
        }
        continue;
      }
      for (const c of novos) {
        const id = deps.novoId();
        const metadata: MetadataAvisoSalvos = {
          href: hrefAtivo(c.ticker),
          symbol: c.symbol,
          tipo: c.tipo,
          classe: c.classe,
          eventoId: c.chave,
        };
        notificacoes.push({
          id,
          userId,
          type: ANALISE_SALVOS_ALERTA_TYPE,
          title: c.titulo,
          message: c.mensagem,
          metadata: json(metadata),
        });
        envios.push({ userId, tipo: c.tipo, symbol: c.symbol, chave: c.chave, notificationId: id });
        novasPush.push({
          id,
          userId,
          type: ANALISE_SALVOS_ALERTA_TYPE,
          title: c.titulo,
          metadata,
        });
        avisosLote++;
      }
    }
    if (!ctx.aplicar) {
      rel.avisos += avisosLote;
      rel.resumos += resumosLote;
      continue;
    }
    if (notificacoes.length === 0 && envios.length === 0 && resumosAtualizados.length === 0) {
      continue;
    }
    try {
      const atualizacoes = await Promise.all(
        resumosAtualizados.map(async (r) => {
          const anteriores = await prisma.analiseAlertaEnvio.findMany({
            where: { userId: r.userId, notificationId: r.id, tipo: { not: 'resumo' } },
            select: { symbol: true },
          });
          return { ...r, total: r.total + new Set(anteriores.map((a) => a.symbol)).size };
        }),
      );
      await prisma.$transaction([
        prisma.notification.createMany({ data: notificacoes }),
        prisma.analiseAlertaEnvio.createMany({ data: envios, skipDuplicates: true }),
        ...atualizacoes.map((r) =>
          prisma.notification.updateMany({
            where: { id: r.id, userId: r.userId, type: ANALISE_SALVOS_ALERTA_TYPE },
            data: { title: textoAvisoResumo(r.total).titulo, readAt: null },
          }),
        ),
      ]);
      ctx.contar('linhasGravadas', notificacoes.length + envios.length + atualizacoes.length);
      rel.avisos += avisosLote;
      rel.resumos += resumosLote;
      pushes.push(...novasPush);
    } catch (e: unknown) {
      rel.erros++;
      ctx.contar('rejeitadas', notificacoes.length);
      ctx.alertar({
        codigo: 'alertas_salvos_escrita',
        nivel: 'erro',
        mensagem: `lote de usuários ${i}–${i + LOTE_USUARIOS - 1} não gravado: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    }
  }

  // --- 7) Marcos (parcial ou lote com erro: ficam para a próxima rodada, que reencontra os fatos
  // e tira os já enviados) ---
  const gravarMarcos = ctx.aplicar && !parcial && rel.erros === 0;
  if (gravarMarcos && marcosNovos.length) {
    for (let i = 0; i < marcosNovos.length; i += LOTE_MARCOS) {
      const lote = marcosNovos.slice(i, i + LOTE_MARCOS);
      await prisma.$transaction(
        lote.map((m) =>
          prisma.analiseAlertaMarco.upsert({
            where: { symbol_tipo: { symbol: m.symbol, tipo: m.tipo } },
            create: { symbol: m.symbol, tipo: m.tipo, marco: json(m.marco) },
            update: { marco: json(m.marco) },
          }),
        ),
      );
    }
    ctx.contar('linhasGravadas', marcosNovos.length);
  }
  rel.marcos = gravarMarcos ? marcosNovos.length : 0;

  // --- 8) Retenção de 90 dias ---
  if (ctx.aplicar) {
    const r = await apagarAvisosVencidos(prisma, agora);
    rel.removidosRetencao = r.envios + r.notificacoes;
  }

  // --- push: esperado antes de terminar (o processo CLI sai logo depois) ---
  const resultados = await emPool(pushes, PUSH_CONCORRENCIA, deps.enviarPush);
  rel.push.enviados = resultados.filter((r) => r.status === 'fulfilled').length;
  rel.push.falhas = resultados.length - rel.push.enviados;

  return { parcial, detalhes: { ...rel, aplicar: ctx.aplicar } };
}

function isoMenosDias(hoje: string, dias: number): string {
  return new Date(Date.parse(`${hoje}T00:00:00.000Z`) - dias * DIA_MS).toISOString().slice(0, 10);
}
