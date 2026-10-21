/**
 * Auditoria de proventos (regras 16 e 26 do relatório da Fase A; revisão da spec da Fase 0).
 *
 * Base: asset_dividend_history, só leitura, com os defeitos conhecidos:
 *  - BRAPI gravava a data EX no campo `dataCom` até 30/09/2026 (PETR4: ex 03/05/2024 gravada;
 *    data-com real 02/05); desde o #270 grava a data-com real (convenção por linha em dataComReal);
 *  - YAHOO grava a data EX na coluna `date` e não tem pagamento (repositorio.proventos já converte
 *    pela convenção de params.sanidade.proventos.camposPorFonte);
 *  - repetição da BRAPI com outra data-com (PETR4 set/2024 2×) e, com o MESMO pagamento, a unique
 *    (symbol, date, tipo) + a soma do dividendService fazem 1 linha com valor em dobro (irreversível:
 *    só sinalizamos `possivel_soma_duplicada`);
 *  - repetição com a mesma data-com (ou deslocada 1 pregão), uma linha sem pagamento e outra paga, de
 *    valor igual ou na razão do prêmio de 10% das PN (ON e PN misturadas: CEBR5) ⇒ duplicata
 *    (marcarRepeticoesSemPagamento);
 *  - DIVIDENDO/JCP/RENDIMENTO que repete uma REST CAP DIN/AMORTIZAÇÃO ⇒ tipo_excluido
 *    (marcarCopiasDeRestituicao). Diagnóstico: docs/analise-ativos/fase1/diagnostico-dy-absurdo.md;
 *  - backtest de 18/10/2026 (docs/analise-ativos/backtest-out2026/ATIVACAO.md): soma de proventos de
 *    datas-com diferentes numa linha (marcarSomasDeParcelas), total declarado + parcelas
 *    (marcarTotalEParcelas), o mesmo JCP com outro pagamento ou a data-com 1 pregão depois, classe
 *    irmã pela linha COM pagamento, fantasmas de FII (marcarFantasmasFii) e a soma sem as parcelas
 *    (temSomaSuspeitaNaJanela, só selo).
 * Data-com real = a gravada (BRAPI pós-#270) ou o pregão B3 anterior à data ex (YAHOO e legado BRAPI).
 * Nunca usa o pagamento como fallback de data-com.
 * Ajuste a hoje POR EVENTO: valor ÷ Π eventos confirmados com data > data-com (MGLU3 2020 teve
 * proventos antes e depois do 4:1 no mesmo ano). Funções puras.
 *
 * fundamentei-regras (F2, A4.b/A4.c; desenho docs/analise-ativos/fundamentei-regras/desenho.json):
 * janelas do DY/DPA de AÇÕES pela regra da scoring_params (regrasCalculoDe), padrões = hoje —
 *  - baseJanelaDy 'ex': data-ex = pregão seguinte à data-com real (dataExDoProvento; vale também
 *    para a YAHOO, cuja data-com real já é o pregão anterior à data ex gravada);
 *  - cortarFuturos: data-ex > hoje fora do DPA do ano (proventos anunciados e ainda não 'ex');
 *  - dpaPorExercicio: exercício fora de dezembro soma [dtIni, dtFim] do FY, não o ano civil.
 * FII (rendimento12m 'fii', 'rend' do critério) segue por data-com nesta entrega.
 */
import { eventoAjustaSerie } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import {
  distanciaEmPregoes,
  pregaoAnterior,
  pregaoSeguinte,
} from '@/services/analiseAtivos/regras/comum/pregoes';
import {
  regrasCalculoDe,
  type BaseJanelaDy,
} from '@/services/analiseAtivos/params/scoringParamsSchema';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type {
  CoberturaProventos,
  EventoCorporativoVerificado,
  ProventoAuditado,
  ProventoBruto,
  ScoringParams,
  Valor,
} from '@/services/analiseAtivos/tipos';

type TipoNormalizado = ProventoAuditado['tipoNormalizado'];
type EventoParaAjuste = Pick<
  EventoCorporativoVerificado,
  'dataEvento' | 'fator' | 'status' | 'anoBase'
>;

/** Provento auditado com o rastro que vai para AssetProventoAuditado. */
export interface ProventoAuditadoCompleto extends ProventoAuditado {
  source: string;
  tipoOriginal: string;
  dataExGravada: string | null;
  dataExOrigem: ProventoBruto['dataExOrigem'];
  valorAjustadoHoje: number;
}

const TIPOS_NORMALIZADOS: readonly TipoNormalizado[] = [
  'DIVIDENDO',
  'JCP',
  'RENDIMENTO',
  'AMORTIZACAO',
  'REST_CAP',
  'OUTRO',
];

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim();
}

const DIA_MS = 24 * 60 * 60 * 1000;
function ms(data: string): number {
  return Date.UTC(
    Number(data.slice(0, 4)),
    Number(data.slice(5, 7)) - 1,
    Number(data.slice(8, 10)),
  );
}
function diasEntre(a: string, b: string): number {
  return Math.abs(ms(a) - ms(b)) / DIA_MS;
}

/**
 * Mesmo valor até o arredondamento da fonte (backtest 18/10/2026): a BRAPI repete a parcela com 6 ou
 * 8 casas (FLRY3 0,13027153132 × 0,13027152; 0,40073265756 × 0,400733) — 5e-6 relativo.
 */
function mesmoValor(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-8, 5e-6 * Math.max(Math.abs(a), Math.abs(b)));
}

/**
 * Meses ('AAAA-MM') do informe mensal da CVM com o DY do mês informado: `semRendimento` = todas as
 * versões do mês com DY 0; `comRendimento` = alguma versão com DY > 0. Mês sem DY (nulo, saneado) não
 * entra em nenhum. Backtest 18/10/2026: prova de distribuição para os fantasmas de FII (A2) e para a
 * base de proventos incompleta no critério de meses (A5/M7).
 */
export function mesesDyCvm(
  meses: ReadonlyArray<{ refMonth: string; dyMesCvmPct?: number | null }>,
): { semRendimento: Set<string>; comRendimento: Set<string> } {
  const com = new Set<string>();
  const zero = new Set<string>();
  for (const m of meses) {
    const dy = m.dyMesCvmPct;
    if (typeof dy !== 'number' || !Number.isFinite(dy)) continue;
    const mes = m.refMonth.slice(0, 7);
    if (dy > 0) com.add(mes);
    else zero.add(mes);
  }
  for (const mes of com) zero.delete(mes);
  return { semRendimento: zero, comRendimento: com };
}

/** Datas a até `max` pregões uma da outra (só conta pregões quando estão a ≤ 7 dias corridos). */
/** Datas-com a ≥ 2 meses: provento de outro período (ver isenção dos JCPs trimestrais). */
const DUPLICATA_DATA_COM_MESES_DIAS = 60;

function vizinhas(a: string, b: string, max = 1): boolean {
  if (a === b) return true;
  if (diasEntre(a, b) > 7) return false;
  return distanciaEmPregoes(a, b) <= max;
}

