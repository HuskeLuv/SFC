/**
 * Job 'cvm-fre-societario' (A6, item 6): posição acionária, distribuição do capital e direitos por
 * espécie do Formulário de Referência (CVM dados abertos), gravados em cia_fre_posicao_acionaria,
 * cia_fre_societario e cia_fre_direito_acao.
 *
 * DONO: fatia D (docs/analise-ativos/fundamentei-trazer/desenho.json). Na fatia 0 é STUB: termina
 * 'pulado' sem tocar no banco nem na rede. A fatia D troca o corpo mantendo a assinatura:
 *  - download condicional (só dados.cvm.gov.br; rad.cvm.gov.br fica FORA da allowlist) de
 *    fre_cia_aberta_{ano, ano−1}.zip e, uma vez, do 2022 (ANO_FRE_DIREITOS);
 *  - streaming, só emissores do universo; gravação em transação por cnpj+anoFre;
 *  - só acionistas DIRETOS + sintéticas IDS_ACIONISTA_SINTETICO; NUNCA grava CPF/CNPJ do acionista;
 *  - classePn vazio = ''; LINK_DOC guardado como texto, nunca baixado.
 * Cron proposto: JOBS_COMPLEMENTOS['cvm-fre-societario'] (domingo 06:10 UTC, myfinance-job.sh).
 * O job NÃO depende de ANALISE_ATIVOS_SOCIETARIO_HABILITADO.
 */
import type { OpcoesExecucaoJob } from '@/services/analiseAtivos/jobs/catalogoJobs';
import type { JobContexto, ResultadoJob } from '@/services/analiseAtivos/tipos';
import { MOTIVO_JOB_NAO_IMPLEMENTADO } from '@/types/analiseAtivosComplementos';

export async function sincronizarFreSocietario(
  _ctx: JobContexto,
  _opcoes?: OpcoesExecucaoJob,
): Promise<ResultadoJob> {
  return { pulado: `cvm-fre-societario: ${MOTIVO_JOB_NAO_IMPLEMENTADO}` };
}
