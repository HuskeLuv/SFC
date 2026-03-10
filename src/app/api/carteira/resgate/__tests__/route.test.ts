import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  stockTransaction: { create: vi.fn(), findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@/utils/auth", () => ({
  requireAuthWithActing: vi.fn().mockResolvedValue({
    payload: { id: "user-123", email: "test@test.com", role: "user" },
    targetUserId: "user-123",
    actingClient: null,
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/services/impersonationLogger", () => ({
  logDataUpdate: vi.fn().mockResolvedValue(undefined),
}));

const createRequest = (body: object) =>
  new NextRequest("http://localhost/api/carteira/resgate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/carteira/resgate", () => {
  const mockPortfolioAcao = {
    id: "port-1",
    userId: "user-123",
    quantity: 100,
    totalInvested: 1000,
    avgPrice: 10,
    stockId: "stock-1",
    assetId: null,
    stock: { ticker: "PETR4", companyName: "Petrobras" },
    asset: null,
  };

  const mockPortfolioCrypto = {
    id: "port-crypto",
    userId: "user-123",
    quantity: 0.5,
    totalInvested: 50000,
    avgPrice: 100000,
    stockId: null,
    assetId: "asset-btc",
    stock: null,
    asset: { symbol: "BTC", name: "Bitcoin", type: "crypto", currency: "USD" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioAcao);
    mockPrisma.portfolio.update.mockResolvedValue({});
    mockPrisma.portfolio.delete.mockResolvedValue({});
    mockPrisma.stockTransaction.create.mockImplementation((args: { data: object }) =>
      Promise.resolve({ id: "tx-1", ...args.data } as object)
    );
    mockPrisma.stockTransaction.findFirst.mockResolvedValue(null);
  });

  describe("Validações obrigatórias", () => {
    it("retorna 400 quando portfolioId está ausente", async () => {
      const response = await POST(
        createRequest({
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("portfolioId");
    });

    it("retorna 400 quando dataResgate está ausente", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          metodoResgate: "quantidade",
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("dataResgate");
    });

    it("retorna 400 quando metodoResgate está ausente", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataResgate: "2024-01-15",
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("metodoResgate");
    });

    it("retorna 404 quando portfolio não existe", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          portfolioId: "port-inexistente",
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain("não encontrado");
    });
  });

  describe("Resgate por quantidade", () => {
    it("realiza resgate por quantidade com sucesso (ações)", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 10,
          cotacaoUnitaria: 32.5,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.transacao).toBeDefined();
      expect(data.transacao.type).toBe("venda");
      expect(data.transacao.quantity).toBe(10);
      expect(data.transacao.price).toBe(32.5);
      expect(mockPrisma.portfolio.update).toHaveBeenCalled();
    });

    it("retorna 400 quando quantidade é maior que disponível", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 150,
          cotacaoUnitaria: 32.5,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("Quantidade maior");
    });

    it("retorna 400 quando cotação unitária é inválida", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 10,
          cotacaoUnitaria: 0,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("Cotação");
    });
  });

  describe("Resgate por valor", () => {
    it("realiza resgate por valor com sucesso (quantidade 1)", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolioAcao,
        quantity: 1,
        totalInvested: 1000,
        avgPrice: 1000,
      });

      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataResgate: "2024-01-15",
          metodoResgate: "valor",
          valorResgate: 1000,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.transacao.quantity).toBe(1);
      expect(data.transacao.price).toBe(1000);
    });

    it("retorna 400 quando resgate por valor com quantidade > 1", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataResgate: "2024-01-15",
          metodoResgate: "valor",
          valorResgate: 500,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("quantidade 1");
    });
  });

  describe("Resgate de criptoativos", () => {
    it("realiza resgate por quantidade de crypto com sucesso", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioCrypto);

      const response = await POST(
        createRequest({
          portfolioId: "port-crypto",
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 0.1,
          cotacaoUnitaria: 100000,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.transacao.type).toBe("venda");
      expect(data.transacao.quantity).toBe(0.1);
      expect(data.transacao.price).toBe(100000);
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assetId: "asset-btc",
            type: "venda",
            quantity: 0.1,
            price: 100000,
          }),
        })
      );
    });

    it("exclui portfolio quando resgate total de crypto", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioCrypto);

      const response = await POST(
        createRequest({
          portfolioId: "port-crypto",
          dataResgate: "2024-01-15",
          metodoResgate: "quantidade",
          quantidade: 0.5,
          cotacaoUnitaria: 100000,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.portfolio.delete).toHaveBeenCalledWith({
        where: { id: "port-crypto" },
      });
    });
  });
});
