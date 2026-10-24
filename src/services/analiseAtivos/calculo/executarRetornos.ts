/**
 * Job 'retornos-cotacao' (A6, item 5; fatia C): variação acumulada da cotação por símbolo, só preço
 * (sem proventos), gravada em asset_retornos_cotacao (upsert por símbolo). Só banco: nenhum
 * provedor externo; não usa asset_price_history.
 *
 * 1. Trava de concorrência (a do 'criterios'): outro job pesado do catálogo — ou o quadro / os
 *    avisos dos Salvos, que rodam antes no mesmo horário — com run 'executando' mais novo que
 *    LOCK_TTL_PADRAO_MS ⇒ termina 'pulado' sem gravar.
 * 2. Universo = cadastro do Quadro: ações (CvmCompanyTicker vigente) e FIIs (FiiTickerMap vigente).
 * 3. Lotes de LOTE_RETORNOS símbolos: série de fechamento (date, closeRaw) desde
 *    inicioCargaRetornos(hoje) + eventos de asset_corporate_action_checks ⇒ função pura
 *    regras/calculo/retornosCotacao ⇒ upsert do lote. Estourou o prazo ⇒ 'parcial' (os lotes já
 *    gravados ficam; cada linha é independente).
 * Com ctx.aplicar = false (runner --sem-aplicar) calcula e relata sem gravar.
 *
 * Cron proposto: JOBS_COMPLEMENTOS['retornos-cotacao'] (11:40 UTC, terça a sábado, myfinance-job.sh).
 * O job NÃO depende de ANALISE_ATIVOS_RETORNOS_HABILITADO (a carga roda com a tela desligada).
 * Memória: pico medido no DEV no RUNBOOK da ativação (docs/…/fundamentei-trazer/ATIVACAO.md).
 */
import type { PrismaClient } from '@prisma/client';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { LOCK_TTL_PADRAO_MS } from '@/services/analiseAtivos/jobs/executarJob';
import {
  inicioCargaRetornos,
  retornosCotacao,
} from '@/services/analiseAtivos/regras/calculo/retornosCotacao';
import {
  gravarRetornos,
  lerEventosRetornos,
  lerProventosRetornos,
  lerSerieRetornos,
} from '@/services/analiseAtivos/repositorio/retornos';
import {
  listarFiisListados,
  listarTickersAcoes,
} from '@/services/analiseAtivos/repositorio/universo';
import type { JobContexto, NomeJob, ResultadoJob } from '@/services/analiseAtivos/tipos';
import type { ClasseBr } from '@/types/analiseAtivosApi';
import { LOTE_RETORNOS, type RetornosCalculados } from '@/types/analiseAtivosComplementos';

export const NOME_JOB_RETORNOS = 'retornos-cotacao' satisfies NomeJob;

/** Jobs leves que também bloqueiam (rodam antes no mesmo horário e leem/gravam muito). */
const JOBS_LEVES_NA_TRAVA: readonly NomeJob[] = ['quadro', 'alertas-salvos'];

export interface ItemUniversoRetornos {
  symbol: string;
  classe: ClasseBr;
}

export interface DependenciasRetornos {
  /** nome do job concorrente em execução (run 'executando' mais novo que `desde`), ou null */
  jobConcorrente: (prisma: PrismaClient, desde: Date) => Promise<string | null>;
  carregarUniverso: (prisma: PrismaClient) => Promise<ItemUniversoRetornos[]>;
  lerSerie: typeof lerSerieRetornos;
  lerEventos: typeof lerEventosRetornos;
  lerProventos: typeof lerProventosRetornos;
  gravar: typeof gravarRetornos;
}

/** Jobs que travam o retornos: os pesados do catálogo (menos ele) + quadro e alertas-salvos. */
export async function jobsDaTrava(): Promise<string[]> {
  // import tardio: o catálogo importa este módulo
  const { CATALOGO_JOBS } = await import('@/services/analiseAtivos/jobs/catalogoJobs');
  const pesados = Object.values(CATALOGO_JOBS)
    .filter((d) => d.pesado && d.nome !== NOME_JOB_RETORNOS)
    .map((d) => d.nome as string);
  return [...new Set([...pesados, ...JOBS_LEVES_NA_TRAVA])];
}

export async function jobConcorrenteEmExecucao(
  prisma: PrismaClient,
  desde: Date,
): Promise<string | null> {
  const aberto = await prisma.analiseJobRun.findFirst({
    where: { job: { in: await jobsDaTrava() }, status: 'executando', inicio: { gt: desde } },
    select: { job: true },
    orderBy: { inicio: 'desc' },
  });
  return aberto?.job ?? null;
}

