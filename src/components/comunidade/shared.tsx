'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { categoriaPorChave } from '@/constants/comunidade';
import type { AutorComunidade, SeloComunidade } from '@/types/comunidade';
import { generateInitials, getAvatarColorClass, shouldShowInitials } from '@/utils/avatarUtils';
import { separarLinks, tempoRelativo } from '@/utils/comunidadeTexto';

export const CARD_CLASS =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';

export const BOTAO_PRIMARIO =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50';

export const BOTAO_SECUNDARIO =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]';

export const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30';

export function AvatarAutor({
  autor,
  tamanho = 40,
}: {
  autor: Pick<AutorComunidade, 'nome' | 'avatarUrl'>;
  tamanho?: number;
}) {
  const estilo = { width: tamanho, height: tamanho };
  if (!shouldShowInitials(autor.avatarUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar externo (URL livre do perfil)
      <img
        src={autor.avatarUrl!}
        alt=""
        style={estilo}
        className="shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      style={estilo}
      className={`flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${getAvatarColorClass(autor.nome)}`}
      aria-hidden="true"
    >
      {generateInitials(autor.nome)}
    </span>
  );
}

const SELO_ROTULO: Record<SeloComunidade, string> = {
  equipe: 'Equipe My Finance',
  consultor: 'Consultor',
};

export function SeloAutor({ selo }: { selo: SeloComunidade }) {
  const equipe = selo === 'equipe';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={
        equipe
          ? { background: MYFINANCE_BRAND.outside, color: '#fff' }
          : { background: `${MYFINANCE_BRAND.tranquilidade}33`, color: MYFINANCE_BRAND.seguranca }
      }
    >
      {equipe && (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden="true">
          <path d="M8 1.2 9.8 3l2.5-.2.4 2.5L14.8 7 13.6 9.2l.3 2.5-2.5.5L10 14.4 8 13.2 6 14.4 4.6 12.2l-2.5-.5.3-2.5L1.2 7l2.1-1.7.4-2.5L6.2 3zm-1 9.3 4.2-4.2-.9-.9L7 8.7 5.6 7.3l-.9.9z" />
        </svg>
      )}
      {SELO_ROTULO[selo]}
    </span>
  );
}

export function CabecalhoAutor({
  autor,
  createdAt,
  editadoEm,
  categoria,
  tamanhoAvatar = 40,
}: {
  autor: AutorComunidade;
  createdAt: string;
  editadoEm: string | null;
  categoria?: string;
  tamanhoAvatar?: number;
}) {
  const cat = categoria ? categoriaPorChave(categoria) : undefined;
  return (
    <div className="flex min-w-0 items-start gap-3">
      <AvatarAutor autor={autor} tamanho={tamanhoAvatar} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {autor.nome}
          </span>
          {autor.selos.map((s) => (
            <SeloAutor key={s} selo={s} />
          ))}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-500 dark:text-gray-400">
          <time dateTime={createdAt} title={new Date(createdAt).toLocaleString('pt-BR')}>
            {tempoRelativo(createdAt)}
          </time>
          {editadoEm && <span>· editado</span>}
          {cat && (
            <>
              <span>·</span>
              <span className="font-medium" style={{ color: MYFINANCE_BRAND.patrimonio }}>
                {cat.nome}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function TextoComLinks({ texto, className }: { texto: string; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className ?? ''}`}>
      {separarLinks(texto).map((t, i) =>
        t.tipo === 'link' ? (
          <a
            key={i}
            href={t.valor}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-brand-500 underline underline-offset-2 hover:text-brand-600"
          >
            {t.valor}
          </a>
        ) : (
          <React.Fragment key={i}>{t.valor}</React.Fragment>
        ),
      )}
    </p>
  );
}

export interface ItemMenu {
  rotulo: string;
  onClick: () => void;
  perigo?: boolean;
}

/** Menu "⋯" de ações de um post/comentário. */
export function MenuAcoes({ itens, rotulo }: { itens: ItemMenu[]; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  if (itens.length === 0) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      </button>
      {aberto && (
        <ul className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {itens.map((item) => (
            <li key={item.rotulo}>
              <button
                type="button"
                onClick={() => {
                  setAberto(false);
                  item.onClick();
                }}
                className={`w-full px-4 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-white/5 ${
                  item.perigo
                    ? 'text-error-600 dark:text-error-400'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {item.rotulo}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Modal curto de confirmação com campo opcional de texto (motivo). */
export function ModalConfirmacao({
  aberto,
  titulo,
  descricao,
  confirmar,
  perigo,
  campoMotivo,
  campoDias,
  carregando,
  erro,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  confirmar: string;
  perigo?: boolean;
  campoMotivo?: string;
  campoDias?: boolean;
  carregando?: boolean;
  erro?: string | null;
  onFechar: () => void;
  onConfirmar: (dados: { motivo: string; dias: number }) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState(7);
  useEffect(() => {
    if (aberto) {
      setMotivo('');
      setDias(7);
    }
  }, [aberto]);

  return (
    <Modal isOpen={aberto} onClose={onFechar} className="m-4 max-w-md p-6">
      <h3 className="pr-8 text-lg font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
      {descricao && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{descricao}</p>}
      {campoDias && (
        <label className="mt-4 block text-sm text-gray-700 dark:text-gray-300">
          Duração
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className={`${INPUT_CLASS} mt-1`}
          >
            {[1, 7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d === 1 ? '1 dia' : `${d} dias`}
              </option>
            ))}
          </select>
        </label>
      )}
      {campoMotivo && (
        <label className="mt-4 block text-sm text-gray-700 dark:text-gray-300">
          {campoMotivo}
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            rows={3}
            className={`${INPUT_CLASS} mt-1 resize-none`}
          />
        </label>
      )}
      {erro && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{erro}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={carregando}
          onClick={() => onConfirmar({ motivo: motivo.trim(), dias })}
          className={
            perigo
              ? 'inline-flex items-center justify-center rounded-lg bg-error-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-error-600 disabled:opacity-50'
              : BOTAO_PRIMARIO
          }
        >
          {carregando ? 'Aguarde…' : confirmar}
        </button>
      </div>
    </Modal>
  );
}
