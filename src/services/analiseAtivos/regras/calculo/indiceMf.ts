/**
 * Índice MF (spec §4.1 com as decisões 2, 4–8 e 13 e a revisão da Fase 0). Funções puras.
 *
 * Índice = Σ wᵢ·Cᵢ ÷ Σ wᵢ sobre os componentes que SE APLICAM (decisão 2: "não se aplica" redistribui
 * o peso — BBAS3 sem C_dívida ⇒ pesos ÷ 0,8). "Ausente" vale 0 e liga o selo "dados incompletos";
 * "zero por regra" (prejuízo, PL ≤ 0, EBITDA ≤ 0 com dívida) vale 0 SEM o selo.
 * - Ações: C_lucro anos de lucro (0→0, 10→10); C_dívida DL/EBITDA (6→0, 0→10; financeira n/a; EBITDA ≤ 0
 *   com DL > 0 ⇒ 0, com caixa líquido ⇒ 10 — nunca interpolar a razão negativa que vem de EBITDA
 *   negativo); C_rent ROE (0→0, 25→10; PL ≤ 0 ⇒ 0, nunca ROE positivo de prejuízo ÷ PL negativo);
 *   C_div DY 12m (0→0, 8→10; DY "em conferência" pela trava de plausibilidade — acima do teto da
 *   classe ou com salto de provento recente, regras/calculo/plausibilidadeProventos — chega aqui
 *   como ausente('em_conferencia'): vale 0 e liga o selo com o motivo 'div:em_conferencia');
 *   C_preço P/L vs. média 10a (+60%→0, −30%→10; prejuízo ⇒ 0).
 * - FII tijolo: meses com rendimento, Obrigações/PL, vacância (desligada, decisão 6), DY, P/VP.
 * - FII papel (decisão 4, provisório): meses, maior CRI (% dos CRIs), nº de CRIs, DY, |P/VP − 1|.
 * - FoF e PL ≤ 0: fora do Índice (decisão 8, regra 22).
 * Todos os limiares vêm de ScoringParams.
 */
