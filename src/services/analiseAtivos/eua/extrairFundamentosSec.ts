/**
 * Extração PURA dos exercícios anuais (FY) de um companyfacts da SEC — Stocks e REITs, fatia A.
 *
 * Regras (desenho.json → final.pipeline_dados §2 "Extração"):
 * - FY = fato de duração de 350–380 dias vindo de 10-K / 10-K/A / 10-KT; balanço = fato instantâneo
 *   na data de término do FY, também de formulário anual;
 * - balanço (instante): do 10-K do próprio exercício; sem nenhum passo da cadeia nele, o
 *   comparativo do 10-K seguinte; nunca de 10-K mais tardio (nota com o mesmo conceito: WELL 2020,
 *   AMT 2019, PLD 2021). Exceção de escala: o valor do próprio 10-K que difere ≥ 100× do mesmo
 *   conceito na mesma data no comparativo do 10-K seguinte cede ao comparativo (TSLA 2016:
 *   LongTermDebt 5.892.016 — em milhares — contra 5.892.016.000; sourceConcept.escalaCorrigida);
 * - dívida bruta: passo com valor irrisório (< 1% de outro passo da cadeia na mesma data, inclusive
 *   zero) conta como ausente (ORCL 2022: LongTermDebt 0 contra 75,9 bi combinados; AMD 2021:
 *   LongTermDebt 1 mi contra 313 mi; sourceConcept.passoDescartado);
 * - por data de término, vale o ÚLTIMO arquivado (reapresentação e desdobramento: AAPL 2018 como
 *   reapresentado no 10-K de 2020);
 * - cadeias por campo e por ano (cadeiasConceitos), conceito usado em sourceConcept;
 * - ano rotulado pelo TÉRMINO do exercício; término em janeiro/fevereiro conta como o ano anterior
 *   (WMT 31/01/2026 = FY2025); dois términos no mesmo rótulo → fica o mais recente;
 * - EBITDA em 3 degraus gravado como `ebit` + `depreciacaoAmortizacao` (o leitor soma os dois,
 *   como no BR): degrau 1 ebit = lucro operacional; degrau 2 ebit = lucro antes do IR + juros
 *   (flag ebitda_pre_ir); degrau 3 ebit = lucro líquido + IR (opcional: REIT) + juros (flag
 *   ebitda_lucro);
 * - DPA: CashPaid → Declared (se não for suspeito) → derivado = dividendos pagos ÷ média diluída
 *   (flag dpa_derivado; Declared suspeito ganha também declared_suspeito);
 * - dividendos pagos: cadeia (… → PaymentsOfCapitalDistribution) → DPA × média diluída
 *   (sourceConcept 'derivado:dpa×acoesMediaDiluida');
 * - capex, dividendos pagos, recompras e DPA são positivos: sinal trocado no arquivo (CCI) volta
 *   ao valor absoluto (sourceConcept.sinalCorrigido);
 * - dívida bruta TOTAL em dividaBrutaLp (dividaBrutaCp = null: o XBRL não separa de forma estável);
 *   sem conceito de dívida = null (sem dado — nunca zero).
 *
 * Nada de I/O: recebe o JSON já parseado e devolve números (o repositório converte para Decimal).
 */
import {
  CADEIAS_SEC,
  CAMPOS_SEC,
  type CadeiaCampo,
  type CampoSec,
} from '@/services/analiseAtivos/eua/cadeiasConceitos';
import {
  alertasSanidade,
  declaredSuspeito,
  type AlertaSanidade,
} from '@/services/analiseAtivos/eua/sanidadeSec';
import {
  FORMULARIOS_ANUAIS_SEC,
  SEC_URLS,
  emissorIdSec,
  normalizarCik,
  type FlagFundamentoSec,
  type OrigemDpa,
} from '@/types/analiseAtivosEua';

// ---------------------------------------------------------------------------
// Formato do companyfacts (data.sec.gov/api/xbrl/companyfacts/CIK##########.json)
// ---------------------------------------------------------------------------

