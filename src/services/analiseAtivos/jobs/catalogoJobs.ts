/**
 * Catálogo dos jobs da Análise de Ativos para o runner de linha de comando
 * (scripts/analise-ativos/rodar-job.ts): nome em AnaliseJobRun, função, prazo interno e se o job é
 * PESADO. Os prazos são os mesmos das rotas /api/cron/analise-ativos/<rota>.
 *
 * Job pesado = pico de RSS medido acima de ~250 MB num processo próprio (medições em
 * docs/analise-ativos/fase0/RUNBOOK.md §5). No Lightsail (1,9 GB compartilhados com o app e o
 * Postgres) ele roda em PROCESSO SEPARADO pela linha de cron (myfinance-job.sh): a memória volta ao
 * sistema quando o processo termina, o que não acontece dentro do next-server. A rota HTTP dele fica
 * só para disparo manual e recusa rodar com o RSS do servidor já alto (limiteRssRotaMb).
 */
import { sincronizarCvmCias } from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import { sincronizarB3Cadastro } from '@/services/analiseAtivos/b3/sincronizarB3Cadastro';
import { sincronizarCotahist } from '@/services/analiseAtivos/b3/sincronizarCotahist';
import { executarScores } from '@/services/analiseAtivos/calculo/executarScores';
import { sincronizarIpe } from '@/services/analiseAtivos/eventos/sincronizarIpe';
import { sincronizarFiiCadastro } from '@/services/analiseAtivos/fii/sincronizarFiiCadastro';
import { sincronizarFiiMensal } from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import { sincronizarFiiTrimestral } from '@/services/analiseAtivos/fii/sincronizarFiiTrimestral';
import { NOMES_JOBS } from '@/services/analiseAtivos/jobs/nomesJobs';
import { gerarQuadro } from '@/services/analiseAtivos/quadro/gerarQuadro';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export type NomeJobCron = (typeof NOMES_JOBS)[number];

export interface DefinicaoJob {
  nome: NomeJobCron;
  prazoMs: number;
  pesado: boolean;
  parametros?: Record<string, unknown>;
  executar: (ctx: JobContexto) => Promise<ResultadoJob>;
}

export const CATALOGO_JOBS: Record<NomeJobCron, DefinicaoJob> = {
  'b3-cadastro': {
    nome: 'b3-cadastro',
    prazoMs: 60_000,
    pesado: false,
    executar: (ctx) => sincronizarB3Cadastro(ctx),
  },
  'fii-cadastro': {
    nome: 'fii-cadastro',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => sincronizarFiiCadastro(ctx),
  },
  'cvm-cias:fca': {
    nome: 'cvm-cias:fca',
    prazoMs: 60_000,
    pesado: false,
    parametros: { doc: 'fca' },
    executar: (ctx) => sincronizarCvmCias(ctx, { doc: 'fca' }),
  },
  'cvm-cias:dfp': {
    nome: 'cvm-cias:dfp',
    prazoMs: 240_000,
    pesado: false,
    parametros: { doc: 'dfp' },
    executar: (ctx) => sincronizarCvmCias(ctx, { doc: 'dfp' }),
  },
  'cvm-cias:itr': {
    nome: 'cvm-cias:itr',
    prazoMs: 240_000,
    pesado: false,
    parametros: { doc: 'itr' },
    executar: (ctx) => sincronizarCvmCias(ctx, { doc: 'itr' }),
  },
  'cvm-ipe': {
    nome: 'cvm-ipe',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => sincronizarIpe(ctx),
  },
  'fii-mensal': {
    nome: 'fii-mensal',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => sincronizarFiiMensal(ctx),
  },
  'fii-trimestral': {
    nome: 'fii-trimestral',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => sincronizarFiiTrimestral(ctx),
  },
  cotahist: {
    nome: 'cotahist',
    prazoMs: 180_000,
    pesado: false,
    executar: (ctx) => sincronizarCotahist(ctx),
  },
  scores: {
    nome: 'scores',
    prazoMs: 240_000,
    pesado: true,
    executar: (ctx) => executarScores(ctx),
  },
  // Fase 1: materializa analise_quadro_linhas depois do scores (medido < 30 s, < 250 MB)
  quadro: {
    nome: 'quadro',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => gerarQuadro(ctx),
  },
};

export function definicaoJob(nome: string): DefinicaoJob {
  const def = (CATALOGO_JOBS as Record<string, DefinicaoJob | undefined>)[nome];
  if (!def) {
    throw new Error(`job desconhecido: ${nome} (válidos: ${NOMES_JOBS.join(', ')})`);
  }
  return def;
}

/** RSS máximo do next-server para uma rota de job pesado aceitar rodar (padrão 400 MB). */
export function limiteRssRotaMb(): number {
  const v = Number(process.env.ANALISE_ATIVOS_ROTA_RSS_MAX_MB);
  return Number.isFinite(v) && v > 0 ? v : 400;
}

/**
 * Rota HTTP de job pesado: null = pode rodar no processo do app; string = motivo da recusa (o
 * RSS do servidor já está alto — rodar pelo runner em processo separado).
 */
export function recusaRotaPesada(
  def: Pick<DefinicaoJob, 'nome' | 'pesado'>,
  rssAtualMb: number = Math.round(process.memoryUsage().rss / 1024 / 1024),
  limiteMb: number = limiteRssRotaMb(),
): string | null {
  if (!def.pesado || rssAtualMb <= limiteMb) return null;
  return (
    `job ${def.nome} é pesado e o servidor já está com ${rssAtualMb} MB de RSS (limite ` +
    `${limiteMb} MB): rodar em processo separado (scripts/analise-ativos/rodar-job.ts ${def.nome})`
  );
}