import { interpolar } from '@/services/analiseAtivos/regras/calculo/interpolacao';
import { ausente, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import { arredondar } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type {
  EstadoComponente,
  MotivoNaoSeAplica,
  NomeComponente,
  Regua,
  ResultadoIndice,
  ScoringParams,
  Valor,
} from '@/services/analiseAtivos/tipos';

export const NOMES_COMPONENTES: readonly NomeComponente[] = [
  'lucro',
  'divida',
  'rent',
  'div',
  'preco',
];

/**
 * tipos.ts (fatia 0) só prevê 'prejuizo' | 'pl_nao_positivo' em zero_regra; a regra de EBITDA ≤ 0 com
 * dívida líquida positiva precisa de 'ebitda_nao_positivo' (registrado em pendências da fatia D).
 */
export type MotivoZeroRegra = 'prejuizo' | 'pl_nao_positivo' | 'ebitda_nao_positivo';
export type EstadoComponenteCalc =
  | Exclude<EstadoComponente, { estado: 'zero_regra' }>
  | { estado: 'zero_regra'; nota: 0; motivo: MotivoZeroRegra };
export type ComponentesIndice = Record<NomeComponente, EstadoComponenteCalc>;
export interface ResultadoIndiceCalc extends Omit<ResultadoIndice, 'componentes'> {
  componentes: ComponentesIndice;
}

type CfgComponente = ScoringParams['acao']['componentes']['lucro'];

/** Componente genérico: métrica interpolada entre piso e teto; três estados preservados. */
export function componentePorMetrica(
  metrica: Valor<number>,
  cfg: CfgComponente,
): EstadoComponenteCalc {
  if (cfg.ativo === false) return { estado: 'nao_se_aplica', motivo: 'criterio_desligado' };
  if (metrica.estado === 'nao_se_aplica')
    return { estado: 'nao_se_aplica', motivo: metrica.motivo };
  if (metrica.estado === 'ausente') return { estado: 'ausente', nota: 0, motivo: metrica.motivo };
  return {
    estado: 'calculado',
    nota: interpolar(metrica.valor, cfg.piso, cfg.teto),
    metrica: metrica.valor,
  };
}

export interface EntradaIndiceAcao {
  anosLucroConsecutivos: Valor<number>;
  /** lucro atribuível do último FY (prejuízo ⇒ C_lucro e C_preço zero por regra) */
  lucroUltimoFy: Valor<number>;
  /** EmissorInfo.ehFinanceira (segmento B3 / holdings financeiras), reaplicada aqui */
  ehFinanceira: boolean;
  dividaLiquida: Valor<number>;
  ebitda: Valor<number>;
  roePct: Valor<number>;
  plControladora: Valor<number>;
  dy12mPct: Valor<number>;
  plVsMedia10aPct: Valor<number>;
}

export function componentesIndiceAcao(e: EntradaIndiceAcao, p: ScoringParams): ComponentesIndice {
  const c = p.acao.componentes;
  const prejuizo = e.lucroUltimoFy.estado === 'ok' && e.lucroUltimoFy.valor <= 0;

  const lucro: EstadoComponenteCalc = prejuizo
    ? { estado: 'zero_regra', nota: 0, motivo: 'prejuizo' }
    : componentePorMetrica(e.anosLucroConsecutivos, c.lucro);

  let divida: EstadoComponenteCalc;
  if (e.ehFinanceira && c.divida.financeiras === 'nao_se_aplica') {
    divida = { estado: 'nao_se_aplica', motivo: 'financeira' };
  } else if (e.ebitda.estado === 'nao_se_aplica') {
    divida = { estado: 'nao_se_aplica', motivo: e.ebitda.motivo };
  } else if (e.dividaLiquida.estado === 'nao_se_aplica') {
    divida = { estado: 'nao_se_aplica', motivo: e.dividaLiquida.motivo };
  } else if (e.ebitda.estado === 'ausente') {
    divida = { estado: 'ausente', nota: 0, motivo: e.ebitda.motivo };
  } else if (e.dividaLiquida.estado === 'ausente') {
    divida = { estado: 'ausente', nota: 0, motivo: e.dividaLiquida.motivo };
  } else if (e.ebitda.valor <= 0) {
    // 'zero_se_divida_liquida_positiva_senao_teto'
    divida =
      e.dividaLiquida.valor > 0
        ? { estado: 'zero_regra', nota: 0, motivo: 'ebitda_nao_positivo' }
        : { estado: 'calculado', nota: 10, metrica: 0 };
  } else {
    divida = componentePorMetrica(ok(e.dividaLiquida.valor / e.ebitda.valor), c.divida);
  }

  const plNaoPositivo = e.plControladora.estado === 'ok' && e.plControladora.valor <= 0;
  const rent: EstadoComponenteCalc =
    plNaoPositivo && c.rent.plNaoPositivo === 'zero'
      ? { estado: 'zero_regra', nota: 0, motivo: 'pl_nao_positivo' }
      : componentePorMetrica(e.roePct, c.rent);

  const div = componentePorMetrica(e.dy12mPct, c.div);

  let preco: EstadoComponenteCalc;
  if (prejuizo && c.preco.prejuizoUltimoAno === 'zero') {
    preco = { estado: 'zero_regra', nota: 0, motivo: 'prejuizo' };
  } else if (
    e.plVsMedia10aPct.estado === 'nao_se_aplica' &&
    e.plVsMedia10aPct.motivo === 'base_nao_positiva' &&
    c.preco.plNaoPositivo === 'zero'
  ) {
    // P/L atual ≤ 0 (prejuízo no TTM)
    preco = { estado: 'zero_regra', nota: 0, motivo: 'prejuizo' };
  } else {
    preco = componentePorMetrica(e.plVsMedia10aPct, c.preco);
  }

  return { lucro, divida, rent, div, preco };
}

export interface EntradaIndiceFii {
  mesesComRendimento: Valor<number>;
  obrigacoesPlPct: Valor<number>;
  vacanciaFisicaCvmPct: Valor<number>;
  dy12mPct: Valor<number>;
  pvp: Valor<number>;
  maiorCriPct: Valor<number>;
  nCri: Valor<number>;
}

function metricasFii(e: EntradaIndiceFii): Record<string, Valor<number>> {
  const semCri = e.nCri.estado === 'ok' && e.nCri.valor <= 0;
  const nCri: Valor<number> = semCri ? ausente('sem_dado_fonte', 'sem_cri') : e.nCri;
  const maiorCriPct: Valor<number> = semCri ? ausente('sem_dado_fonte', 'sem_cri') : e.maiorCriPct;
  const distanciaPvp1: Valor<number> =
    e.pvp.estado === 'ok' ? ok(Math.abs(e.pvp.valor - 1)) : e.pvp;
  return {
    mesesComRendimento: e.mesesComRendimento,
    obrigacoesPlPct: e.obrigacoesPlPct,
    vacanciaFisicaCvmPct: e.vacanciaFisicaCvmPct,
    dy12mPct: e.dy12mPct,
    pvp: e.pvp,
    maiorCriPct,
    nCri,
    distanciaPvp1,
  };
}

/** Régua = FiiMonthly.reguaVigente (gravada pela fatia B). fora_do_indice ⇒ todos n/a. */
export function componentesIndiceFii(
  e: EntradaIndiceFii,
  regua: Regua,
  p: ScoringParams,
  motivoFora: MotivoNaoSeAplica = 'fof',
): ComponentesIndice {
  if (regua !== 'fii_tijolo' && regua !== 'fii_papel') {
    const na: EstadoComponenteCalc = { estado: 'nao_se_aplica', motivo: motivoFora };
    return { lucro: na, divida: na, rent: na, div: na, preco: na };
  }
  const cfg = regua === 'fii_papel' ? p.fii.papel.componentes : p.fii.tijolo.componentes;
  const m = metricasFii(e);
  const out = {} as ComponentesIndice;
  for (const nome of NOMES_COMPONENTES) {
    const c = cfg[nome];
    out[nome] = componentePorMetrica(m[c.metrica] ?? ausente('sem_dado_fonte', c.metrica), c);
  }
  return out;
}

function notaDe(c: EstadoComponenteCalc): number {
  return c.estado === 'nao_se_aplica' ? 0 : c.nota;
}

/**
 * Σ w·c ÷ Σ w só sobre componentes aplicáveis (params.indice.redistribuirNaoSeAplica); ausente conta 0 e
 * marca incompleto. Régua fora_do_indice ⇒ índice n/a. Nenhum componente aplicável ⇒ ausente.
 */
export function calcularIndice(
  componentes: ComponentesIndice,
  pesos: ScoringParams['indice']['pesos'],
  regua: Regua,
  opts?: {
    casasDecimais?: number;
    redistribuirNaoSeAplica?: boolean;
    ausenteContaZero?: boolean;
    motivoFora?: MotivoNaoSeAplica;
  },
): ResultadoIndiceCalc {
  if (regua === 'fora_do_indice') {
    return {
      indice: naoSeAplica(opts?.motivoFora ?? 'fof'),
      componentes,
      pesosEfetivos: {},
      incompleto: false,
      motivosIncompleto: [],
    };
  }
  const redistribuir = opts?.redistribuirNaoSeAplica ?? true;
  const ausenteContaZero = opts?.ausenteContaZero ?? true;
  let somaPesos = 0;
  let soma = 0;
  const motivosIncompleto: string[] = [];
  for (const nome of NOMES_COMPONENTES) {
    const c = componentes[nome];
    const w = pesos[nome];
    if (c.estado === 'nao_se_aplica') {
      if (!redistribuir) somaPesos += w;
      continue;
    }
    if (c.estado === 'ausente') {
      motivosIncompleto.push(`${nome}:${c.motivo}`);
      if (!ausenteContaZero) continue;
    }
    somaPesos += w;
    soma += w * notaDe(c);
  }
  const pesosEfetivos: Partial<Record<NomeComponente, number>> = {};
  if (somaPesos > 0) {
    for (const nome of NOMES_COMPONENTES) {
      const est = componentes[nome].estado;
      if (est === 'nao_se_aplica' || (est === 'ausente' && !ausenteContaZero)) continue;
      pesosEfetivos[nome] = pesos[nome] / somaPesos;
    }
  }
  const indice: Valor<number> =
    somaPesos > 0
      ? ok(arredondar(soma / somaPesos, opts?.casasDecimais ?? 2))
      : ausente('sem_dado_fonte', 'nenhum_componente_aplicavel');
  return {
    indice,
    componentes,
    pesosEfetivos,
    incompleto: motivosIncompleto.length > 0,
    motivosIncompleto,
  };
}

/** Atalho com os parâmetros do ScoringParams. */
export function calcularIndiceComParams(
  componentes: ComponentesIndice,
  regua: Regua,
  p: ScoringParams,
  motivoFora?: MotivoNaoSeAplica,
): ResultadoIndiceCalc {
  return calcularIndice(componentes, p.indice.pesos, regua, {
    casasDecimais: p.indice.casasDecimais,
    redistribuirNaoSeAplica: p.indice.redistribuirNaoSeAplica,
    ausenteContaZero: p.indice.ausenteContaZero,
    motivoFora,
  });
}

export function faixaIndice(
  indice: number,
  p: ScoringParams,
): 'verde' | 'azul' | 'laranja' | 'vermelho' {
  const f = p.indice.faixasCor;
  if (indice >= f.verde) return 'verde';
  if (indice >= f.azul) return 'azul';
  if (indice >= f.laranja) return 'laranja';
  return 'vermelho';
}
