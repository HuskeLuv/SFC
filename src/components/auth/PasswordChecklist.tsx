import React from 'react';
import { passwordRequirements } from '@/utils/passwordRequirements';

/**
 * Checklist dos requisitos de senha: cada item fica verde em tempo real conforme o usuário digita,
 * deixando claro o que falta. Mesma lista do backend (`passwordRequirements`). Usado no cadastro e
 * na troca de senha do Perfil.
 */
export default function PasswordChecklist({
  password,
  className = 'mt-2 space-y-1.5',
}: {
  password: string;
  className?: string;
}) {
  return (
    <ul className={className} aria-label="Requisitos da senha">
      {passwordRequirements.map((req) => {
        const ok = req.test(password);
        return (
          <li
            key={req.id}
            className={`flex items-center gap-2 text-xs ${
              ok ? 'text-success-600 dark:text-success-500' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none ${
                ok
                  ? 'bg-success-500 text-white'
                  : 'border border-gray-300 text-transparent dark:border-gray-600'
              }`}
            >
              ✓
            </span>
            {req.label}
          </li>
        );
      })}
    </ul>
  );
}
