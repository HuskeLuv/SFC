'use client';

/**
 * CardCriterios (v2.4, fatia C2) — card "Critérios de fundamentos" da página do ativo (§3.2 bloco
 * 2), logo abaixo do cabeçalho. Lê AtivoTopoResposta.criterios: as 3 janelas vêm na MESMA resposta,
 * então trocar a pílula (3 | 5 | 10 anos, padrão 5) não refaz requisição.
 *
 *  - número "n de k" NEUTRO (contagem factual, não é nota): k = critérios que se aplicam (6;
 *    instituições financeiras 3, D4) e a frase 'n critérios não se aplicam a este ativo';
 *  - nota do perfil (FoF/indefinido avaliados pela regra de composição, rec. 3);
 *  - itens (ItemCriterio) em 3/2/1 colunas pela largura do card (container query);
 *  - FII na janela de 10 anos: nota de que os informes da CVM começam em 2016 (rec. 5);
 *  - rodapé com a fonte (DFP/ITR ou informes de FIIs, CVM), 'os mesmos critérios dos filtros do
 *    Quadro' e o aviso de dado histórico; menu ⋯ (reportar dado no bloco 'criterios_fundamentos')
 *    e selo de frescor do bloco, como os demais cards.
 * Sem avaliação (job ainda não rodou): o card fica com o título e o texto de espera.
 */
import { useState } from 'react';
import ItemCriterio from '@/components/analiseAtivos/ativo/criterios/ItemCriterio';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import PilulasJanela from '@/components/analiseAtivos/comum/PilulasJanela';
import { MenuBlocoPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_CRITERIOS, formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import {
  JANELA_PADRAO,
  type CardCriteriosProps,
  type ChaveJanela,
  type CriteriosAtivo,
  type Janela,
} from '@/types/analiseAtivosCriterios';

export type { CardCriteriosProps };

const TC = TEXTOS_CRITERIOS;
const TA = TEXTOS_ATIVO.criterios;

const CARD =
  '@container min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const ROTULO =
  'm-0 text-[11.5px] font-semibold tracking-[0.08em] text-gray-500 uppercase dark:text-gray-400';

/** 'FoF: …' / '3 critérios não se aplicam a este ativo' — frases curtas sob o número. */
export function notasDoPerfil(criterios: CriteriosAtivo, janela: Janela): string[] {
  const j = criterios.janelas[String(janela) as ChaveJanela];
  const notas: string[] = [TC.subtitulo];
  if (criterios.observacaoPerfil) notas.push(criterios.observacaoPerfil);
  const fora = j ? j.itens.length - j.aplicaveis : 0;
  if (fora === 1) notas.push(TC.perfil.naoSeAplicamUm);
  else if (fora > 1) notas.push(formatarTexto(TC.perfil.naoSeAplicamVarios, { n: fora }));
  return notas;
}

export default function CardCriterios({
  ticker,
  classe,
  criterios,
  janelaInicial = JANELA_PADRAO,
  className = '',
}: CardCriteriosProps) {
  const [janela, setJanela] = useState<Janela>(janelaInicial);
  const idTitulo = `criterios-${ticker}`;
  const j = criterios?.janelas[String(janela) as ChaveJanela] ?? null;

  const cabecalho = (
    <div className="flex items-start justify-between gap-2">
      <h2 id={idTitulo} className={ROTULO}>
        {TC.titulo}
      </h2>
      <MenuBlocoPagina bloco="criterios_fundamentos" className="-my-2" />
    </div>
  );

  if (!criterios || !j) {
    return (
      <section
        aria-labelledby={idTitulo}
        data-card-criterios={ticker}
        className={`${CARD} flex flex-col gap-3 ${className}`}
      >
        {cabecalho}
        <p className="m-0 text-sm text-gray-600 dark:text-gray-300">{TA.semAvaliacao}</p>
      </section>
    );
  }

  const fonte = classe === 'fii' ? TC.fonte.fii : TC.fonte.acao;
  const notas = notasDoPerfil(criterios, janela);
  return (
    <section
      aria-labelledby={idTitulo}
      data-card-criterios={ticker}
      data-janela={janela}
      className={`${CARD} flex flex-col gap-4 ${className}`}
    >
      <div className="grid min-w-0 gap-4 @3xl:grid-cols-[13.5rem_minmax(0,1fr)] @3xl:gap-x-6">
        <div className="flex min-w-0 flex-col items-start gap-2 @3xl:border-r @3xl:border-gray-200 @3xl:pr-6 @3xl:dark:border-gray-800">
          {cabecalho}
          <p
            aria-live="polite"
            data-contagem-criterios=""
            className="m-0 font-bold leading-none text-gray-800 tabular-nums dark:text-white/90"
          >
            <span className="text-[42px]">{j.atendidos}</span>{' '}
            <span className="text-[15px] font-medium text-gray-500 dark:text-gray-400">
              {formatarTexto(TA.deTotal, { total: j.aplicaveis })}
            </span>
            <span className="sr-only"> {formatarTexto(TA.contagemSr, { anos: janela })}</span>
          </p>
          <PilulasJanela valor={janela} onTrocar={setJanela} className="-ml-0.5" />
          <p className="m-0 max-w-[26ch] text-xs leading-snug text-gray-500 dark:text-gray-400">
            {notas.join(' · ')}
          </p>
        </div>
        <ul
          aria-label={formatarTexto(TA.listaAria, {
            anos: janela,
            anoInicio: j.anoInicio,
            anoFim: j.anoFim,
          })}
          className="m-0 grid min-w-0 list-none grid-cols-1 gap-3 p-0 @xl:grid-cols-2 @5xl:grid-cols-3"
        >
          {j.itens.map((item) => (
            <ItemCriterio key={item.id} item={item} janela={janela} />
          ))}
        </ul>
      </div>
      {classe === 'fii' && janela === 10 ? (
        <p
          data-nota-janela-10=""
          className="m-0 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-snug text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"
        >
          {TC.fonte.janela10Fii}
        </p>
      ) : null}
      <p className="m-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {fonte} {TA.mesmosCriterios} {TC.fonte.aviso}
      </p>
      <RodapeFrescorBloco bloco="criterios_fundamentos" />
    </section>
  );
}
