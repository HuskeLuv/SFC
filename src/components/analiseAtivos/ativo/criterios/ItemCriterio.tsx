'use client';

/**
 * ItemCriterio (v2.4, fatia C2) — um critério de fundamentos no card da página do ativo:
 * MarcaCriterio (✓ / — / n/a em tinta NEUTRA) + rótulo + MiniBarrasAnuais da janela (uma cor só;
 * hover e foco mostram 'ano: valor') + fato + definição.
 *
 * Estados (EstadoCriterio):
 *  - atende / nao_atende: fato do motor ('cresceu em 5 de 5 anos · …') e barras da janela;
 *  - sem_dado: conta como NÃO ATENDE → 'não atende · sem dado nas demonstrações …' (D3 traz o motivo
 *    no próprio fato: vacância CVM, inadimplência/LTV só em PDF; janela 10 de FII);
 *  - nao_se_aplica: borda tracejada, sem barras (financeiras, D4: 'não se aplica a instituições…').
 * Nunca verde/vermelho na marca nem no texto (só o valor negativo das barras sai em vermelho).
 *
 * v2.5: resultado com `obs` — o lucro descontado que a fonte não entrega (o critério usa o lucro
 * líquido dos controladores) ou dados incompletos — ganha ⓘ junto do rótulo (tooltip) e a frase
 * de textosCriterios.obs no fim da definição (visível também no toque).
 */
import MarcaCriterio from '@/components/analiseAtivos/comum/MarcaCriterio';
import MiniBarrasAnuais from '@/components/analiseAtivos/comum/MiniBarrasAnuais';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_CRITERIOS, formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import type { ItemCriterioApi, ItemCriterioProps } from '@/types/analiseAtivosCriterios';

export type { ItemCriterioProps };

/** Fato exibido: sem dado sempre diz que não atende. */
export function textoFatoCriterio(item: Pick<ItemCriterioApi, 'estado' | 'fato'>): string {
  if (item.estado === 'sem_dado') {
    return formatarTexto(TEXTOS_ATIVO.criterios.fatoSemDado, { fato: item.fato });
  }
  return item.fato;
}

export default function ItemCriterio({ item, janela, className = '' }: ItemCriterioProps) {
  const naoSeAplica = item.estado === 'nao_se_aplica';
  const serie = !naoSeAplica && item.serie && item.serie.length > 0 ? item.serie : null;
  const obs = (item.obs ?? []).map((o) => TEXTOS_CRITERIOS.obs[o]);
  return (
    <li
      data-criterio={item.id}
      data-estado-criterio={item.estado}
      data-janela={janela}
      className={`flex min-w-0 flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 ${
        naoSeAplica
          ? 'border-dashed border-gray-300 dark:border-gray-700'
          : 'border-gray-200 dark:border-gray-800'
      } ${className}`}
    >
      <h3 className="m-0 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
        <MarcaCriterio estado={item.estado} />
        <span className="min-w-0">{item.rotulo}</span>
        {obs.length > 0 ? (
          <span
            aria-hidden="true"
            data-obs-ativo=""
            title={obs.join(' ')}
            className="cursor-help text-xs font-normal text-gray-500 dark:text-gray-400"
          >
            ⓘ
          </span>
        ) : null}
      </h3>
      {serie ? (
        <MiniBarrasAnuais
          serie={serie}
          formato={item.formato}
          unidade={item.unidade}
          rotulo={item.rotulo}
        />
      ) : null}
      <p className="m-0 text-[13px] leading-snug text-gray-700 tabular-nums dark:text-gray-300">
        {textoFatoCriterio(item)}
      </p>
      <p className="m-0 text-xs leading-snug text-gray-500 dark:text-gray-400">
        {item.definicao}
        {obs.map((t) => (
          <span key={t} data-obs-criterio="" className="block pt-1">
            {t}
          </span>
        ))}
      </p>
    </li>
  );
}