/** Tipo pelo mapa de params (sem diferenciar acento/caixa); desconhecido ⇒ params.tipoDesconhecido. */
export function normalizarTipo(
  tipo: string,
  p: ScoringParams,
): { tipo: TipoNormalizado; conhecido: boolean } {
  const cfg = p.sanidade.proventos;
  const direto = cfg.mapaTipos[tipo];
  const alvo = semAcento(tipo);
  const achado =
    direto ?? Object.entries(cfg.mapaTipos).find(([k]) => semAcento(k) === alvo)?.[1] ?? null;
  if (achado && (TIPOS_NORMALIZADOS as readonly string[]).includes(achado)) {
    return { tipo: achado as TipoNormalizado, conhecido: true };
  }
  const fallback = (TIPOS_NORMALIZADOS as readonly string[]).includes(cfg.tipoDesconhecido)
    ? (cfg.tipoDesconhecido as TipoNormalizado)
    : 'OUTRO';
  return { tipo: fallback, conhecido: false };
}

/**
 * Data-com real de uma linha bruta ('ex' ⇒ pregão anterior à data gravada; 'com' ⇒ a própria).
 *
 * Rodada 3 (02/10/2026): desde o #270 (30/09/2026) o campo dataCom da BRAPI guarda a data-com real
 * (lastDatePrior) — o sync grava assim e o script corrigir-datacom-proventos.ts reescreveu as linhas
 * antigas que a BRAPI ainda devolve. Recuar mais 1 pregão punha a data-com 1 pregão cedo (queda de
 * preço 2 pregões depois: LOGG3, BMKS3, BALM4, CEBR5). As linhas antigas SEM pagamento que a
 * correção não alcança (chave mudou quando a BRAPI passou a informar o pagamento) já tinham a
 * data-com: conferência no dev com a BRAPI em 02/10/2026, 40 símbolos — 674 linhas antigas com
 * pagamento a ≤ 1 dia da data gravada batem com lastDatePrior e nenhuma com exDate.
 * Convenção pelo CAMPO de origem da data:
 *  - `dataCom` (BRAPI) ⇒ convencaoDataComAtual[fonte] ('com');
 *  - `date` (YAHOO: a coluna date é a data ex) ⇒ convencaoDataCom[fonte] ('ex').
 * Sem o campo (chamadas antigas) vale convencaoDataCom[fonte].
 */
export function dataComReal(
  dataExGravada: string | null,
  source: string,
  p: ScoringParams,
  linha?: Pick<ProventoBruto, 'dataExOrigem'>,
): string | null {
  if (!dataExGravada) return null;
  const cfg = p.sanidade.proventos;
  const legado = cfg.convencaoDataCom[source] ?? 'ex';
  const conv =
    linha?.dataExOrigem === 'dataCom' ? (cfg.convencaoDataComAtual[source] ?? legado) : legado;
  return conv === 'ex' ? pregaoAnterior(dataExGravada) : dataExGravada;
}

/** Π dos eventos confirmados com data > `data` (ajuste a hoje de um provento). */
function fatorApos(eventos: EventoParaAjuste[], data: string | null): number {
  if (!data) return 1;
  return eventos
    .filter((e) => eventoAjustaSerie(e.status) && e.dataEvento > data)
    .reduce((acc, e) => acc * e.fator, 1);
}

/** Espécie pelo sufixo do ticker B3: 3 = ON; 4 a 8 = PN; o resto (units 11, recibos) = outra. */
export function especieDoTicker(symbol: string): 'ON' | 'PN' | 'outra' {
  const m = /^[A-Z0-9]{4}(\d{1,2})$/.exec(symbol.toUpperCase());
  if (!m) return 'outra';
  const n = Number(m[1]);
  if (n === 3) return 'ON';
  if (n >= 4 && n <= 8) return 'PN';
  return 'outra';
}

/**
 * Linha "sem pagamento": a BRAPI não informou paymentDate e o app gravou outra data no campo de
 * pagamento. Legado (antes de 30/09/2026): a mesma data nas duas colunas (4.752 linhas no dev com as
 * datas iguais; 767 a −1 dia, legado 2009–2014 gravado com fuso). Sync atual: data-com real em
 * dataCom e a data ex (o pregão seguinte, às vezes 3–4 dias corridos depois) no pagamento. Pagamento
 * a ≤ 1 pregão da data-com não existe na B3 (liquidação D+2), então |pagamento − data gravada| ≤ 1
 * dia OU pagamento até o pregão seguinte à data gravada = sem pagamento. Só vale para a fonte cuja
 * data vem do campo dataCom (BRAPI).
 */
export function semPagamento(
  i: Pick<ProventoAuditadoCompleto, 'dataExOrigem' | 'dataPagamento' | 'dataExGravada'>,
): boolean {
  if (i.dataExOrigem !== 'dataCom' || i.dataPagamento === null || i.dataExGravada === null) {
    return false;
  }
  return (
    diasEntre(i.dataPagamento, i.dataExGravada) <= 1 ||
    (i.dataPagamento > i.dataExGravada && distanciaEmPregoes(i.dataExGravada, i.dataPagamento) <= 1)
  );
}

const TIPOS_RESTITUICAO: readonly TipoNormalizado[] = ['REST_CAP', 'AMORTIZACAO'];

/**
 * Cópia de restituição de capital (diagnóstico 02/10/2026): a fonte publica o MESMO evento como
 * REST CAP DIN/AMORTIZAÇÃO e de novo como DIVIDENDO/JCP/RENDIMENTO — mesmo símbolo, data-com a
 * ≤ janelaDias e valor igual (±tolPct). A fonte distingue o tipo, então a cópia sai do provento
 * (status tipo_excluido, flag 'copia_de_restituicao', duplicataDe = a linha de restituição).
 * MELK3 18/03/2025 (0,7343 REST CAP DIN × 0,7343 DIVIDENDO), RBIR11 31/08/2023.
 */
function marcarCopiasDeRestituicao(itens: ProventoAuditadoCompleto[], p: ScoringParams): void {
  const cfg = p.sanidade.proventos.copiaRestituicao;
  const restituicoes = itens.filter(
    (i) => TIPOS_RESTITUICAO.includes(i.tipoNormalizado) && i.dataComReal && i.valor > 0,
  );
  if (restituicoes.length === 0) return;
  for (const i of itens) {
    if (i.status !== 'valido' || !i.dataComReal) continue;
    const r = restituicoes.find(
      (x) =>
        x.symbol === i.symbol &&
        diasEntre(x.dataComReal!, i.dataComReal!) <= cfg.janelaDias &&
        Math.abs(i.valor / x.valor - 1) <= cfg.tolPct / 100,
    );
    if (!r) continue;
    i.status = 'tipo_excluido';
    i.duplicataDe = r.origemId;
    i.flags.push('copia_de_restituicao');
  }
}

