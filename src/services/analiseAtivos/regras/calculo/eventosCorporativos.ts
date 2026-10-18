/**
 * Validação de eventos corporativos (regra 6 do relatório da Fase A; regras 13 e 22).
 *
 * asset_corporate_actions (BRAPI + YAHOO) tem fantasmas (EGIE3 ×1,1 em nov/25, BBDC 2024 ×1,2,
 * CPLE3 2021 ×10) e duplicatas (LREN3 2021-10-22/11-05). Aqui:
 *  1. só DESDOBRAMENTO/GRUPAMENTO/BONIFICACAO; mesmo fator (±1%) em ≤ 30 dias = 1 evento;
 *  2. ações: confirma pela razão de ações da CVM (fim do ano ÷ fim do ano anterior; ano corrente pelo
 *     ITR) contra o produto dos eventos do ano (±6%), procurando o SUBCONJUNTO que bate; evento de
 *     1/jan–14/fev pode já estar no fim do ano anterior (SLCE3 2026-01-02 ⇒ anoBase 2025) e evento de
 *     dezembro pode só aparecer no ano seguinte (CYRE3 2025-12-30 ⇒ anoBase 2026);
 *  3. FII: confirma pela razão de cotas do Informe Mensal no mês do evento (HFOF11 1:10 mai/25) e um
 *     `fatorDesdobramento` do FiiMonthly sem evento bruto vira evento confirmado de origem 'cvm_cotas'.
 *  4. (backtest 18/10/2026) evento POSTERIOR à última contagem de ações (ORVR3 ×4 em 11/08/2026,
 *     ENJU3 ×0,1 em 09/10/2026, RCSL3/4 ×0,25 em 05/10/2026 — contagem de 30/06) não pode ser
 *     confirmado pela razão de ações: é confirmado pelo SALTO DA COTAÇÃO no pregão ex
 *     (fech. anterior ÷ fech. do dia ≈ fator; confirmarPelaCotacao) e fica com razaoCvm null e a
 *     fonte FONTE_COTACAO — é o evento que a contagem ainda não reflete (contagemVigente);
 *  5. (backtest 18/10/2026) FII: o evento de origem 'cvm_cotas' é datado pela data EX real (salto da
 *     cotação no COTAHIST, mês do informe ±1; sem cotação, salto do rendimento), não pelo 1º dia
 *     do mês do informe (ALZR11 1:10 era 01/04/2025, ex real 06/05/2025: o rendimento de abril não
 *     era dividido por 10); e o informe ADIANTADO (cotas novas já no mês anterior ao evento bruto)
 *     confirma o evento bruto (ALZR11; e os grupamentos BTYU11 ×0,01 e FLMA11 ×0,02, que eram
 *     descartados e deixavam o rendimento antigo sem ajuste).
 * Ajustam série (fatorEventos*): 'confirmado' e 'emissao_recompra' — este último é o evento que a
 * razão de ações não confirma sozinha porque houve emissão/recompra no mesmo ano e que a Fase A
 * MANTEVE (acoes-cvm.md §2: MGLU3 2024 ×0,1 com follow-on; LREN3 2021 ×1,1 com oferta). Descartado e
 * não validável nunca ajustam. Funções puras.
 */
import { proximoPregaoOuMesmo } from '@/services/analiseAtivos/regras/comum/pregoes';
import type {
  ContagemAcoes,
  EventoCorporativoBruto,
  EventoCorporativoVerificado,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_COMBINACOES_EVENTOS = 12;

/** Fonte gravada em `fontes` quando a data/confirmação veio do salto da cotação (COTAHIST). */
export const FONTE_COTACAO = 'cotacao_b3';
/** Fonte gravada em `fontes` do evento 'cvm_cotas' datado pelo salto do rendimento. */
export const FONTE_RENDIMENTO = 'salto_rendimento';
/**
 * Confirmação pela cotação (backtest 18/10/2026): o pregão ex tem fech. anterior ÷ fech. do dia a
 * ±25% do fator (ENJU3 0,80 → 8,24 = ×0,097 para ×0,1; RCSL4 0,27 → 0,95 = ×0,284 para ×0,25;
 * MAXR11 1.859 → 99,87 = ×18,6 para ×19) e o pregão seguinte fica a ±25% do novo nível. Só fatores
 * ≥ 1,5× (ou ≤ 1/1,5): bonificação de 10% se confunde com a oscilação do dia.
 */
const COTACAO_TOL = 0.25;
const COTACAO_FATOR_MIN = 1.5;
/** Pregões procurados em torno da data do evento bruto (data ex da fonte ± alguns dias). */
const COTACAO_JANELA_ANTES_DIAS = 3;
const COTACAO_JANELA_DEPOIS_DIAS = 5;

/** Pregão do COTAHIST (preço cru) usado para datar/confirmar evento pela cotação. */
export interface PregaoEvento {
  date: string;
  closeRaw: number;
  negocios?: number;
}

/** Status que ajustam séries por ação (ver cabeçalho). */
export function eventoAjustaSerie(status: EventoCorporativoVerificado['status']): boolean {
  return status === 'confirmado' || status === 'emissao_recompra';
}

export type TipoEvento = EventoCorporativoVerificado['tipo'];

/** Evento verificado com o rastro que vai para AssetCorporateActionCheck. */
export interface EventoVerificadoCompleto extends EventoCorporativoVerificado {
  fontes: string[];
  fatorProdutoAno: number | null;
}

interface EventoDedup {
  symbol: string;
  dataEvento: string;
  /** fonte de onde veio `dataEvento` (a preferida vence as demais no mesmo grupo) */
  fonteData: string;
  fator: number;
  tipo: TipoEvento;
  idsOrigem: string[];
  fontes: string[];
}

function ms(data: string): number {
  return Date.UTC(
    Number(data.slice(0, 4)),
    Number(data.slice(5, 7)) - 1,
    Number(data.slice(8, 10)),
  );
}

function ano(data: string): number {
  return Number(data.slice(0, 4));
}

function dentroTol(a: number, b: number, tolPct: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a / b - 1) <= tolPct / 100;
}

