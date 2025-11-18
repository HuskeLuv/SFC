"use client";

import React from "react";
import { Card, CardTitle } from "@/components/ui/card";

interface DashboardMetricCardProps {
  title: string;
  value: string | number;
  formatter?: (value: number) => string;
  subtitle?: string;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  title,
  value,
  formatter,
  subtitle,
}) => {
  const displayValue =
    typeof value === "number" && formatter
      ? formatter(value)
      : String(value);

  return (
    <Card>
      <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
        {title}
      </CardTitle>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">
        {displayValue}
      </p>
      {subtitle && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {subtitle}
        </p>
      )}
    </Card>
  );
};

export default DashboardMetricCard;

