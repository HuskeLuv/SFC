"use client";

import { useAuth } from "@/hooks/useAuth";

export default function UserHeader() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
          <span className="text-white font-semibold text-lg">
            {user.name?.charAt(0) || user.email?.charAt(0)}
          </span>
        </div>
        <div>
          <div className="font-medium text-gray-900 dark:text-white">
            {user.name || 'Usuário'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {user.email}
          </div>
        </div>
      </div>
      
      <button
        onClick={logout}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        Sair
      </button>
    </div>
  );
} 