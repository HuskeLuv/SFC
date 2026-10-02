/**
 * Tela "Área em beta fechado" (decisão 10): flag ligada e usuário fora do beta. Só informativa,
 * sem "Quero participar". Renderizada pelo layout SERVER da área (sem hooks); a API continua 404.
 */
import Link from 'next/link';
import RodapeLegal from '@/components/analiseAtivos/shell/RodapeLegal';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

export default function TelaForaDoBeta() {
  const t = TEXTOS_TELA.foraDoBeta;
  const itens = [
    { texto: t.itens.carteira, href: '/carteira', rotulo: t.links.carteira },
    { texto: t.itens.agenda, href: '/calendario', rotulo: t.links.agenda },
    { texto: t.itens.educacao, href: '/educacao', rotulo: t.links.educacao },
  ];
  return (
    <div className="flex flex-col gap-4" data-analise-ativos="fora-do-beta">
      <section className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <span className="self-start rounded-full bg-[#314666] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
          {t.pilula}
        </span>
        <h1 className="text-xl font-semibold text-gray-800 md:text-2xl dark:text-white/90">
          {t.titulo}
        </h1>
        <p className="text-sm text-gray-600 md:text-base dark:text-gray-300">{t.texto}</p>
        <ul className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          {itens.map((i) => (
            <li key={i.href}>
              {i.texto}{' '}
              <Link
                href={i.href}
                className={`inline-flex min-h-11 items-center ${COR_LINK.classes}`}
              >
                {i.rotulo}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/carteira"
          className="inline-flex min-h-12 items-center justify-center self-start rounded-lg bg-[#314666] px-5 text-sm font-medium text-white hover:bg-[#396CAA]"
        >
          {t.botao}
        </Link>
      </section>
      <RodapeLegal />
    </div>
  );
}
