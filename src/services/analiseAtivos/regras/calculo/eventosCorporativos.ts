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
 * Só 'confirmado' ajusta série (fatorEventosApos/Entre). Funções puras.
 */
import type {
  ContagemAcoes,
  EventoCorporativoBruto,
  EventoCorporativoVerificado,
  ScoringParams,
} from '@/services/analiseAtivos/tipos';

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_COMBINACOES_EVENTOS = 12;

export type TipoEvento = EventoCorporativoVerificado['tipo'];

/** Evento verificado com o rastro que vai para AssetCorporateActionCheck. */
export interface EventoVerificadoCompleto extends EventoCorporativoVerificado {
  fontes: string[];
  fatorProdutoAno: number | null;
}

interface EventoDedup {
  symbol: string;
  dataEvento: string;
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

/** Mesmo fator (±dedupFatorTolPct) em ≤ dedupDias ⇒ 1 evento (data = a mais antiga). */
export function deduplicarEventos(
  brutos: EventoCorporativoBruto[],
  p: ScoringParams,
): EventoDedup[] {
  const cfg = p.sanidade.eventos;
  const validos = brutos
    .map((b) => ({ b, tipo: tipoEvento(b.type, p) }))
    .filter(
      (x): x is { b: EventoCorporativoBruto; tipo: TipoEvento } =>
        x.tipo !== null && Number.isFinite(x.b.factor) && x.b.factor > 0 && x.b.factor !== 1,
    )
    .sort((a, b) => a.b.symbol.localeCompare(b.b.symbol) || a.b.date.localeCompare(b.b.date));
  const out: EventoDedup[] = [];
  for (const { b, tipo } of validos) {
    const par = out.find(
      (e) =>
        e.symbol === b.symbol &&
        dentroTol(e.fator, b.factor, cfg.dedupFatorTolPct) &&
        Math.abs(ms(b.date) - ms(e.dataEvento)) <= cfg.dedupDias * DIA_MS,
    );
    if (par) {
      par.idsOrigem.push(b.id);
      if (!par.fontes.includes(b.source)) par.fontes.push(b.source);
      continue;
    }
    out.push({
      symbol: b.symbol,
      dataEvento: b.date,
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

export interface MesCotasFii {
  refMonth: string;
  cotas: number | null;
  fatorDesdobramento: number | null;
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
      .map((e, idx) => ({ idx, fator: e.fator, fixo: cands[idx].length === 1 }))
      .filter((x) => resultado[x.idx] === null && cands[x.idx].includes(a));
    if (pendentes.length === 0) continue;
    if (!fim || !ini) continue;
    const razao = fim.total / ini.total;
    const sel = melhorSubconjunto(pendentes, razao, tol);
    const prodAno = produto(pendentes.map((x) => x.fator));
    for (const x of pendentes) {
      const e = eventos[x.idx];
      const ultimoCandidato = cands[x.idx][cands[x.idx].length - 1] === a;
      if (sel?.has(x.idx)) {
        resultado[x.idx] = completo(e, a, 'confirmado', razao, prodAno);
      } else if (ultimoCandidato) {
        // não entrou no subconjunto que bate: ações não mudaram (ou o subconjunto bastou) ⇒
        // descartado; nada bate e a razão ≠ 1 ⇒ emissão/recompra no ano
        const status = sel !== null ? 'descartado' : 'emissao_recompra';
        resultado[x.idx] = completo(e, a, status, razao, prodAno);
      }
    }
  }

  // sem contagem validada no(s) ano(s) candidato(s): não validável (anoBase = ano da data)
  return eventos.map(
    (e, idx) => resultado[idx] ?? completo(e, ano(e.dataEvento), 'nao_validavel', null, null),
  );
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
      out.push(
        completo(
          e,
          ano(e.dataEvento),
          semMudanca ? 'descartado' : 'emissao_recompra',
          razoes[0],
          e.fator,
        ),
      );
    }
  }

  // fatorDesdobramento do Informe Mensal sem evento bruto no mês ⇒ evento confirmado (regra 22)
  for (const m of meses) {
    if (m.fatorDesdobramento === null || !(m.fatorDesdobramento > 1)) continue;
    if (mesesComEvento.has(m.refMonth) || mesesComEvento.has(mesAnterior(m.refMonth))) continue;
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

/** Π dos eventos CONFIRMADOS com data estritamente posterior a `data`. */
export function fatorEventosApos(
  eventos: Array<Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>>,
  data: string,
): number {
  return produto(
    eventos.filter((e) => e.status === 'confirmado' && e.dataEvento > data).map((e) => e.fator),
  );
}

/** Π dos eventos CONFIRMADOS com data em (de, ate]. */
export function fatorEventosEntre(
  eventos: Array<Pick<EventoCorporativoVerificado, 'dataEvento' | 'fator' | 'status'>>,
  de: string,
  ate: string,
): number {
  return produto(
    eventos
      .filter((e) => e.status === 'confirmado' && e.dataEvento > de && e.dataEvento <= ate)
      .map((e) => e.fator),
  );
}

/** Π dos eventos CONFIRMADOS com anoBase > ano (ajuste de série anual à base de hoje). */
export function fatorEventosAnoBaseApos(
  eventos: Array<Pick<EventoCorporativoVerificado, 'anoBase' | 'fator' | 'status'>>,
  anoFiscal: number,
): number {
  return produto(
    eventos.filter((e) => e.status === 'confirmado' && e.anoBase > anoFiscal).map((e) => e.fator),
  );
}

/** Π dos eventos CONFIRMADOS com anoBase = ano. */
export function fatorEventosDoAno(
  eventos: Array<Pick<EventoCorporativoVerificado, 'anoBase' | 'fator' | 'status'>>,
  anoFiscal: number,
): number {
  return produto(
    eventos.filter((e) => e.status === 'confirmado' && e.anoBase === anoFiscal).map((e) => e.fator),
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
        .filter((e) => e.status === 'confirmado' && `${e.dataEvento.slice(0, 7)}-01` > m.refMonth)
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
