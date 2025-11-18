"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import Input from "@/components/form/input/InputField";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import LineChartCarteiraHistorico from "@/components/charts/line/LineChartCarteiraHistorico";

type ConsultantOverview = {
  totalClients: number;
  totalActiveClients: number;
  totalManagedAssets: number;
  averageClientReturn: number;
};

type ConsultantOverviewResponse = {
  overview: ConsultantOverview;
};

type ConsultantClient = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: "active" | "inactive";
  createdAt: string;
};

type ConsultantClientsResponse = {
  clients: ConsultantClient[];
};

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
    value: number;
    date: string;
    description?: string | null;
  }>;
};

type ClientWithDetail = ConsultantClient & {
  detail: ClientDetailResponse | null;
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

type PerformancePoint = {
  label: string;
  value: number;
  timestamp: number;
};

type ConsultantInvitationSummary = {
  id: string;
  email: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  respondedAt: string | null;
};

const buildPerformanceSeries = (
  clients: ClientWithDetail[],
): PerformancePoint[] => {
  const aggregates = new Map<
    number,
    {
      sum: number;
      count: number;
    }
  >();

  clients.forEach((client) => {
    const history = client.detail?.monthlyNetHistory;
    if (!history?.length) {
      return;
    }

    history.forEach((entry) => {
      const date = new Date(entry.month);
      const timestamp = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      const aggregate = aggregates.get(timestamp);
      if (aggregate) {
        aggregate.sum += entry.cumulative;
        aggregate.count += 1;
      } else {
        aggregates.set(timestamp, {
          sum: entry.cumulative,
          count: 1,
        });
      }
    });
  });

  if (!aggregates.size) {
    return [];
  }

  const timestamps = Array.from(aggregates.keys()).sort((a, b) => a - b);
  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];

  const cursor = new Date(firstTimestamp);
  const points: PerformancePoint[] = [];
  while (cursor.getTime() <= lastTimestamp) {
    const timestamp = cursor.getTime();
    const aggregate = aggregates.get(timestamp);
    const average =
      aggregate && aggregate.count > 0 ? aggregate.sum / aggregate.count : 0;
    const label = capitalizeFirst(
      cursor.toLocaleDateString("pt-BR", {
        month: "short",
        year: "numeric",
      }),
    );
    points.push({
      label,
      value: Number(average.toFixed(2)),
      timestamp,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
};

const getStatusPresentation = (status: "active" | "inactive") => {
  if (status === "active") {
    return {
      label: "Ativo",
      color: "success" as const,
    };
  }
  return {
    label: "Inativo",
    color: "warning" as const,
  };
};

const ConsultantDashboardPage = () => {
  const { user, isLoading: authLoading, checkAuth, actingClient } = useAuth();
  const router = useRouter();
  const [overview, setOverview] = useState<ConsultantOverview | null>(null);
  const [clients, setClients] = useState<ClientWithDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationSubmitting, setInvitationSubmitting] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationSuccess, setInvitationSuccess] = useState<string | null>(null);
  const [invitationStatuses, setInvitationStatuses] =
    useState<ConsultantInvitationSummary[]>([]);
  const [personifyingClientId, setPersonifyingClientId] = useState<string | null>(null);

  const fetchOverviewAndClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsLoadingDetails(true);
      setError(null);

      const [overviewResponse, clientsResponse] = await Promise.all([
        fetch("/api/consultant/overview", {
          credentials: "include",
        }),
        fetch("/api/consultant/clients", {
          credentials: "include",
        }),
      ]);

      if (!overviewResponse.ok) {
        throw new Error("Falha ao carregar overview");
      }
      if (!clientsResponse.ok) {
        throw new Error("Falha ao carregar clientes");
      }

      const overviewPayload =
        (await overviewResponse.json()) as ConsultantOverviewResponse;
      const clientsPayload =
        (await clientsResponse.json()) as ConsultantClientsResponse;

      setOverview(overviewPayload.overview);

      const clientsWithDetail: ClientWithDetail[] =
        clientsPayload.clients.map((client) => ({
          ...client,
          detail: null,
        }));

      setClients(clientsWithDetail);
    } catch (requestError) {
      console.error("[ConsultantDashboard] load error", requestError);
      setError(
        "Não foi possível carregar os dados do consultor. Tente novamente em instantes.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchInvitations = useCallback(async () => {
    try {
      const response = await fetch("/api/consultant/invitations", {
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        console.warn("[ConsultantDashboard] invitations request failed", {
          status: response.status,
          body: payload,
        });
        setInvitationStatuses([]);
        return;
      }

      const payload = (await response.json()) as {
        invitations: ConsultantInvitationSummary[];
      };

      setInvitationStatuses(payload.invitations.slice(0, 5));
    } catch (inviteError) {
      console.error("[ConsultantDashboard] invitations load error", inviteError);
      setInvitationStatuses([]);
    }
  }, []);

  const fetchClientDetails = async (
    clientsToFetch: ClientWithDetail[],
  ) => {
    try {
      setIsLoadingDetails(true);
      const detailedClients = await Promise.all(
        clientsToFetch.map(async (client) => {
          try {
            const response = await fetch(
              `/api/consultant/client/${client.clientId}`,
              {
                credentials: "include",
              },
            );
            if (!response.ok) {
              return {
                ...client,
                detail: null,
              };
            }
            const detailPayload =
              (await response.json()) as ClientDetailResponse;
            return {
              ...client,
              detail: detailPayload,
            };
          } catch (detailError) {
            console.error(
              `[ConsultantDashboard] client ${client.clientId} detail error`,
              detailError,
            );
            return {
              ...client,
              detail: null,
            };
          }
        }),
      );
      setClients(detailedClients);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user || user.role !== "consultant") {
      return;
    }
    void fetchOverviewAndClients();
    void fetchInvitations();
  }, [authLoading, user, fetchOverviewAndClients, fetchInvitations]);

  useEffect(() => {
    if (!authLoading && user && user.role !== "consultant") {
      router.replace("/carteira");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!isLoading && clients.length > 0) {
      void fetchClientDetails(clients);
    } else if (!isLoading) {
      setIsLoadingDetails(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const totalInvested = useMemo(() => {
    return clients.reduce((accumulator, client) => {
      const invested = client.detail?.summary?.investmentsTotal ?? 0;
      return accumulator + invested;
    }, 0);
  }, [clients]);

  const performanceSeries = useMemo(() => {
    return buildPerformanceSeries(clients);
  }, [clients]);

  const performanceHistory = useMemo(() => {
    return performanceSeries.map((point) => ({
      data: point.timestamp,
      valor: point.value,
    }));
  }, [performanceSeries]);

  const summaryCards = useMemo(() => {
    return [
      {
        title: "Total de clientes",
        value: overview?.totalClients ?? 0,
        formatter: (value: number) => String(value),
      },
      {
        title: "Patrimônio total sob consultoria",
        value: overview?.totalManagedAssets ?? 0,
        formatter: (value: number) => currencyFormatter.format(value),
      },
      {
        title: "Rentabilidade média",
        value: overview?.averageClientReturn ?? 0,
        formatter: (value: number) => `${percentageFormatter.format(value)}%`,
      },
      {
        title: "Total investido",
        value: totalInvested,
        formatter: (value: number) => currencyFormatter.format(value),
      },
    ];
  }, [overview, totalInvested]);

  const handleRetry = () => {
    void fetchOverviewAndClients();
    void fetchInvitations();
  };

  const handlePersonifyClient = async (clientId: string) => {
    if (!clientId || personifyingClientId === clientId) {
      return;
    }
    try {
      setPersonifyingClientId(clientId);
      const response = await fetch("/api/consultant/acting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ clientId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error ?? "Não foi possível personificar o cliente.",
        );
      }

      await checkAuth();
      router.push("/carteira");
    } catch (actionError) {
      console.error("[ConsultantDashboard] acting error", actionError);
      setPersonifyingClientId(null);
    }
  };

  const isEmptyState =
    !isLoading &&
    !isLoadingDetails &&
    (overview?.totalClients ?? 0) === 0 &&
    clients.length === 0;

  const getInvitationBadge = (
    status: "pending" | "accepted" | "rejected",
  ): { label: string; color: "warning" | "success" | "error" } => {
    if (status === "accepted") {
      return { label: "Aceito", color: "success" };
    }
    if (status === "rejected") {
      return { label: "Negado", color: "error" };
    }
    return { label: "Em espera", color: "warning" };
  };

  const handleSendInvitation = async () => {
    if (!invitationEmail || invitationSubmitting) {
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail.trim())) {
      setInvitationError("Informe um e-mail válido.");
      return;
    }

    try {
      setInvitationSubmitting(true);
      setInvitationError(null);
      setInvitationSuccess(null);

      const response = await fetch("/api/consultant/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email: invitationEmail.trim() }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error ?? "Não foi possível enviar o convite, tente novamente.",
        );
      }

      setInvitationSuccess("Convite enviado com sucesso.");
      setInvitationEmail("");
      await fetchInvitations();
    } catch (inviteError) {
      console.error("[ConsultantDashboard] invite error", inviteError);
      setInvitationError(
        inviteError instanceof Error
          ? inviteError.message
          : "Não foi possível enviar o convite. Tente novamente.",
      );
    } finally {
      setInvitationSubmitting(false);
    }
  };

  return (
    <ProtectedRoute>
      <section className="space-y-8">
        <header className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium text-brand-500">
              Painel do Consultor
            </p>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {user?.name ? `Olá, ${user.name}` : "Visão geral"}
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Monitore o desempenho agregado e acompanhe os clientes sob sua
            consultoria em um único lugar.
          </p>
        </header>

        {error && (
          <Card>
            <CardTitle>Não foi possível carregar os dados</CardTitle>
            <CardDescription>
              {error}
            </CardDescription>
            <div className="mt-4">
              <Button onClick={handleRetry}>Tentar novamente</Button>
            </div>
          </Card>
        )}

        {!error && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white/60 dark:border-gray-800 dark:bg-white/[0.03]"
                    />
                  ))
                : summaryCards.map((card) => (
                    <Card key={card.title}>
                      <CardTitle>{card.title}</CardTitle>
                      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
                        {card.formatter(card.value)}
                      </p>
                      {card.title === "Total de clientes" && overview && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {overview.totalActiveClients} clientes ativos
                        </p>
                      )}
                    </Card>
                  ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
              <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
                <div className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Desempenho agregado dos clientes
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Média mensal das movimentações líquidas dos clientes nos últimos meses.
                  </p>
                </div>
                {isLoading || isLoadingDetails ? (
                  <div className="mt-6 flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Carregando desempenho...
                    </span>
                  </div>
                ) : performanceHistory.length === 0 ? (
                  <div className="mt-6 flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-white/[0.02]">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-white/80">
                        Sem dados no período
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Os clientes ainda não possuem movimentações recentes para gerar o desempenho agregado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <LineChartCarteiraHistorico data={performanceHistory} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Adicionar cliente por e-mail
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Envie um convite para que o cliente conecte a conta dele à sua consultoria.
                  </p>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSendInvitation();
                    }}
                  >
                    <Input
                      type="email"
                      placeholder="cliente@exemplo.com"
                      value={invitationEmail}
                      onChange={(event) => {
                        setInvitationEmail(event.target.value);
                        setInvitationError(null);
                        setInvitationSuccess(null);
                      }}
                      disabled={invitationSubmitting}
                      required
                    />
                    {invitationError ? (
                      <p className="text-xs text-error-500">{invitationError}</p>
                    ) : null}
                    {invitationSuccess ? (
                      <p className="text-xs text-success-600">{invitationSuccess}</p>
                    ) : null}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={invitationSubmitting}
                    >
                      {invitationSubmitting ? "Enviando convite..." : "Enviar convite"}
                    </Button>
                  </form>
                </div>
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-white/80">
                      Status dos convites
                    </h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Últimos convites enviados
                    </span>
                  </div>
                  {invitationStatuses.length === 0 ? (
                    <div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Nenhum convite enviado ainda.
                      </p>
                    </div>
                  ) : (
                    <Table className="text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableCell isHeader className="px-3 py-2">
                            Email
                          </TableCell>
                          <TableCell isHeader className="px-3 py-2">
                            Status
                          </TableCell>
                          <TableCell isHeader className="px-3 py-2 text-right">
                            Enviado em
                          </TableCell>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invitationStatuses.map((invite) => {
                          const badge = getInvitationBadge(invite.status);
                          const referenceDate =
                            invite.respondedAt ?? invite.createdAt;
                          const formattedDate = new Date(
                            referenceDate,
                          ).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          });
                          const secondaryLabel =
                            invite.respondedAt !== null ? "Respondido" : "Enviado";

                          return (
                            <TableRow key={invite.id}>
                              <TableCell className="px-3 py-2 text-gray-700 dark:text-gray-200">
                                {invite.email}
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <Badge color={badge.color} size="sm">
                                  {badge.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span>{formattedDate}</span>
                                  <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                    {secondaryLabel}
                                  </span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                    Clientes sob consultoria
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Visualize rapidamente patrimônio, rentabilidade e status de
                    cada cliente.
                  </p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                {isLoading || isLoadingDetails ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.05]"
                      />
                    ))}
                  </div>
                ) : isEmptyState ? (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-16 dark:border-gray-700">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-white/80">
                        Sem dados no período
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Vincule clientes ao seu perfil de consultor para começar
                        a visualizar informações aqui.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Table className="bg-white dark:bg-transparent">
                    <TableHeader className="border-b border-gray-200 dark:border-gray-700">
                      <TableRow className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <TableCell isHeader className="px-4 py-3">
                          Cliente
                        </TableCell>
                        <TableCell isHeader className="px-4 py-3">
                          Patrimônio
                        </TableCell>
                        <TableCell isHeader className="px-4 py-3">
                          Rentabilidade
                        </TableCell>
                        <TableCell isHeader className="px-4 py-3">
                          Status
                        </TableCell>
                        <TableCell isHeader className="px-4 py-3 text-right">
                          Ações
                        </TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.map((client) => {
                        const summary = client.detail?.summary;
                        const statusPresentation = getStatusPresentation(
                          client.status,
                        );
                        return (
                          <TableRow
                            key={client.id}
                            className="border-b border-gray-100 text-sm last:border-b-0 dark:border-gray-800"
                          >
                            <TableCell className="px-4 py-4">
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-800 dark:text-white/90">
                                  {client.name}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {client.email}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="px-4 py-4 text-gray-700 dark:text-white/80">
                              {summary
                                ? currencyFormatter.format(
                                    summary.currentBalance,
                                  )
                                : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-4 text-gray-700 dark:text-white/80">
                              {summary
                                ? `${percentageFormatter.format(
                                    summary.monthlyReturnPercentage,
                                  )}%`
                                : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-4">
                              <Badge
                                variant="light"
                                color={statusPresentation.color}
                                size="sm"
                              >
                                {statusPresentation.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-4 py-4 text-right">
                              <Button
                                size="sm"
                                onClick={() => handlePersonifyClient(client.clientId)}
                                disabled={personifyingClientId === client.clientId || !!actingClient}
                                aria-label="Personificar cliente"
                              >
                                {personifyingClientId === client.clientId
                                  ? "Personificando..."
                                  : actingClient?.id === client.clientId
                                  ? "Personificado"
                                  : "Personificar cliente"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </section>
          </>
        )}
      </section>
    </ProtectedRoute>
  );
};

export default ConsultantDashboardPage;

