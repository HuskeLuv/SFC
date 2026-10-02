/**
 * Regras puras de observabilidade dos jobs da Análise de Ativos:
 *
 *  - deveAlertar: 2 falhas/abandonos SEGUIDOS alertam; enquanto persistir, repete no máximo 1×/24h;
 *    uma execução 'ok'/'parcial' zera. 'pulado' (outro run em andamento) e 'executando' são neutros.
 *  - calcularFrescor: por camada de dado, 'em_dia' | 'atrasado' | 'sem_dado', pela última execução
 *    OK do job dono da camada e pela data do dado mais recente — insumo do selo "Dados: fonte · data"
 *    da Fase 1 e de um /admin futuro. Sem tela nesta fase.
 */
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';
import type { Camada, NomeJob } from '@/services/analiseAtivos/tipos';

export const REPETICAO_ALERTA_MS = 24 * 60 * 60 * 1000;
export const FALHAS_SEGUIDAS_PARA_ALERTAR = 2;

const STATUS_FALHA = new Set(['falha', 'abandonado']);
const STATUS_SUCESSO = new Set(['ok', 'parcial']);

export function deveAlertar(
  execucoes: Array<{ status: string; inicio: Date }>,
  agora: Date,
): { alertar: boolean; motivo: string | null } {
  const ordem = [...execucoes].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  let seguidas = 0;
  let ultimoAlerta: number | null = null;
  let alertar = false;

  ordem.forEach((e, i) => {
    const ultima = i === ordem.length - 1;
    if (STATUS_SUCESSO.has(e.status)) {
      seguidas = 0;
      ultimoAlerta = null;
    } else if (STATUS_FALHA.has(e.status)) {
      seguidas++;
    }
    if (seguidas < FALHAS_SEGUIDAS_PARA_ALERTAR || !STATUS_FALHA.has(e.status)) {
      if (ultima) alertar = false;
      return;
    }
    // execuções anteriores simulam quando o alerta já saiu; a última decide com `agora`
    const momento = ultima ? agora.getTime() : e.inicio.getTime();
    const pode = ultimoAlerta === null || momento - ultimoAlerta >= REPETICAO_ALERTA_MS;
    if (pode) ultimoAlerta = momento;
    if (ultima) alertar = pode;
  });

  if (!alertar) return { alertar: false, motivo: null };
  return { alertar: true, motivo: `${seguidas} falhas seguidas` };
}

export type StatusFrescor = 'em_dia' | 'atrasado' | 'sem_dado';

export interface LimiteFrescor {
  /** horas desde o fim da última execução ok/parcial do job dono */
  maxHorasJob: number;
  /** idade máxima do dado mais recente (dias corridos, ou pregões se emPregoes) */
  maxDiasDado: number;
  emPregoes?: boolean;
}

export interface FrescorCamada {
  camada: Camada;
  job: NomeJob;
  status: StatusFrescor;
  ultimaExecucaoOk: string | null;
  horasDesdeExecucaoOk: number | null;
  dadoMaisRecente: string | null;
  /** dias corridos (ou pregões) entre o dado mais recente e hoje; null sem dado */
  idadeDado: number | null;
  motivos: string[];
}

export interface PainelFrescor {
  geradoEm: string;
  camadas: Record<Camada, FrescorCamada>;
  atrasadas: Camada[];
}

export const JOB_POR_CAMADA: Record<Camada, NomeJob> = {
  cotacoes: 'cotahist',
  fundamentos_dfp: 'cvm-cias:dfp',
  fundamentos_itr: 'cvm-cias:itr',
  fii_mensal: 'fii-mensal',
  fii_trimestral: 'fii-trimestral',
  cadastro_b3: 'b3-cadastro',
  cadastro_fii: 'fii-cadastro',
  eventos: 'cvm-ipe',
  scores: 'scores',
  quadro: 'quadro',
};

