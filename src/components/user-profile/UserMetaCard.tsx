'use client';

import React from 'react';
import Avatar from '../ui/avatar/Avatar';

interface UserMetaCardProps {
  user?: {
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
}

export default function UserMetaCard({ user }: UserMetaCardProps) {
  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col items-center w-full gap-6 xl:flex-row">
          <div className="flex items-center justify-center w-20 h-20">
            <Avatar
              src={user?.avatarUrl}
              name={user?.name || 'Usuário'}
              size="xxlarge"
              alt={`Avatar de ${user?.name || 'Usuário'}`}
            />
          </div>
          <div className="order-3 xl:order-2">
            <h3 className="mb-1 text-xl font-semibold text-gray-800 dark:text-white/90">
              {user?.name || 'Usuário'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email || ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