function maisDias(data: string, dias: number): string {
  return new Date(ms(data) + dias * DIA_MS).toISOString().slice(0, 10);
}

function ultimoDiaDoMes(refMonth: string): string {
  const a = ano(refMonth);
  const m = Number(refMonth.slice(5, 7));
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/**
 * Pregão ex de um desdobramento/grupamento de fator `fator` entre `de` e `ate` (inclusive) pelo salto
 * da cotação: fech. do pregão anterior ÷ fech. do dia a ±COTACAO_TOL do fator e o pregão seguinte
 * (quando há) a ±COTACAO_TOL do novo nível. Mais de um candidato ⇒ o mais próximo do fator. null =
 * sem salto compatível (ou fator pequeno demais para a cotação distinguir).
 */
export function dataExPelaCotacao(
  serie: readonly PregaoEvento[],
  fator: number,
  de: string,
  ate: string,
): string | null {
  if (!(fator > 0) || Math.abs(Math.log(fator)) < Math.log(COTACAO_FATOR_MIN)) return null;
  const s = serie
    .filter((x) => x.closeRaw > 0 && (x.negocios === undefined || x.negocios > 0))
    .sort((a, b) => a.date.localeCompare(b.date));
  const tolLog = Math.log(1 + COTACAO_TOL);
  let melhor: { data: string; dist: number } | null = null;
  for (let i = 1; i < s.length; i++) {
    const dia = s[i];
    if (dia.date < de || dia.date > ate) continue;
    const dist = Math.abs(Math.log(s[i - 1].closeRaw / dia.closeRaw / fator));
    if (dist > tolLog) continue;
    const seg = s[i + 1];
    if (seg && Math.abs(Math.log(seg.closeRaw / dia.closeRaw)) > tolLog) continue;
    if (!melhor || dist < melhor.dist) melhor = { data: dia.date, dist };
  }
  return melhor?.data ?? null;
}

/** Rendimento auditado (válido) de FII: data-com real e valor por cota, cru. */
export interface ProventoEvento {
  dataCom: string;
  valor: number;
}

/**
 * Sem cotação (fundo ainda não listado): a data do desdobramento pelo SALTO DO RENDIMENTO entre dois
 * rendimentos consecutivos (por data-com) na janela — anterior ÷ seguinte a ±COTACAO_TOL do fator ⇒
 * o evento é o dia seguinte à data-com do anterior (TSNC11 1:60: 37,56 com data-com 15/07/2022 e
 * 0,626 em 12/08/2022 ⇒ 16/07/2022; o de julho ainda é da base antiga). null = sem salto.
 */
export function dataPeloSaltoDoRendimento(
  proventos: readonly ProventoEvento[],
  fator: number,
  de: string,
  ate: string,
): string | null {
  if (!(fator > 0) || Math.abs(Math.log(fator)) < Math.log(COTACAO_FATOR_MIN)) return null;
  // o rendimento anterior ao evento pode ter data-com até ~1 mês e meio antes da janela; duas linhas
  // na mesma data-com somam (GARE11 29/07/2022: 0,82 + 0,079)
  const porData = new Map<string, number>();
  for (const x of proventos) {
    if (!(x.valor > 0) || x.dataCom < maisDias(de, -75) || x.dataCom > maisDias(ate, 45)) continue;
    porData.set(x.dataCom, (porData.get(x.dataCom) ?? 0) + x.valor);
  }
  const s = [...porData].sort((a, b) => a[0].localeCompare(b[0]));
  const tolLog = Math.log(1 + COTACAO_TOL);
  const perto = (a: number, b: number) => Math.abs(Math.log(a / b)) <= tolLog;
  for (let i = 1; i < s.length; i++) {
    const [dataAnt, ant] = s[i - 1];
    const [data, atual] = s[i];
    if (data < de || data > ate) continue;
    if (!perto(ant / atual, fator)) continue;
    // mudança de NÍVEL: o anterior parecido com o que vem antes dele e o atual com o seguinte
    // (quando existem) — um rendimento extraordinário isolado não data o evento
    if (i >= 2 && !perto(s[i - 2][1], ant)) continue;
    if (i + 1 < s.length && !perto(s[i + 1][1], atual)) continue;
    return maisDias(dataAnt, 1);
  }
  return null;
}

/** Tipo do evento pelo texto da fonte; fora da lista de params ⇒ null (ignorado). */
export function tipoEvento(type: string, p: ScoringParams): TipoEvento | null {
  const t = type.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim();
  return (p.sanidade.eventos.tipos as readonly string[]).includes(t) ? (t as TipoEvento) : null;
}

/**
 * Data EX do evento pela convenção da fonte (params.sanidade.eventos.convencaoData): a BRAPI grava a
 * DATA-COM (VBBR3 2025-11-25, ex 26/11 no COTAHIST: 'ON EJB'; ITUB4 2025-12-23, ex 26/12) ⇒ próximo
 * pregão; o Yahoo grava a data ex. Os ajustes comparam `dataEvento > dataComReal` (estrito): com a
 * data ex, o provento com data-com = data-com do evento (pago sobre as ações antigas) é ajustado.
 */
export function dataExDoEvento(
  b: Pick<EventoCorporativoBruto, 'date' | 'source'>,
  p: ScoringParams,
) {
  const conv = p.sanidade.eventos.convencaoData[b.source] ?? 'ex';
  if (conv !== 'com') return b.date;
  return proximoPregaoOuMesmo(new Date(ms(b.date) + DIA_MS).toISOString().slice(0, 10));
}

/**
 * Mesmo fator (±dedupFatorTolPct) em ≤ dedupDias ⇒ 1 evento. Data = data EX (dataExDoEvento) da
 * fonte preferida (fontePreferidaData) quando ela está no grupo; senão a mais antiga.
 */
export function deduplicarEventos(
  brutos: EventoCorporativoBruto[],
  p: ScoringParams,
): EventoDedup[] {
  const cfg = p.sanidade.eventos;
  const validos = brutos
    .map((b) => ({ b, tipo: tipoEvento(b.type, p), data: '' }))
    .filter(
      (x): x is { b: EventoCorporativoBruto; tipo: TipoEvento; data: string } =>
        x.tipo !== null && Number.isFinite(x.b.factor) && x.b.factor > 0 && x.b.factor !== 1,
    )
    .map((x) => ({ ...x, data: dataExDoEvento(x.b, p) }))
    .sort((a, b) => a.b.symbol.localeCompare(b.b.symbol) || a.data.localeCompare(b.data));
  const out: EventoDedup[] = [];
  for (const { b, tipo, data } of validos) {
    const par = out.find(
      (e) =>
        e.symbol === b.symbol &&
        dentroTol(e.fator, b.factor, cfg.dedupFatorTolPct) &&
        Math.abs(ms(data) - ms(e.dataEvento)) <= cfg.dedupDias * DIA_MS,
    );
    if (par) {
      par.idsOrigem.push(b.id);
      if (!par.fontes.includes(b.source)) par.fontes.push(b.source);
      if (b.source === cfg.fontePreferidaData && par.fonteData !== cfg.fontePreferidaData) {
        par.dataEvento = data;
        par.fonteData = b.source;
      }
      continue;
    }
    out.push({
      symbol: b.symbol,
      dataEvento: data,
      fonteData: b.source,
      fator: b.factor,
      tipo,
      idsOrigem: [b.id],
      fontes: [b.source],
    });
  }
  return out;
}

/** Anos em que o evento pode já estar refletido na contagem de ações (anoBase candidatos). */
export function anosBaseCandidatos(data: string, p: ScoringParams): number[] {
  const cfg = p.sanidade.eventos;
  const a = ano(data);
  const mmdd = data.slice(5);
  if (mmdd <= cfg.anoBaseInicioAnoAte) return [a - 1, a];
  if (cfg.anoBaseDezembroSeguinte && data.slice(5, 7) === '12') return [a, a + 1];
  return [a];
}

/** Ações totais no fim de cada ano (a última contagem do ano: DFP no fim, ITR no ano corrente). */
function acoesPorAno(contagens: ContagemAcoes[]): Map<number, { data: string; total: number }> {
  const out = new Map<number, { data: string; total: number }>();
  for (const c of contagens) {
    if (c.status === 'nao_verificavel' || c.total === null || !(c.total > 0)) continue;
    const a = ano(c.data);
    const atual = out.get(a);
    if (!atual || c.data > atual.data) out.set(a, { data: c.data, total: c.total });
  }
  return out;
}

function produto(xs: number[]): number {
  return xs.reduce((acc, x) => acc * x, 1);
}

/**
 * Melhor subconjunto de `candidatos` cujo produto bate com `razao` (±tol): mais eventos fixos do ano,
 * depois o produto mais próximo, depois mais eventos. null = nenhum subconjunto (nem o vazio) bate.
 * Eventos de fronteira (jan/fev, dezembro) só entram quando melhoram o ajuste.
 */
function melhorSubconjunto(
  candidatos: Array<{ idx: number; fator: number; fixo: boolean }>,
  razao: number,
  tolPct: number,
): Set<number> | null {
  const n = Math.min(candidatos.length, MAX_COMBINACOES_EVENTOS);
  let melhor: { sel: Set<number>; fixos: number; total: number; dist: number } | null = null;
  for (let mask = 0; mask < 1 << n; mask++) {
    const sel: typeof candidatos = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sel.push(candidatos[i]);
    const prod = produto(sel.map((s) => s.fator));
    if (!dentroTol(prod, razao, tolPct)) continue;
    const fixos = sel.filter((s) => s.fixo).length;
    const dist = Math.abs(prod / razao - 1);
    if (
      !melhor ||
      fixos > melhor.fixos ||
      (fixos === melhor.fixos && dist < melhor.dist - 1e-12) ||
      (fixos === melhor.fixos && Math.abs(dist - melhor.dist) <= 1e-12 && sel.length > melhor.total)
    ) {
      melhor = { sel: new Set(sel.map((s) => s.idx)), fixos, total: sel.length, dist };
    }
  }
  return melhor ? melhor.sel : null;
}

/**
 * O subconjunto escolhido bate só na tolerância larga (6%)? Tira eventos de FONTE ÚNICA enquanto
 * isso fizer o produto bater na tolerância estrita (confirmacaoEstritaTolPct): um evento espúrio
 * pequeno (< 6%) não entra no ajuste só por estar junto de um evento real grande (SBSP3 2026:
 * YAHOO ×1,028 junto do split 1:5 e da bonificação ×1,0016; razão CVM 5,008). Remove o menor número
 * de eventos; empate ⇒ produto mais próximo.
 */
function refinarSubconjunto(
  sel: Set<number>,
  candidatos: Array<{ idx: number; fator: number; fonteUnica: boolean }>,
  razao: number,
  tolEstritaPct: number,
): Set<number> {
  const escolhidos = candidatos.filter((c) => sel.has(c.idx));
  const prodSel = produto(escolhidos.map((c) => c.fator));
  if (dentroTol(prodSel, razao, tolEstritaPct)) return sel;
  const removiveis = escolhidos.filter((c) => c.fonteUnica).slice(0, MAX_COMBINACOES_EVENTOS);
  let melhor: { sel: Set<number>; removidos: number; dist: number } | null = null;
  for (let mask = 1; mask < 1 << removiveis.length; mask++) {
    const fora = new Set<number>();
    for (let i = 0; i < removiveis.length; i++) if (mask & (1 << i)) fora.add(removiveis[i].idx);
    const resto = escolhidos.filter((c) => !fora.has(c.idx));
    const prod = produto(resto.map((c) => c.fator));
    if (!dentroTol(prod, razao, tolEstritaPct)) continue;
    const dist = Math.abs(prod / razao - 1);
    if (
      !melhor ||
      fora.size < melhor.removidos ||
      (fora.size === melhor.removidos && dist < melhor.dist)
    ) {
      melhor = { sel: new Set(resto.map((c) => c.idx)), removidos: fora.size, dist };
    }
  }
  return melhor ? melhor.sel : sel;
}

export interface MesCotasFii {
  refMonth: string;
  cotas: number | null;
  fatorDesdobramento: number | null;
  /** PL do mês: com o do mês anterior, confirma que o salto de cotas foi desdobramento (PL estável) */
  pl?: number | null;
}

/**
 * Verifica os eventos de UM símbolo contra as contagens de ações da empresa (ações) ou contra as
 * cotas mensais (FII, quando `fii` é informado).
 */
export function verificarEventosCorporativos(
  brutos: EventoCorporativoBruto[],
  contagens: ContagemAcoes[],
  p: ScoringParams,
  fii?: MesCotasFii[],
  symbol?: string,
  /**
   * pregões do símbolo em torno dos eventos (datar/confirmar pela cotação) e, para FII, rendimentos
   * auditados válidos (datar pelo salto do rendimento quando não há cotação); sem eles, como antes
   */
  extras: { pregoes?: readonly PregaoEvento[]; proventos?: readonly ProventoEvento[] } = {},
): EventoVerificadoCompleto[] {
  const dedup = deduplicarEventos(brutos, p);
  const alvo = symbol ?? brutos[0]?.symbol ?? '';
  return fii
    ? verificarFii(dedup, fii, p, alvo, extras.pregoes ?? [], extras.proventos ?? [])
    : verificarAcoes(dedup, contagens, p, extras.pregoes ?? []);
}

/** Data da contagem de ações mais recente que entra na verificação (null = nenhuma). */
export function dataUltimaContagem(contagens: ContagemAcoes[]): string | null {
  let ult: string | null = null;
  for (const c of contagens) {
    if (c.status === 'nao_verificavel' || c.total === null || !(c.total > 0)) continue;
    if (ult === null || c.data > ult) ult = c.data;
  }
  return ult;
}

/**
 * Janela de pregões em que se procura o salto de um evento de ação: a data ex da fonte ± alguns dias
 * (a BRAPI/Yahoo às vezes erram por um pregão).
 */
export function janelaCotacaoEvento(dataEvento: string): { de: string; ate: string } {
  return {
    de: maisDias(dataEvento, -COTACAO_JANELA_ANTES_DIAS),
    ate: maisDias(dataEvento, COTACAO_JANELA_DEPOIS_DIAS),
  };
}

/** Janela de pregões de um desdobramento visto no Informe Mensal do mês `refMonth` (mês ± 1). */
export function janelaCotacaoMesFii(refMonth: string): { de: string; ate: string } {
  return { de: mesAnterior(refMonth), ate: ultimoDiaDoMes(mesSeguinte(refMonth)) };
}

function verificarAcoes(
  eventos: EventoDedup[],
  contagens: ContagemAcoes[],
  p: ScoringParams,
  pregoes: readonly PregaoEvento[],
): EventoVerificadoCompleto[] {
  const tol = p.sanidade.eventos.confirmacaoTolPct;
  const acoes = acoesPorAno(contagens);
  const cands = eventos.map((e) => anosBaseCandidatos(e.dataEvento, p));
  const resultado: Array<EventoVerificadoCompleto | null> = eventos.map(() => null);

  const anos = [...new Set(cands.flat())].sort((a, b) => a - b);
  for (const a of anos) {
    const fim = acoes.get(a);
    const ini = acoes.get(a - 1);
    if (!fim || !ini) continue;
    const pendentes = eventos
      .map((e, idx) => ({
        idx,
        fator: e.fator,
        fixo: cands[idx].length === 1,
        fonteUnica: e.fontes.length === 1,
      }))
      .filter((x) => resultado[x.idx] === null && cands[x.idx].includes(a));
    if (pendentes.length === 0) continue;
    const razao = fim.total / ini.total;
    const selLarga = melhorSubconjunto(pendentes, razao, tol);
    const sel =
      selLarga &&
      refinarSubconjunto(selLarga, pendentes, razao, p.sanidade.eventos.confirmacaoEstritaTolPct);
    const prodAno = produto(pendentes.map((x) => x.fator));
    for (const x of pendentes) {
      const e = eventos[x.idx];
      const ultimoCandidato = cands[x.idx][cands[x.idx].length - 1] === a;
      if (sel?.has(x.idx)) {
        resultado[x.idx] = completo(e, a, 'confirmado', razao, prodAno);
      } else if (ultimoCandidato) {
        // evento do MESMO ano civil posterior à contagem do ano que a razão não explica (ITR de
        // 30/06 entregue antes do split de agosto: ENJU3 ×0,1 em 09/10/2026 dava razão 1 ⇒
        // 'descartado') ⇒ confirmação pelo salto da cotação, com razaoCvm null (a contagem ainda
        // não o reflete). Se a contagem já o reflete (ITR entregue depois do evento: LUPA3 ×0,1 em
        // 14/08/2026 no ITR de 30/06), a razão o confirma acima, como antes.
        if (ano(e.dataEvento) === a && e.dataEvento > fim.data) {
          const conf = confirmadoPelaCotacao(e, pregoes);
          if (conf) {
            resultado[x.idx] = conf;
            continue;
          }
        }
        // não entrou no subconjunto que bate: ações não mudaram (ou o subconjunto bastou) ⇒
        // descartado; nada bate ⇒ emissão/recompra no ano SÓ se o evento for coerente com a
        // razão (senão não validável — nunca ajusta: LIGT3 2021 par ×10/×0,01, CALI3 2022 ×400)
        const status =
          sel !== null
            ? 'descartado'
            : emissaoRecompraCoerente(pendentes.length, e.fator, razao, p)
              ? 'emissao_recompra'
              : 'nao_validavel';
        resultado[x.idx] = completo(e, a, status, razao, prodAno);
      }
    }
  }

  // sem contagem validada no(s) ano(s) candidato(s): evento posterior à última contagem ⇒ confirma
  // pelo salto da cotação no pregão ex (razaoCvm null + FONTE_COTACAO: a contagem ainda não o
  // reflete); senão não validável (anoBase = ano da data)
  const ultima = dataUltimaContagem(contagens);
  return eventos.map((e, idx) => {
    const r = resultado[idx];
    if (r) return r;
    const conf =
      ultima !== null && e.dataEvento > ultima ? confirmadoPelaCotacao(e, pregoes) : null;
    return conf ?? completo(e, ano(e.dataEvento), 'nao_validavel', null, null);
  });
}

/** Evento confirmado pelo salto da cotação no pregão ex (razaoCvm null + FONTE_COTACAO) ou null. */
function confirmadoPelaCotacao(
  e: EventoDedup,
  pregoes: readonly PregaoEvento[],
): EventoVerificadoCompleto | null {
  const j = janelaCotacaoEvento(e.dataEvento);
  if (dataExPelaCotacao(pregoes, e.fator, j.de, j.ate) === null) return null;
  const c = completo(e, ano(e.dataEvento), 'confirmado', null, null);
  return { ...c, fontes: [...c.fontes, FONTE_COTACAO] };
}

/**
 * Evento que a razão de ações não confirma, mas que é explicável por emissão/recompra no mesmo ano
 * (MGLU3 2024 ×0,1 com follow-on ⇒ razão 0,11): exige UM evento pendente no ano, do mesmo lado de 1
 * que a razão, e razão ÷ fator dentro de `emissaoRecompraRazaoFator` (achado qa-codigo 30/09:
 * par fantasma ×10/×0,01 da LIGT3 2021, ×400 da CALI3 2022 com razão 10, ×0,05 da IFCM3 2025 com
 * ações subindo 3,5×).
 */
export function emissaoRecompraCoerente(
  pendentesNoAno: number,
  fator: number,
  razao: number,
  p: ScoringParams,
): boolean {
  if (pendentesNoAno !== 1 || !(fator > 0) || !(razao > 0)) return false;
  if (fator > 1 !== razao > 1) return false;
  const [min, max] = p.sanidade.eventos.emissaoRecompraRazaoFator;
  const r = razao / fator;
  return r >= min && r <= max;
}

function completo(
  e: EventoDedup,
  anoBase: number,
  status: EventoCorporativoVerificado['status'],
  razao: number | null,
  fatorProdutoAno: number | null,
): EventoVerificadoCompleto {
  return {
    symbol: e.symbol,
    dataEvento: e.dataEvento,
    fator: e.fator,
    tipo: e.tipo,
    anoBase,
    status,
    razaoCvm: razao,
    idsOrigem: e.idsOrigem,
    fontes: e.fontes,
    fatorProdutoAno,
  };
}

function mesAnterior(refMonth: string): string {
  const a = ano(refMonth);
  const m = Number(refMonth.slice(5, 7));
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
}

function mesSeguinte(refMonth: string): string {
  const a = ano(refMonth);
  const m = Number(refMonth.slice(5, 7));
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Meses olhados para trás E para a frente atrás da outra metade de uma ida e volta de cotas. */
const JANELA_IDA_E_VOLTA_MESES = 6;

/**
 * O salto de cotas do mês `m` (fatorDesdobramento > 1) é metade de uma ida e volta? Simétrico:
 *  - para trás: um grupamento (fator < 1) que ele desfaz (ONDA11 fev→mar/26);
 *  - para a frente: um grupamento que o desfaz, ou cotas que voltam ao nível de antes do salto
 *    (informe com cotas ×N por erro, corrigido no(s) mês(es) seguinte(s)).
 * Só olha os meses disponíveis dentro de JANELA_IDA_E_VOLTA_MESES.
 */
function saltoDeIdaEVolta(m: MesCotasFii, porMes: Map<string, MesCotasFii>, tol: number): boolean {
  const fd = m.fatorDesdobramento;
  if (fd === null || !(fd > 1)) return false;
  const desfaz = (f: number | null | undefined) =>
    f !== null && f !== undefined && f < 1 && dentroTol(f * fd, 1, tol);
  let r = m.refMonth;
  for (let k = 0; k < JANELA_IDA_E_VOLTA_MESES; k++) {
    r = mesAnterior(r);
    if (desfaz(porMes.get(r)?.fatorDesdobramento)) return true;
  }
  const cotasAntes = porMes.get(mesAnterior(m.refMonth))?.cotas ?? null;
  r = m.refMonth;
  for (let k = 0; k < JANELA_IDA_E_VOLTA_MESES; k++) {
    r = mesSeguinte(r);
    const seg = porMes.get(r);
    if (!seg) continue;
    if (desfaz(seg.fatorDesdobramento)) return true;
    if (
      cotasAntes !== null &&
      cotasAntes > 0 &&
      seg.cotas !== null &&
      dentroTol(seg.cotas, cotasAntes, tol)
    )
      return true;
  }
  return false;
}

function verificarFii(
  eventos: EventoDedup[],
  meses: MesCotasFii[],
  p: ScoringParams,
  symbol: string,
  pregoes: readonly PregaoEvento[],
  proventos: readonly ProventoEvento[],
): EventoVerificadoCompleto[] {
  const tol = p.sanidade.eventos.confirmacaoTolPct;
  const cotas = new Map<string, number>();
  for (const m of meses) if (m.cotas !== null && m.cotas > 0) cotas.set(m.refMonth, m.cotas);
  const out: EventoVerificadoCompleto[] = [];
  const mesesComEvento = new Set<string>();

  for (const e of eventos) {
    const mes = `${e.dataEvento.slice(0, 7)}-01`;
    mesesComEvento.add(mes);
    mesesComEvento.add(mesSeguinte(mes));
    const antes = cotas.get(mesAnterior(mes));
    const depois = [cotas.get(mes), cotas.get(mesSeguinte(mes))].filter(
      (c): c is number => c !== undefined,
    );
    if (antes === undefined || depois.length === 0) {
      out.push(completo(e, ano(e.dataEvento), 'nao_validavel', null, null));
      continue;
    }
    const razoes = depois.map((d) => d / antes);
    const bate = razoes.find((r) => dentroTol(e.fator, r, tol));
    // informe ADIANTADO: o gestor já informou as cotas novas no mês ANTERIOR ao evento (ALZR11 1:10
    // ex 06/05/2025 com as cotas ×10 no informe de abril) ⇒ o salto do mês anterior confirma o
    // evento bruto, que fica com a data ex dele; o mês anterior não vira evento 'cvm_cotas'
    const antesDoAnterior = cotas.get(mesAnterior(mesAnterior(mes)));
    const razaoAdiantada = antesDoAnterior === undefined ? undefined : antes / antesDoAnterior;
    if (bate !== undefined) {
      out.push(completo(e, ano(e.dataEvento), 'confirmado', bate, e.fator));
    } else if (razaoAdiantada !== undefined && dentroTol(e.fator, razaoAdiantada, tol)) {
      mesesComEvento.add(mesAnterior(mes));
      out.push(completo(e, ano(mesAnterior(mes)), 'confirmado', razaoAdiantada, e.fator));
    } else {
      const semMudanca = razoes.every((r) => dentroTol(r, 1, tol));
      const status = semMudanca
        ? 'descartado'
        : emissaoRecompraCoerente(1, e.fator, razoes[0], p)
          ? 'emissao_recompra'
          : 'nao_validavel';
      out.push(completo(e, ano(e.dataEvento), status, razoes[0], e.fator));
    }
  }

  // fatorDesdobramento do Informe Mensal sem evento bruto no mês ⇒ evento confirmado (regra 22),
  // desde que o PL fique estável e positivo (senão é incorporação/emissão: IRIM11 nov/25 PL ×18;
  // FIIC11 com PL negativo) e que não seja metade de uma IDA E VOLTA de cotas erradas — nos dois
  // sentidos (ONDA11: cotas ÷101 em fev/26 e ×101 em mar/26; GSRF11 mai→ago/26; e o inverso: salto
  // ×N por erro no informe e correção como grupamento nos meses seguintes)
  const porMes = new Map(meses.map((m) => [m.refMonth, m]));
  for (const m of meses) {
    if (m.fatorDesdobramento === null || !(m.fatorDesdobramento > 1)) continue;
    if (mesesComEvento.has(m.refMonth) || mesesComEvento.has(mesAnterior(m.refMonth))) continue;
    const ant = porMes.get(mesAnterior(m.refMonth));
    // pl === undefined: série sem PL (não confere); null/≤ 0 ⇒ não dá para confirmar
    if (m.pl !== undefined || ant?.pl !== undefined) {
      const plAtual = m.pl ?? null;
      const plAnterior = ant?.pl ?? null;
      if (plAtual === null || plAnterior === null || !dentroTol(plAtual, plAnterior, tol)) continue;
    }
    if (saltoDeIdaEVolta(m, porMes, tol)) continue;
    // data EX real pelo salto da cotação no mês do informe ± 1 (backtest 18/10/2026: CXRI11 ex
    // 10/09/2020, EQIR11 29/09/2022, GAME11 11/03/2022, MAXR11 27/04/2021); sem cotação (fundo
    // ainda não listado), pelo salto do rendimento (TSNC11); sem nenhum dos dois (RZAT11), o 1º
    // dia do mês do informe, como antes
    const j = janelaCotacaoMesFii(m.refMonth);
    const porCotacao = dataExPelaCotacao(pregoes, m.fatorDesdobramento, j.de, j.ate);
    const porRendimento = porCotacao
      ? null
      : dataPeloSaltoDoRendimento(proventos, m.fatorDesdobramento, j.de, j.ate);
    const dataEvento = porCotacao ?? porRendimento ?? m.refMonth;
    const fontes = ['cvm_cotas'];
    if (porCotacao) fontes.push(FONTE_COTACAO);
    if (porRendimento) fontes.push(FONTE_RENDIMENTO);
    out.push({
      symbol,
      dataEvento,
      fator: m.fatorDesdobramento,
      tipo: 'DESDOBRAMENTO',
      // anoBase = ano do INFORME com as cotas novas (não o da data ex): é o que as séries por cota
      // usam (fatorCotasApos pelo mês do informe). MCRE11: ex 16/12/2023, cotas ×10 no informe de
      // jan/2024 ⇒ anoBase 2024 (com 2023 o rendimento de 2023 era dividido duas vezes)
      anoBase: ano(m.refMonth),
      status: 'confirmado',
      razaoCvm: m.fatorDesdobramento,
      idsOrigem: [],
      fontes,
      fatorProdutoAno: m.fatorDesdobramento,
    });
  }
  return out.sort((a, b) => a.dataEvento.localeCompare(b.dataEvento));
}

/** Π dos eventos que ajustam série com data estritamente posterior a `data`. */
export function fatorEventosApos(
  eventos: Array<Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>>,
  data: string,
): number {
  return produto(
    eventos.filter((e) => eventoAjustaSerie(e.status) && e.dataEvento > data).map((e) => e.fator),
  );
}

/** Π dos eventos que ajustam série com data em (de, ate]. */
export function fatorEventosEntre(
  eventos: Array<Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>>,
  de: string,
  ate: string,
): number {
  return produto(
    eventos
      .filter((e) => eventoAjustaSerie(e.status) && e.dataEvento > de && e.dataEvento <= ate)
      .map((e) => e.fator),
  );
}

/** Π dos eventos que ajustam série com anoBase > ano (série anual na base de hoje). */
export function fatorEventosAnoBaseApos(
  eventos: Array<Pick<EventoCorporativoVerificado, 'anoBase' | 'fator' | 'status'>>,
  anoFiscal: number,
): number {
  return produto(
    eventos.filter((e) => eventoAjustaSerie(e.status) && e.anoBase > anoFiscal).map((e) => e.fator),
  );
}

/** Π dos eventos que ajustam série com anoBase = ano. */
export function fatorEventosDoAno(
  eventos: Array<Pick<EventoCorporativoVerificado, 'anoBase' | 'fator' | 'status'>>,
  anoFiscal: number,
): number {
  return produto(
    eventos
      .filter((e) => eventoAjustaSerie(e.status) && e.anoBase === anoFiscal)
      .map((e) => e.fator),
  );
}

/**
 * Regra 13: salto de ações > 2,5× ou < 0,4× que os eventos VALIDADOS do ano não explicam ⇒ flag
 * salto_acoes_sem_evento + dados_incompletos (aplicada em perShareAnual).
 */
export function saltoAcoesSemEvento(
  acoesAnterior: number,
  acoesAtual: number,
  fatorEventosValidados: number,
  p: ScoringParams,
): boolean {
  if (!(acoesAnterior > 0) || !(acoesAtual > 0) || !(fatorEventosValidados > 0)) return false;
  const [min, max] = p.sanidade.acoes.saltoAcoes;
  const razaoAjustada = acoesAtual / acoesAnterior / fatorEventosValidados;
  return razaoAjustada > max || razaoAjustada < min;
}

/**
 * Regra 22: séries POR COTA (VP/cota, rendimento/cota) na base de hoje — divide pelo Π dos
 * desdobramentos confirmados posteriores ao mês. Os múltiplos históricos continuam cru ÷ cru da
 * mesma data (P/VP 2016 do HGLG11 = 1.100 ÷ VP/cota de 2016).
 */
export function ajustarSerieCotaFii<
  T extends { refMonth: string; vpCota: number | null; rendCota?: number | null },
>(
  serie: T[],
  eventos: Array<Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>>,
): T[] {
  return serie.map((m) => {
    // o informe do mês do evento já vem na base nova; o ajuste vale para meses ANTERIORES ao evento
    const f = produto(
      eventos
        .filter((e) => eventoAjustaSerie(e.status) && `${e.dataEvento.slice(0, 7)}-01` > m.refMonth)
        .map((e) => e.fator),
    );
    if (f === 1) return m;
    return {
      ...m,
      vpCota: m.vpCota === null ? null : m.vpCota / f,
      ...(m.rendCota !== undefined
        ? { rendCota: m.rendCota === null ? null : m.rendCota / f }
        : {}),
    };
  });
}
