'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthOptional } from '@/context/AuthContext';
import { useConexoes, usePluggyConfig } from '@/hooks/useConexoesBancarias';

type Contexto = 'carteira' | 'fluxo';

const CHAMADA: Record<Contexto, string> = {
  carteira: 'Traga investimentos e empréstimos direto do seu banco, sem digitar.',
  fluxo: 'As transações da conta e do cartão chegam sozinhas para você revisar e lançar aqui.',
};

/** "Agora não" esconde por 30 dias, por tela (conveniência local, não é consentimento). */
const DISPENSA_MS = 30 * 24 * 3600_000;
const chaveDispensa = (contexto: Contexto) => `myfinance:open-finance-card:${contexto}`;

function dispensadoRecentemente(contexto: Contexto): boolean {
  try {
    const em = Number(window.localStorage.getItem(chaveDispensa(contexto)));
    return Number.isFinite(em) && em > 0 && Date.now() - em < DISPENSA_MS;
  } catch {
    return false;
  }
}

/**
 * Entrada do Open Finance fora do menu (adequação jurídica, etapa 1 — decisão
 * de produto 21/09/2026: Carteira e Fluxo de Caixa). Só aparece com a
 * integração ligada, para o próprio cliente (não para consultor agindo por
 * ele) e enquanto não houver banco conectado. O clique leva à tela de
 * Conexões bancárias, que abre a jornada (aviso → consentimento →
 * redirecionamento); nenhum dado é pedido aqui.
 */
export default function ConectarBancoCard({
  contexto,
  className = '',
}: {
  contexto: Contexto;
  /** Margem externa (o card some por inteiro quando não se aplica). */
  className?: string;
}) {
  const auth = useAuthOptional();
  const agindoPorCliente = Boolean(auth?.actingClient);
  const { data: config } = usePluggyConfig();
  const habilitado = Boolean(config?.habilitado) && !agindoPorCliente;
  const { data: conexoes, isSuccess } = useConexoes(habilitado);
  const [dispensado, setDispensado] = useState(true);

  useEffect(() => setDispensado(dispensadoRecentemente(contexto)), [contexto]);

  if (!habilitado || !isSuccess || (conexoes?.length ?? 0) > 0 || dispensado) return null;

  const dispensar = () => {
    try {
      window.localStorage.setItem(chaveDispensa(contexto), String(Date.now()));
    } catch {}
    setDispensado(true);
  };

  return (
    <div
      className={`${className} flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#0079F2]/30 bg-[#0079F2]/5 px-4 dark:border-[#80BCF8]/30 dark:bg-[#0079F2]/10 ${
        contexto === 'fluxo' ? 'py-2' : 'py-3'
      }`}
    >
      <p className="min-w-0 flex-1 text-sm text-[#314666] dark:text-blue-100">
        <span className="font-semibold">Conecte seu banco pelo Open Finance.</span>{' '}
        {CHAMADA[contexto]}{' '}
        <span className="text-xs text-gray-600 dark:text-gray-300">
          Somente leitura: o My Finance nunca movimenta seu dinheiro.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/conexoes-bancarias?conectar=1"
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
        >
          Conectar banco
        </Link>
        <button
          type="button"
          onClick={dispensar}
          className="rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
