import React from 'react';

interface LegalArticleProps {
  title: string;
  updatedAt: string;
  version?: string;
  children: React.ReactNode;
}

/**
 * Wrapper de tipografia para Política, Termos e Subprocessadores. Aplica
 * estilos manuais (Tailwind v4 sem plugin typography) via descendant
 * selectors arbitrary — h1/h2, parágrafos, listas, links ficam coerentes
 * sem precisar adicionar @tailwindcss/typography como dependência.
 */
export default function LegalArticle({ title, updatedAt, version, children }: LegalArticleProps) {
  return (
    <article
      className={[
        'text-gray-700 dark:text-gray-300',
        // Headings
        '[&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-gray-900 dark:[&_h1]:text-white',
        '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-white',
        '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 dark:[&_h3]:text-white',
        // Parágrafos e listas
        '[&_p]:my-3 [&_p]:leading-relaxed',
        '[&_ul]:my-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1',
        '[&_li]:leading-relaxed',
        '[&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-white',
        // Links
        '[&_a]:text-brand-500 [&_a]:underline-offset-2 hover:[&_a]:underline dark:[&_a]:text-brand-400',
      ].join(' ')}
    >
      <h1>{title}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Última atualização: {updatedAt}
        {version ? ` · Versão ${version}` : ''}
      </p>
      {children}
    </article>
  );
}
