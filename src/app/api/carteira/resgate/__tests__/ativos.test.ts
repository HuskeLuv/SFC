import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../ativos/route";

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn() },
  stockTransaction: { findMany: vi.fn() },
}));

vi.mock("@/utils/auth", () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: "user-123" },
    targetUserId: "user-123",
    actingClient: null,
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

const createRequest = (params: Record<string, string>) => {
  const url = new URL("http://localhost/api/carteira/resgate/ativos");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
};

describe("GET /api/carteira/resgate/ativos", () => {
  const mockPortfolioAcao = {
    id: "port-1",
    stockId: "stock-1",
    assetId: null,
    stock: { ticker: "PETR4", companyName: "Petrobras" },
    asset: null,
  };

  const mockPortfolioCrypto = {
    id: "port-crypto",
    stockId: null,
    assetId: "asset-btc",
    stock: null,
    asset: { symbol: "BTC", name: "Bitcoin", type: "crypto", currency: "USD" },
    quantity: 0.5,
    avgPrice: 100000,
    totalInvested: 50000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([]);
  });

  it("retorna 400 quando tipo ou instituicaoId estão ausentes", async () => {
    const response = await GET(createRequest({ tipo: "criptoativo" }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toContain("obrigatórios");
  });

  it("retorna ativos de criptoativos corretamente (apenas assetId)", async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioCrypto, userId: "user-123" },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: "tx-1",
        assetId: "asset-btc",
        stockId: null,
        type: "compra",
        notes: JSON.stringify({ operation: { instituicaoId: "inst-1" } }),
      },
    ]);

    const response = await GET(
      createRequest({
        tipo: "criptoativo",
        instituicaoId: "inst-1",
        search: "",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.assets).toBeDefined();
    expect(Array.isArray(data.assets)).toBe(true);
  });

  it("retorna ativos de ações corretamente (apenas stockId)", async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      { ...mockPortfolioAcao, userId: "user-123" },
    ]);
    mockPrisma.stockTransaction.findMany.mockResolvedValue([
      {
        id: "tx-1",
        stockId: "stock-1",
        assetId: null,
        type: "compra",
        notes: JSON.stringify({ operation: { instituicaoId: "inst-1" } }),
      },
    ]);

    const response = await GET(
      createRequest({
        tipo: "acao",
        instituicaoId: "inst-1",
        search: "",
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.assets).toBeDefined();
  });
});
