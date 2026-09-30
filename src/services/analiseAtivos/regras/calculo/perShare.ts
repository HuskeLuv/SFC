/**
 * Valores por ação/cota de cada exercício (regras 13, 16, 17 e 22; decisão 11). Funções puras.
 *
 * Ações: LPA = lucro atribuível ÷ ações do fim do exercício × fatorEquivalencia; VPA idem com o PL da
 * controladora; ajuste a hoje ÷ Π eventos CONFIRMADOS com anoBase > ano (WEGE3 2016: 0,6923 ÷ 2,6 =
 * 0,2663). DPA por data-com vem pronto (dpaNoAno, ajuste por evento). Payout (decisão 11) = DMPL
 * "declarado no ano" ÷ lucro do ano; > 150% ou < 0 ⇒ selo, sem corte (PETR4 2024 ≈ 275,6%, WEGE3 2025
 * 161,3%). Payout por ação (DPA ÷ LPA) só confere: |diferença| > 15 p.p. ⇒ auditoria_proventos.
 * FIIs: rendimento por cota no ano e VP/cota do fim do ano, crus e ajustados a hoje pelos
 * desdobramentos confirmados (HGLG11 10:1 em 2018).
 */
import {
  fatorEventosAnoBaseApos,
  fatorEventosDoAno,
  saltoAcoesSemEvento,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { ausente, deNumero, mapearValor, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type {
  EventoCorporativoVerificado,
  ScoringParams,
  Valor,
} from '@/services/analiseAtivos/tipos';

type EventoParaAjuste = Pick<
  EventoCorporativoVerificado,
  'dataEvento' | 'fator' | 'status' | 'anoBase'
>;

export interface EntradaPerShare {
  anoFiscal: number;
  lucroAtribuivel: Valor<number>;
  plControladora: Valor<number>;
  /** ações totais da empresa (ex-tesouraria) no fim do exercício */
  acoesFim: number | null;
  /** ações no fim do exercício anterior (regra 13) */
  acoesAnterior: number | null;
  fatorEquivalencia: number;
  /** eventos verificados do ticker */
  eventos: EventoParaAjuste[];
  /** DPA por data-com no ano, na base de ações do fim do ano */
  dpaFimDoAno: Valor<number>;
  /** mesmo DPA na base de hoje (ajuste por evento) */
  dpaHoje: Valor<number>;
  dmplDeclarado: number | null;
}

export interface PerShareAnual {
  lpa: Valor<number>;
  vpa: Valor<number>;
  dpaDataCom: Valor<number>;
  fatorAjusteHoje: number;
  lpaAjHoje: Valor<number>;
  vpaAjHoje: Valor<number>;
  dpaAjHoje: Valor<number>;
  payoutDmplPct: Valor<number>;
  payoutPorAcaoPct: Valor<number>;
  flags: string[];
}

function porAcao(v: Valor<number>, acoes: number | null, fator: number): Valor<number> {
  if (v.estado !== 'ok') return v;
  if (acoes === null || !(acoes > 0)) return ausente('sem_acoes');
  return ok((v.valor / acoes) * fator);
}

export function perShareAnual(e: EntradaPerShare, p: ScoringParams): PerShareAnual {
  const cfg = p.sanidade.acoes;
  const flags: string[] = [];
  const fator = fatorEventosAnoBaseApos(e.eventos, e.anoFiscal);
  const lpa = porAcao(e.lucroAtribuivel, e.acoesFim, e.fatorEquivalencia);
  const vpa = porAcao(e.plControladora, e.acoesFim, e.fatorEquivalencia);

  let payoutDmplPct: Valor<number>;
  if (e.lucroAtribuivel.estado !== 'ok') payoutDmplPct = e.lucroAtribuivel;
  else if (e.dmplDeclarado === null) payoutDmplPct = ausente('sem_dado_fonte', 'dmpl');
  else if (e.lucroAtribuivel.valor === 0) payoutDmplPct = ausente('outro', 'lucro_zero');
  else payoutDmplPct = ok((e.dmplDeclarado / e.lucroAtribuivel.valor) * 100);

  if (
    payoutDmplPct.estado === 'ok' &&
    (payoutDmplPct.valor > cfg.payoutSeloPct || payoutDmplPct.valor < 0)
  ) {
    flags.push('payout_extraordinario_ou_lucro_negativo');
  }

  let payoutPorAcaoPct: Valor<number>;
  if (lpa.estado !== 'ok') payoutPorAcaoPct = lpa;
  else if (e.dpaFimDoAno.estado !== 'ok') payoutPorAcaoPct = e.dpaFimDoAno;
  else if (!(lpa.valor > 0)) payoutPorAcaoPct = ausente('outro', 'lpa_nao_positivo');
  else payoutPorAcaoPct = ok((e.dpaFimDoAno.valor / lpa.valor) * 100);

  if (
    payoutDmplPct.estado === 'ok' &&
    payoutPorAcaoPct.estado === 'ok' &&
    Math.abs(payoutPorAcaoPct.valor - payoutDmplPct.valor) > cfg.payoutAuditoriaPp
  ) {
    flags.push('auditoria_proventos');
  }

  if (
    e.acoesFim !== null &&
    e.acoesAnterior !== null &&
    saltoAcoesSemEvento(e.acoesAnterior, e.acoesFim, fatorEventosDoAno(e.eventos, e.anoFiscal), p)
  ) {
    flags.push('salto_acoes_sem_evento', 'dados_incompletos');
  }

  return {
    lpa,
    vpa,
    dpaDataCom: e.dpaFimDoAno,
    fatorAjusteHoje: fator,
    lpaAjHoje: mapearValor(lpa, (x) => x / fator),
    vpaAjHoje: mapearValor(vpa, (x) => x / fator),
    dpaAjHoje: e.dpaHoje,
    payoutDmplPct,
    payoutPorAcaoPct,
    flags,
  };
}

export interface EntradaPerShareFii {
  anoFiscal: number;
  /** VP/cota do informe de dezembro (cru) */
  vpCotaFim: number | null;
  /** Σ rendimentos por cota com data-com no ano, na base do fim do ano (cru) */
  rendCotaAno: Valor<number>;
  /** mesmo rendimento na base de hoje (ajuste por evento) */
  rendCotaHoje: Valor<number>;
  eventos: EventoParaAjuste[];
  pl: number | null;
}

export interface PerShareAnualFii {
  vpCotaFim: Valor<number>;
  rendCota: Valor<number>;
  fatorAjusteHoje: number;
  vpaAjHoje: Valor<number>;
  dpaAjHoje: Valor<number>;
  flags: string[];
}

/** Regra 22: por cota na base de hoje ÷ Π desdobramentos confirmados depois do exercício. */
export function perShareAnualFii(e: EntradaPerShareFii): PerShareAnualFii {
  const fator = fatorEventosAnoBaseApos(e.eventos, e.anoFiscal);
  const vp = deNumero(e.vpCotaFim);
  const flags: string[] = [];
  if (e.pl !== null && e.pl <= 0) flags.push('pl_nao_positivo');
  return {
    vpCotaFim: vp,
    rendCota: e.rendCotaAno,
    fatorAjusteHoje: fator,
    vpaAjHoje: mapearValor(vp, (x) => x / fator),
    dpaAjHoje: e.rendCotaHoje,
    flags,
  };
}
