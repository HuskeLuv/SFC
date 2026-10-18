/**
 * Nº de ações VIGENTE da empresa para os múltiplos do dia (P/L, P/VP, P/Receita…) e para o valor de
 * mercado do Quadro — a MESMA contagem nos dois (backtest 18/10/2026, A6–A8). Função pura.
 *
 * 1. Contagem mais recente com total, exceto a 'alerta' DESMENTIDA pelo LPA: desvia mais de
 *    ALERTA_DESVIO_MIN da última 'ok' (× eventos entre as datas) e o nº implícito pelo LPA publicado
 *    (total ÷ razaoLpa) bate com essa 'ok' a ±ALERTA_LPA_TOL. TEND3 ITR 2T26: tesouraria errada
 *    (65,1 mi) ⇒ 57,4 mi ações, razaoLpa 0,455 ⇒ implícito 126,1 mi ≈ 122,6 mi do 1T26 ⇒ vale o
 *    1T26. Uma 'alerta' em geral NÃO é descartada: ORVR3 (137,3 mi, follow-on), SIMH3 (583,8 mi,
 *    grupamento + emissão) e MOVI3 (401,0 mi) estão certas e só não batem com o LPA da CVM.
 *    Sem LPA para conferir (razão LPA nula ou ≤ 0: prejuízo, sinal trocado), a 'alerta' que destoa
 *    mais de ALERTA_DESVIO_MIN da 'ok' imediatamente anterior e recente (≤ ALERTA_OK_RECENTE_DIAS,
 *    × eventos) também sai: RAIZ4 ITR 2T26 com ON 4,50 bi + PN 51 mi = 4,55 bi contra 10,34 bi no
 *    DFP de 31/03/2026 (B3: 10,35 bi) ⇒ vale o DFP; VM R$ 1,68 bi → 3,83 bi. Na base de 18/10 é o
 *    único caso do universo.
 * 2. Regra 13 (salto contra o último DFP 'ok' sem evento que explique — os eventos que estão numa
 *    contagem e não na outra, fatorEventosEntreContagens) e "não verificável" como antes ⇒ sem
 *    contagem (múltiplos por ação ausentes, Índice incompleto).
 * 3. Eventos que a contagem ainda NÃO reflete (eventoRefletidoNaContagem) multiplicam on/pn/total:
 *    ORVR3 ×4 em 11/08/2026 sobre a contagem de 30/06 (P/L 54,6 → 218,6); ENJU3 ×0,1 em 09/10/2026.
 *    A cotação é a do PRÓPRIO ticker (`dataPreco`): evento depois dela não vale para ela — nem o que
 *    a contagem ainda não reflete (não se aplica) nem o que já reflete (desfaz-se, para a contagem
 *    ficar no regime de ações da cotação). Cotação congelada (fora do Quadro, na página do ativo):
 *    AMBP3 cotação de 30/12/2024 e ×10 em 05/08/2025 ⇒ VM 21,7 bi, não 216,7 bi; LUPA3 R$ 1,00 de
 *    30/12/2025 e ×0,1 de 14/08/2026 já no ITR de 30/06 ⇒ 47,3 mi ações, não 4,7 mi.
 * 4. Escala de milhares pelo volume: ações negociadas por dia acima de GIRO_DIARIO_MAX do total
 *    (INEP3: ~62 mil ações/dia contra 54.399 "ações" do ITR) ⇒ contagem em milhares ⇒ ×1000.
 *    O LPA da CVM vem na mesma escala errada, por isso a razão LPA não pega.
 */
