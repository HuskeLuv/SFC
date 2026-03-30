import React from 'react';

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className || ''}`} />
  );
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
      <Skeleton className="mb-2 h-4 w-20" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export default function ConsultorLoading() {
  return (
    <div className="space-y-6">
      {/* Page title skeleton */}
      <Skeleton className="h-8 w-48" />

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      {/* Charts row skeleton */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <Skeleton className="mb-4 h-6 w-40" />
          <Skeleton className="h-56 w-full" />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <Skeleton className="mb-4 h-6 w-40" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>

      {/* Clients table skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-10 w-48" />
        </div>
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