/** Ações e FIIs do cadastro do Quadro (um símbolo aparece uma vez; ação tem prioridade). */
export async function carregarUniversoRetornos(
  prisma: PrismaClient,
): Promise<ItemUniversoRetornos[]> {
  const [acoes, fiis] = await Promise.all([listarTickersAcoes(prisma), listarFiisListados(prisma)]);
  const out = new Map<string, ItemUniversoRetornos>();
  for (const a of acoes) out.set(a.symbol, { symbol: a.symbol, classe: 'acao' });
  for (const f of fiis)
    if (!out.has(f.symbol)) out.set(f.symbol, { symbol: f.symbol, classe: 'fii' });
  return [...out.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export const DEPENDENCIAS_RETORNOS: DependenciasRetornos = {
  jobConcorrente: jobConcorrenteEmExecucao,
  carregarUniverso: carregarUniversoRetornos,
  lerSerie: lerSerieRetornos,
  lerEventos: lerEventosRetornos,
  lerProventos: lerProventosRetornos,
  gravar: gravarRetornos,
};

const mb = () => Math.round(process.memoryUsage().rss / 1024 / 1024);

export async function executarRetornos(
  ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
  deps: DependenciasRetornos = DEPENDENCIAS_RETORNOS,
): Promise<ResultadoJob> {
  const inicio = Date.now();

  // 1. trava de concorrência
  const concorrente = await deps.jobConcorrente(
    ctx.prisma,
    new Date(Date.now() - LOCK_TTL_PADRAO_MS),
  );
  if (concorrente) {
    const motivo = `job '${concorrente}' ainda em execução: retornos-cotacao pulado (fica a variação anterior)`;
    ctx.alertar({ codigo: 'retornos_job_concorrente', nivel: 'aviso', mensagem: motivo });
    return { pulado: motivo, detalhes: { pulado: 'job_concorrente', concorrente } };
  }

  // 2. universo
  const universo = await deps.carregarUniverso(ctx.prisma);
  const desde = inicioCargaRetornos(ctx.hoje);
  let calculados = 0;
  let gravados = 0;
  let semCotacao = 0;
  let rssPico = mb();
  const porFlag: Record<string, number> = {};
  const amostra: RetornosCalculados[] = [];

  // 3. lotes
  for (let i = 0; i < universo.length; i += LOTE_RETORNOS) {
    if (ctx.estourouPrazo()) {
      ctx.alertar({
        codigo: 'retornos_prazo',
        nivel: 'aviso',
        mensagem: `retornos-cotacao: prazo estourado em ${i} de ${universo.length} símbolos (lotes anteriores gravados)`,
      });
      return {
        parcial: true,
        detalhes: {
          universo: universo.length,
          processados: i,
          calculados,
          gravados,
          rssPicoMb: rssPico,
        },
      };
    }
    const lote = universo.slice(i, i + LOTE_RETORNOS);
    const symbols = lote.map((l) => l.symbol);
    const [series, eventos, proventos] = await Promise.all([
      deps.lerSerie(ctx.prisma, symbols, desde, ctx.hoje),
      deps.lerEventos(ctx.prisma, symbols),
      deps.lerProventos(ctx.prisma, symbols, desde, ctx.hoje),
    ]);
    ctx.contar('linhasLidas', lote.length);
    const linhas: RetornosCalculados[] = [];
    for (const item of lote) {
      const r = retornosCotacao({
        symbol: item.symbol,
        classe: item.classe,
        pregoes: series.get(item.symbol) ?? [],
        eventos: eventos.get(item.symbol) ?? [],
        proventos: proventos.get(item.symbol) ?? [],
        hoje: ctx.hoje,
      });
      if (!r) {
        semCotacao++;
        continue;
      }
      linhas.push(r);
      for (const f of r.flags) porFlag[f] = (porFlag[f] ?? 0) + 1;
      if (amostra.length < 3) amostra.push(r);
    }
    calculados += linhas.length;
    if (ctx.aplicar && linhas.length > 0) {
      const n = await deps.gravar(ctx.prisma, linhas);
      gravados += n;
      ctx.contar('linhasGravadas', n);
    }
    rssPico = Math.max(rssPico, mb());
  }

  return {
    detalhes: {
      universo: universo.length,
      calculados,
      gravados,
      semCotacao,
      desde,
      lote: LOTE_RETORNOS,
      porFlag,
      rssPicoMb: rssPico,
      duracaoMs: Date.now() - inicio,
      ...(ctx.aplicar ? {} : { dryRun: true, amostra }),
    },
  };
}
