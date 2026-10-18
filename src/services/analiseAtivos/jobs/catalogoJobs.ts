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
 *
 * Stocks e REITs (fatia 0): os 6 jobs EUA apontam cada um para o SEU módulo em
 * services/analiseAtivos/eua/jobs/* (MODULOS_JOBS_EUA: sec-cadastro, sec-fundamentos e
 * cotacoes-eua = fatia A; criterios-eua, quadro-eua e eua-diario = fatia B). Este arquivo NÃO é mais
 * editado por A nem por B: cada fatia só preenche o próprio módulo (até lá, 'pulado').
 */
import { executarAlertasSalvos } from '@/services/analiseAtivos/alertas/executarAlertasSalvos';
import { sincronizarCvmCias } from '@/services/analiseAtivos/acoes/sincronizarCvmCias';
import { sincronizarB3Cadastro } from '@/services/analiseAtivos/b3/sincronizarB3Cadastro';
import { sincronizarCotahist } from '@/services/analiseAtivos/b3/sincronizarCotahist';
import { executarCriterios } from '@/services/analiseAtivos/calculo/executarCriterios';
import { executarScores } from '@/services/analiseAtivos/calculo/executarScores';
import { executarCuradoria } from '@/services/analiseAtivos/curadoria/sincronizarCasos';
import { sincronizarIpe } from '@/services/analiseAtivos/eventos/sincronizarIpe';
import {
  DEPENDENCIAS_INGESTAO,
  ingerirFontes,
} from '@/services/analiseAtivos/fontes/fundamentos/ingerirFontes';
import { sincronizarFiiCadastro } from '@/services/analiseAtivos/fii/sincronizarFiiCadastro';
import { sincronizarFiiMensal } from '@/services/analiseAtivos/fii/sincronizarFiiMensal';
import { sincronizarFiiTrimestral } from '@/services/analiseAtivos/fii/sincronizarFiiTrimestral';
import { NOMES_JOBS } from '@/services/analiseAtivos/jobs/nomesJobs';
import { gerarQuadro } from '@/services/analiseAtivos/quadro/gerarQuadro';
import { jobCotacoesEua } from '@/services/analiseAtivos/eua/jobs/cotacoesEua';
import { jobCriteriosEua } from '@/services/analiseAtivos/eua/jobs/criteriosEua';
import { jobEuaDiario } from '@/services/analiseAtivos/eua/jobs/euaDiario';
import { jobQuadroEua } from '@/services/analiseAtivos/eua/jobs/quadroEua';
import { jobSecCadastro } from '@/services/analiseAtivos/eua/jobs/secCadastro';
import { jobSecFundamentos } from '@/services/analiseAtivos/eua/jobs/secFundamentos';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';

export type NomeJobCron = (typeof NOMES_JOBS)[number];

/**
 * Opções que o runner de linha de comando repassa ao job (v2.5): --versao-params=N (criterios e
 * fontes-fundamentos: lê essa versão do criteria_params, para o dry-run de uma versão ainda não
 * vigente) e --fonte=<id> (fontes-fundamentos: conector pedido no lugar de ANALISE_FONTES_INGESTAO;
 * 'exemplo' só fora de produção). Jobs que não usam ignoram.
 */
export interface OpcoesExecucaoJob {
  versaoParams?: number;
  fonte?: string;
}

