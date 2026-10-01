/**
 * Nomes dos jobs da Análise de Ativos (AnaliseJobRun.job). Rotas: /api/cron/analise-ativos/<rota>.
 * Backfills (scripts) usam `backfill:<nome>`.
 */
import type { NomeJob } from '@/services/analiseAtivos/tipos';

export const NOMES_JOBS = [
  'b3-cadastro',
  'fii-cadastro',
  'cvm-cias:fca',
  'cvm-cias:dfp',
  'cvm-cias:itr',
  'cvm-ipe',
  'fii-mensal',
  'fii-trimestral',
  'cotahist',
  'scores',
] as const satisfies readonly NomeJob[];

export type DocCvmCias = 'fca' | 'dfp' | 'itr';

export function jobCvmCias(doc: DocCvmCias): NomeJob {
  return `cvm-cias:${doc}`;
}

export function nomeBackfill(nome: string): NomeJob {
  if (!/^[a-z0-9-]+$/.test(nome)) throw new Error(`Nome de backfill inválido: ${nome}`);
  return `backfill:${nome}`;
}

export function ehNomeJob(s: string): s is NomeJob {
  return (NOMES_JOBS as readonly string[]).includes(s) || /^backfill:[a-z0-9-]+$/.test(s);
}
