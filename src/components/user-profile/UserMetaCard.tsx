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

/**
 * PWA fase 3: abaixo de lg (Perfil em lista de ajustes) vira o cabeçalho compacto — avatar de 64px
 * à esquerda, nome e e-mail ao lado. Só tokens `max-lg:`; o desktop não muda.
 */
export default function UserMetaCard({ user }: UserMetaCardProps) {
  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6 max-lg:bg-white max-lg:p-4 dark:max-lg:bg-white/[0.03]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col items-center w-full gap-6 xl:flex-row max-lg:flex-row max-lg:gap-4">
          <div className="flex items-center justify-center w-20 h-20 max-lg:h-16 max-lg:w-16 max-lg:shrink-0">
            <Avatar
              src={user?.avatarUrl}
              name={user?.name || 'Usuário'}
              size="xxlarge"
              alt={`Avatar de ${user?.name || 'Usuário'}`}
            />
          </div>
          <div className="order-3 xl:order-2 max-lg:order-2 max-lg:min-w-0">
            <h3 className="mb-1 text-xl font-semibold text-gray-800 dark:text-white/90 max-lg:truncate max-lg:text-lg">
              {user?.name || 'Usuário'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-lg:truncate">
              {user?.email || ''}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