export interface FatoSec {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFactsSec {
  cik: number | string;
  entityName: string;
  facts: Record<string, Record<string, { label?: string; units: Record<string, FatoSec[]> }>>;
}

export const DURACAO_FY_MIN_DIAS = 350;
export const DURACAO_FY_MAX_DIAS = 380;

/**
 * Prazos entre o fim do exercício e o arquivamento de um fato de BALANÇO (instante). Vale o 10-K do
 * próprio ano (sai em até ~3 meses; atrasado, alguns meses a mais), em toda a cadeia. Só sem nenhum
 * passo da cadeia nele entra o comparativo do 10-K seguinte (~13–14 meses: GOOGL 2014, empresa
 * criada em 2015). O comparativo não substitui o valor do próprio ano: o 10-K posterior pode trazer
 * outro item com o mesmo conceito numa nota (WELL 2020: LongTermDebt 2,4 bi no 10-K de 2022 contra
 * 13,9 bi; AMT 2019: 1,9 mi no 10-K de 2021, com 21,1 bi + 2,9 bi no balanço; PLD 2021: 215 mi no
 * 10-K de 2024 contra 17,7 bi). Mais tarde que o comparativo, nunca. A única troca é o erro de
 * escala: o mesmo conceito, na mesma data, ≥ 100× diferente no comparativo do 10-K seguinte (TSLA
 * 2016 em milhares no próprio 10-K) — aí vale o comparativo (RAZAO_ESCALA_COMPARATIVO).
 */
export const BALANCO_PRAZO_PROPRIO_DIAS = 300;
export const BALANCO_PRAZO_COMPARATIVO_DIAS = 460;
/**
 * Razão entre o valor do próprio 10-K e o comparativo do 10-K seguinte (mesmo conceito, mesma data)
 * a partir da qual o próprio é erro de escala (milhares/milhões no lugar de dólares) e cede ao
 * comparativo. Reapresentação legítima não chega perto: WELL 2020 (nota no 10-K de 2022) é 5,8×.
 */
export const RAZAO_ESCALA_COMPARATIVO = 100;
/** Passo de dívida abaixo desta fração de outro passo na mesma data conta como ausente. */
export const FRACAO_PASSO_IRRISORIO = 0.01;

const FORMS = new Set<string>(FORMULARIOS_ANUAIS_SEC);
const DIA_MS = 86_400_000;
const dias = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DIA_MS;

/** Ano fiscal pelo término: jan/fev = ano anterior ('2026-01-31' → 2025). */
export function anoFiscalDoTermino(fim: string): number {
  const ano = Number(fim.slice(0, 4));
  const mes = Number(fim.slice(5, 7));
  return mes <= 2 ? ano - 1 : ano;
}

interface ValorAnual {
  val: number;
  filed: string;
  accn: string;
  form: string;
  start: string | null;
  primeiroFiled: string;
}

/**
 * Valores anuais de um conceito por data de término (último arquivado vence; empate de data de
 * arquivamento: o maior accession). Duração: só 350–380 dias; instante: só fatos sem início (e,
 * com `prazoMaxDias`, arquivados até N dias depois da data do balanço).
 */
export function anuaisDoConceito(
  fatos: readonly FatoSec[] | undefined,
  tipo: 'duracao' | 'instante',
  /** só instante: descarta fatos arquivados mais de N dias depois da data do balanço */
  prazoMaxDias?: number,
): Map<string, ValorAnual> {
  const m = new Map<string, ValorAnual>();
  if (!fatos) return m;
  for (const f of fatos) {
    if (!FORMS.has(f.form) || typeof f.val !== 'number' || !Number.isFinite(f.val)) continue;
    if (tipo === 'duracao') {
      if (!f.start) continue;
      const d = dias(f.start, f.end);
      if (d < DURACAO_FY_MIN_DIAS || d > DURACAO_FY_MAX_DIAS) continue;
    } else if (f.start) {
      continue;
    } else if (prazoMaxDias !== undefined && dias(f.end, f.filed) > prazoMaxDias) {
      continue;
    }
    const cur = m.get(f.end);
    if (!cur) {
      m.set(f.end, {
        val: f.val,
        filed: f.filed,
        accn: f.accn,
        form: f.form,
        start: f.start ?? null,
        primeiroFiled: f.filed,
      });
      continue;
    }
    if (f.filed < cur.primeiroFiled) cur.primeiroFiled = f.filed;
    if (f.filed > cur.filed || (f.filed === cur.filed && f.accn > cur.accn)) {
      cur.val = f.val;
      cur.filed = f.filed;
      cur.accn = f.accn;
      cur.form = f.form;
      cur.start = f.start ?? null;
    }
  }
  return m;
}

/** Leitor com cache por (taxonomia, conceito, unidade, tipo) — cada série é montada uma vez. */
function criarLeitor(cf: CompanyFactsSec) {
  const cache = new Map<string, Map<string, ValorAnual>>();
  return (
    taxonomia: string,
    conceito: string,
    unidade: string,
    tipo: 'duracao' | 'instante',
    prazoMaxDias?: number,
  ) => {
    const k = `${taxonomia}:${conceito}:${unidade}:${tipo}:${prazoMaxDias ?? ''}`;
    let s = cache.get(k);
    if (!s) {
      s = anuaisDoConceito(cf.facts[taxonomia]?.[conceito]?.units[unidade], tipo, prazoMaxDias);
      cache.set(k, s);
    }
    return s;
  };
}
type Leitor = ReturnType<typeof criarLeitor>;

export interface ValorCampo {
  val: number;
  conceito: string;
  filed: string;
  accn: string;
  /** conceitos do próprio 10-K trocados pelo comparativo do seguinte (erro de escala) */
  escalaCorrigida?: string[];
  /** passos irrisórios (< 1% de outro, inclusive zero) pulados antes do passo usado */
  descartados?: string[];
}

/**
 * Primeiro passo da cadeia com valor na data de término `fim`. Balanço: a cadeia inteira no 10-K do
 * próprio exercício; sem nada nele, a cadeia inteira até o comparativo do 10-K seguinte.
 */
export function valorDaCadeia(ler: Leitor, c: CadeiaCampo, fim: string): ValorCampo | null {
  if (c.tipo === 'instante') {
    return (
      valorDaCadeiaNoPrazo(ler, c, fim, BALANCO_PRAZO_PROPRIO_DIAS, true) ??
      valorDaCadeiaNoPrazo(ler, c, fim, BALANCO_PRAZO_COMPARATIVO_DIAS, false)
    );
  }
  return valorDaCadeiaNoPrazo(ler, c, fim, undefined, false);
}

/** Diferem ≥ RAZAO_ESCALA_COMPARATIVO× (os dois ≠ 0, mesmo sinal)? */
function divergeEscala(a: number, b: number): boolean {
  if (a === 0 || b === 0 || Math.sign(a) !== Math.sign(b)) return false;
  const r = Math.abs(a / b);
  return r >= RAZAO_ESCALA_COMPARATIVO || r <= 1 / RAZAO_ESCALA_COMPARATIVO;
}

function valorDaCadeiaNoPrazo(
  ler: Leitor,
  c: CadeiaCampo,
  fim: string,
  prazoMaxDias: number | undefined,
  /** balanço do próprio 10-K: confere a escala contra o comparativo do 10-K seguinte */
  conferirEscala: boolean,
): ValorCampo | null {
  const candidatos: ValorCampo[] = [];
  for (const p of c.passos) {
    let soma = 0;
    let base: ValorAnual | null = null;
    let ok = true;
    const corrigidos: string[] = [];
    for (const t of p.termos) {
      let v = ler(t.taxonomia, t.conceito, c.unidade, c.tipo, prazoMaxDias).get(fim);
      if (!v) {
        if (t.opcional) continue;
        ok = false;
        break;
      }
      if (conferirEscala) {
        const comp = ler(
          t.taxonomia,
          t.conceito,
          c.unidade,
          c.tipo,
          BALANCO_PRAZO_COMPARATIVO_DIAS,
        ).get(fim);
        if (comp && comp.filed > v.filed && divergeEscala(v.val, comp.val)) {
          v = comp;
          corrigidos.push(t.conceito);
        }
      }
      soma += t.sinal * v.val;
      if (!base) base = v;
    }
    if (!ok || !base) continue;
    const x: ValorCampo = { val: soma, conceito: p.rotulo, filed: base.filed, accn: base.accn };
    if (corrigidos.length > 0) x.escalaCorrigida = corrigidos;
    if (!c.descartaIrrisorio) return x;
    candidatos.push(x);
  }
  return escolherSemIrrisorio(candidatos);
}

/**
 * Primeiro candidato (ordem da cadeia) que não é irrisório: < FRACAO_PASSO_IRRISORIO do maior
 * candidato da mesma data (zero incluído). Todos irrisórios ou nenhum positivo: o primeiro.
 */
function escolherSemIrrisorio(candidatos: ValorCampo[]): ValorCampo | null {
  if (candidatos.length === 0) return null;
  const maior = Math.max(...candidatos.map((x) => x.val));
  if (!(maior > 0)) return candidatos[0];
  const i = candidatos.findIndex((x) => x.val >= FRACAO_PASSO_IRRISORIO * maior);
  if (i <= 0) return candidatos[0];
  return { ...candidatos[i], descartados: candidatos.slice(0, i).map((x) => x.conceito) };
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

/** Um FY extraído (valores em US$, ações em unidades, por ação em US$). */
export interface PeriodoSec {
  emissorId: string;
  cik: string;
  anoFiscal: number;
  dtIni: string;
  dtFim: string;
  accession: string;
  /** formulário do fato âncora (10-K, 10-K/A, 10-KT); docTipo gravado = '10-K' */
  formulario: string;
  dtEntrega: string;
  dtEntregaOriginal: string;
  sourceUrl: string;
  receita: number | null;
  ebit: number | null;
  depreciacaoAmortizacao: number | null;
  lucroLiquido: number | null;
  lucroAtribuivel: number | null;
  ativoTotal: number | null;
  caixa: number | null;
  aplicacoesFinanceiras: number | null;
  dividaBrutaCp: number | null;
  dividaBrutaLp: number | null;
  pl: number | null;
  plControladora: number | null;
  fco: number | null;
  capex: number | null;
  dividendosJcpPagos: number | null;
  recompras: number | null;
  lpaOn: number | null;
  acoesMediaDiluida: number | null;
  dpa: number | null;
  dpaOrigem: OrigemDpa | null;
  /** campo gravado → conceito XBRL usado ('OperatingIncomeLoss', 'pre_ir:…+juros:…') */
  sourceConcept: Record<string, string>;
  flags: FlagFundamentoSec[];
}

export interface ResultadoExtracaoSec {
  cik: string;
  nome: string;
  periodos: PeriodoSec[];
  alertas: AlertaSanidade[];
}

/** Campos âncora que definem os términos de exercício (o FY existe se um deles tem valor anual). */
const CAMPOS_ANCORA: CampoSec[] = ['receita', 'lucroControladora', 'fco'];

export interface OpcoesExtracao {
  /** só FY com rótulo ≥ este ano (padrão: todos) */
  anoMinimo?: number;
}

/** Campos que o US GAAP informa como valor positivo (saída de caixa, dividendo por ação). */
export const CAMPOS_POSITIVOS: readonly CampoSec[] = [
  'capex',
  'dividendosPagos',
  'recompras',
  'dpaCashPaid',
  'dpaDeclared',
];

/** Campos comparados entre anos para a flag 'troca_conceito'. */
const CAMPOS_TROCA: readonly string[] = [
  'receita',
  'lucroAtribuivel',
  'ebit',
  'depreciacaoAmortizacao',
  'dividaBrutaLp',
  'fco',
  'capex',
  'dividendosJcpPagos',
];

export function extrairFundamentosSec(
  cf: CompanyFactsSec,
  opts: OpcoesExtracao = {},
): ResultadoExtracaoSec {
  const cik = normalizarCik(cf.cik);
  const ler = criarLeitor(cf);

  // 1. términos de exercício pelos campos âncora (todos os passos de todas as cadeias âncora)
  const porAno = new Map<number, { fim: string; ini: string | null }>();
  for (const campo of CAMPOS_ANCORA) {
    const c = CADEIAS_SEC[campo];
    for (const p of c.passos) {
      const t = p.termos[0];
      for (const [fim, v] of ler(t.taxonomia, t.conceito, c.unidade, c.tipo)) {
        const ano = anoFiscalDoTermino(fim);
        const cur = porAno.get(ano);
        if (!cur || fim > cur.fim) porAno.set(ano, { fim, ini: v.start });
        else if (fim === cur.fim && !cur.ini) cur.ini = v.start;
      }
    }
  }

  const eventos = eventosDesdobramento(cf);
  const periodos: PeriodoSec[] = [];
  const anos = [...porAno.keys()]
    .filter((a) => opts.anoMinimo === undefined || a >= opts.anoMinimo)
    .sort((a, b) => a - b);

  for (const anoFiscal of anos) {
    const { fim, ini } = porAno.get(anoFiscal)!;
    const v = {} as Record<CampoSec, ValorCampo | null>;
    for (const campo of CAMPOS_SEC) v[campo] = valorDaCadeia(ler, CADEIAS_SEC[campo], fim);
    // saídas de caixa e dividendo por ação são positivos por definição no US GAAP; o sinal trocado
    // é erro do arquivo (CCI: PaymentsOfDividendsCommonStock negativo nos 10-K de 2020, 2025 e 2026)
    const sinalTrocado: string[] = [];
    for (const campo of CAMPOS_POSITIVOS) {
      const x = v[campo];
      if (x && x.val < 0) {
        v[campo] = { ...x, val: -x.val };
        sinalTrocado.push(campo);
      }
    }

    const ancora = v.receita ?? v.lucroControladora ?? v.fco;
    if (!ancora) continue;
    // versão = o 10-K mais recente que trouxe algum valor usado (reapresentação de qualquer campo)
    let maisRecente: ValorCampo = ancora;
    for (const x of Object.values(v)) {
      if (
        x &&
        (x.filed > maisRecente.filed ||
          (x.filed === maisRecente.filed && x.accn > maisRecente.accn))
      )
        maisRecente = x;
    }
    const fonte: Record<string, string> = {};
    const flags: FlagFundamentoSec[] = [];
    const usar = (destino: string, x: ValorCampo | null): number | null => {
      if (!x) return null;
      fonte[destino] = x.conceito;
      return x.val;
    };

    const receita = usar('receita', v.receita);
    const lucroAtribuivel = usar('lucroAtribuivel', v.lucroControladora);
    const lucroLiquido = usar('lucroLiquido', v.lucroConsolidado ?? v.lucroControladora);

    // EBITDA em 3 degraus (ebit equivalente + D&A)
    let ebit: number | null = null;
    if (v.lucroOperacional) {
      ebit = usar('ebit', v.lucroOperacional);
    } else if (v.lucroAntesIr && v.juros) {
      ebit = v.lucroAntesIr.val + v.juros.val;
      fonte.ebit = `pre_ir:${v.lucroAntesIr.conceito}+juros:${v.juros.conceito}`;
      flags.push('ebitda_pre_ir');
    } else if (v.lucroControladora && v.juros) {
      // IR opcional: REIT não recolhe IR corporativo (ARE, BXP, AMH sem IncomeTaxExpenseBenefit)
      ebit = v.lucroControladora.val + (v.impostoRenda?.val ?? 0) + v.juros.val;
      fonte.ebit = `lucro:${v.lucroControladora.conceito}+ir:${v.impostoRenda?.conceito ?? 'ausente'}+juros:${v.juros.conceito}`;
      flags.push('ebitda_lucro');
    }
    const depreciacaoAmortizacao = usar('depreciacaoAmortizacao', v.depreciacaoAmortizacao);

    // desdobramento: ano não reapresentado depois de um split vai para a escala atual
    // (fator pelo arquivamento de CADA valor: o 10-K pós-split pode reapresentar o LPA e não o DPA)
    const ajustes: string[] = [];
    const ajustar = (x: ValorCampo | null, campo: string, inverso: boolean): ValorCampo | null => {
      if (!x) return null;
      const f = fatorDesdobramento(eventos, x.filed);
      if (f === 1) return x;
      ajustes.push(`${campo}×${inverso ? `1/${f}` : f}`);
      return { ...x, val: inverso ? x.val / f : x.val * f };
    };
    const porAcao = (x: ValorCampo | null, campo: string) => ajustar(x, campo, true);
    const lpa = porAcao(v.lpaDiluido, 'lpaOn');
    let media = ajustar(
      v.acoesMediaDiluida && v.acoesMediaDiluida.val > 0 ? v.acoesMediaDiluida : null,
      'acoesMediaDiluida',
      false,
    );
    // ações informadas em mil/milhão por engano (MCD 2023+: 751,8 em vez de 751.800.000)
    const escala = media
      ? fatorEscalaAcoes(media.val, v.lucroControladora?.val ?? null, lpa?.val ?? null)
      : 1;
    if (media && escala !== 1) {
      media = { ...media, val: media.val * escala };
      ajustes.push(`acoesMediaDiluida×${escala}(escala)`);
    }
    const acoesMediaDiluida = usar('acoesMediaDiluida', media);
    const cashPaid = porAcao(v.dpaCashPaid, 'dpa');
    const declared = porAcao(v.dpaDeclared, 'dpa');
    const pagos = v.dividendosPagos;

    // DPA: CashPaid → Declared (não suspeito) → derivado
    const d = resolverDpa(cashPaid, declared, pagos, media);
    if (d.conceito) fonte.dpa = d.conceito;
    flags.push(...d.flags);

    if (sinalTrocado.length > 0) fonte.sinalCorrigido = sinalTrocado.join(',');
    const escalas: string[] = [];
    const descartes: string[] = [];
    for (const campo of CAMPOS_SEC) {
      const x = v[campo];
      if (x?.escalaCorrigida) escalas.push(...x.escalaCorrigida.map((k) => `${campo}:${k}`));
      if (x?.descartados) descartes.push(...x.descartados.map((k) => `${campo}:${k}`));
    }
    if (escalas.length > 0) fonte.escalaCorrigida = escalas.join(',');
    if (descartes.length > 0) fonte.passoDescartado = descartes.join(',');
    if (ajustes.length > 0) fonte.ajusteDesdobramento = [...new Set(ajustes)].join(',');

    let dividendosJcpPagos: number | null = usar('dividendosJcpPagos', pagos);
    if (dividendosJcpPagos === null && d.dpa !== null && media && d.origem !== 'derivado') {
      dividendosJcpPagos = d.dpa * media.val;
      fonte.dividendosJcpPagos = 'derivado:dpa×acoesMediaDiluida';
    }

    periodos.push({
      emissorId: emissorIdSec(cik),
      cik,
      anoFiscal,
      dtIni: ini ?? new Date(Date.parse(fim) - 364 * DIA_MS).toISOString().slice(0, 10),
      dtFim: fim,
      accession: maisRecente.accn,
      formulario: ancoraFormulario(ler, fim) ?? '10-K',
      dtEntrega: maisRecente.filed,
      dtEntregaOriginal: primeiroArquivamento(ler, fim) ?? ancora.filed,
      sourceUrl: SEC_URLS.companyfacts.replace('{cik}', cik),
      receita,
      ebit,
      depreciacaoAmortizacao,
      lucroLiquido,
      lucroAtribuivel,
      ativoTotal: usar('ativoTotal', v.ativoTotal),
      caixa: usar('caixa', v.caixa),
      aplicacoesFinanceiras: usar('aplicacoesFinanceiras', v.aplicacoesCp),
      dividaBrutaCp: null,
      dividaBrutaLp: usar('dividaBrutaLp', v.dividaBruta),
      pl: usar('pl', v.plTotal),
      plControladora: usar('plControladora', v.plControladora),
      fco: usar('fco', v.fco),
      capex: usar('capex', v.capex),
      dividendosJcpPagos,
      recompras: usar('recompras', v.recompras),
      lpaOn: usar('lpaOn', lpa),
      acoesMediaDiluida,
      dpa: d.dpa,
      dpaOrigem: d.origem,
      sourceConcept: fonte,
      flags,
    });
  }

  // troca de conceito entre FY consecutivos (informativa)
  for (let i = 1; i < periodos.length; i++) {
    const a = periodos[i - 1].sourceConcept;
    const b = periodos[i].sourceConcept;
    const trocou = CAMPOS_TROCA.some((k) => a[k] && b[k] && a[k] !== b[k]);
    if (trocou && !periodos[i].flags.includes('troca_conceito')) {
      periodos[i].flags.push('troca_conceito');
    }
  }

  const alertas = alertasSanidade(
    periodos.map((p) => ({
      anoFiscal: p.anoFiscal,
      receita: p.receita,
      lucroControladora: p.lucroAtribuivel,
      acoesMediaDiluida: p.acoesMediaDiluida,
      lpaDiluido: p.lpaOn,
      plControladora: p.plControladora,
      dividaBruta: p.dividaBrutaLp,
      caixa: p.caixa,
    })),
  );
  for (const p of periodos) {
    if (p.flags.includes('declared_suspeito')) {
      alertas.push({
        codigo: 'declared_suspeito',
        anoFiscal: p.anoFiscal,
        mensagem:
          'DPA declarado difere > 10% de dividendos pagos ÷ média diluída; usado o derivado',
      });
    }
    if (p.flags.includes('troca_conceito')) {
      alertas.push({
        codigo: 'troca_conceito',
        anoFiscal: p.anoFiscal,
        mensagem: 'série muda de conceito XBRL em relação ao ano anterior',
      });
    }
  }

  return { cik, nome: cf.entityName, periodos, alertas };
}

interface DpaResolvido {
  dpa: number | null;
  origem: OrigemDpa | null;
  conceito: string | null;
  flags: FlagFundamentoSec[];
}

/** DPA: CashPaid → Declared (se não suspeito) → derivado (dividendos pagos ÷ média diluída). */
export function resolverDpa(
  cashPaid: ValorCampo | null,
  declared: ValorCampo | null,
  pagos: ValorCampo | null,
  media: ValorCampo | null,
): DpaResolvido {
  const derivado = (flags: FlagFundamentoSec[]): DpaResolvido =>
    pagos && media
      ? {
          dpa: pagos.val / media.val,
          origem: 'derivado',
          conceito: `derivado:${pagos.conceito}÷${media.conceito}`,
          flags: [...flags, 'dpa_derivado'],
        }
      : { dpa: null, origem: null, conceito: null, flags };
  if (cashPaid)
    return { dpa: cashPaid.val, origem: 'cash_paid', conceito: cashPaid.conceito, flags: [] };
  if (declared) {
    if (declaredSuspeito(declared.val, pagos?.val ?? null, media?.val ?? null)) {
      return derivado(['declared_suspeito']);
    }
    return { dpa: declared.val, origem: 'declared', conceito: declared.conceito, flags: [] };
  }
  return derivado([]);
}

/** Razão mínima entre duas versões da mesma média de ações para contar como desdobramento. */
export const RAZAO_MIN_DESDOBRAMENTO = 1.3;

export interface EventoDesdobramento {
  /** arquivamento ainda na escala velha */
  velho: string;
  /** primeiro arquivamento na escala nova */
  novo: string;
  razao: number;
}

/**
 * Desdobramentos vistos no companyfacts: o 10-K seguinte a um split reapresenta só os anos
 * comparativos (2–3); os mais antigos ficam na escala velha. Um evento é a mesma data de término
 * com a média de ações mudando ≥ 1,3× (ou ≤ 1/1,3) entre dois arquivamentos consecutivos.
 */
export function eventosDesdobramento(cf: CompanyFactsSec): EventoDesdobramento[] {
  const c = CADEIAS_SEC.acoesMediaDiluida;
  const eventos = new Map<string, EventoDesdobramento>();
  for (const p of c.passos) {
    const t = p.termos[0];
    const fatos = cf.facts[t.taxonomia]?.[t.conceito]?.units[c.unidade];
    if (!fatos) continue;
    const porFim = new Map<string, { filed: string; val: number }[]>();
    for (const f of fatos) {
      if (!FORMS.has(f.form) || !f.start || !(f.val > 0)) continue;
      const d = dias(f.start, f.end);
      if (d < DURACAO_FY_MIN_DIAS || d > DURACAO_FY_MAX_DIAS) continue;
      const l = porFim.get(f.end) ?? [];
      l.push({ filed: f.filed, val: f.val });
      porFim.set(f.end, l);
    }
    for (const l of porFim.values()) {
      l.sort((a, b) => a.filed.localeCompare(b.filed));
      for (let i = 1; i < l.length; i++) {
        if (l[i].filed === l[i - 1].filed) continue;
        const r = l[i].val / l[i - 1].val;
        // potência de 1.000 = unidade errada num arquivamento (DLR 2023 em milhares), não split:
        // fica para fatorEscalaAcoes, que confere com lucro ÷ LPA
        if (ehPotenciaDeMil(r)) continue;
        if (r >= RAZAO_MIN_DESDOBRAMENTO || r <= 1 / RAZAO_MIN_DESDOBRAMENTO) {
          const k = l[i].filed;
          if (!eventos.has(k)) {
            eventos.set(k, { velho: l[i - 1].filed, novo: k, razao: arredondarRazao(r) });
          }
        }
      }
    }
    if (porFim.size > 0) break; // só o primeiro conceito da cadeia que existe
  }
  return [...eventos.values()].sort((a, b) => a.novo.localeCompare(b.novo));
}

/**
 * Fator que leva um valor arquivado em `filed` para a escala atual: produto das razões dos eventos
 * posteriores a ele (velho ≥ filed). Ex.: AAPL 4:1 de 2020 — LPA de 2017 (último em out/2019) ×1/4;
 * o de 2018 (reapresentado em out/2020) fica como está.
 */
export function fatorDesdobramento(eventos: readonly EventoDesdobramento[], filed: string): number {
  let f = 1;
  for (const e of eventos) if (e.velho >= filed) f *= e.razao;
  return Math.abs(f - 1) < 1e-9 ? 1 : f;
}

/** r ≈ 10^±3 ou 10^±6 (±2%)? */
export function ehPotenciaDeMil(r: number): boolean {
  if (!(r > 0)) return false;
  const e = Math.log10(r);
  const n = Math.round(e / 3) * 3;
  return n !== 0 && Math.abs(r / 10 ** n - 1) <= 0.02;
}

/**
 * Fator (10^±3 ou 10^±6) que leva a média de ações à escala de lucro ÷ LPA, quando ela foi
 * informada em mil/milhão por engano; 1 quando já bate (±50%) ou sem lucro/LPA para conferir.
 */
export function fatorEscalaAcoes(media: number, lucro: number | null, lpa: number | null): number {
  if (lucro === null || lpa === null || Math.abs(lpa) < 0.01 || !(media > 0)) return 1;
  const implicita = lucro / lpa;
  if (!(implicita > 0)) return 1;
  const k = implicita / media;
  if (k >= 0.5 && k <= 2) return 1;
  for (const n of [3, 6, -3, -6]) {
    const q = k / 10 ** n;
    if (q >= 0.5 && q <= 2) return 10 ** n;
  }
  return 1;
}

/** Razões de split são frações simples (4, 7, 1/10, 3/2): arredonda para 2 casas significativas. */
function arredondarRazao(r: number): number {
  return r >= 1 ? Math.round(r * 100) / 100 : 1 / (Math.round((1 / r) * 100) / 100);
}

/** Formulário anual que trouxe por último o lucro/receita deste término. */
function ancoraFormulario(ler: Leitor, fim: string): string | null {
  for (const campo of CAMPOS_ANCORA) {
    const c = CADEIAS_SEC[campo];
    for (const p of c.passos) {
      const t = p.termos[0];
      const v = ler(t.taxonomia, t.conceito, c.unidade, c.tipo).get(fim);
      if (v) return v.form;
    }
  }
  return null;
}

/** Primeiro arquivamento (dtEntregaOriginal) de qualquer fato âncora deste término. */
function primeiroArquivamento(ler: Leitor, fim: string): string | null {
  let menor: string | null = null;
  for (const campo of CAMPOS_ANCORA) {
    const c = CADEIAS_SEC[campo];
    for (const p of c.passos) {
      const t = p.termos[0];
      const v = ler(t.taxonomia, t.conceito, c.unidade, c.tipo).get(fim);
      if (v && (menor === null || v.primeiroFiled < menor)) menor = v.primeiroFiled;
    }
  }
  return menor;
}
