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
): EventoVerificadoCompleto[] {
  const dedup = deduplicarEventos(brutos, p);
  const alvo = symbol ?? brutos[0]?.symbol ?? '';
  return fii ? verificarFii(dedup, fii, p, alvo) : verificarAcoes(dedup, contagens, p);
}

function verificarAcoes(
  eventos: EventoDedup[],
  contagens: ContagemAcoes[],
  p: ScoringParams,
): EventoVerificadoCompleto[] {
  const tol = p.sanidade.eventos.confirmacaoTolPct;
  const acoes = acoesPorAno(contagens);
  const cands = eventos.map((e) => anosBaseCandidatos(e.dataEvento, p));
  const resultado: Array<EventoVerificadoCompleto | null> = eventos.map(() => null);

  const anos = [...new Set(cands.flat())].sort((a, b) => a - b);
  for (const a of anos) {
    const fim = acoes.get(a);
    const ini = acoes.get(a - 1);
    const pendentes = eventos
      .map((e, idx) => ({
        idx,
        fator: e.fator,
        fixo: cands[idx].length === 1,
        fonteUnica: e.fontes.length === 1,
      }))
      .filter((x) => resultado[x.idx] === null && cands[x.idx].includes(a));
    if (pendentes.length === 0) continue;
    if (!fim || !ini) continue;
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

  // sem contagem validada no(s) ano(s) candidato(s): não validável (anoBase = ano da data)
  return eventos.map(
    (e, idx) => resultado[idx] ?? completo(e, ano(e.dataEvento), 'nao_validavel', null, null),
  );
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
    if (bate !== undefined) {
      out.push(completo(e, ano(e.dataEvento), 'confirmado', bate, e.fator));
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
    out.push({
      symbol,
      dataEvento: m.refMonth,
      fator: m.fatorDesdobramento,
      tipo: 'DESDOBRAMENTO',
      anoBase: ano(m.refMonth),
      status: 'confirmado',
      razaoCvm: m.fatorDesdobramento,
      idsOrigem: [],
      fontes: ['cvm_cotas'],
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
