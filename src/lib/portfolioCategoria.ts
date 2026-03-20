import { SECOES_ORDEM } from "@/lib/carteiraCategoryColors";

export type CategoriaKey = (typeof SECOES_ORDEM)[number];

export type PortfolioCategoriaInput = {
  stock?: { ticker: string } | null;
  asset?: { type?: string | null; currency?: string | null; symbol?: string; name?: string } | null;
  assetId?: string | null;
};

export const getCategoriaFromPortfolio = (
  item: PortfolioCategoriaInput,
  _fixedIncomeAssetIds: Set<string>
): CategoriaKey | null => {
  const symbol = item.asset?.symbol || item.stock?.ticker;
  if (!symbol) return null;

  const assetType = item.asset?.type?.toLowerCase() || "";
  const isReserva =
    assetType === "emergency" ||
    assetType === "opportunity" ||
    symbol.startsWith("RESERVA-EMERG") ||
    symbol.startsWith("RESERVA-OPORT");

  if (isReserva) {
    return assetType === "opportunity" || symbol.startsWith("RESERVA-OPORT")
      ? "reservaOportunidade"
      : "reservaEmergencia";
  }

  if (assetType === "imovel" || assetType === "personalizado") {
    return "imoveisBens";
  }

  if (assetType) {
    switch (assetType) {
      case "ação":
      case "acao":
      case "stock":
        return item.asset?.currency === "BRL" ? "acoes" : "stocks";
      case "bdr":
      case "brd":
        return "acoes";
      case "fii":
        return "fiis";
      case "fund":
      case "funds": {
        const symbolUpper = symbol.toUpperCase();
        const nameLower = (item.asset?.name || "").toLowerCase();
        return symbolUpper.endsWith("11") ||
          nameLower.includes("fii") ||
          nameLower.includes("imobili")
          ? "fiis"
          : "fimFia";
      }
      case "etf":
        return "etfs";
      case "reit":
        return "reits";
      case "crypto":
      case "currency":
      case "metal":
      case "commodity":
        return "moedasCriptos";
      case "bond":
      case "cash":
        return "rendaFixaFundos";
      case "insurance":
      case "previdencia":
        return "previdenciaSeguros";
      case "opcao":
        return "opcoes";
      default:
        if (symbol.toUpperCase().endsWith("11")) return "fiis";
        return "rendaFixaFundos";
    }
  }

  const tickerUpper = symbol.toUpperCase();
  if (tickerUpper.endsWith("11")) return "fiis";
  return "acoes";
};
