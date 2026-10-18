/**
 * Critério 'months' ("Rendimento todos os meses") — rec. 4 de 13/10/2026. Funções puras.
 *
 * 1. mesesAteAnoFim: meses CONSECUTIVOS com rendimento pago até dez/anoFim, com a função do Índice
 *    (mesesComRendimentoDetalhado: mês de pagamento; sem pagamento, mês seguinte à data-com) mas
 *    ancorada em 31/12/anoFim e SEM tolerar o "mês corrente" vazio — os meses depois da janela
 *    (ex.: uma lacuna em mar/2026 com anoFim 2025) não contam. NÃO lê
 *    AssetMultiplesCurrent.mesesComRendimento (que conta a partir de hoje). Também devolve o mês do
 *    1º provento da base (inicioBase).
 * 2. avaliarMeses: atende = consecutivos ≥ 12J; o fato CONTA os meses com rendimento DENTRO da janela
 *    (jan/(anoFim − J + 1)–dez/anoFim), não só a sequência final — uma lacuna antiga não zera a
 *    contagem: 'n de 12J meses com rendimento pago (jan/AAAA–dez/AAAA)' (QA 13/10).
 *    Base que começa DEPOIS de jan/(anoFim − J + 1) e cuja sequência chega até o começo da base
 *    (nenhuma lacuna dentro do que existe) = params.meses.mesesBaseCurta ('sem_dado' por padrão,
 *    com o fato 'sem dado nas demonstrações (proventos registrados desde MM/AAAA)').
 * 4. backtest 18/10/2026 (A5/M7): lacuna de COBERTURA da base ≠ mês sem rendimento. Mês da janela
 *    sem provento na base em que o informe mensal da CVM tem DY > 0 (e sem pagamento duplo nos meses
 *    vizinhos nem pagamento vizinho de competência deslocada — CVM 0 no mês do pagamento: RZTR11
 *    dez/2020 × jan/2021, decisão do Pedro pendente, fica como está) = 'sem_dado' com o fato
 *    baseProventosIncompleta, salvo se a janela tiver um mês em que a CVM confirma que NÃO houve
 *    distribuição (DY 0 no mês e no anterior). KNRI11 fev/2017 (DY 0,64% na CVM); BTHF11 2023–2024
 *    (9 meses sem provento na base, todos com DY na CVM).
 * 3. v2.5 — contagens anuais de um provedor (EntradaAvaliacaoAtivo.mesesPorAno): com TODOS os anos da
 *    janela informados, n = Σ, de = 12×J (atende só com 12×J) e qualquer ano nulo = sem dado; ano da
 *    janela que o provedor não informa = a contagem da CVM acima (sem misturar as bases).
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
  /**
   * meses ('AAAA-MM', sem repetição) com rendimento pago até dez/anoFim; ausente (fixtures antigas)
   * = só a sequência final é conhecida e a contagem cai para min(consecutivos, 12J)
   */
  mesesPagos?: readonly string[];
  /** meses sem provento na base com distribuição no informe da CVM (lacuna de cobertura, A5/M7) */
  mesesLacunaBase?: readonly string[];
  /** meses sem provento na base em que a CVM confirma que não houve distribuição (DY 0 no mês e no anterior) */
  mesesSemDistribuicaoCvm?: readonly string[];
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
  cvm?: { comRendimento: ReadonlySet<string>; semRendimento: ReadonlySet<string> },
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
  const pagos = new Set<string>();
  const fim = `${anoFim}-12`;
  const porMes = new Map<string, number>();
  for (const p of proventos) {
    if (p.status !== 'valido' || !cfg.tiposFii.includes(p.tipoNormalizado)) continue;
    const mes = mesDoProvento(p);
    if (mes && (inicioBase === null || mes < inicioBase)) inicioBase = mes;
    if (mes && mes <= fim) pagos.add(mes);
    if (mes) porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
  }
  const out: MesesRendimento = { consecutivos: meses, inicioBase, mesesPagos: [...pagos].sort() };
  if (cvm && inicioBase !== null) {
    const lacunas: string[] = [];
    const semDistribuicao: string[] = [];
    // pagamento no vizinho que é a distribuição DESTE mês (CVM 0 no mês do pagamento) ou mais de um
    // pagamento no vizinho: a lacuna é de calendário, não de cobertura
    const vizinhoExplica = (v: string) =>
      (porMes.get(v) ?? 0) > 1 || ((porMes.get(v) ?? 0) > 0 && cvm.semRendimento.has(v));
    for (let m = inicioBase; m <= fim; m = somarMeses(m, 1)) {
      if (pagos.has(m)) continue;
      if (cvm.semRendimento.has(m) && cvm.semRendimento.has(somarMeses(m, -1))) {
        semDistribuicao.push(m);
      } else if (
        cvm.comRendimento.has(m) &&
        !vizinhoExplica(somarMeses(m, -1)) &&
        !vizinhoExplica(somarMeses(m, 1))
      ) {
        lacunas.push(m);
      }
    }
    out.mesesLacunaBase = lacunas;
    out.mesesSemDistribuicaoCvm = semDistribuicao;
  }
  return out;
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

