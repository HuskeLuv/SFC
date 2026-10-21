/**
 * resolverSeries — junta as fontes de fundamentos de UM ativo em séries anuais para os critérios e
 * o Essencial (v2.5, fatia 0; desenho final.camada_fontes §4). FUNÇÃO PURA: a fatia A orquestra com
 * o banco (FonteCvm.lerLocal + repositorio/fontesFundamentos.lerPontosVigentes) e a B usa no
 * Essencial. Nunca chama terceiros.
 *
 * Regras (params.fontes, ver criteriaParamsSchema.fontesEfetivas):
 *  - para cada série, percorre prioridade.porSerie[serie] ?? prioridade.padrao; por ANO, a primeira
 *    fonte com valor COMPLETO no ano vence (fonte fora da lista é ignorada);
 *  - ponto vigente = maior versão de (tipoPeriodo, dtFim) dentro da fonte; só 'approved' chega aqui
 *    (o repositório filtra; 'pending'/'rejected' nunca aparecem);
 *  - incompleto (§6) = valor AUSENTE no ano, com a OrigemSerie marcada incompleto (selo na tela). Um
 *    ponto incompleto NÃO apaga a fonte seguinte: o ano só fica incompleto quando nenhuma fonte da
 *    lista tem valor completo nele (provedor que não mandou a receita não esconde a da CVM);
 *  - valor do ano: o ponto FY do ano fiscal; sem FY, os trimestrais (Q) e, sem eles, os mensais (M)
 *    agregados por agregacaoAnual — 'ultimo' (padrão, decisão 4: o período de dtFim mais recente do
 *    ano) ou 'media' (média dos períodos com valor; algum incompleto = ano incompleto). Com 'ultimo',
 *    se a fonte vencedora só tem períodos (Q/M) que terminam ANTES do período mais recente que outra
 *    fonte da lista tem no ano, vale o mais recente (empate = prioridade): um 4º tri do provedor
 *    ainda em revisão não faz o ano usar o 1º tri dele no lugar do 4º tri da CVM. FY nunca é trocado;
 *  - unidade: o ponto vem na unidade do catálogo (BRL em reais); a saída fica na unidade dos
 *    critérios (BRL → R$ mi, ESCALA_CRITERIO).
 * escolherSerieJanela decide a serieFallback pela JANELA INTEIRA (nunca mistura séries entre anos):
 * se todos os anos exigidos têm a série principal, usa a principal; senão, a de fallback em todos.
 *
 * fundamentei-regras (F1): as séries do REIT ajustadas pela remuneração em ações (fco_acao e pay da
 * v5) caem na série sem ajuste com a obs 'sbc_indisponivel' (OBS_FALLBACK). No payout ajustado,
 * +Infinity (caixa operacional ajustado ≤ 0) é VALOR do ano (fora do limite), não falta de dado:
 * não dispara o fallback (SERIES_INFINITO_E_VALOR). As séries de antes seguem a regra de antes.
 */
