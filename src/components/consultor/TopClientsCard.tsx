"use client";

import React from "react";
import { Card, CardTitle } from "@/components/ui/card";

interface TopClient {
  clientId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  metric: number;
  metricLabel: string;
  metricFormatter: (value: number) => string;
}

interface TopClientsCardProps {
  title: string;
  clients: TopClient[];
  emptyMessage?: string;
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(" ");
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const TopClientsCard: React.FC<TopClientsCardProps> = ({
  title,
  clients,
  emptyMessage = "Nenhum cliente encontrado",
}) => {
  if (clients.length === 0) {
    return (
      <Card>
        <CardTitle>{title}</CardTitle>
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
      <CardTitle>{title}</CardTitle>
      <div className="mt-4 space-y-3">
        {clients.map((client) => (
          <div
            key={client.clientId}
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
              {client.avatarUrl ? (
                <img
                  src={client.avatarUrl}
                  alt={client.name}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                getInitials(client.name)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {client.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {client.email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {client.metricFormatter(client.metric)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {client.metricLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default TopClientsCard;

