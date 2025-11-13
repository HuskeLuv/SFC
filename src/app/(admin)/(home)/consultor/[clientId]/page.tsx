"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Button from "@/components/ui/button/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDownIcon } from "@/icons";

type ClientSummary = {
  currentBalance: number;
  investmentsTotal: number;
  monthlyReturnPercentage: number;
  totalAssets: number;
};

type ClientBalances = {
  income: number;
  expenses: number;
  investments: number;
  net: number;
};

type ClientDetailResponse = {
  clientId: string;
  summary?: ClientSummary | null;
  balances?: {
    total: ClientBalances;
    monthly: ClientBalances;
  } | null;
  portfolio?: {
    currentValue: number;
    totalInvested: number;
    assets: Array<{
      id: string;
      symbol: string | null;
      name: string;
      type?: string | null;
      quantity: number;
      avgPrice: number;
      totalInvested: number;
      currentPrice: number;
      currentValue: number;
      profit: number;
      profitPercentage: number;
    }>;
  } | null;
  indicators?: {
    monthlyReturnPercentage: number;
    totalAssets: number;
    investmentsTotal: number;
  } | null;
  monthlyNetHistory?: Array<{
    month: string;
    net: number;
    cumulative: number;
  }>;
  client?: {
    name?: string | null;
    email?: string | null;
  } | null;
  recentCashflows?: Array<{
    id: string;
    type: string;
    category?: string | null;
    description?: string | null;
    value: number;
    date: string;
    paid: boolean;
  }>;
};

type PerformancePoint = {
  label: string;
  value: number;
};

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const wealthChartOptions: ApexOptions = {
  chart: {
    type: "area",
    height: 320,
    toolbar: { show: false },
    fontFamily: "Outfit, sans-serif",
  },
  stroke: {
    width: 3,
    curve: "smooth",
  },
  colors: ["#0EA5E9"],
  fill: {
    type: "gradient",
    gradient: {
      opacityFrom: 0.35,
      opacityTo: 0.05,
    },
  },
  dataLabels: {
    enabled: false,
  },
  markers: {
    size: 4,
    hover: {
      size: 7,
    },
  },
  grid: {
    borderColor: "rgba(148, 163, 184, 0.18)",
    strokeDashArray: 4,
  },
  yaxis: {
    labels: {
      formatter: (value) =>
        value.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        }),
    },
  },
  xaxis: {
    type: "category",
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: {
        colors: "#64748B",
      },
    },
  },
  tooltip: {
    y: {
      formatter: (value) =>
        value.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        }),
    },
  },
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const percentageFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const capitalizeFirst = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const MONTHS_LIMIT = 6;

