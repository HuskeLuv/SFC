import React from 'react';

export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
      <div className="flex flex-col items-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-700" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
      </div>
    </div>
  );
}