export interface DefinicaoJob {
  nome: NomeJobCron;
  prazoMs: number;
  pesado: boolean;
  parametros?: Record<string, unknown>;
  executar: (ctx: JobContexto, opcoes?: OpcoesExecucaoJob) => Promise<ResultadoJob>;
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
  // v2.4: Filtros de Fundamentos — criteria_eval por símbolo × janela (10:30 UTC, entre o scores e o
  // quadro; com o scores ainda rodando termina 'pulado'). Lotes de 50, só banco. Pico medido no
  // runner (DEV, 13/10/2026): 265 MB em 19 s ⇒ pesado (processo separado pelo myfinance-job.sh).
  criterios: {
    nome: 'criterios',
    prazoMs: 240_000,
    pesado: true,
    // v2.5: --versao-params=N no runner lê essa versão (dry-run de uma versão ainda não vigente)
    executar: (ctx, opcoes) =>
      opcoes?.versaoParams !== undefined
        ? executarCriterios(ctx, undefined, { versaoParams: opcoes.versaoParams })
        : executarCriterios(ctx),
  },
  // Fase 1: materializa analise_quadro_linhas depois do scores (medido < 30 s, < 250 MB)
  quadro: {
    nome: 'quadro',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => gerarQuadro(ctx),
  },
  // Bloco C: abre/atualiza casos de regra a partir das flags conf:/rev: e manda o resumo de prazos
  // aos admins (10:55 UTC, depois do quadro). Só banco.
  curadoria: {
    nome: 'curadoria',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => executarCuradoria(ctx),
  },
  // v2.5: ingestão point-in-time dos conectores de fundamentos (provedor pago). Sem conector
  // habilitado (ANALISE_FONTES_INGESTAO vazio, o padrão) termina 'pulado'. Linha de cron das 10:20
  // UTC COMENTADA no template do Lightsail: descomentar só quando houver contrato (ver
  // docs/analise-ativos/v25-regras-pedro/desenho.json → camada_fontes §10).
  'fontes-fundamentos': {
    nome: 'fontes-fundamentos',
    prazoMs: 240_000,
    pesado: false,
    executar: (ctx, opcoes) =>
      ingerirFontes(ctx, DEPENDENCIAS_INGESTAO, {
        ...(opcoes?.fonte ? { fonte: opcoes.fonte } : {}),
        ...(opcoes?.versaoParams !== undefined ? { versaoParams: opcoes.versaoParams } : {}),
      }),
  },
  // Bloco 1: avisos das listas dos Salvos (Notification + push 'analise') — 11:10 UTC, depois da
  // curadoria. Só banco; sem ANALISE_ATIVOS_ALERTAS_HABILITADO termina 'pulado'.
  'alertas-salvos': {
    nome: 'alertas-salvos',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx) => executarAlertasSalvos(ctx),
  },
  // ---- Stocks e REITs (módulos eua/jobs/*: fatias A e B) ----
  // Cadastro e universo SEC (domingo 03:30 UTC, incremental; a 1ª carga é manual, ~6 min)
  'sec-cadastro': {
    nome: 'sec-cadastro',
    prazoMs: 540_000,
    pesado: true,
    executar: (ctx, opcoes) => jobSecCadastro(ctx, opcoes),
  },
  // Fundamentos SEC incrementais (form.idx); no cron roda dentro do eua-diario
  'sec-fundamentos': {
    nome: 'sec-fundamentos',
    prazoMs: 240_000,
    pesado: true,
    executar: (ctx, opcoes) => jobSecFundamentos(ctx, opcoes),
  },
  // Cotação EUA (só com ANALISE_ATIVOS_EUA_PRECO_HABILITADO; linha de cron comentada)
  'cotacoes-eua': {
    nome: 'cotacoes-eua',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx, opcoes) => jobCotacoesEua(ctx, opcoes),
  },
  // criteria_eval stock/reit (--versao-params=N para o dry-run da v3)
  'criterios-eua': {
    nome: 'criterios-eua',
    prazoMs: 240_000,
    pesado: true,
    executar: (ctx, opcoes) => jobCriteriosEua(ctx, opcoes),
  },
  // analise_quadro_linhas stock/reit
  'quadro-eua': {
    nome: 'quadro-eua',
    prazoMs: 120_000,
    pesado: false,
    executar: (ctx, opcoes) => jobQuadroEua(ctx, opcoes),
  },
  // Encadeado 11:25 UTC: sec-fundamentos → criterios-eua → quadro-eua (um AnaliseJobRun por etapa)
  'eua-diario': {
    nome: 'eua-diario',
    prazoMs: 540_000,
    pesado: true,
    executar: (ctx, opcoes) => jobEuaDiario(ctx, opcoes),
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