/**
 * Repetição sem pagamento (diagnóstico 02/10/2026): mesmo símbolo e tipo, data-com igual ou a até
 * `duplicataSemPagamento.pregoesDataCom` pregões (1); uma linha SEM pagamento (semPagamento) e outra
 * COM pagamento. A unique (symbol, date, tipo) do app deixa as duas entrarem porque a "data de
 * pagamento" difere. Critério conservador:
 *  - valor igual (±duplicataSemPagamento.tolPct, 2%): a linha sem pagamento é a duplicata
 *    (KEPL3 15/12/2025 0,1442 × 2; NATU3 mar/2024; LUXM4 abr/2026) — flag 'duplicata_sem_pagamento';
 *  - ações, valores a menos de 1 + premioPreferencialPct (10%, art. 17 §1º da Lei 6.404)
 *    ±premioTolPct um do outro: a fonte mistura no ticker o valor de OUTRA classe da mesma empresa
 *    (ON, PNA, PNB). Fica a linha COM pagamento — flag 'duplicata_classe_irma'. Backtest 18/10/2026
 *    (B3, suplemento por ISIN): qual classe tem o prêmio muda por empresa — Banrisul: PNA com prêmio
 *    (0,46253751 × ON = PNB = 0,44004976 em 26/12/2025, razão 1,051); CEB e Coelba: PNB com prêmio e
 *    PNA = ON (CEBR5 = 1,665744588 em 10/12/2025, CEBR6 = 1,832319047). A regra antiga (PN fica com o
 *    maior) acertava a CEBR6 e errava a BRSR6, a CEBR5 e a CEEB5; a linha com pagamento é a que a fonte
 *    publica hoje para o ISIN do ticker e bate com a B3 nos três.
 * Data-com deslocada (prod 02/10/2026): a BRAPI repete a parcela com a data-com 1 pregão depois e o
 * "pagamento" = data gravada (CPFE3 3,7315 com data-com 28/04 paga em 31/12 × 29/04 sem pagamento;
 * CEEB5 4,2018 × 4,2554 em 28–29/10/2025). O par mais próximo (mesma data-com primeiro) decide.
 * Valores diferentes fora dessas razões (tranches, complementos) e linhas que TÊM pagamento (cronograma
 * real: CPFE3 1,1282/0,1302/0,2170/0,6075 em 29/04/2026) NÃO são tocados.
 */
function marcarRepeticoesSemPagamento(
  itens: ProventoAuditadoCompleto[],
  p: ScoringParams,
  classe: 'acao' | 'fii' | undefined,
): void {
  const cfg = p.sanidade.proventos.duplicataSemPagamento;
  const tol = cfg.tolPct / 100;
  const premio = 1 + cfg.premioPreferencialPct / 100;
  const tolPremio = cfg.premioTolPct / 100;
  const maxPregoes = cfg.pregoesDataCom;
  const grupos = new Map<string, ProventoAuditadoCompleto[]>();
  for (const i of itens) {
    if (i.status !== 'valido' || !i.dataComReal) continue;
    const k = `${i.symbol}|${i.tipoNormalizado}`;
    const g = grupos.get(k);
    if (g) g.push(i);
    else grupos.set(k, [i]);
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    g.sort(
      (a, b) =>
        a.dataComReal!.localeCompare(b.dataComReal!) || a.origemId.localeCompare(b.origemId),
    );
    for (const x of g.filter(semPagamento)) {
      if (x.status !== 'valido') continue;
      const candidatos = g
        .filter(
          (y) =>
            y !== x &&
            Math.abs(ms(y.dataComReal!) - ms(x.dataComReal!)) <= 15 * DIA_MS &&
            y.status === 'valido' &&
            !semPagamento(y) &&
            y.valor > 0,
        )
        .map((y) => ({ y, d: distanciaEmPregoes(x.dataComReal!, y.dataComReal!) }))
        .filter((c) => c.d <= maxPregoes)
        .sort((a, b) => a.d - b.d);
      for (const { y } of candidatos) {
        const razao = x.valor / y.valor;
        if (Math.abs(razao - 1) <= tol) {
          x.status = 'duplicata';
          x.duplicataDe = y.origemId;
          x.flags.push('duplicata_sem_pagamento');
          break;
        }
        const q = Math.max(razao, 1 / razao);
        const ehClasseIrma = classe !== 'fii' && q > 1 + tol && q <= premio * (1 + tolPremio);
        if (!ehClasseIrma) continue;
        // fica a linha COM pagamento (y); sai a sem pagamento (x), da outra classe
        x.status = 'duplicata';
        x.duplicataDe = y.origemId;
        x.flags.push('duplicata_classe_irma');
        break;
      }
    }
  }
}

