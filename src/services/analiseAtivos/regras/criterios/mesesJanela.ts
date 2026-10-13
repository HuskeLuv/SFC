/**
 * Critério 'months' ("Rendimento todos os meses") — rec. 4 de 13/10/2026. Funções puras.
 *
 * 1. mesesAteAnoFim: meses CONSECUTIVOS com rendimento pago até dez/anoFim, com a função do Índice
 *    (mesesComRendimentoDetalhado: mês de pagamento; sem pagamento, mês seguinte à data-com) mas
 *    ancorada em 31/12/anoFim e SEM tolerar o "mês corrente" vazio — os meses depois da janela
 *    (ex.: uma lacuna em mar/2026 com anoFim 2025) não contam. NÃO lê
 *    AssetMultiplesCurrent.mesesComRendimento (que conta a partir de hoje). Também devolve o mês do
 *    1º provento da base (inicioBase).
 * 2. avaliarMeses: atende = consecutivos ≥ 12J; fato 'min(m,12J) de 12J meses com rendimento pago'.
 *    Base que começa DEPOIS de jan/(anoFim − J + 1) e cuja sequência chega até o começo da base
 *    (nenhuma lacuna dentro do que existe) = params.meses.mesesBaseCurta ('sem_dado' por padrão,
 *    com o fato 'sem dado nas demonstrações (proventos registrados desde MM/AAAA)').
 */
import type { CriteriaParams } from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { mesesComRendimentoDetalhado } from '@/services/analiseAtivos/regras/calculo/sequencias';
import { formatarTexto, TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { ProventoAuditado, ScoringParams } from '@/services/analiseAtivos/tipos';
import type { EstadoCriterio, Janela, MotivoCriterio } from '@/types/analiseAtivosCriterios';
import { anoInicioJanela } from '@/services/analiseAtivos/regras/criterios/ancoraJanela';

export type ProventoMeses = Pick<
  ProventoAuditado,
  'status' | 'tipoNormalizado' | 'dataPagamento' | 'dataComReal'
>;

export interface MesesRendimento {
  /** meses seguidos com rendimento pago, de dez/anoFim para trás */
  consecutivos: number;
  /** 'AAAA-MM' do 1º mês com rendimento na base (null = nenhum provento válido) */
  inicioBase: string | null;
}

/** Só a parte do ScoringParams que a contagem lê. */
export type ParamsMeses = Pick<ScoringParams, 'sanidade'>;

function somarMeses(mes: string, n: number): string {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) - 1 + n;
  const aa = a + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${aa}-${String(mm + 1).padStart(2, '0')}`;
}

/** Mês (AAAA-MM) em que o provento conta, pela mesma regra da contagem. */
function mesDoProvento(p: ProventoMeses): string | null {
  if (p.dataPagamento) return p.dataPagamento.slice(0, 7);
  if (p.dataComReal) return somarMeses(p.dataComReal.slice(0, 7), 1);
  return null;
}

export function mesesAteAnoFim(
  proventos: readonly ProventoMeses[],
  anoFim: number,
  scoring: ParamsMeses,
): MesesRendimento {
  const cfg = scoring.sanidade.proventos;
  const semTolerancia = {
    ...scoring,
    sanidade: {
      ...scoring.sanidade,
      proventos: { ...cfg, mesCorrenteTolerado: false },
    },
  } as ScoringParams;
  const { meses } = mesesComRendimentoDetalhado([...proventos], `${anoFim}-12-31`, semTolerancia);
  let inicioBase: string | null = null;
  for (const p of proventos) {
    if (p.status !== 'valido' || !cfg.tiposFii.includes(p.tipoNormalizado)) continue;
    const mes = mesDoProvento(p);
    if (mes && (inicioBase === null || mes < inicioBase)) inicioBase = mes;
  }
  return { consecutivos: meses, inicioBase };
}

export interface ResultadoMeses {
  estado: Exclude<EstadoCriterio, 'nao_se_aplica'>;
  n: number | null;
  de: number | null;
  fato: string;
  motivo?: MotivoCriterio;
}

/** 'AAAA-MM' → 'MM/AAAA'. */
function mesAno(mes: string): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export function avaliarMeses(
  meses: MesesRendimento | null,
  anoFim: number,
  janela: Janela,
  params: Pick<CriteriaParams, 'meses'>,
): ResultadoMeses {
  const t = TEXTOS_CRITERIOS.fatos;
  if (!meses || meses.inicioBase === null) {
    return {
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: t.semDado,
      motivo: 'sem_dado_demonstracoes',
    };
  }
  const total = 12 * janela;
  const n = Math.min(Math.max(0, meses.consecutivos), total);
  if (meses.consecutivos >= total) {
    return { estado: 'atende', n, de: total, fato: formatarTexto(t.meses, { n, total }) };
  }
  const inicioJanela = `${anoInicioJanela(anoFim, janela)}-01`;
  // 1º mês da sequência que termina em dez/anoFim (dez/anoFim + 1 quando a sequência é vazia)
  const inicioSequencia = somarMeses(`${anoFim}-12`, 1 - meses.consecutivos);
  const baseCurta = meses.inicioBase > inicioJanela && inicioSequencia <= meses.inicioBase;
  if (baseCurta && params.meses.mesesBaseCurta === 'sem_dado') {
    return {
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: formatarTexto(t.baseProventosCurta, { mesAno: mesAno(meses.inicioBase) }),
      motivo: 'base_proventos_curta',
    };
  }
  return { estado: 'nao_atende', n, de: total, fato: formatarTexto(t.meses, { n, total }) };
}
