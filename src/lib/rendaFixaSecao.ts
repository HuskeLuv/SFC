/**
 * Seção (Pós-fixada / Pré-fixada / Híbrida) de um item na aba Renda Fixa —
 * fonte ÚNICA (mover fase 2, out/2026). Puro: roda no cliente e no servidor.
 *
 * Paridade com a main (decisão 5 do Wellington, 02/10/2026): para todo item que
 * NÃO foi movido para a RF a regra é exatamente a da rota renda-fixa de antes:
 *   - com FixedIncomeAsset: tipo `*_HIB` → híbrida (vale ANTES do indexador; por
 *     isso IPCA+ de hoje é Híbrida); indexador CDI|IPCA → pós-fixada; senão
 *     pré-fixada;
 *   - sem FI (legacy): `debentureTipo` das notes, se válido; senão pré-fixada.
 *
 * Item MOVIDO para a RF (veio de uma Reserva): o FI de reserva nasce com type
 * CDB_PRE e indexer tirado do benchmark da reserva (CDI por padrão), então um
 * Tesouro Prefixado/IPCA+ comprado como reserva cairia em "Pós-fixada". Nesse
 * caso a seção vem do tipo do título (`tesouroBondType`), com o MESMO resultado
 * que o título teria se tivesse sido comprado na RF (Selic → pós; Prefixado →
 * pré; IPCA+/Renda+/Educa+ → híbrida, como os NTN-B da RF hoje). Sem FI, o
 * benchmark CDI/IPCA/SELIC das notes de reserva vira pós-fixada.
 */
import type { TipoRendaFixa } from '@/types/rendaFixa';

export const SECOES_RENDA_FIXA: readonly TipoRendaFixa[] = ['pos-fixada', 'prefixada', 'hibrida'];

export const ROTULO_SECAO_RENDA_FIXA: Record<TipoRendaFixa, string> = {
  'pos-fixada': 'Pós-fixada',
  prefixada: 'Pré-fixada',
  hibrida: 'Híbrida',
};

export const isSecaoRendaFixa = (v: unknown): v is TipoRendaFixa =>
  typeof v === 'string' && (SECOES_RENDA_FIXA as readonly string[]).includes(v);

export interface SecaoRendaFixaInput {
  /** FixedIncomeAsset.type (CDB_PRE, CDB_HIB, CRI_HIB, LCI…); null/undefined = sem FI. */
  fiType?: string | null;
  /** FixedIncomeAsset.indexer (CDI, IPCA, PRE…). */
  indexer?: string | null;
  /** FixedIncomeAsset.tesouroBondType ("Tesouro Selic", "Tesouro IPCA+"…). */
  tesouroBondType?: string | null;
  /** notes.debentureTipo (itens legacy sem FI). */
  debentureTipo?: string | null;
  /** notes.benchmark de reserva (CDI, SELIC, IPCA, PRE…). */
  benchmark?: string | null;
  /** O item está na RF por override (veio de uma Reserva). */
  movidoParaRf?: boolean;
}

/** Seção pelo tipo do título do Tesouro; null quando o texto não é reconhecido. */
export const secaoDoTituloTesouro = (bondType: string | null | undefined): TipoRendaFixa | null => {
  const t = (bondType ?? '').toLowerCase();
  if (!t) return null;
  if (/selic/.test(t)) return 'pos-fixada';
  if (/ipca|renda\+|educa\+/.test(t)) return 'hibrida';
  if (/prefixado/.test(t)) return 'prefixada';
  return null;
};

/** Regra da rota renda-fixa da main para item com FI. */
const secaoPeloFi = (fiType: string, indexer: string | null | undefined): TipoRendaFixa => {
  if (String(fiType).endsWith('_HIB')) return 'hibrida';
  if (indexer === 'CDI' || indexer === 'IPCA') return 'pos-fixada';
  return 'prefixada';
};

export const secaoRendaFixa = (input: SecaoRendaFixaInput): TipoRendaFixa => {
  const temFi = input.fiType != null && input.fiType !== '';
  if (temFi) {
    if (input.movidoParaRf) {
      const doTitulo = secaoDoTituloTesouro(input.tesouroBondType);
      if (doTitulo) return doTitulo;
    }
    return secaoPeloFi(input.fiType as string, input.indexer);
  }
  if (isSecaoRendaFixa(input.debentureTipo)) return input.debentureTipo;
  if (input.movidoParaRf) {
    const doTitulo = secaoDoTituloTesouro(input.tesouroBondType);
    if (doTitulo) return doTitulo;
    const bench = (input.benchmark ?? '').toUpperCase();
    if (/\b(CDI|IPCA|SELIC)\b/.test(bench)) return 'pos-fixada';
  }
  return 'prefixada';
};