export function auditarProventos(
  brutos: ProventoBruto[],
  eventos: EventoParaAjuste[],
  p: ScoringParams,
  opts?: {
    classe?: 'acao' | 'fii';
    /** FII: meses 'AAAA-MM' em que o informe mensal da CVM tem DY do mês = 0 (fantasmas, A2) */
    mesesSemRendimentoCvm?: ReadonlySet<string>;
  },
): ProventoAuditadoCompleto[] {
  const cfg = p.sanidade.proventos;
  const itens: ProventoAuditadoCompleto[] = brutos.map((b) => {
    const { tipo, conhecido } = normalizarTipo(b.tipo, p);
    const com = dataComReal(b.dataExGravada, b.source, p, b);
    const flags: string[] = [];
    if (!conhecido) flags.push('tipo_desconhecido');
    if (b.dataPagamento === null) flags.push('sem_data_pagamento');
    let status: ProventoAuditado['status'] = 'valido';
    const tiposClasse =
      opts?.classe === 'acao' ? cfg.tiposAcao : opts?.classe === 'fii' ? cfg.tiposFii : null;
    if (
      !conhecido ||
      tipo === 'OUTRO' ||
      cfg.tiposExcluidos.includes(tipo) ||
      (tiposClasse !== null && !tiposClasse.includes(tipo))
    ) {
      status = 'tipo_excluido';
    } else if (com === null) {
      status = 'sem_data_com';
    }
    const fator = fatorApos(eventos, com);
    return {
      origemId: b.id,
      symbol: b.symbol,
      source: b.source,
      tipoOriginal: b.tipo,
      tipoNormalizado: tipo,
      valor: b.valor,
      dataPagamento: b.dataPagamento,
      dataExGravada: b.dataExGravada,
      dataExOrigem: b.dataExOrigem,
      dataComReal: com,
      status,
      duplicataDe: null,
      fatorAjusteHoje: fator,
      valorAjustadoHoje: fator > 0 ? b.valor / fator : b.valor,
      flags,
    };
  });

  // Fonte secundária (YAHOO) só quando não há provento da preferida (BRAPI) do símbolo no ano
  if (cfg.fonteSecundariaSomenteSemPreferidaNoAno) {
    const anosPreferida = new Set(
      itens
        .filter((i) => i.source === cfg.fontePreferida && i.status === 'valido' && i.dataComReal)
        .map((i) => `${i.symbol}|${i.dataComReal!.slice(0, 4)}`),
    );
    for (const i of itens) {
      if (i.status !== 'valido' || i.source === cfg.fontePreferida || !i.dataComReal) continue;
      if (anosPreferida.has(`${i.symbol}|${i.dataComReal.slice(0, 4)}`)) {
        i.status = 'fonte_secundaria_descartada';
      }
    }
  }

  marcarCopiasDeRestituicao(itens, p);
  marcarRepeticoesSemPagamento(itens, p, opts?.classe);

  // Duplicatas: mesmo símbolo+tipo+valor, data-com diferente e pagamentos a ≤ N dias
  const validos = itens
    .filter((i) => i.status === 'valido')
    .sort(
      (a, b) =>
        (a.dataComReal ?? '').localeCompare(b.dataComReal ?? '') ||
        a.origemId.localeCompare(b.origemId),
    );
  for (let i = 0; i < validos.length; i++) {
    const a = validos[i];
    if (a.status !== 'valido') continue;
    for (let j = i + 1; j < validos.length; j++) {
      const b = validos[j];
      if (
        b.status !== 'valido' ||
        a.symbol !== b.symbol ||
        a.tipoNormalizado !== b.tipoNormalizado
      ) {
        continue;
      }
      if (!mesmoValor(a.valor, b.valor)) continue;
      if (a.dataPagamento === null || b.dataPagamento === null) continue;
      const dias = diasEntre(a.dataPagamento, b.dataPagamento);
      if (a.dataComReal !== b.dataComReal) {
        // mesmo pagamento com datas-com diferentes (e não vizinhas) é o caso que a chave antiga
        // somava: desde o backtest de 18/10/2026 são linhas distintas e LEGÍTIMAS (ISAE4 0,141311 em
        // 12/03, 02/04 e 17/04/2026, todos pagos em 29/04; VIVT3 0,156464828 em 27/07 e 25/09/2026)
        if (
          dias === 0 &&
          comPagamento(a) &&
          comPagamento(b) &&
          !vizinhas(a.dataComReal!, b.dataComReal!)
        ) {
          continue;
        }
        // JCPs trimestrais de mesmo valor com o pagamento agendado para a virada do ano: os
        // pagamentos caem a 1 dia (31/12 × 30/12) e as datas-com estão a meses. HYPE3 0,2925 de
        // 26/06, 26/09 e 26/12/2025, pagos em 31/12 e 30/12/2026 (a B3 tem os três). Repetição da
        // fonte vem com o valor reescrito (CEGR3 0,18105036 × 0,18105) ou pagamento a dias (CLSC4,
        // PETR4 a 3 dias) e continua duplicata.
        if (
          dias <= 1 &&
          a.valor === b.valor &&
          comPagamento(a) &&
          comPagamento(b) &&
          diasEntre(a.dataComReal!, b.dataComReal!) >= DUPLICATA_DATA_COM_MESES_DIAS
        ) {
          continue;
        }
        if (dias <= cfg.duplicataJanelaPagamentoDias) {
          b.status = 'duplicata';
          b.duplicataDe = a.origemId;
          b.flags.push('duplicata_outra_data_com');
        } else if (
          !semPagamento(a) &&
          !semPagamento(b) &&
          vizinhas(a.dataComReal!, b.dataComReal!)
        ) {
          // backtest 18/10/2026: a fonte repete o JCP com a data-com 1 pregão depois e outro
          // pagamento (ITSA4 0,0182 de 09/12/2025 pago em 06/03 × 10/12 pago em 30/04/2026; a B3
          // tem um só). Tranche real tem a MESMA data-com.
          b.status = 'duplicata';
          b.duplicataDe = a.origemId;
          b.flags.push('duplicata_data_com_deslocada');
        }
      } else if (dias < cfg.trancheMinDiasEntrePagamentos) {
        // mesma data-com, mesmo valor e pagamentos a menos de trancheMinDias: repetição (tranche real
        // vem com meses de intervalo — CMIG4 30/06 e 30/12). Backtest 18/10/2026: ITUB4 JCP de
        // 18/06/2026 pago em 28/08 e em 31/08 contava 2× (a B3 tem um). Fica o 1º pagamento.
        const [fica, sai] = b.dataPagamento < a.dataPagamento ? [b, a] : [a, b];
        for (const x of [a, b])
          if (!x.flags.includes('tranche_ambigua')) x.flags.push('tranche_ambigua');
        sai.status = 'duplicata';
        sai.duplicataDe = fica.origemId;
      }
    }
  }

  if (opts?.classe !== 'fii') {
    marcarTotalEParcelas(itens, p);
    marcarSomasDeParcelas(itens, p);
  }
  if (opts?.classe === 'fii') marcarFantasmasFii(itens, opts.mesesSemRendimentoCvm);

  // Possível soma duplicada (1 linha com valor ≈ 2× outro provento do mesmo tipo no ano)
  const tol = cfg.somaDuplicadaTolPct / 100;
  const vivos = itens.filter((i) => i.status === 'valido' && i.dataComReal);
  for (const a of vivos) {
    const anoA = a.dataComReal!.slice(0, 4);
    const achou = vivos.some(
      (b) =>
        b !== a &&
        b.symbol === a.symbol &&
        b.tipoNormalizado === a.tipoNormalizado &&
        b.dataComReal!.slice(0, 4) === anoA &&
        b.valor > 0 &&
        Math.abs(a.valor / (2 * b.valor) - 1) <= tol,
    );
    if (achou) a.flags.push('possivel_soma_duplicada');
  }
  return itens;
}

/** Linha com pagamento informado (nem "sem pagamento" do legado, nem YAHOO). */
function comPagamento(i: ProventoAuditadoCompleto): boolean {
  return i.dataPagamento !== null && !semPagamento(i);
}

/**
 * Subconjunto de `cands` (ordenadas por valor decrescente) com soma `alvo` ± `tolAbs` e pelo menos
 * `min` elementos; null se não houver ou se a busca passar de `maxNos` nós (não decide). Valores
 * positivos: poda pela soma do que resta.
 */
function subconjuntoComSoma<T extends { valor: number }>(
  cands: readonly T[],
  alvo: number,
  tolAbs: number,
  min: number,
  maxNos: number,
  aceita: (sel: readonly T[]) => boolean = () => true,
): T[] | null {
  const restoApos: number[] = new Array(cands.length + 1).fill(0);
  for (let i = cands.length - 1; i >= 0; i--) restoApos[i] = restoApos[i + 1] + cands[i].valor;
  let nos = 0;
  const sel: T[] = [];
  const busca = (i: number, falta: number): T[] | null => {
    if (++nos > maxNos) return null;
    if (Math.abs(falta) <= tolAbs && sel.length >= min && aceita(sel)) return [...sel];
    if (i >= cands.length || falta < -tolAbs || restoApos[i] < falta - tolAbs) return null;
    sel.push(cands[i]);
    const com = busca(i + 1, falta - cands[i].valor);
    sel.pop();
    if (com) return com;
    return busca(i + 1, falta);
  };
  return busca(0, alvo);
}

/**
 * Tolerância absoluta da soma: relativa ao total, com piso de 2e-6 (a fonte arredonda parcelas a 6
 * casas: BBDC4 0,297339 + 0,346895 = 0,644234 × 0,644233458).
 */