import {
  eventoAjustaSerie,
  saltoAcoesSemEvento,
} from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import type {
  ContagemAcoes,
  EventoCorporativoVerificado,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

/** Desvio mínimo da 'alerta' contra a última 'ok' para o LPA poder desmenti-la (20%). */
const ALERTA_DESVIO_MIN = 0.2;
/** Implícito pelo LPA a ±5% da última 'ok' ⇒ a 'ok' é que vale. */
const ALERTA_LPA_TOL = 0.05;
/** A contagem já saltou ≈ o fator do evento contra a anterior (±25%) ⇒ já o reflete. */
const SALTO_REFLETE_TOL = 0.25;
/** 'ok' até ~13 meses antes da 'alerta' conta como referência recente sem LPA. */
const ALERTA_OK_RECENTE_DIAS = 400;
/** Giro diário máximo plausível (ações negociadas/dia ÷ ações totais). */
const GIRO_DIARIO_MAX = 0.5;
const ESCALA_MILHARES = 1000;

export type EventoParaContagem = Pick<
  EventoCorporativoVerificado,
  'dataEvento' | 'fator' | 'status' | 'anoBase' | 'razaoCvm'
>;

export const FLAG_ALERTA_DESMENTIDA = 'acoes_alerta_lpa_confirma_anterior';
export const FLAG_ALERTA_SEM_LPA_DESTOA = 'acoes_alerta_sem_lpa_destoa_ok';
export const FLAG_EVENTO_POSTERIOR = 'acoes_evento_apos_contagem';
export const FLAG_ESCALA_VOLUME = 'acoes_escala_x1000_volume';
export const FLAG_PRECO_ANTES_EVENTO = 'acoes_cotacao_anterior_evento';

/**
 * O evento já está no nº de ações da contagem `c`?
 *  - confirmado PELA razão de ações (razaoCvm ≠ null): está nas contagens dos anos depois de
 *    anoBase e, no ano anoBase, na última do ano (a que o confirmou) e nas de data ≥ a do evento —
 *    a última pode ser de data anterior ao evento quando o ITR foi entregue depois dele (LUPA3 ×0,1
 *    em 14/08/2026 já no ITR de 30/06) e a do fim do ano anterior para jan/fev (SLCE3 2026-01-02 no
 *    DFP 2025); evento de dezembro com anoBase no ano seguinte (CYRE3 2025-12-30) não está no DFP;
 *  - confirmado pela COTAÇÃO (razaoCvm null, posterior à última contagem verificada): só nas
 *    contagens de data ≥ a do evento — ou quando a própria contagem já saltou ≈ o fator contra a
 *    anterior (`anterior`: contagem 'nao_verificavel', que a verificação não usa, entregue depois
 *    do evento: AZTE3 ×0,1 de 09/07/2026 e ITR de 30/06 com 40,0 mi contra 339,1 mi).
 */
export function eventoRefletidoNaContagem(
  e: EventoParaContagem,
  c: ContagemRef,
  anterior?: Pick<ContagemAcoes, 'total'> | null,
): boolean {
  const anoContagem = Number(c.data.slice(0, 4));
  if (e.razaoCvm !== null) {
    if (e.anoBase !== anoContagem) return e.anoBase < anoContagem;
    // ano anoBase: a última contagem do ano (a que confirmou o evento) e as de data ≥ a do evento;
    // uma anterior do mesmo ano não (VIVR3 ×0,1 de 11/06/2026: no ITR de 30/06, não no de 31/03)
    return e.dataEvento <= c.data || (c.ultimaDoAno ?? true);
  }
  if (e.dataEvento <= c.data) return true;
  if (anterior?.total && anterior.total > 0 && c.total && c.total > 0) {
    return (
      Math.abs(Math.log(c.total / anterior.total / e.fator)) <= Math.log(1 + SALTO_REFLETE_TOL)
    );
  }
  return false;
}

/** Contagem vista pelos eventos: `ultimaDoAno` = não há contagem posterior no mesmo ano. */
export interface ContagemRef {
  data: string;
  total: number | null;
  ultimaDoAno?: boolean;
}

/** ContagemRef de `c` dentro da série da empresa. */
export function contagemRef(c: ContagemAcoes, contagens: readonly ContagemAcoes[]): ContagemRef {
  const ano = c.data.slice(0, 4);
  return {
    data: c.data,
    total: c.total,
    ultimaDoAno: !contagens.some(
      (x) => x.data > c.data && x.data.startsWith(ano) && x.total !== null && x.total > 0,
    ),
  };
}

/** Π dos eventos que ajustam série, até `dataRef`, ainda não refletidos na contagem. */
export function fatorEventosAposContagem(
  eventos: readonly EventoParaContagem[],
  c: ContagemRef,
  dataRef: string,
  anterior?: Pick<ContagemAcoes, 'total'> | null,
): number {
  let f = 1;
  for (const e of eventos) {
    if (!eventoAjustaSerie(e.status) || e.dataEvento > dataRef) continue;
    if (eventoRefletidoNaContagem(e, c, anterior)) continue;
    f *= e.fator;
  }
  return f;
}

/**
 * Π dos eventos posteriores à cotação (`dataPreco` < dataEvento ≤ `dataRef`) que a contagem JÁ
 * reflete — o que se divide para voltar ao nº de ações da data da cotação (LUPA3 ×0,1 de 14/08/2026
 * no ITR de 30/06 com cotação de 30/12/2025 ⇒ 10).
 */
export function fatorEventosRefletidosAposPreco(
  eventos: readonly EventoParaContagem[],
  c: ContagemRef,
  dataPreco: string,
  dataRef: string,
  anterior?: Pick<ContagemAcoes, 'total'> | null,
): number {
  let f = 1;
  for (const e of eventos) {
    if (!eventoAjustaSerie(e.status) || e.dataEvento <= dataPreco || e.dataEvento > dataRef)
      continue;
    if (eventoRefletidoNaContagem(e, c, anterior)) f *= e.fator;
  }
  return f;
}

/**
 * Π dos eventos que estão na contagem `depois` e não na `antes` (eventoRefletidoNaContagem) — o
 * que explica a razão entre duas contagens. Diferente de fatorEventosEntre (só pela data): o ITR
 * entregue depois do evento já o traz (LUPA3 ×0,1 de 14/08/2026 no ITR de 30/06 ⇒ 46,7 mi → 4,7
 * mi não é salto sem evento).
 */
export function fatorEventosEntreContagens(
  eventos: readonly EventoParaContagem[],
  antes: ContagemRef,
  depois: ContagemRef,
): number {
  let f = 1;
  for (const e of eventos) {
    if (!eventoAjustaSerie(e.status)) continue;
    if (eventoRefletidoNaContagem(e, depois, antes) && !eventoRefletidoNaContagem(e, antes)) {
      f *= e.fator;
    }
  }
  return f;
}

function alertaDesmentidaPeloLpa(
  c: ContagemAcoes,
  ordenadas: readonly ContagemAcoes[],
  eventos: readonly EventoParaContagem[],
): boolean {
  if (c.status !== 'alerta' || !(c.total! > 0) || !(c.razaoLpa !== null && c.razaoLpa > 0)) {
    return false;
  }
  const ref = ordenadas.find((x) => x.data < c.data && x.status === 'ok' && x.total! > 0);
  if (!ref) return false;
  const esperado =
    ref.total! *
    fatorEventosEntreContagens(eventos, contagemRef(ref, ordenadas), contagemRef(c, ordenadas));
  if (!(esperado > 0)) return false;
  if (Math.abs(c.total! / esperado - 1) <= ALERTA_DESVIO_MIN) return false;
  const implicito = c.total! / c.razaoLpa;
  return Math.abs(implicito / esperado - 1) <= ALERTA_LPA_TOL;
}

const diasEntre = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

/** 'alerta' sem LPA que a confirme (razão nula ou ≤ 0) e longe da 'ok' recente anterior. */
function alertaSemLpaDestoaDaOk(
  c: ContagemAcoes,
  ordenadas: readonly ContagemAcoes[],
  eventos: readonly EventoParaContagem[],
): boolean {
  if (c.status !== 'alerta' || !(c.total! > 0) || (c.razaoLpa !== null && c.razaoLpa > 0)) {
    return false;
  }
  const ref = ordenadas.find((x) => x.data < c.data && x.total! > 0);
  if (!ref || ref.status !== 'ok' || diasEntre(ref.data, c.data) > ALERTA_OK_RECENTE_DIAS) {
    return false;
  }
  const esperado =
    ref.total! *
    fatorEventosEntreContagens(eventos, contagemRef(ref, ordenadas), contagemRef(c, ordenadas));
  return esperado > 0 && Math.abs(c.total! / esperado - 1) > ALERTA_DESVIO_MIN;
}

export interface EntradaContagemVigente {
  contagens: readonly ContagemAcoes[];
  eventos: readonly EventoParaContagem[];
  dataRef: string;
  /**
   * data da cotação usada com a contagem (último pregão do ticker); anterior a `dataRef` em ativo de
   * cotação congelada. Sem ela, a cotação é de `dataRef`.
   */
  dataPreco?: string | null;
  /** ações (equivalentes) negociadas por dia no ticker; sem ela, não confere a escala */
  acoesNegociadasDia?: number | null;
}

export interface ContagemVigente {
  /** contagem dos múltiplos e do valor de mercado (ajustada); null = sem nº de ações validado */
  contagem: ContagemAcoes | null;
  /** contagem mais recente aceita, como gravada (bloco C R1 usa a bruta) */
  maisRecente: ContagemAcoes | null;
  /** Π eventos aplicados sobre a contagem (1 = nenhum); inclui o inverso dos desfeitos pela cotação */
  fatorEventos: number;
  /** 1 ou 1000 (escala de milhares pelo volume) */
  escala: number;
  flags: string[];
}

export function contagemVigente(e: EntradaContagemVigente, p: ScoringParams): ContagemVigente {
  const flags: string[] = [];
  const ordenadas = [...e.contagens]
    .filter((c) => c.total !== null)
    .sort((a, b) => b.data.localeCompare(a.data));
  let maisRecente: ContagemAcoes | null = null;
  for (const c of ordenadas) {
    if (alertaDesmentidaPeloLpa(c, ordenadas, e.eventos)) {
      if (!flags.includes(FLAG_ALERTA_DESMENTIDA)) flags.push(FLAG_ALERTA_DESMENTIDA);
      continue;
    }
    if (alertaSemLpaDestoaDaOk(c, ordenadas, e.eventos)) {
      if (!flags.includes(FLAG_ALERTA_SEM_LPA_DESTOA)) flags.push(FLAG_ALERTA_SEM_LPA_DESTOA);
      continue;
    }
    maisRecente = c;
    break;
  }
  // regra 13 também na contagem dos múltiplos do dia: salto contra o último DFP validado que os
  // eventos confirmados não explicam ⇒ sem nº de ações (múltiplos por ação ausentes, Índice
  // incompleto) em vez de múltiplos 1000× errados (PSSA3/BEES3/RAPT4 2026)
  const refDfp = maisRecente
    ? (ordenadas.find(
        (c) =>
          c.total! > 0 &&
          c.data < maisRecente!.data &&
          !c.fonte.startsWith('itr') &&
          c.status === 'ok',
      ) ?? null)
    : null;
  const saltoSemEvento =
    maisRecente !== null &&
    refDfp !== null &&
    saltoAcoesSemEvento(
      refDfp.total!,
      maisRecente.total!,
      fatorEventosEntreContagens(
        e.eventos,
        contagemRef(refDfp, ordenadas),
        contagemRef(maisRecente, ordenadas),
      ),
      p,
    );
  if (saltoSemEvento) flags.push('salto_acoes_sem_evento');
  // sem DFP anterior validado ('ok') para servir de referência: a contagem mais recente só vale se
  // ela mesma bater com lucro × LPA publicado (status 'ok'); senão sem nº de ações
  const naoVerificavel = maisRecente !== null && refDfp === null && maisRecente.status !== 'ok';
  if (naoVerificavel) flags.push('acoes_nao_verificavel');
  const base = saltoSemEvento || naoVerificavel ? null : maisRecente;
  if (!base) return { contagem: null, maisRecente, fatorEventos: 1, escala: 1, flags };

  const anterior = ordenadas.find((c) => c.data < base.data && c.total! > 0) ?? null;
  const ref = contagemRef(base, ordenadas);
  const dataPreco = e.dataPreco && e.dataPreco < e.dataRef ? e.dataPreco : e.dataRef;
  const fatorAplicado = fatorEventosAposContagem(e.eventos, ref, dataPreco, anterior);
  const fatorDesfeito = fatorEventosRefletidosAposPreco(
    e.eventos,
    ref,
    dataPreco,
    e.dataRef,
    anterior,
  );
  if (fatorAplicado !== 1) flags.push(FLAG_EVENTO_POSTERIOR);
  if (fatorDesfeito !== 1) flags.push(FLAG_PRECO_ANTES_EVENTO);
  const fatorEventos = fatorAplicado / fatorDesfeito;
  let escala = 1;
  const giro = e.acoesNegociadasDia ?? null;
  const total = base.total! * fatorEventos;
  if (
    giro !== null &&
    giro > 0 &&
    total > 0 &&
    !base.fonte.endsWith('_x1000') &&
    giro > total * GIRO_DIARIO_MAX &&
    giro <= total * ESCALA_MILHARES * GIRO_DIARIO_MAX
  ) {
    escala = ESCALA_MILHARES;
    flags.push(FLAG_ESCALA_VOLUME);
  }
  const f = fatorEventos * escala;
  const contagem: ContagemAcoes =
    f === 1
      ? base
      : {
          ...base,
          on: base.on === null ? null : base.on * f,
          pn: base.pn === null ? null : base.pn * f,
          total: base.total! * f,
        };
  return { contagem, maisRecente, fatorEventos, escala, flags };
}

/** Ações (equivalentes) negociadas por dia: volume médio ÷ preço × ações por unit. */
export function acoesNegociadasDia(
  resumo: { volumeMedio21: number; closeRaw: number } | null | undefined,
  fatorEquivalencia: number | null,
): number | null {
  if (!resumo || !(resumo.closeRaw > 0) || !(resumo.volumeMedio21 > 0)) return null;
  return (resumo.volumeMedio21 / resumo.closeRaw) * (fatorEquivalencia ?? 1);
}
