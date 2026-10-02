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
 *
 * Fase 2 (Reservas + Renda Fixa): `baseCtx` de cada item (reserva do Tesouro de
 * catálogo, `reservaDestinoPorAsset`) vai para `overrideEfetivo` e para o
 * contrato de movidoInfo — sem ele a base de um Tesouro de reserva seria a RF.
 * Com MOVER_CAIXA_RF_HABILITADO desligada, toda linha das 3 abas ganha
 * `naoMovivelMotivo` (sem alça), como antes da fase 2.
 */
import {
  MOTIVO_SEM_COTACAO,
  isCategoriaCaixaRf,
  modeloDePreco,
  motivoNaoMovivel,
  overrideEfetivo,
  type AssetMovivelLike,
  type BaseCtx,
  type CategoriaMovivel,
  type LinhaMovidaCampos,
} from '@/lib/carteiraMover';
import { moverCaixaRfHabilitado } from '@/lib/carteiraMoverConfig';
import { movidoInfoPorEntidade } from '@/services/portfolio/movidoInfo';

export interface ItemDaAba {
  /** id do Portfolio (posição) ou da Watchlist (planejado) — o mesmo `id` da linha. */
  id: string;
  categoriaOverride?: string | null;
  asset: AssetMovivelLike | null;
  /** Posição com FixedIncomeAsset (valor pela curva). */
  temRendaFixa?: boolean;
  /** Aba base que o Asset sozinho não diz (Tesouro de catálogo comprado numa reserva). */
  baseCtx?: BaseCtx;
}

const ABAS_COM_FUNDO_NATIVO: readonly CategoriaMovivel[] = ['fimFia', 'etfs'];

export async function camposMovidoPorLinha(
  userId: string,
  categoria: CategoriaMovivel,
  itens: readonly ItemDaAba[],
): Promise<Map<string, LinhaMovidaCampos>> {
  const out = new Map<string, LinhaMovidaCampos>();
  if (isCategoriaCaixaRf(categoria) && !moverCaixaRfHabilitado()) {
    // Chave da fase 2 desligada: as 3 abas continuam fora do mover.
    const motivo = motivoNaoMovivel(categoria);
    for (const item of itens) out.set(item.id, { naoMovivelMotivo: motivo });
    return out;
  }
  const efetivo = (i: ItemDaAba) => overrideEfetivo(i.asset, i.categoriaOverride, i.baseCtx);
  const movidos = itens.filter((i) => efetivo(i) !== null);
  const porId = new Map(movidos.map((i) => [i.id, i]));
  const info =
    movidos.length > 0
      ? await movidoInfoPorEntidade(
          userId,
          movidos.map((i) => i.id),
          (id) => ({ asset: porId.get(id)?.asset, baseCtx: porId.get(id)?.baseCtx }),
        )
      : new Map();

  for (const item of itens) {
    const campos: LinhaMovidaCampos = {};
    const selo = info.get(item.id);
    if (selo?.movido && efetivo(item)) {
      campos.movido = true;
      if (selo.em) campos.movidoEm = selo.em;
      if (selo.viaConsultant) campos.movidoViaConsultor = true;
    }
    if (
      !ABAS_COM_FUNDO_NATIVO.includes(categoria) &&
      item.asset?.symbol &&
      modeloDePreco(item.asset, { temRendaFixa: item.temRendaFixa, baseCtx: item.baseCtx }) ===
        'fundo'
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