function tolSoma(total: number, tolRel: number): number {
  return Math.max(tolRel * total, 2e-6);
}

function agruparPorSimboloTipo(itens: ProventoAuditadoCompleto[]) {
  const g = new Map<string, ProventoAuditadoCompleto[]>();
  for (const i of itens) {
    if (i.status !== 'valido' || !i.dataComReal || !(i.valor > 0)) continue;
    const k = `${i.symbol}|${i.tipoNormalizado}`;
    g.set(k, [...(g.get(k) ?? []), i]);
  }
  return g.values();
}

/**
 * Total declarado + parcelas do MESMO provento (backtest 18/10/2026, A1b): a fonte publica o total e
 * também o cronograma de pagamento, com a mesma data-com (ou 1 pregão depois); a B3 lista só o total.
 * Para cada linha T COM pagamento, as candidatas a parcela são as menores, do mesmo tipo, com
 * pagamento informado até o de T e data-com a ≤ 1 pregão:
 *  - exato: ≥ 2 candidatas com pagamentos distintos somam T (± somaParcelas.tolPct) — CPFE3 28/04/2023
 *    0,4339 + 0,2604 + 0,5401 = 1,2344 (fica 1,2344 e o 0,8679 da mesma data); ABEV3 JCP de
 *    18/12/2025 0,075 + 0,0755 + 0,1185 = 0,269;
 *  - parcial: T é o MAIOR valor e o ÚLTIMO pagamento entre as linhas válidas do tipo com data-com a
 *    ≤ 1 pregão, e ≥ 2 candidatas, todas pagas ANTES de T, com pagamentos distintos, somam menos que
 *    T (CPFE3 29/04/2025: 2,7942 em 15/12 e 0,7811/0,4339/0,3211 em jun–ago; 29/04/2026: 3,7315 em
 *    31/12 e 1,1282/0,1302/0,2170/0,6075 em mai–set, data-com 30/04). Um cronograma sem o total
 *    (CPFE3 26/04/2024: 6 parcelas que somam os 2,7540 da B3) não tem esse T e fica inteiro.
 * Fica o total (a visão da B3); as parcelas saem com status duplicata, flag 'parcela_de_total'.
 */
function marcarTotalEParcelas(itens: ProventoAuditadoCompleto[], p: ScoringParams): void {
  const cfg = p.sanidade.proventos.somaParcelas;
  const tol = cfg.tolPct / 100;
  for (const grupo of agruparPorSimboloTipo(itens)) {
    if (grupo.length < 3) continue;
    const ordenado = [...grupo].sort(
      (a, b) => b.valor - a.valor || a.origemId.localeCompare(b.origemId),
    );
    for (const t of ordenado) {
      if (t.status !== 'valido' || !comPagamento(t)) continue;
      const cands = ordenado.filter(
        (y) =>
          y !== t &&
          y.status === 'valido' &&
          comPagamento(y) &&
          y.valor < t.valor * (1 - tol) &&
          y.dataPagamento! <= t.dataPagamento! &&
          vizinhas(y.dataComReal!, t.dataComReal!),
      );
      if (cands.length < 2) continue;
      const pagamentosDistintos = (sel: readonly ProventoAuditadoCompleto[]) =>
        new Set(sel.map((x) => x.dataPagamento)).size === sel.length;
      const exato = subconjuntoComSoma(
        cands,
        t.valor,
        tolSoma(t.valor, tol),
        2,
        cfg.maxNos,
        pagamentosDistintos,
      );
      const antes = cands.filter((y) => y.dataPagamento! < t.dataPagamento!);
      const vizinhanca = ordenado.filter(
        (y) => y !== t && y.status === 'valido' && vizinhas(y.dataComReal!, t.dataComReal!),
      );
      const totalPorUltimo = vizinhanca.every(
        (y) => y.valor < t.valor && (y.dataPagamento ?? '') < t.dataPagamento!,
      );
      const parcial =
        !exato &&
        totalPorUltimo &&
        antes.length >= 2 &&
        pagamentosDistintos(antes) &&
        antes.reduce((s, y) => s + y.valor, 0) < t.valor * (1 + tol)
          ? antes
          : null;
      for (const y of exato ?? parcial ?? []) {
        y.status = 'duplicata';
        y.duplicataDe = t.origemId;
        y.flags.push('parcela_de_total');
      }
    }
  }
}

/**
 * Soma de proventos de datas-com DIFERENTES gravada como uma linha (backtest 18/10/2026, A1a): a
 * chave antiga (symbol, pagamento, tipo) fazia o sync somar as parcelas pagas no mesmo dia e gravar
 * a data-com de uma delas; as linhas originais (sem pagamento, ou de outra versão da fonte) continuam
 * no banco. Linha X COM pagamento é soma quando ≥ 2 outras do mesmo tipo, menores, com ≥ 2 datas-com
 * distintas, data-com até 1 pregão depois da de X e no máximo somaParcelas.janelaDias antes, e uma
 * delas com a data-com de X (± 1 pregão), somam X (± somaParcelas.tolPct). X sai (duplicata, flag
 * 'soma_de_parcelas'). SAPR11: 1,960639691 (30/12/2025, pago 26/06/2026) = 1,4082268 (30/06/2025) +
 * 0,5524128 (30/12/2025); BBDC4: 0,644233458 (03/07/2026) = 0,297339 (07/04) + 0,346895 (06/07).
 * Quando faltam as parcelas no banco não há como provar a soma: a correção é a regravação da fonte
 * (scripts/analise-ativos/limpar-proventos-somados.ts); até lá o DY fica em conferência
 * (temSomaSuspeitaNaJanela, motivo linha_suspeita).
 */
function marcarSomasDeParcelas(itens: ProventoAuditadoCompleto[], p: ScoringParams): void {
  const cfg = p.sanidade.proventos.somaParcelas;
  const tol = cfg.tolPct / 100;
  for (const grupo of agruparPorSimboloTipo(itens)) {
    if (grupo.length < 3) continue;
    const ordenado = [...grupo].sort(
      (a, b) => b.valor - a.valor || a.origemId.localeCompare(b.origemId),
    );
    for (const x of ordenado) {
      if (x.status !== 'valido' || !comPagamento(x)) continue;
      const desde = menosDias(x.dataComReal!, cfg.janelaDias);
      const cands = ordenado.filter(
        (y) =>
          y !== x &&
          y.status === 'valido' &&
          y.valor < x.valor * (1 - tol) &&
          y.dataComReal! >= desde &&
          (y.dataComReal! <= x.dataComReal! || vizinhas(y.dataComReal!, x.dataComReal!)),
      );
      for (const ancora of cands.filter((y) => vizinhas(y.dataComReal!, x.dataComReal!))) {
        const resto = cands.filter(
          (y) => y !== ancora && !vizinhas(y.dataComReal!, ancora.dataComReal!),
        );
        const sub = subconjuntoComSoma(
          resto,
          x.valor - ancora.valor,
          tolSoma(x.valor, tol),
          1,
          cfg.maxNos,
        );
        if (!sub) continue;
        x.status = 'duplicata';
        x.duplicataDe = ancora.origemId;
        x.flags.push('soma_de_parcelas');
        break;
      }
    }
  }
}

