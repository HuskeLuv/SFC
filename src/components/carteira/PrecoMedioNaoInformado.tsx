'use client';
import React from 'react';
import Link from 'next/link';
import { linkCorrigirPrecoMedio, usePrecoMedioPendente } from '@/hooks/usePrecoMedioPendente';

/**
 * "Preço médio não informado pelo banco" (Open Finance): o banco mandou só quantidade e cotação
 * de ação/FII/ETF, e a compra entrou com a cotação e a data da conexão. Os avisos levam à edição
 * da compra; corrigido o preço, somem (a consulta é refeita pela invalidação da carteira).
 */

const IconeInfo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Aviso discreto na linha (ou no cartão) da posição. Nada quando a posição tem preço médio. */
export function AvisoPrecoMedioLinha({
  portfolioId,
  className = '',
}: {
  portfolioId: string;
  className?: string;
}) {
  const { porPortfolio } = usePrecoMedioPendente();
  if (!porPortfolio.has(portfolioId)) return null;
  return (
    <Link
      href={linkCorrigirPrecoMedio(portfolioId)}
      data-preco-medio-nao-informado=""
      title="O banco mandou só a quantidade e a cotação atual. Informe o preço médio e a data da compra."
      className={`mt-1 inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-mf-patrimonio hover:underline focus-visible:outline-2 focus-visible:outline-mf-outside dark:text-mf-tranquilidade ${className}`}
    >
      <IconeInfo />
      Preço médio não informado pelo banco — informe
    </Link>
  );
}

/** Aviso agregado (topo da Carteira e Conexões): "N posições vieram do banco sem preço médio". */
export function AvisoPrecoMedioAgregado({ className = '' }: { className?: string }) {
  const { posicoes } = usePrecoMedioPendente();
  if (posicoes.length === 0) return null;
  const n = posicoes.length;
  return (
    <div
      role="note"
      data-preco-medio-agregado=""
      className={`rounded-lg border border-[#DCE6F2] bg-[#EDF2F8] px-4 py-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300 ${className}`}
    >
      <p className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-mf-patrimonio dark:text-mf-tranquilidade">
          <IconeInfo />
        </span>
        <span>
          <b className="font-semibold text-gray-900 dark:text-white">
            {n === 1
              ? '1 posição veio do banco sem preço médio.'
              : `${n} posições vieram do banco sem preço médio.`}
          </b>{' '}
          O banco mandou só a quantidade e a cotação atual, então o preço médio e a data da compra
          ficaram os do dia da conexão e a rentabilidade não está certa. Informe os valores reais:
        </span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-2 pl-6" aria-label="Posições sem preço médio">
        {posicoes.map((p) => (
          <li key={p.portfolioId}>
            <Link
              href={linkCorrigirPrecoMedio(p.portfolioId)}
              title={p.nome || undefined}
              className="inline-flex min-h-8 items-center rounded-full border border-[#DCE6F2] bg-white px-3 text-xs font-semibold text-mf-patrimonio hover:underline focus-visible:outline-2 focus-visible:outline-mf-outside dark:border-gray-700 dark:bg-white/5 dark:text-mf-tranquilidade"
            >
              {p.ticker || p.nome}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