import {
  agregacaoDaSerie,
  prioridadeDaSerie,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import type { ObsCriterio, SerieCriterio } from '@/types/analiseAtivosCriterios';
import {
  FLAG_OBRIGACOES_ATIVO_REVISAO,
  LIMITE_REVISAO_OBRIGACOES_ATIVO_PCT,
  SERIE_ALAV_ATIVO,
} from '@/types/analiseAtivosComplementos';
import {
  CATALOGO_SERIES,
  type IdFonte,
  type OrigemSerie,
  type PeriodicidadeSerie,
  type PontoSerieVigente,
  type SerieFundamento,
  type UnidadeSerie,
} from '@/types/analiseAtivosFontes';

/** Série anual por nome canônico (ano → valor na unidade dos critérios; null = sem dado). */
export type SeriesResolvidas = Partial<Record<SerieFundamento, Record<number, number | null>>>;

/** Origem por série e ano. */
export type OrigensSeries = Partial<Record<SerieFundamento, Record<number, OrigemSerie>>>;

export interface ResultadoResolverSeries {
  series: SeriesResolvidas;
  origens: OrigensSeries;
}

/** Fator catálogo → unidade dos critérios (BRL em reais → R$ mi; o resto já está na unidade). */
export const ESCALA_CRITERIO: Record<UnidadeSerie, number> = {
  BRL: 1e-6,
  BRL_por_cota: 1,
  pct: 1,
  x: 1,
  contagem: 1,
  // EUA: US$ → US$ mi (como BRL → R$ mi); por ação já está em US$/ação
  USD: 1e-6,
  USD_por_acao: 1,
};

export interface EntradaResolverSeries {
  /** pontos vigentes de UM ativo, de todas as fontes (approved) */
  pontos: readonly PontoSerieVigente[];
  /** séries a resolver (as dos critérios do perfil + fallbacks; o Essencial pede as suas) */
  series: readonly SerieFundamento[];
  fontes: FontesParams;
}

interface ValorAno {
  valor: number | null;
  incompleto: boolean;
  /** granularidade usada e dtFim do período mais recente dela no ano */
  tipo: PeriodicidadeSerie;
  dtFim: string;
}

const ORDEM_GRANULARIDADE: readonly PeriodicidadeSerie[] = ['FY', 'Q', 'M'];

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Valor de um ponto: número finito ou +Infinity (net_debt_ebitda da CVM com EBITDA ≤ 0 e dívida
 * líquida positiva: o motor mostra 'EBITDA ≤ 0 em AAAA'); NaN/−Infinity/null = sem dado.
 */
const numeroOuInfinito = (v: number | null | undefined): number | null =>
  typeof v === 'number' && (Number.isFinite(v) || v === Number.POSITIVE_INFINITY) ? v : null;

/** Maior versão por (tipoPeriodo, dtFim) dentro de uma fonte. */
function vigentesDaFonte(pontos: readonly PontoSerieVigente[]): PontoSerieVigente[] {
  const porChave = new Map<string, PontoSerieVigente>();
  for (const p of pontos) {
    const k = `${p.tipoPeriodo}|${p.dtFim}`;
    const atual = porChave.get(k);
    if (!atual || p.versao > atual.versao) porChave.set(k, p);
  }
  return [...porChave.values()];
}

/** Valor do ano de uma fonte (undefined = a fonte não tem ponto no ano). */
function valorDoAno(
  pontosAno: readonly PontoSerieVigente[],
  agregacao: 'ultimo' | 'media',
): ValorAno | undefined {
  for (const tipo of ORDEM_GRANULARIDADE) {
    const doTipo = pontosAno
      .filter((p) => p.tipoPeriodo === tipo)
      .sort((a, b) => a.dtFim.localeCompare(b.dtFim));
    if (doTipo.length === 0) continue;
    const ultimo = doTipo[doTipo.length - 1];
    const base = { tipo, dtFim: ultimo.dtFim };
    if (tipo === 'FY' || agregacao === 'ultimo') {
      return ultimo.incompleto
        ? { ...base, valor: null, incompleto: true }
        : { ...base, valor: numeroOuInfinito(ultimo.valor), incompleto: false };
    }
    if (doTipo.some((p) => p.incompleto)) return { ...base, valor: null, incompleto: true };
    const valores = doTipo.map((p) => p.valor).filter(finito);
    return {
      ...base,
      valor: valores.length > 0 ? valores.reduce((a, v) => a + v, 0) / valores.length : null,
      incompleto: false,
    };
  }
  return undefined;
}

/**
 * Fonte do ano entre os candidatos (já na ordem da prioridade): o primeiro COMPLETO; sem nenhum
 * completo, o primeiro (incompleto). Com 'ultimo' e vencedor trimestral/mensal, um candidato
 * completo seguinte com período mais recente no ano o substitui (o mais recente; empate = prioridade).
 */
function escolherCandidato<C extends { v: ValorAno }>(
  candidatos: readonly C[],
  agregacao: 'ultimo' | 'media',
): C | undefined {
  const completos = candidatos.filter((c) => !c.v.incompleto);
  let escolhido = completos[0];
  if (!escolhido) return candidatos[0];
  if (agregacao === 'ultimo' && escolhido.v.tipo !== 'FY') {
    for (const c of completos) if (c.v.dtFim > escolhido.v.dtFim) escolhido = c;
  }
  return escolhido;
}

/** Resolve as séries de UM ativo pela prioridade de fontes. Pura. */
export function resolverSeries(e: EntradaResolverSeries): ResultadoResolverSeries {
  const series: SeriesResolvidas = {};
  const origens: OrigensSeries = {};
  for (const serie of new Set(e.series)) {
    const prioridade = prioridadeDaSerie(e.fontes, serie);
    const agregacao = agregacaoDaSerie(e.fontes, serie);
    const escala = ESCALA_CRITERIO[CATALOGO_SERIES[serie].unidade];
    // fonte → ano → pontos vigentes
    const porFonte = new Map<IdFonte, Map<number, PontoSerieVigente[]>>();
    for (const fonte of prioridade) {
      const daFonte = vigentesDaFonte(
        e.pontos.filter((p) => p.serie === serie && p.fonte === fonte),
      );
      const porAno = new Map<number, PontoSerieVigente[]>();
      for (const p of daFonte) {
        const lista = porAno.get(p.anoFiscal);
        if (lista) lista.push(p);
        else porAno.set(p.anoFiscal, [p]);
      }
      porFonte.set(fonte, porAno);
    }
    const anos = [...new Set([...porFonte.values()].flatMap((m) => [...m.keys()]))].sort(
      (a, b) => a - b,
    );
    if (anos.length === 0) continue;
    const valores: Record<number, number | null> = {};
    const orig: Record<number, OrigemSerie> = {};
    for (const ano of anos) {
      // candidatos na ordem da prioridade
      const candidatos: Array<{ fonte: IdFonte; v: ValorAno }> = [];
      for (const fonte of prioridade) {
        const pontosAno = porFonte.get(fonte)?.get(ano);
        if (!pontosAno || pontosAno.length === 0) continue;
        const v = valorDoAno(pontosAno, agregacao);
        if (v) candidatos.push({ fonte, v });
      }
      const escolhido = escolherCandidato(candidatos, agregacao);
      if (!escolhido) continue;
      const { fonte, v } = escolhido;
      valores[ano] = v.valor === null ? null : v.valor * escala;
      orig[ano] = { fonte, serieUsada: serie, fallback: false, incompleto: v.incompleto };
    }
    series[serie] = valores;
    origens[serie] = orig;
  }
  return { series, origens };
}

/** Observação do resultado quando a janela usou a serieFallback desta série principal. */
export const OBS_FALLBACK: Partial<Record<SerieCriterio, ObsCriterio>> = {
  net_income_adjusted: 'lucro_sem_descontado',
  // fundamentei-regras (v5, REIT): algum ano da janela sem a SBC no 10-K
  ocf_adjusted_per_share: 'sbc_indisponivel',
  cash_payout_adjusted_pct: 'sbc_indisponivel',
};

/**
 * Séries principais em que +Infinity conta como valor do ano na escolha do fallback (payout com o
 * denominador ≤ 0 = fora do limite). Só as da v5; as de antes ficam com a regra de antes.
 */
export const SERIES_INFINITO_E_VALOR: ReadonlySet<SerieCriterio> = new Set<SerieCriterio>([
  'cash_payout_adjusted_pct',
]);

export interface SerieDaJanela {
  /** série efetivamente usada (a principal ou a de fallback) */
  serie: SerieCriterio;
  valores: Readonly<Record<number, number | null>>;
  fallback: boolean;
  /**
   * fontes dos anos exigidos (provedores primeiro, na ordem em que aparecem; 'cvm' por último).
   * Vazio quando a entrada não tem origens (v2.4: só CVM).
   */
  fontes: IdFonte[];
  /** algum ano exigido veio de ponto incompleto */
  incompleto: boolean;
  /**
   * obs do ResultadoCriterio ('lucro_sem_descontado', 'dados_incompletos' e, A6, a revisão
   * 'obrigacoes_ativo_revisao' da série leverage_assets_pct acima de 50% do ativo em algum ano)
   */
  obs: ObsCriterio[];
}

const temTodos = (
  valores: Readonly<Record<number, number | null>> | undefined,
  anos: number[],
  infinitoEValor = false,
) =>
  !!valores &&
  anos.every(
    (a) => finito(valores[a]) || (infinitoEValor && valores[a] === Number.POSITIVE_INFINITY),
  );

/**
 * Série de um critério numa janela (anos exigidos já com o ano anterior do 'up'). Fallback pela
 * JANELA INTEIRA: com todos os anos da principal, usa a principal; senão, a serieFallback (se o
 * critério tiver) em todos os anos. Pura.
 */
export function escolherSerieJanela(
  series: Readonly<Partial<Record<SerieCriterio, Record<number, number | null>>>>,
  origens: Readonly<OrigensSeries> | undefined,
  def: { serie: SerieCriterio; serieFallback?: SerieCriterio },
  anos: number[],
): SerieDaJanela {
  const principal = series[def.serie];
  const usarFallback =
    !!def.serieFallback && !temTodos(principal, anos, SERIES_INFINITO_E_VALOR.has(def.serie));
  const serie = usarFallback ? (def.serieFallback as SerieCriterio) : def.serie;
  const valores = (usarFallback ? series[serie] : principal) ?? {};
  const origemSerie = origens?.[serie];
  const fontesVistas: IdFonte[] = [];
  let incompleto = false;
  for (const a of anos) {
    const o = origemSerie?.[a];
    if (!o) continue;
    if (!fontesVistas.includes(o.fonte)) fontesVistas.push(o.fonte);
    if (o.incompleto) incompleto = true;
  }
  const fontes = [
    ...fontesVistas.filter((f) => f !== 'cvm'),
    ...fontesVistas.filter((f) => f === 'cvm'),
  ];
  const obs: ObsCriterio[] = [];
  const obsFallback = OBS_FALLBACK[def.serie];
  if (usarFallback && obsFallback) obs.push(obsFallback);
  if (incompleto) obs.push('dados_incompletos');
  // A6 (fatia E): obrigações acima de 50% do ativo em algum ano exigido = valor em revisão (outros
  // valores a pagar podem incluir itens que não são dívida). Só marca; o resultado não muda.
  if (
    serie === SERIE_ALAV_ATIVO &&
    anos.some((a) => {
      const v = valores[a];
      return finito(v) && v > LIMITE_REVISAO_OBRIGACOES_ATIVO_PCT;
    })
  ) {
    obs.push(FLAG_OBRIGACOES_ATIVO_REVISAO);
  }
  return { serie, valores, fallback: usarFallback, fontes, incompleto, obs };
}
