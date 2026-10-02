/**
 * Auditoria de proventos (regras 16 e 26 do relatório da Fase A; revisão da spec da Fase 0).
 *
 * Base: asset_dividend_history, só leitura, com os defeitos conhecidos:
 *  - BRAPI grava a data EX no campo `dataCom` (PETR4: ex 03/05/2024 gravada; data-com real 02/05);
 *  - YAHOO grava a data EX na coluna `date` e não tem pagamento (repositorio.proventos já converte
 *    pela convenção de params.sanidade.proventos.camposPorFonte);
 *  - repetição da BRAPI com outra data-com (PETR4 set/2024 2×) e, com o MESMO pagamento, a unique
 *    (symbol, date, tipo) + a soma do dividendService fazem 1 linha com valor em dobro (irreversível:
 *    só sinalizamos `possivel_soma_duplicada`);
 *  - repetição com a mesma data-com (ou deslocada 1 pregão), uma linha sem pagamento e outra paga, de
 *    valor igual ou na razão do prêmio de 10% das PN (ON e PN misturadas: CEBR5) ⇒ duplicata
 *    (marcarRepeticoesSemPagamento);
 *  - DIVIDENDO/JCP/RENDIMENTO que repete uma REST CAP DIN/AMORTIZAÇÃO ⇒ tipo_excluido
 *    (marcarCopiasDeRestituicao). Diagnóstico: docs/analise-ativos/fase1/diagnostico-dy-absurdo.md.
 * Data-com real = pregão B3 anterior à data ex. Nunca usa o pagamento como fallback de data-com.
 * Ajuste a hoje POR EVENTO: valor ÷ Π eventos confirmados com data > data-com (MGLU3 2020 teve
 * proventos antes e depois do 4:1 no mesmo ano). Funções puras.
 */
import { eventoAjustaSerie } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { distanciaEmPregoes, pregaoAnterior } from '@/services/analiseAtivos/regras/comum/pregoes';
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

/** Data-com real pela convenção da fonte ('ex' ⇒ pregão anterior à data gravada). */
export function dataComReal(
  dataExGravada: string | null,
  source: string,
  p: ScoringParams,
): string | null {
  if (!dataExGravada) return null;
  const conv = p.sanidade.proventos.convencaoDataCom[source] ?? 'ex';
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
 * Linha "sem pagamento": a BRAPI não informou paymentDate e o app gravou a data ex/data-com também
 * no campo de pagamento (4.752 linhas no dev com as datas iguais; 767 a −1 dia, legado 2009–2014
 * gravado com fuso). Pagamento a ≤ 1 dia da data-com não existe na B3 (liquidação D+2), então
 * |pagamento − data gravada| ≤ 1 dia = sem pagamento. Só vale para a fonte cuja data ex vem do campo
 * dataCom (BRAPI).
 */
export function semPagamento(
  i: Pick<ProventoAuditadoCompleto, 'dataExOrigem' | 'dataPagamento' | 'dataExGravada'>,
): boolean {
  return (
    i.dataExOrigem === 'dataCom' &&
    i.dataPagamento !== null &&
    i.dataExGravada !== null &&
    diasEntre(i.dataPagamento, i.dataExGravada) <= 1
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
 *  - ações, razão = 1 + premioPreferencialPct (10%, art. 17 §1º da Lei 6.404) ±premioTolPct: a fonte
 *    mistura o valor da ON e o da PN no mesmo ticker (CEBR5/CEBR6/CEEB5/BRSR6). Fica o valor da
 *    espécie do ticker (PN = o maior, ON = o menor; units e outras: a linha com pagamento) — flag
 *    'duplicata_classe_irma'.
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
        const ehPremio =
          classe !== 'fii' &&
          (Math.abs(razao / premio - 1) <= tolPremio || Math.abs(razao * premio - 1) <= tolPremio);
        if (!ehPremio) continue;
        const especie = especieDoTicker(x.symbol);
        const xMaior = x.valor > y.valor;
        // PN fica com o maior; ON com o menor; outra espécie: a linha com pagamento
        const fica = especie === 'PN' ? (xMaior ? x : y) : especie === 'ON' ? (xMaior ? y : x) : y;
        const sai = fica === x ? y : x;
        sai.status = 'duplicata';
        sai.duplicataDe = fica.origemId;
        sai.flags.push('duplicata_classe_irma');
        break;
      }
    }
  }
}