/**
 * Contagem pelos meses por ano do provedor (n = Σ, de = 12×J). undefined = algum ano da janela sem
 * a contagem do provedor (a CVM decide). Pura.
 */
export function avaliarMesesPorAno(
  mesesPorAno: Readonly<Record<number, number | null>> | null | undefined,
  anoFim: number,
  janela: Janela,
): ResultadoMeses | undefined {
  if (!mesesPorAno) return undefined;
  const t = TEXTOS_CRITERIOS.fatos;
  const anoInicio = anoInicioJanela(anoFim, janela);
  const anos = Array.from({ length: janela }, (_, i) => anoInicio + i);
  if (!anos.every((a) => Object.prototype.hasOwnProperty.call(mesesPorAno, a))) return undefined;
  const valores = anos.map((a) => mesesPorAno[a]);
  if (valores.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return {
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: t.semDado,
      motivo: 'sem_dado_demonstracoes',
    };
  }
  const total = 12 * janela;
  const n = Math.min(
    total,
    (valores as number[]).reduce((s, v) => s + Math.max(0, Math.min(12, Math.trunc(v))), 0),
  );
  return {
    estado: n === total ? 'atende' : 'nao_atende',
    n,
    de: total,
    fato: formatarTexto(t.mesesPeriodo, { n, total, anoInicio, anoFim }),
  };
}

export function avaliarMeses(
  meses: MesesRendimento | null,
  anoFim: number,
  janela: Janela,
  params: Pick<CriteriaParams, 'meses'>,
  mesesPorAno?: Readonly<Record<number, number | null>> | null,
): ResultadoMeses {
  const t = TEXTOS_CRITERIOS.fatos;
  const doProvedor = avaliarMesesPorAno(mesesPorAno, anoFim, janela);
  if (doProvedor) return doProvedor;
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
  const anoInicio = anoInicioJanela(anoFim, janela);
  const inicioJanela = `${anoInicio}-01`;
  const fimJanela = `${anoFim}-12`;
  const n = meses.mesesPagos
    ? meses.mesesPagos.filter((m) => m >= inicioJanela && m <= fimJanela).length
    : Math.min(Math.max(0, meses.consecutivos), total);
  const fato = formatarTexto(t.mesesPeriodo, { n, total, anoInicio, anoFim });
  if (meses.consecutivos >= total) {
    return {
      estado: 'atende',
      n: total,
      de: total,
      fato: formatarTexto(t.mesesPeriodo, { n: total, total, anoInicio, anoFim }),
    };
  }
  // A5/M7: lacuna de cobertura da base provada pela CVM ⇒ sem dado (a menos que a CVM também
  // confirme um mês sem distribuição na janela — aí o "não atende" é real)
  const naJanela = (m: string) => m >= inicioJanela && m <= fimJanela;
  const lacunas = (meses.mesesLacunaBase ?? []).filter(naJanela);
  if (lacunas.length > 0 && !(meses.mesesSemDistribuicaoCvm ?? []).some(naJanela)) {
    const lista = lacunas.slice(0, 3).map(mesAno).join(', ') + (lacunas.length > 3 ? '…' : '');
    return {
      estado: 'sem_dado',
      n: null,
      de: null,
      fato: formatarTexto(t.baseProventosIncompleta, { mesAno: lista }),
      motivo: 'base_proventos_curta',
    };
  }
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
  return { estado: 'nao_atende', n, de: total, fato };
}