/**
 * Limites padrão, pelo calendário das fontes: jobs diários tolerados até 26 h (1 run perdido não
 * alerta; 2 sim), semanais até 8 dias. Idade do dado pelo ciclo de publicação: DFP anual (dtFim 31/12
 * visto até ~abr do ano seguinte + 1 ano), ITR (dtFim do trimestre + até 45 dias, sem ITR do 4º
 * trimestre), informe mensal de FII (mês + ~45 dias), trimestral (trimestre + ~60 dias).
 */
export const LIMITES_FRESCOR_PADRAO: Record<Camada, LimiteFrescor> = {
  cotacoes: { maxHorasJob: 26, maxDiasDado: 2, emPregoes: true },
  fundamentos_dfp: { maxHorasJob: 26, maxDiasDado: 470 },
  fundamentos_itr: { maxHorasJob: 26, maxDiasDado: 240 },
  fii_mensal: { maxHorasJob: 26, maxDiasDado: 80 },
  fii_trimestral: { maxHorasJob: 26, maxDiasDado: 190 },
  cadastro_b3: { maxHorasJob: 8 * 24, maxDiasDado: 8 },
  cadastro_fii: { maxHorasJob: 8 * 24, maxDiasDado: 8 },
  eventos: { maxHorasJob: 26, maxDiasDado: 120 },
  scores: { maxHorasJob: 26, maxDiasDado: 2, emPregoes: true },
  // Fase 1: linhas do Quadro (dataRef = a do score); diário depois do scores
  quadro: { maxHorasJob: 26, maxDiasDado: 2, emPregoes: true },
};

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

function idade(dado: string, hoje: string, emPregoes: boolean): number {
  if (dado >= hoje) return 0;
  if (emPregoes) return pregoesEntre(dado, hoje).filter((d) => d > dado && d <= hoje).length;
  return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${dado}T00:00:00Z`)) / DIA_MS);
}

export function calcularFrescor(
  entrada: {
    ultimaOkPorJob: Map<NomeJob, Date>;
    dadoMaisRecente: Record<Camada, string | null>;
  },
  agora: Date,
  limites: Record<Camada, LimiteFrescor> = LIMITES_FRESCOR_PADRAO,
): PainelFrescor {
  const hoje = agora.toISOString().slice(0, 10);
  const camadas = {} as Record<Camada, FrescorCamada>;
  const atrasadas: Camada[] = [];

  for (const camada of Object.keys(JOB_POR_CAMADA) as Camada[]) {
    const job = JOB_POR_CAMADA[camada];
    const lim = limites[camada];
    const ultimaOk = entrada.ultimaOkPorJob.get(job) ?? null;
    const dado = entrada.dadoMaisRecente[camada] ?? null;
    const horas = ultimaOk ? (agora.getTime() - ultimaOk.getTime()) / HORA_MS : null;
    const idadeDado = dado ? idade(dado, hoje, lim.emPregoes === true) : null;
    const motivos: string[] = [];

    let status: StatusFrescor;
    if (ultimaOk === null && dado === null) {
      status = 'sem_dado';
      motivos.push('job nunca concluiu e não há dado gravado');
    } else {
      if (horas === null) motivos.push('job nunca concluiu com sucesso');
      else if (horas > lim.maxHorasJob) {
        motivos.push(`última execução ok há ${Math.round(horas)} h (limite ${lim.maxHorasJob} h)`);
      }
      if (idadeDado === null) motivos.push('sem dado gravado');
      else if (idadeDado > lim.maxDiasDado) {
        const unidade = lim.emPregoes ? 'pregões' : 'dias';
        motivos.push(`dado de ${dado} (${idadeDado} ${unidade}; limite ${lim.maxDiasDado})`);
      }
      status = motivos.length > 0 ? 'atrasado' : 'em_dia';
    }
    if (status === 'atrasado') atrasadas.push(camada);
    camadas[camada] = {
      camada,
      job,
      status,
      ultimaExecucaoOk: ultimaOk ? ultimaOk.toISOString() : null,
      horasDesdeExecucaoOk: horas === null ? null : Math.round(horas * 10) / 10,
      dadoMaisRecente: dado,
      idadeDado,
      motivos,
    };
  }
  return { geradoEm: agora.toISOString(), camadas, atrasadas };
}