/** 'AAAA-MM' do mês anterior. */
function mesAnterior(mes: string): string {
  return menosMeses(`${mes}-01`, 1).slice(0, 7);
}

/**
 * Rendimento "fantasma" de FII (backtest 18/10/2026, A2): a BRAPI grava linhas com data-com = data de
 * pagamento, sempre no dia 01 — a mesma assinatura do fantasma mensal da Carteira
 * (dividendService.isPhantomMonthlyRow), que nunca é evento real. Sai (duplicata, flag
 * 'fantasma_mensal') quando:
 *  - há rendimento real (não fantasma) do mesmo tipo com pagamento ou data-com no MESMO mês —
 *    RBTS11 01/12/2025 10,9084 × 7,3419 de 30/12; XLPR11 01/12/2025 × 30/12; REME11 01/04 × pago
 *    15/04; ZAVI11 01/11 e 01/12/2025; ou
 *  - o informe mensal da CVM diz que o fundo NÃO distribuiu no mês do fantasma nem no anterior
 *    (DY do mês = 0 nos dois: `mesesSemRendimentoCvm`) — RBTS11 0,2936 em mar–jun/2026 e 3,5665 em
 *    01/02/2026, meses com DY 0 na CVM.
 * Sem nenhuma das duas provas o fantasma fica (pode ser a única notícia do pagamento: BTHF11 2023).
 */
function marcarFantasmasFii(
  itens: ProventoAuditadoCompleto[],
  mesesSemRendimentoCvm: ReadonlySet<string> | undefined,
): void {
  const fantasma = (i: ProventoAuditadoCompleto) =>
    i.dataExOrigem === 'dataCom' &&
    i.dataPagamento !== null &&
    i.dataPagamento === i.dataExGravada &&
    i.dataPagamento.endsWith('-01');
  const reais = new Map<string, ProventoAuditadoCompleto>();
  for (const i of itens) {
    if (i.status !== 'valido' || !i.dataComReal || fantasma(i)) continue;
    for (const d of [i.dataPagamento, i.dataComReal]) {
      if (!d) continue;
      const k = `${i.symbol}|${i.tipoNormalizado}|${d.slice(0, 7)}`;
      if (!reais.has(k)) reais.set(k, i);
    }
  }
  for (const i of itens) {
    if (i.status !== 'valido' || !fantasma(i)) continue;
    const mes = i.dataPagamento!.slice(0, 7);
    const real = reais.get(`${i.symbol}|${i.tipoNormalizado}|${mes}`);
    const semCvm =
      mesesSemRendimentoCvm?.has(mes) === true && mesesSemRendimentoCvm.has(mesAnterior(mes));
    if (!real && !semCvm) continue;
    i.status = 'duplicata';
    i.duplicataDe = real?.origemId ?? null;
    i.flags.push('fantasma_mensal');
  }
}

/**
 * Soma que não dá para provar (backtest 18/10/2026, M9): enquanto a fonte não é regravada na chave
 * nova, a soma antiga X fica no banco e as parcelas dela não — só sobra, às vezes, a linha "sem
 * pagamento" do legado de UMA parcela, que nunca ganhou a versão paga (a versão paga entrou na soma).
 * Sinal: linha válida SEM pagamento com data-com na janela do DY 12m e há pelo menos
 * plausibilidade.orfaMinDias, e depois dela uma linha COM pagamento do mesmo tipo maior que
 * plausibilidade.orfaFator × o valor dela. Prod 17/10/2026: VIVT3 0,1142 (27/04) × 0,9607 (25/09,
 * 9 JCPs de 2026 somados); CMIG4 0,1150 (25/03) × 0,2602 (22/09); RADL3 0,0860 (07/04) × 0,1744
 * (03/07); HYPE3 0,2630 × 0,7891. Só põe o DY em conferência (motivo linha_suspeita); nada sai da
 * conta. Em prod: 11 ações, todas com soma confirmada pela B3 ou pela BRAPI de hoje.
 */
export function temSomaSuspeitaNaJanela(
  proventos: ReadonlyArray<
    Pick<
      ProventoAuditadoCompleto,
      | 'status'
      | 'tipoNormalizado'
      | 'valor'
      | 'dataComReal'
      | 'dataPagamento'
      | 'dataExGravada'
      | 'dataExOrigem'
    >
  >,
  hoje: string,
  p: ScoringParams,
): boolean {
  const cfg = p.sanidade.proventos.plausibilidade;
  if (!(cfg.orfaFator > 0)) return false;
  const de = menosMeses(hoje, p.sanidade.proventos.janelaMesesDy);
  const limite = menosDias(hoje, cfg.orfaMinDias);
  const validos = proventos.filter(
    (x) =>
      x.status === 'valido' &&
      !!x.dataComReal &&
      x.dataComReal <= hoje &&
      p.sanidade.proventos.tiposAcao.includes(x.tipoNormalizado),
  );
  return validos.some(
    (y) =>
      y.dataComReal! > de &&
      y.dataComReal! <= limite &&
      semPagamento(y) &&
      validos.some(
        (x) =>
          x !== y &&
          x.tipoNormalizado === y.tipoNormalizado &&
          x.dataPagamento !== null &&
          !semPagamento(x) &&
          x.dataComReal! > y.dataComReal! &&
          x.valor > cfg.orfaFator * y.valor,
      ),
  );
}

type ProventoParaSoma = Pick<
  ProventoAuditado,
  'tipoNormalizado' | 'status' | 'dataComReal' | 'valor'
>;

/** Data-ex de um provento (F2, A4.b): pregão B3 seguinte à data-com real; null sem data-com. */
export function dataExDoProvento(pr: Pick<ProventoAuditado, 'dataComReal'>): string | null {
  return pr.dataComReal ? pregaoSeguinte(pr.dataComReal) : null;
}

/** Data do provento na base da janela ('com' = data-com real; 'ex' = pregão seguinte). */
function dataNaBase(pr: Pick<ProventoAuditado, 'dataComReal'>, base: BaseJanelaDy): string | null {
  return base === 'ex' ? dataExDoProvento(pr) : pr.dataComReal;
}

/**
 * Opções do DPA do ano (F2 fundamentei-regras). Ausentes = o DPA de hoje (data-com no ano civil,
 * sem corte), byte a byte.
 */
export interface OpcoesDpaAno {
  /** base da janela: 'com' (padrão, hoje) | 'ex' (scoring v3) */
  baseJanela?: BaseJanelaDy;
  /** cortarFuturos (scoring v3): provento com data-ex > `cortarApos` fica fora */
  cortarApos?: string | null;
  /** dpaPorExercicio (scoring v3, exercício fora de dezembro): janela [dtIni, dtFim] */
  periodo?: { dtIni: string; dtFim: string } | null;
}

