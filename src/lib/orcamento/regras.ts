/**
 * Regras do Orçamento v2 (ticket 86e3v8p3u, spec v1.3 §5 R-01..R-18): núcleo PURO e isomórfico.
 * Usado pela montagem no servidor (`services/cashflow/orcamentoV2/montarOrcamento`) e pela UI
 * otimista (recalcular a linha, a categoria e os KPIs depois de editar um orçado), sempre com as
 * mesmas funções — o front nunca inventa status nem ritmo.
 *
 * Sem Prisma, sem fetch e sem `new Date()` sem argumento: a data de referência ("hoje" em
 * America/Sao_Paulo, mesmo critério de `orcamentoAlertas`) chega por parâmetro.
 *
 * Convenções:
 * - mês 0–11 (`mes0`), igual a `CashflowValue`; a API converte para 1–12;
 * - valores em R$ arredondados a centavos nas somas (evita 273,70000000000005);
 * - `consumido` é FRAÇÃO (0,9083), sem arredondar (a barra precisa da precisão; a tela mostra 0
 *   casas). Os percentuais "de leitura" (% da receita, % do orçado, índice de poupança) já saem
 *   em PONTOS PERCENTUAIS com 1 casa (75,1), como na resposta da spec §8.1;
 * - receita `null` (ou ≤ 0) = "sem receita prevista": % da receita, sobra e índice ficam `null` e
 *   orçados em % valem 0 até a receita existir (spec §12.1).
 */

export type StatusOrcamento = 'ok' | 'warn' | 'bad' | 'none';
export type FaseMes = 'passado' | 'corrente' | 'futuro';

/** "Hoje" em America/Sao_Paulo, já decomposto (quem chama resolve o fuso). */
export interface HojeSP {
  ano: number;
  mes0: number;
  dia: number;
}

export interface Orcado {
  valor: number | null;
  pct: number | null;
}

/** R-08: "estouro" só acima de 100,5% (centavos de arredondamento não acendem vermelho). */
export const TOLERANCIA_ESTOURO = 1.005;
/** R-08: "à frente do ritmo" a partir de 80% consumido… */
export const LIMIAR_A_FRENTE = 0.8;
/** …e 10 p.p. acima da fração do período decorrida. */
export const MARGEM_RITMO = 0.1;
/** R-18: nome de subcategoria com 1–60 caracteres. */
export const NOME_MAX = 60;

/** Folga para comparações `>=` em ponto flutuante (0,1 − 0,0999999… não pode virar "ok"). */
const EPS = 1e-9;

const arred = (n: number, casas: number): number => {
  const f = 10 ** casas;
  return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
};
/** Centavos. */
export const arred2 = (n: number): number => arred(n, 2);
/** 1 casa (pct do orçado, % de leitura). */
export const arred1 = (n: number): number => arred(n, 1);

const temReceita = (receita: number | null | undefined): receita is number =>
  typeof receita === 'number' && receita > 0;

const soma = (ns: number[]): number => arred2(ns.reduce((a, n) => a + n, 0));

/**
 * R-08/R-09: realizado ACIMA de orçado × 1,005, comparado em centavos inteiros (10,05 ÷ 10 dá
 * 1,0050000000000001 em ponto flutuante e acenderia "estouro" exatamente em 100,5%).
 */
const passouDaTolerancia = (orcado: number, realizado: number): boolean =>
  Math.round(realizado * 100) * 1000 >
  Math.round(orcado * 100) * Math.round(TOLERANCIA_ESTOURO * 1000);

// ─── Calendário (R-06, R-15) ────────────────────────────────────────────────────────────────

