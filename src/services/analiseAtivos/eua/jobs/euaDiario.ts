/**
 * Job encadeado 'eua-diario' (11:25 UTC pelo myfinance-job.sh; pesado, timeout 600 s): sec-fundamentos
 * (jobSecFundamentos, fatia A) → criterios-eua (jobCriteriosEua) → quadro-eua (jobQuadroEua), um
 * AnaliseJobRun por etapa; falha numa etapa não impede as seguintes (rodam sobre os dados
 * anteriores). Nunca concorre com os jobs BR (scores 10:10, criterios 10:30, quadro 10:40,
 * curadoria 10:55, alertas-salvos 11:10).
 *
 * DONO: fatia B (docs/analise-ativos/stocks-reits/desenho.json).
 *
 * Cada etapa passa pelo MESMO wrapper dos jobs (executarJobAnalise: lock pelo nome da etapa,
 * AnaliseJobRun próprio com status/alertas/rssPicoMb, prazo), no mesmo processo e com o mesmo
 * Prisma, origem e aplicar do run 'eua-diario'. O prazo de cada etapa é o dela, limitado ao que
 * resta do run encadeado. 'falha' (ou exceção) numa etapa vira alerta de erro no 'eua-diario' e a
 * próxima roda; o 'eua-diario' termina 'parcial' quando alguma etapa falhou ou terminou parcial.
 * --versao-params=N vale para o criterios-eua (dry-run da v3).
 */
import { executarJobAnalise } from '@/services/analiseAtivos/jobs/executarJob';
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import { jobCriteriosEua } from '@/services/analiseAtivos/eua/jobs/criteriosEua';
import { jobQuadroEua } from '@/services/analiseAtivos/eua/jobs/quadroEua';
import { jobSecFundamentos } from '@/services/analiseAtivos/eua/jobs/secFundamentos';
import type {
  JobContexto,
  NomeJob,
  RelatorioJob,
  ResultadoJob,
} from '@/services/analiseAtivos/tipos';

export interface EtapaEuaDiario {
  nome: Extract<NomeJob, 'sec-fundamentos' | 'criterios-eua' | 'quadro-eua'>;
  prazoMs: number;
  executar: (ctx: JobContexto, opcoes?: OpcoesExecucaoJob) => Promise<ResultadoJob>;
}

/** Ordem fixa (os prazos são os do catálogo de cada job). */
export const ETAPAS_EUA_DIARIO: readonly EtapaEuaDiario[] = [
  { nome: 'sec-fundamentos', prazoMs: 240_000, executar: jobSecFundamentos },
  { nome: 'criterios-eua', prazoMs: 240_000, executar: jobCriteriosEua },
  { nome: 'quadro-eua', prazoMs: 120_000, executar: jobQuadroEua },
];

/** Prazo mínimo para uma etapa começar (abaixo disso ela é registrada como pulada). */
export const PRAZO_MINIMO_ETAPA_MS = 5_000;

export interface DependenciasEuaDiario {
  etapas: readonly EtapaEuaDiario[];
  executar: typeof executarJobAnalise;
}

export const DEPENDENCIAS_EUA_DIARIO: DependenciasEuaDiario = {
  etapas: ETAPAS_EUA_DIARIO,
  executar: executarJobAnalise,
};

interface ResumoEtapa {
  job: string;
  status: RelatorioJob['status'] | 'sem_prazo';
  runId: string | null;
  duracaoMs: number;
  rssPicoMb: number | null;
  linhasGravadas: number;
  alertas: number;
  erro?: string;
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function jobEuaDiario(
  ctx: JobContexto,
  opcoes?: OpcoesExecucaoJob,
  deps: DependenciasEuaDiario = DEPENDENCIAS_EUA_DIARIO,
): Promise<ResultadoJob> {
  const etapas: ResumoEtapa[] = [];
  let algumaFalhou = false;
  for (const etapa of deps.etapas) {
    const restante = ctx.restanteMs();
    if (restante < PRAZO_MINIMO_ETAPA_MS) {
      algumaFalhou = true;
      ctx.alertar({
        codigo: 'eua_diario_sem_prazo',
        nivel: 'erro',
        mensagem: `etapa ${etapa.nome} não rodou: prazo do eua-diario esgotado`,
      });
      etapas.push({
        job: etapa.nome,
        status: 'sem_prazo',
        runId: null,
        duracaoMs: 0,
        rssPicoMb: null,
        linhasGravadas: 0,
        alertas: 0,
      });
      continue;
    }
    const comOpcoes = opcoes && Object.keys(opcoes).length > 0;
    try {
      const r = await deps.executar(etapa.nome, (c) => etapa.executar(c, opcoes), {
        prisma: ctx.prisma,
        prazoMs: Math.min(etapa.prazoMs, restante),
        origem: ctx.origem,
        aplicar: ctx.aplicar,
        ...(comOpcoes ? { parametros: { ...opcoes, encadeadoEm: 'eua-diario' } } : {}),
      });
      etapas.push({
        job: etapa.nome,
        status: r.status,
        runId: r.id || null,
        duracaoMs: r.duracaoMs,
        rssPicoMb: r.rssPicoMb,
        linhasGravadas: r.linhasGravadas,
        alertas: r.alertas.length,
        ...(r.erro ? { erro: r.erro } : {}),
      });
      if (r.status === 'falha' || r.status === 'parcial') {
        algumaFalhou = true;
        ctx.alertar({
          codigo: 'eua_diario_etapa_falhou',
          nivel: 'erro',
          mensagem: `etapa ${etapa.nome} terminou '${r.status}'${r.erro ? ` (${r.erro})` : ''}; as seguintes rodam sobre os dados anteriores`,
          ref: r.id || undefined,
        });
      }
    } catch (e: unknown) {
      // executarJobAnalise não lança; isto cobre uma dependência injetada que lance
      algumaFalhou = true;
      ctx.alertar({
        codigo: 'eua_diario_etapa_falhou',
        nivel: 'erro',
        mensagem: `etapa ${etapa.nome} lançou (${mensagemDe(e)}); as seguintes rodam sobre os dados anteriores`,
      });
      etapas.push({
        job: etapa.nome,
        status: 'falha',
        runId: null,
        duracaoMs: 0,
        rssPicoMb: null,
        linhasGravadas: 0,
        alertas: 0,
        erro: mensagemDe(e),
      });
    }
  }
  ctx.contar(
    'linhasGravadas',
    etapas.reduce((s, e) => s + e.linhasGravadas, 0),
  );
  return {
    ...(algumaFalhou ? { parcial: true } : {}),
    detalhes: { etapas },
  };
}
