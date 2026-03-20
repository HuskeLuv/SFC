import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findFirst: vi.fn(), update: vi.fn() },
  stockTransaction: { create: vi.fn() },
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
  new NextRequest("http://localhost/api/carteira/aporte", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("POST /api/carteira/aporte", () => {
  const mockPortfolio = {
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

  const mockPortfolioWithAsset = {
    ...mockPortfolio,
    stockId: null,
    assetId: "asset-1",
    stock: null,
    asset: { symbol: "RESERVA-EMERG-1", name: "Reserva" },
  };

  const mockTransaction = { id: "tx-1", type: "compra", quantity: 1, total: 500 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolio);
    mockPrisma.portfolio.update.mockResolvedValue({});
    mockPrisma.stockTransaction.create.mockResolvedValue(mockTransaction);
  });

  describe("Validações obrigatórias", () => {
    it("retorna 400 quando portfolioId está ausente", async () => {
      const response = await POST(
        createRequest({
          dataAporte: "2024-01-15",
          valorAporte: 500,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("portfolioId");
    });

    it("retorna 400 quando dataAporte está ausente", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          valorAporte: 500,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("dataAporte");
    });

    it("retorna 400 quando valorAporte está ausente", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataAporte: "2024-01-15",
        })
      );
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toContain("valorAporte");
    });
  });

  describe("Fluxo de sucesso", () => {
    it("realiza aporte com sucesso em portfolio com stock", async () => {
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataAporte: "2024-01-15",
          valorAporte: 500,
          tipoAtivo: "acao",
          instituicaoId: "inst-1",
        })
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.portfolio.findFirst).toHaveBeenCalledWith({
        where: { id: "port-1", userId: "user-123" },
        include: { stock: true, asset: true },
      });
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-123",
          stockId: "stock-1",
          type: "compra",
          quantity: 1,
          price: 500,
          total: 500,
          fees: 0,
        }),
      });
      expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
        where: { id: "port-1" },
        data: expect.objectContaining({
          totalInvested: 1500,
          avgPrice: 15,
        }),
      });
    });

    it("realiza aporte com sucesso em portfolio com asset", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(mockPortfolioWithAsset);
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataAporte: "2024-01-15",
          valorAporte: 300,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          assetId: "asset-1",
          type: "compra",
          total: 300,
        }),
      });
      expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
        where: { id: "port-1" },
        data: expect.objectContaining({
          totalInvested: 1300,
        }),
      });
    });

    it("calcula preço médio corretamente após aporte", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue({
        ...mockPortfolio,
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
      });
      const response = await POST(
        createRequest({
          portfolioId: "port-1",
          dataAporte: "2024-01-15",
          valorAporte: 500,
        })
      );
      expect(response.status).toBe(201);
      const novoTotal = 1000 + 500;
      const novaQuantidade = 100;
      const novoPrecoMedio = novoTotal / novaQuantidade;
      expect(mockPrisma.portfolio.update).toHaveBeenCalledWith({
        where: { id: "port-1" },
        data: expect.objectContaining({
          totalInvested: novoTotal,
          avgPrice: novoPrecoMedio,
        }),
      });
    });
  });

  describe("Erros", () => {
    it("retorna 404 quando portfolio não encontrado", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          portfolioId: "port-inexistente",
          dataAporte: "2024-01-15",
          valorAporte: 500,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain("Investimento não encontrado");
    });

    it("retorna 404 quando portfolio pertence a outro usuário", async () => {
      mockPrisma.portfolio.findFirst.mockResolvedValue(null);
      const response = await POST(
        createRequest({
          portfolioId: "port-outro-user",
          dataAporte: "2024-01-15",
          valorAporte: 500,
        })
      );
      const data = await response.json();
      expect(response.status).toBe(404);
      expect(data.error).toContain("Investimento não encontrado");
    });
  });
});