/**
 * DPA do ano por data-com (só DIVIDENDO+JCP válidos). base 'fim_do_ano': na base de ações do fim do
 * exercício (÷ eventos confirmados após a data-com e já refletidos no fim do ano: anoBase ≤ ano);
 * 'hoje': na base de hoje (÷ todos os eventos confirmados após a data-com). Com `opts` (F2), a data
 * da janela pode ser a data-ex, a janela o exercício real e a data-ex futura fica fora.
 */
export function dpaNoAno(
  proventos: ProventoParaSoma[],
  ano: number,
  base: 'fim_do_ano' | 'hoje',
  eventos: EventoParaAjuste[],
  tipos: readonly string[] = ['DIVIDENDO', 'JCP'],
  opts: OpcoesDpaAno = {},
): Valor<number> {
  const prefixo = String(ano);
  const baseJanela = opts.baseJanela ?? 'com';
  let soma = 0;
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !pr.dataComReal || !tipos.includes(pr.tipoNormalizado)) continue;
    const data = dataNaBase(pr, baseJanela)!;
    if (opts.periodo) {
      if (data < opts.periodo.dtIni || data > opts.periodo.dtFim) continue;
    } else if (data.slice(0, 4) !== prefixo) continue;
    if (opts.cortarApos && dataExDoProvento(pr)! > opts.cortarApos) continue;
    const fator = eventos
      .filter(
        (e) =>
          eventoAjustaSerie(e.status) &&
          e.dataEvento > pr.dataComReal! &&
          (base === 'hoje' || e.anoBase <= ano),
      )
      .reduce((acc, e) => acc * e.fator, 1);
    soma += pr.valor / fator;
  }
  return ok(soma);
}

/**
 * Opções do DPA de um FY de ação pela scoring_params (F2): base da janela, corte de data-ex futura
 * e exercício real fora de dezembro. Padrões da v1/v2 ⇒ {} (o DPA de hoje).
 */
export function opcoesDpaDoFy(
  f: { dtIni: string; dtFim: string },
  hoje: string,
  p: ScoringParams,
): OpcoesDpaAno {
  const r = regrasCalculoDe(p);
  const opts: OpcoesDpaAno = {};
  if (r.baseJanelaDy !== 'com') opts.baseJanela = r.baseJanelaDy;
  if (r.cortarFuturos) opts.cortarApos = hoje;
  if (r.dpaPorExercicio && f.dtFim.slice(5, 7) !== '12') {
    opts.periodo = { dtIni: f.dtIni, dtFim: f.dtFim };
  }
  return opts;
}

