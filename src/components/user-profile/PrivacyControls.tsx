'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import { useCsrf } from '@/hooks/useCsrf';

/**
 * Controles de privacidade do usuário (LGPD Fase 2, Art. 18):
 *  - Editar nome (correção, Art. 18 III)
 *  - Alterar senha
 *  - Baixar meus dados (portabilidade, Art. 18 V)
 *  - Excluir minha conta (eliminação/anonimização, Art. 18 IV)
 *
 * Os 4 ficam num único card pra reduzir cognitive load — usuário acha
 * tudo o que precisa fazer com seus dados em um lugar só.
 */
export default function PrivacyControls({
  user,
}: {
  user: { id: string; name?: string; email?: string };
}) {
  const { csrfFetch } = useCsrf();
  const [name, setName] = useState(user.name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [deletePwd, setDeletePwd] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await csrfFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao salvar');
      setNameMsg('Salvo!');
    } catch (err) {
      setNameMsg(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPwd(true);
    setPwdMsg(null);
    try {
      const res = await csrfFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao trocar senha');
      setPwdMsg({ type: 'ok', text: 'Senha alterada com sucesso.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwdMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erro' });
    } finally {
      setSavingPwd(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/profile/export', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao exportar');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myfinance-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Erro export:', err);
      alert('Erro ao baixar seus dados. Tente novamente.');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteMsg('Marque a confirmação pra prosseguir.');
      return;
    }
    if (!deletePwd) {
      setDeleteMsg('Informe sua senha pra confirmar.');
      return;
    }
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const res = await csrfFetch('/api/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: deletePwd, confirm: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao excluir');
      // Conta anonimizada — desloga
      window.location.href = '/signin';
    } catch (err) {
      setDeleteMsg(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Editar nome */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
          Informações pessoais
        </h3>
        <form onSubmit={handleSaveName} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">Nome completo</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">E-mail</span>
            <input
              type="email"
              value={user.email || ''}
              disabled
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            />
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-500">
              Alteração de e-mail estará disponível em breve.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingName}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {savingName ? 'Salvando…' : 'Salvar'}
            </button>
            {nameMsg && <span className="text-sm text-gray-600 dark:text-gray-400">{nameMsg}</span>}
          </div>
        </form>
      </section>

      {/* Trocar senha */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-4 text-base font-semibold text-gray-800 dark:text-white/90">
          Alterar senha
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">Senha atual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">Nova senha (mín. 8 caracteres)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingPwd || !currentPassword || !newPassword}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {savingPwd ? 'Alterando…' : 'Alterar senha'}
            </button>
            {pwdMsg && (
              <span
                className={`text-sm ${
                  pwdMsg.type === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {pwdMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Baixar dados */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-2 text-base font-semibold text-gray-800 dark:text-white/90">
          Baixar meus dados
        </h3>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          Exporta todos os seus dados em formato JSON estruturado (perfil, portfólio, transações,
          fluxo de caixa, planejamento). Conforme Art. 18, V da LGPD.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Baixar JSON
        </button>
      </section>

      {/* Excluir conta */}
      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 dark:border-red-900/40 dark:bg-red-900/10 lg:p-6">
        <h3 className="mb-2 text-base font-semibold text-red-700 dark:text-red-300">
          Excluir minha conta
        </h3>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          Seus dados pessoais identificáveis (nome e e-mail) serão anonimizados; registros
          transacionais podem ser preservados de forma agregada para fins fiscais. A operação não
          pode ser desfeita.
        </p>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-400">Senha atual (pra confirmar)</span>
            <input
              type="password"
              value={deletePwd}
              onChange={(e) => setDeletePwd(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Entendo que esta ação é irreversível e que perderei o acesso a todos os meus dados na
              plataforma.
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || !deleteConfirm || !deletePwd}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? 'Excluindo…' : 'Excluir minha conta'}
            </button>
            {deleteMsg && (
              <span className="text-sm text-red-600 dark:text-red-400">{deleteMsg}</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
