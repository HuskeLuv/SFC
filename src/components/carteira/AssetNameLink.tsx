import React from 'react';
import Link from 'next/link';
import { simplifyAssetName } from '@/utils/assetDisplayName';

interface AssetNameLinkProps {
  portfolioId: string;
  ticker: string;
  nome?: string;
  /** Quando true, o nome (simplificado) é o rótulo em vez do ticker (ex: fundos, RF, reservas) */
  nomeComoPrincipal?: boolean;
  className?: string;
}

/**
 * Exibe o ativo como link para a página de detalhes, de forma SIMPLIFICADA
 * (pedido do Wellington, 16/09/2026): uma linha só, com o identificador curto —
 * o ticker (ações, FIIs, ETFs...) ou o nome sem o sufixo "- R$ valor - data"
 * dos ativos manuais. Nunca quebra linha: nomes longos (fundos CVM) são
 * cortados com reticências, e o nome completo fica no `title` (hover) e na
 * página de detalhes. Antes mostrava ticker + razão social em duas linhas.
 */
const AssetNameLink: React.FC<AssetNameLinkProps> = ({
  portfolioId,
  ticker,
  nome,
  nomeComoPrincipal = false,
  className = '',
}) => {
  const tickerLimpo = (ticker || '').trim();
  const nomeSimples = simplifyAssetName(nome);
  const principal = nomeComoPrincipal
    ? nomeSimples || simplifyAssetName(tickerLimpo) || tickerLimpo
    : tickerLimpo || nomeSimples;

  const completo = [tickerLimpo, (nome || '').trim()]
    .filter((s, i, arr) => s && arr.indexOf(s) === i)
    .join(' — ');
  const title = completo && completo !== principal ? completo : undefined;

  return (
    <Link
      href={`/ativos/${portfolioId}`}
      title={title}
      className={`block max-w-[20rem] truncate hover:underline hover:text-brand-600 dark:hover:text-brand-400 ${className}`}
    >
      {principal}
    </Link>
  );
};

export default AssetNameLink;
