import Link from 'next/link';
import type { TextoConsentimento as Texto } from '@/lib/openFinanceConsentimento';

/**
 * Corpo do termo de autorização Open Finance de UMA versão. Usado na tela de
 * consentimento e em "Ver o que autorizei" (mostra a versão que a pessoa aceitou).
 */
export default function TextoConsentimento({ texto }: { texto: Texto }) {
  return (
    <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
      {texto.consentimento.secoes.map((s) => (
        <section key={s.titulo}>
          <h4 className="mb-1 font-semibold text-gray-800 dark:text-white/90">{s.titulo}</h4>
          {s.texto ? <p>{s.texto}</p> : null}
          {s.itens ? (
            <ul className="list-disc space-y-0.5 pl-5">
              {s.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        <Link href="/politica-de-privacidade" target="_blank" className="text-brand-500 underline">
          Aviso de Privacidade
        </Link>
        {' · '}
        <Link href="/subprocessadores" target="_blank" className="text-brand-500 underline">
          Empresas parceiras
        </Link>
        {' · '}
        <a href="mailto:privacidade@appmyfinance.com.br" className="text-brand-500 underline">
          Encarregado (DPO)
        </a>
        {' · versão '}
        {texto.versao}
        {texto.provisorio ? ' (texto provisório, em revisão jurídica)' : ''}
      </p>
    </div>
  );
}
