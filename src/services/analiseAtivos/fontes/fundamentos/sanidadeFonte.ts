/**
 * Sanidade da §6 da spec do Pedro (v2.5, desenho final.camada_fontes §6). FUNÇÕES PURAS, aplicadas
 * pela ingestão ('fontes-fundamentos') nas camadas listadas em criteria_params.fontes.sanidade.aplicaA
 * ('provedor' por padrão; 'cvm' deixa a regra literal para a CVM também, pelo job 'criterios'):
 *  - variação maior que variacaoRevisaoPct (40%) contra o período ANTERIOR aprovado → 'pending';
 *  - confiança da extração abaixo de confiancaMin (0,8) → 'pending';
 *  - divergência maior que divergenciaMaxPct (5%) contra a CVM da mesma série e período →
 *    'pending' (a CVM prevalece: 'pending' nunca chega à tela, então o resolvedor usa a CVM);
 *  - série obrigatória ausente no período (obrigatorias[mercado]) → ponto incompleto, valor null
 *    (selo 'dados incompletos' na tela).
 * Nada daqui chama terceiros nem o banco.
 */
import {
  sanidadeAplicaA,
  seriesObrigatorias,
  type FontesParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import {
  CATALOGO_SERIES,
  type CamadaFonte,
  type MercadoFonte,
  type PeriodicidadeSerie,
  type PontoSerieVigente,
  type ReviewStatus,
  type SerieFundamento,
} from '@/types/analiseAtivosFontes';

/** Por que um ponto foi para revisão (asset_fundamentals_serie.motivosRevisao). */
export const MOTIVOS_REVISAO = ['variacao', 'confianca', 'divergencia_cvm'] as const;
export type MotivoRevisao = (typeof MOTIVOS_REVISAO)[number];

export interface EntradaSanidade {
  camada: CamadaFonte;
  valor: number | null;
  /** 0–1 (extração); ausente = API estruturada, sem checagem */
  confianca?: number | null;
  /** valor do período anterior APROVADO (mesma fonte, série e periodicidade) */
  anterior?: number | null;
  /** valor da CVM no mesmo período (só para provedor) */
  cvm?: number | null;
}

export interface ResultadoSanidade {
  reviewStatus: Extract<ReviewStatus, 'approved' | 'pending'>;
  motivos: MotivoRevisao[];
}

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** |a − b| ÷ |b| em %; b = 0 com a ≠ 0 = Infinity; ambos 0 = 0. */
export function diferencaPct(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (Math.abs(a - b) / Math.abs(b)) * 100;
}

/** Avalia UM valor pela sanidade da §6. Fora de aplicaA = aprovado sem checagem. */
export function avaliarSanidade(e: EntradaSanidade, fontes: FontesParams): ResultadoSanidade {
  if (!sanidadeAplicaA(fontes, e.camada) || !finito(e.valor)) {
    return { reviewStatus: 'approved', motivos: [] };
  }
  const s = fontes.sanidade;
  const motivos: MotivoRevisao[] = [];
  if (finito(e.anterior) && diferencaPct(e.valor, e.anterior) > s.variacaoRevisaoPct) {
    motivos.push('variacao');
  }
  if (finito(e.confianca) && e.confianca < s.confiancaMin) motivos.push('confianca');
  if (
    e.camada === 'provedor' &&
    finito(e.cvm) &&
    diferencaPct(e.valor, e.cvm) > s.divergenciaMaxPct
  ) {
    motivos.push('divergencia_cvm');
  }
  return { reviewStatus: motivos.length > 0 ? 'pending' : 'approved', motivos };
}

/** Confiança de uma linha de qualidade de FII: a MENOR entre os campos informados. */
export function confiancaMinima(
  confianca: Partial<Record<string, number>> | null | undefined,
): number | null {
  const valores = Object.values(confianca ?? {}).filter(finito);
  return valores.length > 0 ? Math.min(...valores) : null;
}

/** Ponto agrupável por período para a regra das obrigatórias. */
export interface PontoPeriodo {
  symbol: string;
  serie: SerieFundamento;
  tipoPeriodo: PeriodicidadeSerie;
  anoFiscal: number;
  dtFim: string;
  valor: number | null;
  incompleto?: boolean;
}

/**
 * Séries obrigatórias (§6) dos períodos que o conector entregou: para cada (ativo, periodicidade,
 * fim do período) do lote, a obrigatória do mercado com a MESMA periodicidade nativa que veio nula
 * ou não veio vira ponto incompleto (valor null). Devolve os pontos já marcados + os criados. Pura.
 */
export function marcarIncompletos<T extends PontoPeriodo>(
  pontos: readonly T[],
  mercadoDe: (symbol: string) => MercadoFonte | null,
  fontes: FontesParams,
  criar: (base: PontoPeriodo) => T,
): T[] {
  const out: T[] = pontos.map((p) => ({ ...p }));
  const grupos = new Map<string, T[]>();
  for (const p of out) {
    const k = `${p.symbol}|${p.tipoPeriodo}|${p.dtFim}`;
    const g = grupos.get(k);
    if (g) g.push(p);
    else grupos.set(k, [p]);
  }
  for (const g of grupos.values()) {
    const ref = g[0];
    const mercado = mercadoDe(ref.symbol);
    if (!mercado) continue;
    const obrig = seriesObrigatorias(fontes, mercado).filter(
      (s) => CATALOGO_SERIES[s].periodicidade === ref.tipoPeriodo,
    );
    for (const serie of obrig) {
      const existente = g.find((p) => p.serie === serie);
      if (existente) {
        if (!finito(existente.valor)) {
          existente.incompleto = true;
          existente.valor = null;
        }
        continue;
      }
      out.push(
        criar({
          symbol: ref.symbol,
          serie,
          tipoPeriodo: ref.tipoPeriodo,
          anoFiscal: ref.anoFiscal,
          dtFim: ref.dtFim,
          valor: null,
          incompleto: true,
        }),
      );
    }
  }
  return out;
}

/**
 * Sanidade literal na CVM (aplicaA inclui 'cvm'; usada pelo job 'criterios'): o ponto com variação
 * acima do limite contra o período anterior da MESMA série é retirado (fica em revisão: a tela
 * mostra 'sem dado nas demonstrações'). Fora de aplicaA devolve os pontos como vieram. Pura.
 */
export function filtrarCvmPelaSanidade(
  pontos: readonly PontoSerieVigente[],
  fontes: FontesParams,
): { pontos: PontoSerieVigente[]; emRevisao: PontoSerieVigente[] } {
  if (!sanidadeAplicaA(fontes, 'cvm')) return { pontos: [...pontos], emRevisao: [] };
  const grupos = new Map<string, PontoSerieVigente[]>();
  for (const p of pontos) {
    const k = `${p.symbol}|${p.serie}|${p.tipoPeriodo}|${p.fonte}`;
    const g = grupos.get(k);
    if (g) g.push(p);
    else grupos.set(k, [p]);
  }
  const manter: PontoSerieVigente[] = [];
  const emRevisao: PontoSerieVigente[] = [];
  for (const g of grupos.values()) {
    g.sort((a, b) => a.dtFim.localeCompare(b.dtFim));
    let anterior: number | null = null;
    for (const p of g) {
      const r = avaliarSanidade({ camada: 'cvm', valor: p.valor, anterior }, fontes);
      if (r.reviewStatus === 'pending') {
        emRevisao.push(p);
        continue;
      }
      manter.push(p);
      if (finito(p.valor)) anterior = p.valor;
    }
  }
  return { pontos: manter, emRevisao };
}
