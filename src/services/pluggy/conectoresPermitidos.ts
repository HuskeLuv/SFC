import { getPluggyClient } from '@/lib/pluggy';
import { logger } from '@/lib/logger';

/**
 * Conectores que o widget pode listar: só Open Finance (decisão 08/10/2026 — o conector direto pede
 * a senha do banco dentro do widget, o que contradiz o texto das telas de consentimento: "a
 * autorização acontece no app do seu banco, sem senha aqui"). Com PLUGGY_INCLUI_SANDBOX, os de
 * teste também. Cache de 6 h por processo; falha ao buscar = null (widget sem filtro) — a trava
 * no servidor (registrarConexao) recusa conector direto de qualquer forma.
 */
const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { ids: number[]; ate: number; sandbox: boolean } | null = null;

export function conectorPermitido(c: { isOpenFinance?: boolean; isSandbox?: boolean }): boolean {
  return Boolean(c.isOpenFinance || c.isSandbox);
}

export async function conectoresPermitidos(incluiSandbox: boolean): Promise<number[] | null> {
  if (cache && cache.sandbox === incluiSandbox && cache.ate > Date.now()) return cache.ids;
  try {
    const { results } = await getPluggyClient().fetchConnectors({
      countries: ['BR'],
      sandbox: incluiSandbox,
    });
    const ids = results
      .filter((c) => (incluiSandbox ? conectorPermitido(c) : Boolean(c.isOpenFinance)))
      .map((c) => c.id);
    if (ids.length === 0) return null;
    cache = { ids, ate: Date.now() + TTL_MS, sandbox: incluiSandbox };
    return ids;
  } catch (error: unknown) {
    logger.warn('[pluggy] lista de conectores indisponível — widget sem filtro', {
      msg: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Só para testes. */
export function limparCacheConectores(): void {
  cache = null;
}
