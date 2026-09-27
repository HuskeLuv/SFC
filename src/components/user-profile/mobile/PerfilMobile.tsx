'use client';

import React, { useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import UserMetaCard from '@/components/user-profile/UserMetaCard';
import PrivacyControls, { type PrivacySection } from '@/components/user-profile/PrivacyControls';
import { TwoFactorAuthAutoLoad } from '@/components/user-profile/TwoFactorAuth';
import AgendaPreferencias from '@/components/user-profile/AgendaPreferencias';

/**
 * Perfil no celular (PWA fase 3, U1–U3): lista de ajustes em grupos. Cada linha abre, num sheet, o
 * MESMO formulário da página de desktop (mesmas rotas, mesma validação, mesmos textos). Um sheet
 * por vez. "Excluir minha conta" isolada no fim, em vermelho.
 */

export interface PerfilMobileUser {
  id: string;
  email?: string;
  name?: string;
  role?: 'user' | 'consultant' | 'admin';
  avatarUrl?: string;
}

type ItemId = 'nome' | 'senha' | '2fa' | 'sessoes' | 'agenda' | 'dados' | 'excluir';

interface Item {
  id: ItemId;
  label: string;
  hint: string;
  danger?: boolean;
}

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Conta',
    itens: [
      { id: 'nome', label: 'Informações pessoais', hint: 'Nome e e-mail' },
      { id: 'senha', label: 'Alterar senha', hint: 'Senha atual e nova senha' },
    ],
  },
  {
    titulo: 'Segurança',
    itens: [
      { id: '2fa', label: 'Verificação em duas etapas', hint: 'App autenticador (2FA)' },
      { id: 'sessoes', label: 'Sessões ativas', hint: 'Encerrar o acesso nos seus aparelhos' },
    ],
  },
  {
    titulo: 'Agenda',
    itens: [
      {
        id: 'agenda',
        label: 'Lembretes e iCal',
        hint: 'Avisos no sino e link para o seu calendário',
      },
    ],
  },
  {
    titulo: 'Privacidade (LGPD)',
    itens: [
      { id: 'dados', label: 'Baixar meus dados', hint: 'Arquivo JSON com os dados da sua conta' },
    ],
  },
  {
    // Isolada no fim, sem título de grupo.
    titulo: '',
    itens: [
      { id: 'excluir', label: 'Excluir minha conta', hint: 'Não pode ser desfeito', danger: true },
    ],
  },
];

const SECAO_PRIVACIDADE: Partial<Record<ItemId, PrivacySection>> = {
  nome: 'nome',
  senha: 'senha',
  sessoes: 'sessoes',
  dados: 'dados',
  excluir: 'excluir',
};

const TODOS_ITENS = GRUPOS.flatMap((g) => g.itens);

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-gray-400 dark:text-gray-500"
    >
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PerfilMobile({ user }: { user: PerfilMobileUser }) {
  const [aberto, setAberto] = useState<ItemId | null>(null);
  const itemAberto = TODOS_ITENS.find((i) => i.id === aberto) ?? null;
  const secao = aberto ? SECAO_PRIVACIDADE[aberto] : undefined;

  return (
    <div data-mf-mobile="" data-mf-perfil-mobile="" className="space-y-5">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Perfil</h3>

      <UserMetaCard user={user} />

      {GRUPOS.map((grupo, g) => (
        <section
          key={grupo.titulo || g}
          aria-labelledby={grupo.titulo ? `perfil-grupo-${g}` : undefined}
          className={grupo.titulo ? undefined : 'pt-3'}
        >
          {grupo.titulo ? (
            <h4
              id={`perfil-grupo-${g}`}
              className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
            >
              {grupo.titulo}
            </h4>
          ) : null}
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-white/[0.03]">
            {grupo.itens.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  data-perfil-item={item.id}
                  onClick={() => setAberto(item.id)}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-gray-50 dark:active:bg-white/5"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`text-[15px] font-medium ${
                        item.danger
                          ? 'text-[#D92D20] dark:text-[#F97066]'
                          : 'text-gray-800 dark:text-white/90'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {item.hint}
                    </span>
                  </span>
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <BottomSheet isOpen={!!itemAberto} onClose={() => setAberto(null)} title={itemAberto?.label}>
        <div data-perfil-sheet={aberto ?? undefined} className="pb-2">
          {aberto === '2fa' ? (
            <TwoFactorAuthAutoLoad />
          ) : aberto === 'agenda' ? (
            <AgendaPreferencias />
          ) : secao ? (
            <PrivacyControls user={user} section={secao} />
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}