const monthKeyFromDate = (input: string) => {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    "0",
  )}`;
};

const inferSignedValue = (movement: { type: string; value: number }) => {
  const normalizedType = movement.type?.toLowerCase?.() ?? "";
  const isExpense =
    normalizedType.includes("desp") ||
    normalizedType.includes("saida") ||
    normalizedType.includes("pag");
  return isExpense ? -Math.abs(movement.value) : Math.abs(movement.value);
};

const buildWealthSeries = (
  detail: ClientDetailResponse | null,
): PerformancePoint[] => {
  if (detail?.monthlyNetHistory?.length) {
    const ordered = detail.monthlyNetHistory
      .map((entry) => {
        const date = new Date(entry.month);
        return {
          timestamp: date.getTime(),
          label: capitalizeFirst(
            date.toLocaleDateString("pt-BR", {
              month: "short",
              year: "numeric",
            }),
          ),
          value: entry.cumulative,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    return ordered.map((entry) => ({
      label: entry.label,
      value: entry.value,
    }));
  }

  if (!detail?.recentCashflows?.length) {
    return [];
  }

  const now = new Date();
  const monthKeys = Array.from({ length: MONTHS_LIMIT })
    .map((_, index) => {
      const reference = new Date(
        now.getFullYear(),
        now.getMonth() - (MONTHS_LIMIT - 1 - index),
        1,
      );
      return {
        key: `${reference.getFullYear()}-${String(
          reference.getMonth() + 1,
        ).padStart(2, "0")}`,
        date: reference,
      };
    });

  const netByMonth = new Map<string, number>();
  detail.recentCashflows.forEach((movement) => {
    const key = monthKeyFromDate(movement.date);
    if (!key) return;
    const current = netByMonth.get(key) ?? 0;
    netByMonth.set(key, current + inferSignedValue(movement));
  });

  const totalNetPeriod = monthKeys.reduce((accumulator, entry) => {
    return accumulator + (netByMonth.get(entry.key) ?? 0);
  }, 0);

  const currentBalance = detail.summary?.currentBalance ?? 0;
  let runningTotal = currentBalance - totalNetPeriod;

  return monthKeys.map(({ key, date }) => {
    const monthlyNet = netByMonth.get(key) ?? 0;
    runningTotal += monthlyNet;
    const label = capitalizeFirst(
      date.toLocaleDateString("pt-BR", { month: "short" }),
    );
    return {
      label,
      value: Number(runningTotal.toFixed(2)),
    };
  });
};

const savingsIndex = (balances: ClientBalances | undefined | null) => {
  if (!balances || balances.income <= 0) {
    return 0;
  }
  const available = balances.income - balances.expenses;
  return (available / balances.income) * 100;
};

const statusBadge = (value: number) => {
  if (value > 0) {
    return { label: "Entrada", color: "success" as const };
  }
  if (value < 0) {
    return { label: "Saída", color: "error" as const };
  }
  return { label: "Neutro", color: "info" as const };
};

const typeLabels: Record<string, string> = {
  stock: "Ações",
  fii: "Fundos Imobiliários",
  etf: "ETFs",
  bdr: "BDRs",
  crypto: "Cripto",
  renda_fixa: "Renda Fixa",
  fixed_income: "Renda Fixa",
  fund: "Fundos",
  other: "Outros",
};

const normalizeTypeLabel = (rawType?: string | null) => {
  if (!rawType) {
    return "Outros";
  }
  const normalized = rawType.toLowerCase();
  return typeLabels[normalized] ?? "Outros";
};

const ClientConsultantDetailPage = () => {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading, actingClient, checkAuth } = useAuth();
  const [detail, setDetail] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingError, setActingError] = useState<string | null>(null);
  const [isSwitchingView, setIsSwitchingView] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  useEffect(() => {
    const loadDetail = async () => {
      if (!params?.clientId) {
        setError("Cliente não encontrado.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/consultant/client/${params.clientId}`,
          { credentials: "include" },
        );
        if (response.status === 404) {
          throw new Error("NOT_LINKED");
        }
        if (!response.ok) {
          throw new Error("FAILED_REQUEST");
        }
        const payload = (await response.json()) as ClientDetailResponse;
        setDetail(payload);
      } catch (requestError) {
        console.error("[ConsultantClientDetail] error", requestError);
        if (requestError instanceof Error && requestError.message === "NOT_LINKED") {
          setError("Cliente não vinculado ao consultor.");
        } else {
          setError(
            "Não foi possível carregar os dados deste cliente. Tente novamente em instantes.",
          );
        }
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };

    if (authLoading) {
      return;
    }
    if (!user || user.role !== "consultant") {
      return;
    }

    void loadDetail();
  }, [params?.clientId, authLoading, user]);

  useEffect(() => {
    if (!authLoading && user && user.role !== "consultant") {
      router.replace("/carteira");
    }
  }, [authLoading, user, router]);

  const isActingOnThisClient =
    actingClient?.id && params?.clientId
      ? actingClient.id === params.clientId
      : false;

  const handleToggleActionMenu = () => {
    if (isSwitchingView) {
      return;
    }
    setActionMenuOpen((previous) => !previous);
  };

  const handlePersonifyNavigation = async (targetPath: string) => {
    if (!params?.clientId) {
      return;
    }
    try {
      setIsSwitchingView(true);
      setActingError(null);
      if (!isActingOnThisClient) {
        const response = await fetch("/api/consultant/acting", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ clientId: params.clientId }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.error ?? "Não foi possível alternar para a visão do cliente.",
          );
        }

        await checkAuth();
      }

      router.push(targetPath);
    } catch (actionError) {
      console.error("[ConsultantClientDetail] acting error", actionError);
      setActingError(
        actionError instanceof Error
          ? actionError.message
          : "Não foi possível alternar a visão para o cliente selecionado.",
      );
    } finally {
      setIsSwitchingView(false);
      setActionMenuOpen(false);
    }
  };

  const wealthSeries = useMemo(() => buildWealthSeries(detail), [detail]);

  const totalBalances = detail?.balances?.total;
  const monthlyBalances = detail?.balances?.monthly;

  const cards = useMemo(() => {
    const summary = detail?.summary;
    const saldoAtual = totalBalances?.net ?? summary?.currentBalance ?? 0;
    const totalInvestido = summary?.investmentsTotal ?? 0;
    const rentabilidadeAcumulada =
      totalInvestido > 0
        ? ((summary?.currentBalance ?? 0) - totalInvestido) / totalInvestido * 100
        : 0;
    const indicePoupanca = savingsIndex(monthlyBalances ?? totalBalances);

    return [
      {
        title: "Saldo atual",
        value: currencyFormatter.format(saldoAtual),
        helper: "Fluxo de caixa consolidado",
      },
      {
        title: "Total investido",
        value: currencyFormatter.format(totalInvestido),
        helper: "Somatório dos ativos em carteira",
      },
      {
        title: "Rentabilidade acumulada",
        value: `${percentageFormatter.format(rentabilidadeAcumulada)}%`,
        helper: "Com base no saldo atual x investido",
      },
      {
        title: "Índice de poupança",
        value: `${percentageFormatter.format(indicePoupanca)}%`,
        helper: "Proporção de renda preservada no mês",
      },
    ];
  }, [detail, totalBalances, monthlyBalances]);

  const portfolioSummary = useMemo(() => {
    if (!detail?.portfolio?.assets?.length) {
      return [];
    }
    const totals = new Map<
      string,
      {
        label: string;
        invested: number;
        current: number;
      }
    >();
    detail.portfolio.assets.forEach((asset) => {
      const label = normalizeTypeLabel(asset.type);
      const entry = totals.get(label);
      if (entry) {
        entry.invested += asset.totalInvested;
        entry.current += asset.currentValue;
      } else {
        totals.set(label, {
          label,
          invested: asset.totalInvested,
          current: asset.currentValue,
        });
      }
    });
    const totalCurrent = Array.from(totals.values()).reduce(
      (accumulator, item) => accumulator + item.current,
      0,
    );
    return Array.from(totals.values()).map((item) => ({
      ...item,
      percentage:
        totalCurrent > 0 ? (item.current / totalCurrent) * 100 : 0,
    }));
  }, [detail]);

  const lastAccess = useMemo(() => {
    const firstMovement = detail?.recentCashflows?.[0];
    if (!firstMovement) return null;
    const date = new Date(firstMovement.date);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [detail]);

  const clientDisplayName =
    detail?.client?.name && detail.client.name.trim().length > 0
      ? detail.client.name
      : "Cliente consultado";

  return (
    <ProtectedRoute>
      <section className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <Link href="/dashboard/consultor">
              <Button variant="outline" size="sm">
                Voltar ao Painel
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {loading && !detail ? "Carregando cliente" : clientDisplayName}
            </h1>
            {detail?.client?.email && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {detail.client.email}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {lastAccess
                ? `Último acesso registrado em ${lastAccess}`
                : "Sem dados no período"}
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="relative">
              <Button
                variant="primary"
                className="dropdown-toggle"
                onClick={handleToggleActionMenu}
                endIcon={<ChevronDownIcon className="h-4 w-4" />}
                disabled={isSwitchingView}
                aria-label="Personificar cliente e acessar áreas"
              >
                {isActingOnThisClient
                  ? "Navegar como cliente"
                  : "Personificar cliente"}
              </Button>
              <Dropdown
                isOpen={actionMenuOpen}
                onClose={() => setActionMenuOpen(false)}
                className="w-64"
              >
                <div className="flex flex-col py-2">
                  <DropdownItem
                    onClick={() => handlePersonifyNavigation("/fluxodecaixa")}
                    className="text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  >
                    Ir para Fluxo de Caixa
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => handlePersonifyNavigation("/carteira")}
                    className="text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  >
                    Ir para Carteira de Investimentos
                  </DropdownItem>
                </div>
              </Dropdown>
            </div>
            {actingError ? (
              <p className="text-sm text-red-500 dark:text-red-400">
                {actingError}
              </p>
            ) : null}
          </div>
        </div>

        {error && (
          <Card>
            <CardTitle>Ocorreu um problema</CardTitle>
            <CardDescription>{error}</CardDescription>
          </Card>
        )}

        {loading && !error ? (
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white/60 dark:border-gray-800 dark:bg-white/[0.03]"
                />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white/60 dark:border-gray-800 dark:bg-white/[0.03]" />
            <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white/60 dark:border-gray-800 dark:bg-white/[0.03]" />
          </div>
        ) : (
          !error && (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                  <Card key={card.title}>
                    <CardTitle>{card.title}</CardTitle>
                    <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {card.helper}
                    </p>
                  </Card>
                ))}
              </section>

              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                      Evolução patrimonial (6 meses)
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Valores calculados com base nas movimentações registradas.
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  {wealthSeries.length ? (
                    <ReactApexChart
                      options={{
                        ...wealthChartOptions,
                        xaxis: {
                          ...wealthChartOptions.xaxis,
                          categories: wealthSeries.map((item) => item.label),
                        },
                      }}
                      series={[
                        {
                          name: "Patrimônio",
                          data: wealthSeries.map((item) =>
                            Number(item.value.toFixed(2)),
                          ),
                        },
                      ]}
                      type="area"
                      height={320}
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700 dark:text-white/80">
                          Sem dados no período
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Registre movimentações mensais para visualizar a evolução patrimonial.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <section className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardTitle>Últimas movimentações</CardTitle>
                  <CardDescription>
                    Entradas e saídas registradas mais recentemente.
                  </CardDescription>
                  <div className="mt-5 space-y-4">
                    {detail?.recentCashflows?.length ? (
                      detail.recentCashflows.map((movement) => {
                        const signedValue = inferSignedValue(movement);
                        const badge = statusBadge(signedValue);
                        const formattedDate = new Date(
                          movement.date,
                        ).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        });
                        return (
                          <div
                            key={movement.id}
                            className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 dark:border-gray-800"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                                {movement.description ??
                                  movement.category ??
                                  movement.type}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {formattedDate}
                              </p>
                            </div>
                            <div className="text-right">
                              <p
                                className={`text-sm font-semibold ${
                                  signedValue >= 0
                                    ? "text-success-600"
                                    : "text-error-500"
                                }`}
                              >
                                {signedValue >= 0 ? "+" : "−"}
                                {currencyFormatter.format(Math.abs(signedValue))}
                              </p>
                              <div className="mt-1 flex justify-end">
                                <Badge
                                  variant="light"
                                  color={badge.color}
                                  size="sm"
                                >
                                  {badge.label}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sem dados no período.
                      </p>
                    )}
                  </div>
                </Card>

                <Card>
                  <CardTitle>Resumo por tipo de investimento</CardTitle>
                  <CardDescription>
                    Distribuição atualizada dos ativos sob consultoria.
                  </CardDescription>
                  <div className="mt-5">
                    {portfolioSummary.length ? (
                      <Table className="text-sm">
                        <TableHeader>
                          <TableRow className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            <TableCell isHeader className="px-4 py-3">
                              Tipo
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3">
                              Investido
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3">
                              Valor atual
                            </TableCell>
                            <TableCell isHeader className="px-4 py-3">
                              Participação
                            </TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {portfolioSummary.map((item) => (
                            <TableRow
                              key={item.label}
                              className="border-b border-gray-100 text-sm last:border-b-0 dark:border-gray-800"
                            >
                              <TableCell className="px-4 py-3 text-gray-800 dark:text-white/90">
                                {item.label}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-gray-700 dark:text-white/80">
                                {currencyFormatter.format(item.invested)}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-gray-700 dark:text-white/80">
                                {currencyFormatter.format(item.current)}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-gray-700 dark:text-white/80">
                                {percentageFormatter.format(item.percentage)}%
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Sem dados no período. Este cliente ainda não possui ativos cadastrados na carteira.
                      </p>
                    )}
                  </div>
                </Card>
              </section>
            </>
          )
        )}
      </section>
    </ProtectedRoute>
  );
};

export default ClientConsultantDetailPage;

