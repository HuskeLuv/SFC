import React from 'react';

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className || ''}`} />
  );
}

export default function AdminLoading() {
  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar skeleton */}
      <div className="hidden w-[200px] border-r border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 lg:block">
        <Skeleton className="mb-8 h-10 w-32" />
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      {/* Content area skeleton */}
      <div className="flex-1">
        {/* Header skeleton */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-900">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        {/* Page content skeleton */}
        <div className="p-4 md:p-6">
          <Skeleton className="mb-6 h-8 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
                <Skeleton className="mb-2 h-4 w-20" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
