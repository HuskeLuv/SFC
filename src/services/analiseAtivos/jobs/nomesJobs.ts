/**
 * Nomes dos jobs da Análise de Ativos (AnaliseJobRun.job). Rotas: /api/cron/analise-ativos/<rota>.
 * Backfills (scripts) usam `backfill:<nome>`.
 */
import type { NomeJob } from '@/services/analiseAtivos/tipos';
import { NOMES_JOBS_COMPLEMENTOS } from '@/types/analiseAtivosComplementos';
import { NOMES_JOBS_EUA } from '@/types/analiseAtivosEua';

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
  'criterios',
  'quadro',
  'curadoria',
  // v2.5: ingestão dos conectores de fundamentos (ANALISE_FONTES_INGESTAO; sem conector = pulado)
  'fontes-fundamentos',
  // bloco 1: avisos das listas dos Salvos (11:10 UTC, depois da curadoria; sem a flag = pulado)
  'alertas-salvos',
  // Stocks e REITs (fatia 0): um módulo por job em services/analiseAtivos/eua/jobs/* (A e B donos)
  ...NOMES_JOBS_EUA,
  // A6 (fatia 0): retornos-cotacao (fatia C) e cvm-fre-societario (fatia D), stubs 'pulado'
  ...NOMES_JOBS_COMPLEMENTOS,
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
