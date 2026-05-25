'use client';

import React from 'react';

interface UserInfoCardProps {
  user?: {
    name?: string;
    email?: string;
  };
}

export default function UserInfoCard({ user }: UserInfoCardProps) {
  const nameParts = user?.name?.split(' ') || [];
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
        Informações Pessoais
      </h4>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
        <div>
          <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">Nome</p>
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">{firstName || '—'}</p>
        </div>

        <div>
          <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">Sobrenome</p>
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">{lastName || '—'}</p>
        </div>

        <div>
          <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
            Endereço de email
          </p>
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
            {user?.email || '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
