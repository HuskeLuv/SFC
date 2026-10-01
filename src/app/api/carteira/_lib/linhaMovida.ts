/**
 * Campos do mover na Carteira (out/2026) por linha das rotas de aba
 * (acoes, stocks, fii, etf, reit, fim-fia) — contrato `LinhaMovidaCampos`.
 *
 * - `movido`/`movidoEm`/`movidoViaConsultor`: selo "movido" (só troca de ABA,
 *   decisão 10), lido do Histórico de alterações via movidoInfoPorEntidade. Só
 *   linhas com override efetivo (fora da aba base) consultam o histórico; se o
 *   histórico tiver sido apagado, a linha fica sem selo e continua onde está.
 * - `naoMovivelMotivo`: item sem cotação em bolsa (modelo 'fundo') numa aba de
 *   bolsa (Ações, FII's, Stocks, REIT's) — só troca de seção, nunca de aba. Em
 *   Fundos e ETF's esse é o caso comum e não ganha motivo.
 */
import {
  MOTIVO_SEM_COTACAO,
  modeloDePreco,
  overrideEfetivo,
  type AssetMovivelLike,
  type CategoriaMovivel,
  type LinhaMovidaCampos,
} from '@/lib/carteiraMover';
import { movidoInfoPorEntidade } from '@/services/portfolio/movidoInfo';

export interface ItemDaAba {
  /** id do Portfolio (posição) ou da Watchlist (planejado) — o mesmo `id` da linha. */
  id: string;
  categoriaOverride?: string | null;
  asset: AssetMovivelLike | null;
  /** Posição com FixedIncomeAsset (valor pela curva). */
  temRendaFixa?: boolean;
}

const ABAS_COM_FUNDO_NATIVO: readonly CategoriaMovivel[] = ['fimFia', 'etfs'];

export async function camposMovidoPorLinha(
  userId: string,
  categoria: CategoriaMovivel,
  itens: readonly ItemDaAba[],
): Promise<Map<string, LinhaMovidaCampos>> {
  const out = new Map<string, LinhaMovidaCampos>();
  const movidos = itens.filter((i) => overrideEfetivo(i.asset, i.categoriaOverride) !== null);
  const info =
    movidos.length > 0
      ? await movidoInfoPorEntidade(
          userId,
          movidos.map((i) => i.id),
        )
      : new Map();

  for (const item of itens) {
    const campos: LinhaMovidaCampos = {};
    const selo = info.get(item.id);
    if (selo?.movido && overrideEfetivo(item.asset, item.categoriaOverride)) {
      campos.movido = true;
      if (selo.em) campos.movidoEm = selo.em;
      if (selo.viaConsultant) campos.movidoViaConsultor = true;
    }
    if (
      !ABAS_COM_FUNDO_NATIVO.includes(categoria) &&
      item.asset?.symbol &&
      modeloDePreco(item.asset, { temRendaFixa: item.temRendaFixa }) === 'fundo'
    ) {
      campos.naoMovivelMotivo = MOTIVO_SEM_COTACAO;
    }
    if (Object.keys(campos).length > 0) out.set(item.id, campos);
  }
  return out;
}

/** Copia os campos para as linhas (por `id`), sem tocar nas demais. */
export function aplicarCamposMovido<T extends { id: string }>(
  linhas: T[],
  campos: Map<string, LinhaMovidaCampos>,
): T[] {
  if (campos.size === 0) return linhas;
  for (const linha of linhas) {
    const c = campos.get(linha.id);
    if (c) Object.assign(linha, c);
  }
  return linhas;
}
