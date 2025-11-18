"use client";

import React from "react";
import { Card, CardTitle } from "@/components/ui/card";
import Badge from "@/components/ui/badge/Badge";

interface RiskAlert {
  clientId: string;
  name: string;
  email: string;
  alertType: "negative_flow" | "high_concentration" | "no_aportes";
  message: string;
}

interface RiskAlertListProps {
  alerts: RiskAlert[];
  emptyMessage?: string;
}

const getAlertColor = (
  alertType: RiskAlert["alertType"],
): "error" | "warning" => {
  switch (alertType) {
    case "negative_flow":
      return "error";
    case "high_concentration":
      return "warning";
    case "no_aportes":
      return "warning";
    default:
      return "warning";
  }
};

const RiskAlertList: React.FC<RiskAlertListProps> = ({
  alerts,
  emptyMessage = "Nenhum alerta encontrado",
}) => {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardTitle>Riscos & Alertas</CardTitle>
        <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-gray-200 py-8 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {emptyMessage}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Riscos & Alertas</CardTitle>
      <div className="mt-4 space-y-3">
        {alerts.map((alert) => (
          <div
            key={`${alert.clientId}-${alert.alertType}`}
            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {alert.name}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {alert.email}
                </p>
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                  {alert.message}
                </p>
              </div>
              <Badge
                color={getAlertColor(alert.alertType)}
                size="sm"
                variant="light"
              >
                {alert.alertType === "negative_flow"
                  ? "Fluxo Negativo"
                  : alert.alertType === "high_concentration"
                  ? "Concentração"
                  : "Sem Aportes"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RiskAlertList;

