/**
 * Job 'curadoria' do bloco C — STUB da fatia 0 com a assinatura FINAL; a fatia C implementa.
 *
 * Contrato (spec fatia C item 1; fluxo_curadoria):
 *  - roda às 10:55 UTC (depois do 'quadro'), idempotente, só banco; `ctx.aplicar=false` = dry-run
 *    (conta sem gravar);
 *  - lê as linhas do Quadro com flags 'conf:'/'rev:' (regras/comum/conferencia.ts) e faz upsert de um
 *    caso por chaveCaso({symbol, campo: CAMPO_PRINCIPAL do grupo ou REGRAS_REVISAO[regra].campo,
 *    periodo: chave}) com origem 'regra', regraAtiva=true, emConferencia (só 'conf:') e contexto;
 *  - caso de REGRA PURA (nReportes=0) cuja regra parou: fecha como corrigido/fonte_corrigiu SÓ se a
 *    linha é de hoje e o campo principal está 'ok'; se o dado sumiu: regraAtiva=false + evento
 *    'regra_cessou' e o caso fica aberto. Caso 'misto'/'usuario' NUNCA fecha sozinho;
 *  - digest diário por admin (vencidos e vencendo em ≤ 2 dias úteis; sem 'rev') com
 *    Notification TIPOS_NOTIFICACAO.sla + push. Gate: analiseAtivosReporteHabilitado() + produção
 *    (não depende de ANALISE_ATIVOS_ALERTA_ADMIN);
 *  - devolve RelatorioCuradoria em ResultadoJob.detalhes.
 */
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import type { RelatorioCuradoria } from '@/types/analiseAtivosCuradoria';

export type { RelatorioCuradoria };

export const RELATORIO_CURADORIA_VAZIO: RelatorioCuradoria = {
  abertos: 0,
  atualizados: 0,
  autorresolvidos: 0,
  regraCessou: 0,
  digestEnviados: 0,
};

export async function executarCuradoria(_ctx: JobContexto): Promise<ResultadoJob> {
  // STUB (fatia 0): nada a fazer até a fatia C. Não grava nada.
  return { detalhes: { ...RELATORIO_CURADORIA_VAZIO, stub: true } };
}