export function diasNoMes(ano: number, mes0: number): number {
  // Date.UTC é determinístico (sem fuso): dia 0 do mês seguinte = último dia deste.
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

const bissexto = (ano: number): boolean => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

/** Dias de 1º/jan até o fim de `mes0` (inclusive). */
function diasAteFimDoMes(ano: number, mes0: number): number {
  let total = 0;
  for (let m = 0; m <= mes0; m++) total += diasNoMes(ano, m);
  return total;
}

/** Fase de (ano, mes0) em relação a hoje. */
export function faseDoMes(ano: number, mes0: number, hojeSP: HojeSP): FaseMes {
  if (ano < hojeSP.ano || (ano === hojeSP.ano && mes0 < hojeSP.mes0)) return 'passado';
  if (ano === hojeSP.ano && mes0 === hojeSP.mes0) return 'corrente';
  return 'futuro';
}

/**
 * R-06, ritmo do mês: passado = 1 (mês fechado: só "estouro" é possível); corrente = dia ÷ dias
 * do mês (23/31 = 0,742); futuro = 1 (Q18/§6.1 do desenho: no Lançado o "realizado" do futuro é
 * o PREVISTO, comparado com o orçado inteiro — ritmo 0 acenderia "à frente" em massa). O `dia`
 * de um mês futuro é 0 (a UI troca o rótulo para "Previsto", sem "dias para fechar").
 */
export function ritmoDoMes(
  ano: number,
  mes0: number,
  hojeSP: HojeSP,
): { dia: number; diasNoMes: number; ritmo: number; fase: FaseMes } {
  const dias = diasNoMes(ano, mes0);
  const fase = faseDoMes(ano, mes0, hojeSP);
  if (fase === 'passado') return { dia: dias, diasNoMes: dias, ritmo: 1, fase };
  if (fase === 'futuro') return { dia: 0, diasNoMes: dias, ritmo: 1, fase };
  const dia = Math.min(Math.max(hojeSP.dia, 1), dias);
  return { dia, diasNoMes: dias, ritmo: dia / dias, fase };
}

/** Dias do ano (365/366). */
export const diasNoAno = (ano: number): number => (bissexto(ano) ? 366 : 365);

/**
 * R-15 (spec §5 e R-06), ritmo do acumulado (jan..mes0) com `mes0` corrente: dias decorridos no
 * ano ÷ dias do ano (23/out/2026 = 296/365 = 0,811). Período já fechado = 1 e período que termina
 * no futuro = 1 (mesma leitura de previsto do R-06/Q18).
 */
export function ritmoDoAno(ano: number, mes0: number, hojeSP: HojeSP): number {
  const fase = faseDoMes(ano, mes0, hojeSP);
  if (fase !== 'corrente') return 1;
  const decorridos = diasAteFimDoMes(ano, mes0 - 1) + ritmoDoMes(ano, mes0, hojeSP).dia;
  return decorridos / diasNoAno(ano);
}

// ─── Orçado (R-01, R-17) ────────────────────────────────────────────────────────────────────

/**
 * R-17, orçado efetivo em R$: `valor`, ou `round(receita × pct ÷ 100, 2)`. Sem receita, um orçado
 * em % vale 0. Sem orçado (os dois nulos) = 0.
 */
export function orcadoEfetivo(o: Orcado, receita: number | null): number {
  if (o.pct !== null && o.pct !== undefined) {
    return temReceita(receita) ? arred2((receita * o.pct) / 100) : 0;
  }
  return o.valor ?? 0;
}

/**
 * R-17, troca de modo R$ ↔ % (botão da linha): R$ → % arredonda a 1 casa; % → R$ a 2 casas
 * (T23: 1.500 com receita 24.000 → 6,3%; T25: 7% → 1.680 → 7,0%). Já no modo pedido → igual.
 * Para % sem receita não há conversão possível: devolve o atual (a UI desabilita o botão).
 */
export function converterModo(
  alvo: 'valor' | 'pct',
  atual: Orcado,
  receita: number | null,
): Orcado {
  if (alvo === 'valor') {
    if (atual.pct === null) return { valor: atual.valor, pct: null };
    return { valor: orcadoEfetivo(atual, receita), pct: null };
  }
  if (atual.pct !== null) return { valor: null, pct: atual.pct };
  if (!temReceita(receita)) return { valor: atual.valor, pct: null };
  const pct = arred1(((atual.valor ?? 0) / receita) * 100);
  return { valor: null, pct: Math.min(100, Math.max(0, pct)) };
}

/**
 * R-17: só subcategorias NÃO Geral de categoria poupança (Planejamento Financeiro) aceitam %.
 * A Geral fica sempre em valor (T26), inclusive a de Planejamento.
 */
export const aceitaPct = (sub: { geral: boolean }, categoria: { poupanca: boolean }): boolean =>
  categoria.poupanca && !sub.geral;

/**
 * R-07: fixa = a escolha do usuário (`orcamentoFixa`) ou o padrão do catálogo; em Planejamento
 * Financeiro é sempre fixa (inclusive a Geral, D9) — aporte planejado não "corre à frente".
 */
export function subcategoriaFixa(s: {
  orcamentoFixa: boolean | null;
  fixaPadrao: boolean;
  poupanca: boolean;
}): boolean {
  if (s.poupanca) return true;
  return s.orcamentoFixa ?? s.fixaPadrao;
}

// ─── Linha (R-04, R-05, R-08) ───────────────────────────────────────────────────────────────

/** R-04: diferença = orçado − realizado (negativa = estouro). */
export const diferenca = (orcado: number, realizado: number): number => arred2(orcado - realizado);

/** R-05: consumido = realizado ÷ orçado, sem teto (pode passar de 1); `null` com orçado 0 ("—"). */
export function consumido(orcado: number, realizado: number): number | null {
  if (!(orcado > 0)) return null;
  return realizado / orcado;
}

/**
 * R-08, status da subcategoria (a função da spec, igual no backend e no front):
 * - orçado 0 → 'bad' se houve gasto, senão 'none';
 * - consumido > 1,005 → 'bad' (mesmo fixa);
 * - fixa → 'ok' (fixa só avisa quando passa);
 * - consumido ≥ 0,80 e (consumido − ritmo) ≥ 0,10 → 'warn' ("à frente do ritmo");
 * - senão 'ok'.
 */
export function statusSubcategoria(
  orcado: number,
  realizado: number,
  fixa: boolean,
  ritmo: number,
): StatusOrcamento {
  if (!(orcado > 0)) return realizado > 0 ? 'bad' : 'none';
  if (passouDaTolerancia(orcado, realizado)) return 'bad';
  const p = realizado / orcado;
  if (fixa) return 'ok';
  if (p >= LIMIAR_A_FRENTE - EPS && p - ritmo >= MARGEM_RITMO - EPS) return 'warn';
  return 'ok';
}

/**
 * R-09, status da categoria (também serve à linha Total, passando as categorias — corrige a
 * D16): Σ orçado 0 → 'bad' se houve gasto, senão 'none'; Σ realizado > Σ orçado × 1,005 → 'bad';
 * alguma sub 'warn' → 'warn'; senão 'ok'. Os contadores contam as linhas 'bad' e 'warn' (é o
 * que impede um estouro de sub de se esconder numa categoria que, no total, está dentro).
 */
export function statusCategoria(
  subs: { orcado: number; realizado: number; status: StatusOrcamento }[],
): { status: StatusOrcamento; qtdEstouro: number; qtdAFrente: number } {
  const orcado = soma(subs.map((s) => s.orcado));
  const realizado = soma(subs.map((s) => s.realizado));
  const qtdEstouro = subs.filter((s) => s.status === 'bad').length;
  const qtdAFrente = subs.filter((s) => s.status === 'warn').length;
  let status: StatusOrcamento;
  if (!(orcado > 0)) status = realizado > 0 ? 'bad' : 'none';
  else if (passouDaTolerancia(orcado, realizado)) status = 'bad';
  else if (qtdAFrente > 0) status = 'warn';
  else status = 'ok';
  return { status, qtdEstouro, qtdAFrente };
}

/** % de `parte` sobre `todo` em pontos percentuais com 1 casa; `null` sem base. */
export function pctDe(parte: number, todo: number | null): number | null {
  if (!temReceita(todo)) return null;
  return arred1((parte / todo) * 100);
}

// ─── Recalcular linha, categoria e resumo (UI otimista e montagem) ─────────────────────────

export interface SubcategoriaEntrada {
  geral: boolean;
  fixa: boolean;
  valor: number | null;
  pct: number | null;
  realizado: number;
}

export interface SubcategoriaCalculada {
  orcado: number;
  realizado: number;
  diferenca: number;
  consumido: number | null;
  status: StatusOrcamento;
}

/** Uma linha de subcategoria: orçado efetivo (R-17), diferença, consumido e status. */
export function calcularSubcategoria(
  s: SubcategoriaEntrada,
  receita: number | null,
  ritmo: number,
): SubcategoriaCalculada {
  const orcado = orcadoEfetivo(s, receita);
  const realizado = arred2(s.realizado);
  return {
    orcado,
    realizado,
    diferenca: diferenca(orcado, realizado),
    consumido: consumido(orcado, realizado),
    status: statusSubcategoria(orcado, realizado, s.fixa, ritmo),
  };
}

export interface CategoriaCalculada {
  orcado: number;
  realizado: number;
  diferenca: number;
  consumido: number | null;
  pctReceita: number | null;
  status: StatusOrcamento;
  qtdEstouro: number;
  qtdAFrente: number;
  /** "n de m subcategorias com orçamento" (orçado > 0). */
  qtdComOrcamento: number;
}

/** R-01 + R-09: a categoria é a soma das subcategorias (nunca tem orçado próprio). */
export function calcularCategoria(
  subs: SubcategoriaCalculada[],
  receita: number | null,
): CategoriaCalculada {
  const orcado = soma(subs.map((s) => s.orcado));
  const realizado = soma(subs.map((s) => s.realizado));
  return {
    orcado,
    realizado,
    diferenca: diferenca(orcado, realizado),
    consumido: consumido(orcado, realizado),
    pctReceita: orcado > 0 ? pctDe(orcado, receita) : null,
    ...statusCategoria(subs),
    qtdComOrcamento: subs.filter((s) => s.orcado > 0).length,
  };
}

export interface ContagensOrcamento {
  estouro: number;
  aFrente: number;
  semOrcamento: number;
}

type SubParaFiltro = { geral: boolean; status: StatusOrcamento };

/** R-10: Estouro = 'bad'; À frente = 'warn'; Sem orçamento = 'none' (orçado 0 e realizado 0) fora da Geral. */
function passaNoFiltro(s: SubParaFiltro, filtro: FiltroOrcamento): boolean {
  switch (filtro) {
    case 'todas':
      return true;
    case 'estouro':
      return s.status === 'bad';
    case 'aFrente':
      return s.status === 'warn';
    case 'semOrcamento':
      return s.status === 'none' && !s.geral;
  }
}

/** R-10: contadores dos chips = total de subcategorias em cada status, independente do filtro ativo. */
export function contarStatus(categorias: { subcategorias: SubParaFiltro[] }[]): ContagensOrcamento {
  const subs = categorias.flatMap((c) => c.subcategorias);
  return {
    estouro: subs.filter((s) => passaNoFiltro(s, 'estouro')).length,
    aFrente: subs.filter((s) => passaNoFiltro(s, 'aFrente')).length,
    semOrcamento: subs.filter((s) => passaNoFiltro(s, 'semOrcamento')).length,
  };
}

export interface ResumoOrcamento {
  orcado: number;
  orcadoPctReceita: number | null;
  realizado: number;
  realizadoPctOrcado: number | null;
  disponivel: number;
  sobraPrevista: number | null;
  indicePoupanca: number | null;
  totalCategorias: number;
  totalSubcategorias: number;
  contagens: ContagensOrcamento;
  status: StatusOrcamento;
}

/**
 * KPIs (spec §4.2/D7) e linha Total:
 * - Orçado = Σ categorias; % da receita = Orçado ÷ Receita;
 * - Realizado e "% do orçado" (Realizado ÷ Orçado);
 * - Disponível = Orçado − Realizado (pode ficar negativo);
 * - Sobra prevista = Receita − Orçado; Índice de poupança = (Receita − Orçado) ÷ Receita (Q3:
 *   fórmula da spec, com Planejamento contando como orçado);
 * - status do Total = `statusCategoria` sobre as categorias.
 */
export function calcularResumo(
  categorias: {
    orcado: number;
    realizado: number;
    status: StatusOrcamento;
    subcategorias: SubParaFiltro[];
  }[],
  receita: number | null,
): ResumoOrcamento {
  const orcado = soma(categorias.map((c) => c.orcado));
  const realizado = soma(categorias.map((c) => c.realizado));
  const comReceita = temReceita(receita);
  return {
    orcado,
    orcadoPctReceita: pctDe(orcado, receita),
    realizado,
    realizadoPctOrcado: orcado > 0 ? arred1((realizado / orcado) * 100) : null,
    disponivel: diferenca(orcado, realizado),
    sobraPrevista: comReceita ? arred2(receita - orcado) : null,
    indicePoupanca: comReceita ? arred1(((receita - orcado) / receita) * 100) : null,
    totalCategorias: categorias.length,
    totalSubcategorias: categorias.reduce((a, c) => a + c.subcategorias.length, 0),
    contagens: contarStatus(categorias),
    status: statusCategoria(categorias).status,
  };
}

// ─── Acumulado do ano (R-15) ────────────────────────────────────────────────────────────────

/**
 * R-15: orçado acumulado de uma subcategoria = Σ jan..mes0 do orçado efetivo de cada mês, com o %
 * convertido pela receita DAQUELE mês. Mês sem orçado (null) conta 0.
 */
export function orcadoAcumulado(
  orcadosPorMes: (Orcado | null | undefined)[],
  receitaPorMes: (number | null | undefined)[],
  mes0: number,
): number {
  const parcelas: number[] = [];
  for (let m = 0; m <= mes0; m++) {
    const o = orcadosPorMes[m];
    if (o) parcelas.push(orcadoEfetivo(o, receitaPorMes[m] ?? null));
  }
  return soma(parcelas);
}

/** R-15: receita acumulada = Σ das receitas mensais conhecidas de jan..mes0; `null` se nenhuma. */
export function receitaAcumulada(
  receitaPorMes: (number | null | undefined)[],
  mes0: number,
): number | null {
  const conhecidas: number[] = [];
  for (let m = 0; m <= mes0; m++) {
    const r = receitaPorMes[m];
    if (typeof r === 'number') conhecidas.push(r);
  }
  return conhecidas.length > 0 ? soma(conhecidas) : null;
}

/** R-15: meses (0–11) de jan..mes0 sem nenhum orçado (tooltip "meses sem orçamento: x"). */
export function mesesSemOrcamento(
  orcadoTotalPorMes: (number | null | undefined)[],
  mes0: number,
): number[] {
  const meses: number[] = [];
  for (let m = 0; m <= mes0; m++) {
    if (!((orcadoTotalPorMes[m] ?? 0) > 0)) meses.push(m);
  }
  return meses;
}

// ─── Entrada do usuário (R-18) ──────────────────────────────────────────────────────────────

/**
 * R-18, valor em R$ no padrão brasileiro: ≥ 0, até 2 casas, milhar com ponto opcional (em grupos
 * de 3) e vírgula decimal. Aceita "1.500,00", "1500,5", "1500", "R$ 1.500". Vazio = 0 (campo
 * limpo). Inválido → `null`: NÃO salva, mostra o erro e restaura o anterior (Q6; T07 revisto —
 * "abc" não vira 0).
 */
export function parseValorBR(texto: string): number | null {
  const t = texto.replace(/^\s*R\$\s*/i, '').trim();
  if (t === '') return 0;
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const inteiro = m[1].replace(/\./g, '');
  const n = Number(`${inteiro}.${m[2] ?? '0'}`);
  return Number.isFinite(n) ? n : null;
}

/** R-18, percentual: 0–100 com até 1 casa (vírgula ou ponto decimal; "%" opcional). Inválido → `null`. */
export function parsePctBR(texto: string): number | null {
  const t = texto.replace(/%\s*$/, '').trim();
  const m = /^(\d{1,3})(?:[.,](\d))?$/.exec(t);
  if (!m) return null;
  const n = Number(`${m[1]}.${m[2] ?? '0'}`);
  return n >= 0 && n <= 100 ? n : null;
}

/** D13: comparação sem acento, sem caixa e sem espaços repetidos/nas pontas. */
export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * R-12/R-18, nome de subcategoria: sem espaços nas pontas, 1–60 caracteres e único dentro da
 * categoria (comparação de `normalizarBusca`, então "Cafés" colide com "cafes"). `irmaos` são os
 * nomes das OUTRAS subcategorias da categoria — num renomear, quem chama tira o próprio item
 * (e a Geral está entre os irmãos, então ninguém cria uma segunda "Geral").
 */
export function validarNomeSubcategoria(
  nome: string,
  irmaos: string[],
): { ok: true; nome: string } | { ok: false; motivo: 'vazio' | 'longo' | 'duplicado' } {
  const limpo = nome.trim();
  if (limpo === '') return { ok: false, motivo: 'vazio' };
  if (limpo.length > NOME_MAX) return { ok: false, motivo: 'longo' };
  const chave = normalizarBusca(limpo);
  if (irmaos.some((i) => normalizarBusca(i) === chave)) return { ok: false, motivo: 'duplicado' };
  return { ok: true, nome: limpo };
}

// ─── Filtros e busca (R-10) ─────────────────────────────────────────────────────────────────

export type FiltroOrcamento = 'todas' | 'estouro' | 'aFrente' | 'semOrcamento';

/**
 * R-10: filtro por status da subcategoria + busca por nome (sem acento/caixa).
 * - Uma sub aparece se passa no filtro E (busca vazia OU o nome dela bate OU o nome da categoria
 *   bate — D13: categoria que bate na busca mostra TODAS as suas subs, respeitado o filtro).
 * - Uma categoria aparece se sobra ao menos uma sub (com filtro 'todas' e sem busca, todas
 *   aparecem, inclusive vazias).
 * Devolve cópias com `subcategorias` já filtradas; a expansão automática e os contadores (que
 * não mudam com o filtro, ver `contarStatus`) ficam com quem chama.
 */
export function filtrarCategorias<
  S extends { nome: string } & SubParaFiltro,
  C extends { nome: string; subcategorias: S[] },
>(cats: C[], filtro: FiltroOrcamento, busca: string): C[] {
  const q = normalizarBusca(busca);
  if (filtro === 'todas' && q === '') return cats;
  const out: C[] = [];
  for (const c of cats) {
    const catBate = q !== '' && normalizarBusca(c.nome).includes(q);
    const subs = c.subcategorias.filter(
      (s) =>
        passaNoFiltro(s, filtro) && (q === '' || catBate || normalizarBusca(s.nome).includes(q)),
    );
    if (subs.length > 0) out.push({ ...c, subcategorias: subs });
  }
  return out;
}
