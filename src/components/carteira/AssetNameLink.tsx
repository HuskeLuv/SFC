import React from 'react';
import Link from 'next/link';

interface AssetNameLinkProps {
  portfolioId: string;
  ticker: string;
  nome?: string;
  /** Quando true, exibe nome como principal e ticker como secundário (ex: FIM/FIA) */
  nomeComoPrincipal?: boolean;
  className?: string;
}

/**
 * Componente que exibe ticker/nome do ativo como link para a página de detalhes.
 * Usado em FiiTable, AcoesTable e outras tabelas da carteira.
 */
const AssetNameLink: React.FC<AssetNameLinkProps> = ({
  portfolioId,
  ticker,
  nome,
  nomeComoPrincipal = false,
  className = '',
}) => {
  const principal = nomeComoPrincipal ? nome || ticker : ticker;
  const secundario = nomeComoPrincipal ? ticker : nome;
  return (
    <Link
      href={`/ativos/${portfolioId}`}
      className={`hover:underline hover:text-brand-600 dark:hover:text-brand-400 ${className}`}
    >
      <div>
        <div>{principal}</div>
        {secundario && secundario !== principal && <div className="text-xs">{secundario}</div>}
      </div>
    </Link>
  );
};

export default AssetNameLink;