/** Data AAAA-MM-DD menos `meses` meses (dia limitado ao fim do mês). */
export function menosMeses(data: string, meses: number): string {
  const a = Number(data.slice(0, 4));
  const m = Number(data.slice(5, 7)) - 1 - meses;
  const d = Number(data.slice(8, 10));
  const alvoAno = a + Math.floor(m / 12);
  const alvoMes = ((m % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(alvoAno, alvoMes, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}

/**
 * Rendimento de 12 meses por data-com, janela de CALENDÁRIO (hoje − 12m, hoje] — nunca "os últimos
 * 12 registros" (regra 26). Ações: DIVIDENDO+JCP bruto; FII: RENDIMENTO+DIVIDENDO. Na base de hoje.
 * F2 (A4.b): ações com proventos.baseJanelaDy 'ex' (scoring v3) = janela pela data-ex; FII segue
 * pela data-com. O ajuste por evento continua pela data-com.
 */
export function rendimento12m(
  proventos: ProventoParaSoma[],
  hoje: string,
  classe: 'acao' | 'fii',
  eventos: EventoParaAjuste[],
  p?: ScoringParams,
): Valor<number> {
  const tipos =
    classe === 'acao'
      ? (p?.sanidade.proventos.tiposAcao ?? ['DIVIDENDO', 'JCP'])
      : (p?.sanidade.proventos.tiposFii ?? ['RENDIMENTO', 'DIVIDENDO']);
  const meses = p?.sanidade.proventos.janelaMesesDy ?? 12;
  const de = menosMeses(hoje, meses);
  const baseJanela: BaseJanelaDy = classe === 'acao' && p ? regrasCalculoDe(p).baseJanelaDy : 'com';
  let soma = 0;
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !pr.dataComReal || !tipos.includes(pr.tipoNormalizado)) continue;
    const data = dataNaBase(pr, baseJanela)!;
    if (data <= de || data > hoje) continue;
    soma += pr.valor / fatorApos(eventos, pr.dataComReal);
  }
  return ok(soma);
}

export type MotivoDefasagemProventos =
  | 'base_parada'
  | 'cobertura_antiga'
  | 'pagador_recorrente_parado';

/**
 * Frescor da base de proventos (achado qa-dados 30/09): o market_data_coverage 'OK' não diz QUANDO a
 * fonte foi consultada. Base de proventos parada ⇒ rendimento/DPA de 12 meses e meses com rendimento
 * saem SUBESTIMADOS (HGLG11: R$ 8,80 × 13,41) com cara de dado calculado. Devolve o motivo (⇒ o
 * chamador trata como ausente 'fonte_defasada') ou null:
 *  - base_parada: a data-com mais recente da CLASSE inteira é mais velha que maxDiasBase;
 *  - cobertura_antiga: lastCheckedAt do símbolo mais velho que maxDias[classe] (ou sem data);
 *  - pagador_recorrente_parado: pagou em ≥ recorrenteMinMeses[classe] meses distintos nos 12 meses
 *    anteriores ao último provento e a última data-com está mais velha que o PRAZO ESPERADO do
 *    pagador: max(maxDias[classe], maior intervalo entre data-coms nos `janelaHistoricoMeses` antes
 *    da última × `fatorIntervalo`). Não é parado quem tem parcela de declaração já feita com
 *    pagamento a partir de hoje − maxDias[classe] (inclusive futuro, até `pagamentoMaxAnos` após a
 *    data-com: o "9999-12-31 a definir" não conta). Parado há mais de `maxDiasParado` (2 anos) com
 *    a cobertura verificada = interrupção real dos proventos (DY 0 conta), não fonte defasada.
 *    Rodada 3 (02/10/2026, docs/analise-ativos/fase1/diagnostico-proventos-parados.md): a regra
 *    antiga (só maxDias) marcava 93 ações em prod com a fonte em dia — KLBN11 declarou em 15/12/2025
 *    o dividendo de 2026 inteiro em 4 parcelas (fev, mai, ago, nov/2026); semestrais/anuais que
 *    anteciparam em dez/2025 a distribuição de 2026 (CYRE3, SLCE3, DIRR3…) passaram de 200 dias sem
 *    nova data-com sem que nada estivesse faltando na fonte.
 * Sem nenhum provento e sem cobertura ⇒ null (os três estados de valorProventosComCobertura valem).
 */
export function motivoProventosDefasados(
  e: {
    classe: 'acao' | 'fii';
    proventos: Array<
      Pick<ProventoAuditado, 'status' | 'tipoNormalizado' | 'dataComReal'> &
        Partial<Pick<ProventoAuditado, 'dataPagamento'>>
    >;
    verificadoEm: string | null | undefined;
    ultimaDataComDaClasse: string | null;
    hoje: string;
  },
  p: ScoringParams,
): MotivoDefasagemProventos | null {
  const cfg = p.sanidade.proventos.frescor;
  const maxDias = cfg.maxDias[e.classe];
  if (e.ultimaDataComDaClasse && diasEntre(e.ultimaDataComDaClasse, e.hoje) > cfg.maxDiasBase) {
    return 'base_parada';
  }
  if (e.verificadoEm !== undefined) {
    if (e.verificadoEm === null || diasEntre(e.verificadoEm, e.hoje) > maxDias) {
      return 'cobertura_antiga';
    }
  }
  const tipos =
    e.classe === 'acao' ? p.sanidade.proventos.tiposAcao : p.sanidade.proventos.tiposFii;
  const validos = e.proventos.filter(
    (x) => x.status === 'valido' && x.dataComReal && tipos.includes(x.tipoNormalizado),
  );
  const datas = [...new Set(validos.map((x) => x.dataComReal!))].filter((d) => d <= e.hoje).sort();
  const ultima = datas[datas.length - 1];
  if (!ultima || diasEntre(ultima, e.hoje) <= maxDias) return null;
  // parou há anos com a fonte verificada: interrupção real (DASA3 sem provento desde dez/2022), DY 0
  if (diasEntre(ultima, e.hoje) > cfg.maxDiasParado) return null;
  const desde = menosMeses(ultima, 12);
  const meses = new Set(datas.filter((d) => d > desde).map((d) => d.slice(0, 7)));
  if (meses.size < cfg.recorrenteMinMeses[e.classe]) return null;
  // declaração com parcela paga recentemente ou agendada (inclusive com data-com depois de hoje)
  // ⇒ a fonte está viva (KLBN11)
  const pagamentoDesde = menosDias(e.hoje, maxDias);
  const pagamentoVivo = validos.some(
    (x) =>
      x.dataPagamento != null &&
      x.dataPagamento >= pagamentoDesde &&
      x.dataPagamento <= maisMeses(x.dataComReal!, 12 * cfg.pagamentoMaxAnos),
  );
  if (pagamentoVivo) return null;
  // prazo esperado pela cadência do próprio pagador (semestral/anual não é "parado" aos 200 dias)
  const inicioHistorico = menosMeses(ultima, cfg.janelaHistoricoMeses);
  const historico = datas.filter((d) => d >= inicioHistorico);
  let maiorIntervalo = 0;
  for (let i = 1; i < historico.length; i++) {
    maiorIntervalo = Math.max(maiorIntervalo, diasEntre(historico[i - 1], historico[i]));
  }
  const prazo = Math.max(maxDias, maiorIntervalo * cfg.fatorIntervalo);
  return diasEntre(ultima, e.hoje) > prazo ? 'pagador_recorrente_parado' : null;
}

function menosDias(data: string, dias: number): string {
  return new Date(ms(data) - dias * DIA_MS).toISOString().slice(0, 10);
}

function maisMeses(data: string, meses: number): string {
  return menosMeses(data, -meses);
}

/** Maior data-com válida (≤ hoje) entre os proventos dados (para ultimaDataComDaClasse). */
export function ultimaDataCom(
  proventos: Iterable<Pick<ProventoAuditado, 'status' | 'dataComReal'>>,
  hoje: string,
): string | null {
  let max: string | null = null;
  for (const x of proventos) {
    if (x.status !== 'valido' || !x.dataComReal || x.dataComReal > hoje) continue;
    if (max === null || x.dataComReal > max) max = x.dataComReal;
  }
  return max;
}

/**
 * Zero × ausente (regra 1): sem nenhum provento na base, só é zero de verdade se o market_data_coverage
 * diz que a fonte foi consultada (EMPTY = sem provento; OK = consultado). FETCH_FAIL/GAP_QUEUED/sem
 * registro ⇒ ausente.
 */
export function valorProventosComCobertura(
  v: Valor<number>,
  temAlgumProvento: boolean,
  cobertura: CoberturaProventos,
): Valor<number> {
  if (temAlgumProvento || v.estado !== 'ok') return v;
  if (cobertura === 'EMPTY' || cobertura === 'OK') return ok(0);
  return ausente(
    cobertura === 'FETCH_FAIL' ? 'fonte_falhou' : 'sem_dado_fonte',
    cobertura ?? 'sem_cobertura',
  );
}

/** Campos de uma linha auditada que, se mudarem, exigem regravar o símbolo. */
export type ProventoGravadoChave = Pick<
  ProventoAuditadoCompleto,
  | 'origemId'
  | 'symbol'
  | 'source'
  | 'tipoOriginal'
  | 'tipoNormalizado'
  | 'valor'
  | 'dataPagamento'
  | 'dataExGravada'
  | 'dataComReal'
  | 'status'
  | 'duplicataDe'
  | 'fatorAjusteHoje'
  | 'flags'
>;

function chaveLinha(l: ProventoGravadoChave): string {
  return [
    l.origemId,
    l.source,
    l.tipoOriginal,
    l.tipoNormalizado,
    l.valor,
    l.dataPagamento ?? '',
    l.dataExGravada ?? '',
    l.dataComReal ?? '',
    l.status,
    l.duplicataDe ?? '',
    Math.round(l.fatorAjusteHoje * 1e10) / 1e10,
    [...l.flags].sort().join(','),
  ].join('|');
}

/** Impressão digital de um conjunto de linhas auditadas (independe da ordem). */
export function impressaoAuditoria(linhas: ProventoGravadoChave[]): string {
  return linhas.map(chaveLinha).sort().join('\n');
}

/**
 * Compara a auditoria recalculada com o que está gravado, POR SÍMBOLO (auditoria completa a cada
 * run — o Yahoo apaga/reinsere com id novo e o upsert da BRAPI muda valor sem mexer em createdAt, então
 * nada de incremental). `reescrever` = símbolos do universo cuja impressão mudou (inclui símbolo que
 * ficou sem linha); `orfaos` = símbolos gravados que saíram do universo.
 */
export function planejarReescritaProventos(
  novos: ProventoGravadoChave[],
  gravados: ProventoGravadoChave[],
  simbolos: string[],
): { reescrever: string[]; orfaos: string[] } {
  const agrupar = (ls: ProventoGravadoChave[]) => {
    const m = new Map<string, ProventoGravadoChave[]>();
    for (const l of ls) {
      const lista = m.get(l.symbol);
      if (lista) lista.push(l);
      else m.set(l.symbol, [l]);
    }
    return m;
  };
  const porNovo = agrupar(novos);
  const porGravado = agrupar(gravados);
  const universo = new Set(simbolos);
  const reescrever = simbolos.filter(
    (s) => impressaoAuditoria(porNovo.get(s) ?? []) !== impressaoAuditoria(porGravado.get(s) ?? []),
  );
  const orfaos = [...porGravado.keys()].filter((s) => !universo.has(s)).sort();
  return { reescrever: [...reescrever].sort(), orfaos };
}
