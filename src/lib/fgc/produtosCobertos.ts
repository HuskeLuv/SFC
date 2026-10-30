/**
 * Regras puras do FGC por produto e por instituição (ClickUp 86e2xqh69).
 *
 * - Produto coberto: CDB, LC, LCI, LCA, RDB, DPGE, LIG e RDC (o enum FixedIncomeType tem
 *   valores como CDB_PRE e LCI_HIB). Não cobertos: CRI, CRA, LF e LFS.
 * - Aceita emissor: produto coberto que de fato tem um banco emissor para o usuário escolher
 *   (fora Tesouro, debênture e fundo gravados como CDB, e Pluggy com subtipo que não emite).
 */

/** Prefixos de FixedIncomeType cobertos pelo FGC. */
export const FGC_COVERED_PREFIXES = ['CDB', 'LC', 'LCI', 'LCA', 'RDB', 'DPGE', 'LIG', 'RDC'];

/** Coberto pelo FGC pelo tipo (CDB_PRE, LCI_HIB...). */
export function isFgcCovered(fixedIncomeType: string | null | undefined): boolean {
  if (!fixedIncomeType) return false;
  return FGC_COVERED_PREFIXES.includes(produtoFgc(fixedIncomeType));
}

/** Produto do tipo de renda fixa: 'CDB_PRE' → 'CDB'. */
export function produtoFgc(fixedIncomeType: string): string {
  return fixedIncomeType.split('_')[0];
}

/** Subtipos do Pluggy (FIXED_INCOME) que têm banco emissor coberto. */
export const SUBTIPOS_PLUGGY_COM_EMISSOR: ReadonlySet<string> = new Set([
  'CDB',
  'LC',
  'LCI',
  'LCA',
  'RDB',
  'LIG',
]);

/** Tcb do IF.data que emitem: bancos (B1, B2, B4), cooperativas (B3S, B3C) e financeiras (N1). */
export const TIPOS_BACEN_EMISSORES = ['B1', 'B2', 'B3S', 'B3C', 'B4', 'N1'] as const;

/** Marca do import nas linhas antigas do catálogo que não emitem. */
export const TIPO_BACEN_NAO_EMISSOR = 'NAO_EMISSOR';

/** Prefixos de Institution.codigo de linhas que não emitem (corretoras, seguradoras, genéricas). */
export const CODIGO_PREFIXOS_NAO_EMISSOR = ['COR-', 'PREV-', 'INT-', 'CRP-', 'OTH-', 'RESERVA-'];

const SIMBOLO_SEM_EMISSOR = /^(DEBENTURE|FUNDO|TESOURO|PLUGGY-TD)-/i;
const SIMBOLO_PLUGGY_RF = /^PLUGGY-RF-/i;

/**
 * A instituição emite renda fixa coberta?
 * true: Tcb emissor. false: N2, N4, NAO_EMISSOR ou código com prefixo não emissor.
 * null: não se sabe (linha antiga sem tipo).
 */
export function ehInstituicaoEmissora(inst: {
  tipoBacen?: string | null;
  codigo?: string | null;
}): boolean | null {
  const tipo = inst.tipoBacen?.trim().toUpperCase() || null;
  if (tipo) {
    if ((TIPOS_BACEN_EMISSORES as readonly string[]).includes(tipo)) return true;
    return false;
  }
  const codigo = inst.codigo?.trim().toUpperCase() ?? '';
  if (codigo && CODIGO_PREFIXOS_NAO_EMISSOR.some((p) => codigo.startsWith(p))) return false;
  return null;
}

/**
 * O investimento aceita banco emissor? Produto coberto pelo FGC, fora do Tesouro, sem símbolo de
 * debênture/fundo/Tesouro e, quando veio do Pluggy (PLUGGY-RF-), com subtipo que tem emissor.
 */
export function aceitaEmissor(input: {
  type: string | null | undefined;
  tesouroBondType?: string | null;
  assetSymbol?: string | null;
  pluggySubtype?: string | null;
}): boolean {
  if (!isFgcCovered(input.type)) return false;
  if (input.tesouroBondType) return false;
  const simbolo = input.assetSymbol?.trim() ?? '';
  if (SIMBOLO_SEM_EMISSOR.test(simbolo)) return false;
  if (SIMBOLO_PLUGGY_RF.test(simbolo)) {
    const subtipo = input.pluggySubtype?.trim().toUpperCase() ?? '';
    return SUBTIPOS_PLUGGY_COM_EMISSOR.has(subtipo);
  }
  return true;
}
