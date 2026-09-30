/**
 * Semáforo (spec §4.2 com as decisões 2, 4, 5, 6 e 10). Função pura.
 *
 * Cada critério: atende | parcial | nao_atende | nao_se_aplica | sem_dado.
 * - "Não se aplica" sai da contagem: banco ⇒ "n de 4"; tijolo com vacância e nº de imóveis desligados
 *   (decisão 6) ⇒ "n de 3".
 * - "Sem dado" conta como não atendido, com ícone próprio. NUNCA comparar null com número: no
 *   protótipo um papel sem dados atendia 5/5 porque `null <= 1` é true.
 * - EBITDA ≤ 0 com dívida líquida positiva ⇒ endividamento não atende (com caixa líquido, atende);
 *   PL ≤ 0 ⇒ rentabilidade não atende; P/L ≤ 0 ⇒ preço vs. histórico não atende.
 * Os checks gravados são compactos (código, status, valor, referência); as frases saem de textos.ts.
 */
import type {
  CheckSemaforo,
  Regua,
  ScoringParams,
  StatusCriterio,
  Valor,
} from '@/services/analiseAtivos/tipos';

type Criterio = ScoringParams['acao']['semaforo'][number];

export interface EntradaSemaforo {
  /** métricas pelo nome usado em params (dy12mPct, roePct, plVsMedia10aPct, pvp, nCri…) */
  metricas: Partial<Record<string, Valor<number>>>;
  ehFinanceira?: boolean;
  dividaLiquida?: Valor<number>;
  ebitda?: Valor<number>;
  plControladora?: Valor<number>;
  /** P/L atual ≤ 0 (prejuízo no TTM ou no último FY) */
  plNaoPositivo?: boolean;
}

export interface ResultadoSemaforo {
  checks: CheckSemaforo[];
  aplicaveis: number;
  atendidos: number;
}

export function criteriosDaRegua(regua: Regua, p: ScoringParams): Criterio[] {
  switch (regua) {
    case 'acao':
    case 'acao_financeira':
      return p.acao.semaforo;
    case 'fii_tijolo':
      return p.fii.tijolo.semaforo;
    case 'fii_papel':
      return p.fii.papel.semaforo;
    default:
      return [];
  }
}

function comparar(v: number, c: Criterio): StatusCriterio {
  if (c.direcao === 'faixa') {
    const [a0, a1] = c.atende as [number, number];
    const [p0, p1] = c.parcial as [number, number];
    if (v >= a0 && v <= a1) return 'atende';
    if (v >= p0 && v <= p1) return 'parcial';
    return 'nao_atende';
  }
  const atende = c.atende as number;
  const parcial = c.parcial as number;
  if (c.direcao === 'maior_melhor') {
    if (v >= atende) return 'atende';
    if (v >= parcial) return 'parcial';
    return 'nao_atende';
  }
  if (v <= atende) return 'atende';
  if (v <= parcial) return 'parcial';
  return 'nao_atende';
}

function check(
  c: Criterio,
  status: StatusCriterio,
  valor: number | null,
  motivo?: string,
): CheckSemaforo {
  const out: CheckSemaforo = {
    codigo: c.codigo,
    status,
    valor,
    referencia: c.atende as number | [number, number],
  };
  if (c.provisorio) out.provisorio = true;
  if (motivo) out.motivo = motivo;
  return out;
}

function avaliar(c: Criterio, e: EntradaSemaforo, regua: Regua): CheckSemaforo {
  if (c.ativo === false)
    return check(c, 'nao_se_aplica', null, c.motivoInativo ?? 'criterio_desligado');
  if (c.financeiras === 'nao_se_aplica' && (e.ehFinanceira || regua === 'acao_financeira')) {
    return check(c, 'nao_se_aplica', null, 'financeira');
  }
  if (c.ebitdaNaoPositivo && e.ebitda?.estado === 'ok' && e.ebitda.valor <= 0) {
    const dl = e.dividaLiquida;
    if (!dl || dl.estado === 'ausente') return check(c, 'sem_dado', null, 'divida_liquida');
    if (dl.estado === 'nao_se_aplica') return check(c, 'nao_se_aplica', null, dl.motivo);
    return dl.valor > 0
      ? check(c, 'nao_atende', null, 'ebitda_nao_positivo')
      : check(c, 'atende', null, 'caixa_liquido');
  }
  if (c.plNaoPositivo === 'nao_atende') {
    if (
      c.metrica === 'roePct' &&
      e.plControladora?.estado === 'ok' &&
      e.plControladora.valor <= 0
    ) {
      return check(c, 'nao_atende', null, 'pl_nao_positivo');
    }
    if (c.metrica !== 'roePct' && e.plNaoPositivo)
      return check(c, 'nao_atende', null, 'pl_negativo');
  }
  const v = e.metricas[c.metrica];
  if (!v || v.estado === 'ausente') return check(c, 'sem_dado', null, v?.motivo);
  if (v.estado === 'nao_se_aplica') {
    // P/L ≤ 0 sem a flag explícita também não atende (nunca "baixo" por ser negativo)
    if (c.plNaoPositivo === 'nao_atende' && v.motivo === 'base_nao_positiva') {
      return check(c, 'nao_atende', null, 'base_nao_positiva');
    }
    return check(c, 'nao_se_aplica', null, v.motivo);
  }
  return check(c, comparar(v.valor, c), v.valor);
}

export function semaforo(e: EntradaSemaforo, regua: Regua, p: ScoringParams): ResultadoSemaforo {
  const checks = criteriosDaRegua(regua, p).map((c) => avaliar(c, e, regua));
  return {
    checks,
    aplicaveis: checks.filter((c) => c.status !== 'nao_se_aplica').length,
    atendidos: checks.filter((c) => c.status === 'atende').length,
  };
}
