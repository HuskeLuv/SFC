'use client';

/**
 * Resumo numérico (decisão 9): caixa neutra, SEM placar — Índice MF na ordem dos slots com '*' no
 * incompleto, critérios atendidos, conferências e a frase de responsabilidade. Sem contagem de ★,
 * sem "X tem o maior", sem botão de compra, sem "Salvar comparação" e sem PDF.
 */
import { CARD_ANALISE } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { textosResumo } from '@/services/analiseAtivos/regras/comparador/resumo';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type { ResumoComparador } from '@/types/analiseAtivosBlocoD';

export default function ResumoNumerico({ resumo }: { resumo: ResumoComparador }) {
  const t = textosResumo(resumo);
  const itens = [t.indice, t.criterios, t.emConferencia].filter((x): x is string => !!x);
  return (
    <section aria-labelledby="comparador-resumo" className={`${CARD_ANALISE} flex flex-col gap-2`}>
      <h2
        id="comparador-resumo"
        className="text-base font-semibold text-gray-800 md:text-[17px] dark:text-white/90"
      >
        {TEXTOS_COMPARADOR.resumo.titulo}
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
        {itens.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {t.legendaIncompleto ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t.legendaIncompleto}</p>
      ) : null}
      <p className="text-xs text-gray-500 dark:text-gray-400">{t.responsabilidade}</p>
    </section>
  );
}