export function auditarProventos(
  brutos: ProventoBruto[],
  eventos: EventoParaAjuste[],
  p: ScoringParams,
  opts?: { classe?: 'acao' | 'fii' },
): ProventoAuditadoCompleto[] {
  const cfg = p.sanidade.proventos;
  const itens: ProventoAuditadoCompleto[] = brutos.map((b) => {
    const { tipo, conhecido } = normalizarTipo(b.tipo, p);
    const com = dataComReal(b.dataExGravada, b.source, p);
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
      if (Math.abs(a.valor - b.valor) >= 1e-8) continue;
      if (a.dataPagamento === null || b.dataPagamento === null) continue;
      const dias = diasEntre(a.dataPagamento, b.dataPagamento);
      if (a.dataComReal !== b.dataComReal) {
        if (dias <= cfg.duplicataJanelaPagamentoDias) {
          b.status = 'duplicata';
          b.duplicataDe = a.origemId;
          b.flags.push('duplicata_outra_data_com');
        }
      } else if (dias < cfg.trancheMinDiasEntrePagamentos) {
        // mesma data-com, mesmo valor e pagamentos próximos: não dá para separar tranche de repetição
        for (const x of [a, b])
          if (!x.flags.includes('tranche_ambigua')) x.flags.push('tranche_ambigua');
      }
    }
  }

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

type ProventoParaSoma = Pick<
  ProventoAuditado,
  'tipoNormalizado' | 'status' | 'dataComReal' | 'valor'
>;

/**
 * DPA do ano por data-com (só DIVIDENDO+JCP válidos). base 'fim_do_ano': na base de ações do fim do
 * exercício (÷ eventos confirmados após a data-com e já refletidos no fim do ano: anoBase ≤ ano);
 * 'hoje': na base de hoje (÷ todos os eventos confirmados após a data-com).
 */
export function dpaNoAno(
  proventos: ProventoParaSoma[],
  ano: number,
  base: 'fim_do_ano' | 'hoje',
  eventos: EventoParaAjuste[],
  tipos: readonly string[] = ['DIVIDENDO', 'JCP'],
): Valor<number> {
  const prefixo = String(ano);
  let soma = 0;
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !pr.dataComReal || !tipos.includes(pr.tipoNormalizado)) continue;
    if (pr.dataComReal.slice(0, 4) !== prefixo) continue;
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
  let soma = 0;
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !pr.dataComReal || !tipos.includes(pr.tipoNormalizado)) continue;
    if (pr.dataComReal <= de || pr.dataComReal > hoje) continue;
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
 *    anteriores ao último provento e o último tem data-com mais velha que maxDias[classe].
 * Sem nenhum provento e sem cobertura ⇒ null (os três estados de valorProventosComCobertura valem).
 */
export function motivoProventosDefasados(
  e: {
    classe: 'acao' | 'fii';
    proventos: Array<Pick<ProventoAuditado, 'status' | 'tipoNormalizado' | 'dataComReal'>>;
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
  const datas = e.proventos
    .filter((x) => x.status === 'valido' && x.dataComReal && tipos.includes(x.tipoNormalizado))
    .map((x) => x.dataComReal!)
    .filter((d) => d <= e.hoje)
    .sort();
  const ultima = datas[datas.length - 1];
  if (!ultima || diasEntre(ultima, e.hoje) <= maxDias) return null;
  const desde = menosMeses(ultima, 12);
  const meses = new Set(datas.filter((d) => d > desde).map((d) => d.slice(0, 7)));
  return meses.size >= cfg.recorrenteMinMeses[e.classe] ? 'pagador_recorrente_parado' : null;
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
