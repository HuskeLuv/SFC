import { describe, expect, it, beforeEach, beforeAll, vi } from "vitest";

const prismaMock = {
  user: { findUnique: vi.fn() },
  portfolio: { findMany: vi.fn() },
  cashflow: { groupBy: vi.fn(), findMany: vi.fn() },
  consultant: { findFirst: vi.fn() },
  clientConsultant: { findFirst: vi.fn() },
};

const fetchQuotesMock = vi.fn(async (symbols: string[]) => {
  return new Map(symbols.map((symbol) => [symbol, 100]));
});

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

vi.mock("@/services/brapiQuote", () => ({
  fetchQuotes: fetchQuotesMock,
}));

const prismaModulePromise = import("@/lib/prisma");
const brapiModulePromise = import("@/services/brapiQuote");
const consultantApiPromise = import("@/pages/api/consultant/[...params]");
const consultantServicePromise = import("@/services/consultantService");
const actingUtilsPromise = import("@/utils/consultantActing");

let consultantServiceModule: typeof import("@/services/consultantService");
let getClientSummary: typeof import("@/services/consultantService").getClientSummary;
let assertClientOwnership: typeof import("@/pages/api/consultant/[...params]").assertClientOwnership;
let resolveActingContext: typeof import("@/utils/consultantActing").resolveActingContext;

beforeAll(async () => {
  await prismaModulePromise;
  await brapiModulePromise;

  consultantServiceModule = await consultantServicePromise;
  getClientSummary = consultantServiceModule.getClientSummary;

  const consultantApiModule = await consultantApiPromise;
  assertClientOwnership = consultantApiModule.assertClientOwnership;

  const actingModule = await actingUtilsPromise;
  resolveActingContext = actingModule.resolveActingContext;
});

describe("Consultant dashboard domain logic", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.portfolio.findMany.mockReset();
    prismaMock.cashflow.groupBy.mockReset();
    prismaMock.cashflow.findMany.mockReset();
    prismaMock.consultant.findFirst.mockReset();
    prismaMock.clientConsultant.findFirst.mockReset();
    fetchQuotesMock.mockReset();
    fetchQuotesMock.mockResolvedValue(new Map());
  });

  it("retorna null quando o cliente não é encontrado", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const summary = await getClientSummary("missing-client");

    expect(prismaMock.user.findUnique).toHaveBeenCalled();
    expect(summary).toBeNull();
  });

  it("impede acesso a clientes não vinculados", async () => {
    prismaMock.clientConsultant.findFirst.mockResolvedValue(null);

    await expect(
      assertClientOwnership("consultant-id", "unauthorized-client"),
    ).rejects.toMatchObject({
      status: 404,
      message: "Cliente não vinculado ao consultor",
    });
  });

  it("calcula corretamente o resumo financeiro do cliente com dados reais", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "client-123",
      role: "user",
    });

    prismaMock.portfolio.findMany.mockResolvedValue([
      {
        id: "portfolio-1",
        asset: { symbol: "AAA", name: "AAA" },
        stock: null,
        quantity: 10,
        avgPrice: 100,
        totalInvested: 1000,
      },
    ]);

    fetchQuotesMock.mockResolvedValue(
      new Map([
        ["AAA", 120],
      ]),
    );

    prismaMock.cashflow.groupBy.mockResolvedValueOnce([
      { tipo: "receita", _sum: { valor: 500 } },
      { tipo: "despesa", _sum: { valor: 200 } },
    ]);

    prismaMock.cashflow.groupBy.mockResolvedValueOnce([
      { tipo: "receita", _sum: { valor: 100 } },
      { tipo: "despesa", _sum: { valor: 40 } },
    ]);

    const summary = await getClientSummary("client-123");

    expect(summary).toEqual({
      currentBalance: 1500,
      investmentsTotal: 1200,
      monthlyReturnPercentage: Number(((60 / 1000) * 100).toFixed(2)),
      totalAssets: 1,
    });
  });

  it("resolve contexto de atuação do consultor quando cookie válido", async () => {
    const mockRequest = {
      cookies: {
        get: vi.fn(() => ({ value: "client-acting" })),
      },
    } as unknown as import("next/server").NextRequest;

    prismaMock.clientConsultant.findFirst.mockResolvedValue({
      client: {
        id: "client-acting",
        name: "Cliente Exemplo",
        email: "cliente@example.com",
      },
    });

    const context = await resolveActingContext(mockRequest, {
      id: "consultant-user",
      role: "consultant",
    });

    expect(context.targetUserId).toBe("client-acting");
    expect(context.actingClient).toMatchObject({
      id: "client-acting",
      name: "Cliente Exemplo",
      email: "cliente@example.com",
    });
  });
});

