import Link from 'next/link';

/**
 * Rodapé das páginas legais e auth. Cruza os links de Política, Termos e
 * Subprocessadores + expõe o contato do DPO/Encarregado (Art. 41 LGPD).
 *
 * TODO (LGPD #7): substituir o email do DPO pelo definitivo depois que a
 * empresa indicar formalmente o Encarregado.
 */
export default function LegalFooter() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Link
            href="/politica-de-privacidade"
            className="hover:text-brand-500 dark:hover:text-brand-400"
          >
            Política de Privacidade
          </Link>
          <Link href="/termos-de-uso" className="hover:text-brand-500 dark:hover:text-brand-400">
            Termos de Uso
          </Link>
          <Link href="/subprocessadores" className="hover:text-brand-500 dark:hover:text-brand-400">
            Subprocessadores
          </Link>
        </div>
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800">
          <p>
            <strong>Encarregado de Proteção de Dados (DPO):</strong>{' '}
            <a
              href="mailto:dpo@appmyfinance.com.br"
              className="text-brand-500 hover:underline dark:text-brand-400"
            >
              dpo@appmyfinance.com.br
            </a>
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            © {new Date().getFullYear()} MyFinance. Em conformidade com a Lei nº 13.709/2018 (LGPD).
          </p>
        </div>
      </div>
    </footer>
  );
}
