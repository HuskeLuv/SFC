'use client';

/**
 * CardCriterios (v2.4, fatia C2) — card "Critérios de fundamentos" da página do ativo (§3.2 bloco
 * 2), logo abaixo do cabeçalho. Lê AtivoTopoResposta.criterios: as 3 janelas vêm na MESMA resposta,
 * então trocar a pílula (3 | 5 | 10 anos, padrão 5) não refaz requisição.
 *
 *  - número "n de k" na cor da marca (patrimonio/tranquilidade), contagem factual (não é nota):
 *    k = critérios que se aplicam (6; v2.5: financeiras também 6 — só com o D4 religado por params
 *    sai a frase 'n critérios não se aplicam a este ativo');
 *  - nota do perfil (FoF/indefinido avaliados pela regra de composição, rec. 3);
 *  - itens (ItemCriterio) em 3/2/1 colunas pela largura do card (container query);
 *  - v2.5: sem a nota dos informes de FII de 2016 (janela 10 = só 'sem dado nas demonstrações');
 *  - rodapé com a fonte — v2.5: montada pelas origens no servidor (criteriosComFonte:
 *    'Fonte: ‹provedor› · DFP/ITR (CVM).'); sem origens, DFP/ITR ou informes de FIIs (CVM) —,
 *    'os mesmos critérios dos filtros do Quadro' e o aviso de dado histórico; selo 'dados
 *    incompletos' (§6) quando a fonte marcou algum ponto da avaliação; menu ⋯ (reportar dado no
 *    bloco 'criterios_fundamentos') e selo de frescor do bloco, como os demais cards.
 * Sem avaliação (job ainda não rodou): o card fica com o título e o texto de espera.
 * Visual v2 (fundamentei-regras F4, C2): cabeçalho `.hd` (título, hint e ⋯) acima do corpo, como
 * os blocos do CartaoAnalise; sem a chave, o card de hoje.
 */
import { useState } from 'react';
import ItemCriterio from '@/components/analiseAtivos/ativo/criterios/ItemCriterio';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import PilulasJanela from '@/components/analiseAtivos/comum/PilulasJanela';
import { MenuBlocoPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import {
  TEXTOS_CRITERIOS,
  formatarTexto,
  separarRegraCagr,
  textoFonteClasse,
} from '@/services/analiseAtivos/textosCriterios';
import {
  JANELA_PADRAO,
  type CardCriteriosProps,
  type ChaveJanela,
  type CriteriosAtivo,
  type Janela,
} from '@/types/analiseAtivosCriterios';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_VISUAL } from '@/services/analiseAtivos/textosVisual';
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import {
  CabecalhoCartaoV2,
  CARD_V2,
  CORPO_V2,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';

export type { CardCriteriosProps };

/**
 * Stocks e REITs (fatia C): `linkDocumentos` (AtivoTopoResposta.eua.linkDocumentos) acrescenta o
 * link "Ver os 10-K na SEC" no rodapé do card (abre em outra aba).
 */
export interface CardCriteriosEuaProps extends CardCriteriosProps {
  linkDocumentos?: string;
}

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

/**
 * Frase de fonte do rodapé: com as origens da avaliação (v2.5), a montada no servidor; sem elas, a
 * fixa da classe (v2.4).
 */
export function fonteDoCard(criterios: CriteriosAtivo, classe: ClasseQuadro): string {
  if (criterios.fontes && criterios.fonte) return criterios.fonte;
  if (classe === 'acao' || classe === 'fii') return classe === 'fii' ? TC.fonte.fii : TC.fonte.acao;
  // EUA (fatia 0): 'Fonte: relatório anual 10-K (SEC).'
  return textoFonteClasse(classe);
}

export default function CardCriterios({
  ticker,
  classe,
  criterios,
  janelaInicial = JANELA_PADRAO,
  aoTrocarJanela,
  className = '',
  linkDocumentos,
}: CardCriteriosEuaProps) {
  const [janela, setJanela] = useState<Janela>(janelaInicial);
  const idTitulo = `criterios-${ticker}`;
  const j = criterios?.janelas[String(janela) as ChaveJanela] ?? null;
  const v2 = useVisualV2();

  const cabecalho = v2 ? null : (
    <div className="flex items-start justify-between gap-2">
      <h2 id={idTitulo} className={ROTULO}>
        {TC.titulo}
      </h2>
      <MenuBlocoPagina bloco="criterios_fundamentos" className="-my-2" />
    </div>
  );
  const cabecalhoV2 = v2 ? (
    <CabecalhoCartaoV2 id={idTitulo} titulo={TC.titulo} hint={TEXTOS_VISUAL.criterios.hint}>
      <MenuBlocoPagina bloco="criterios_fundamentos" className="self-center" />
    </CabecalhoCartaoV2>
  ) : null;

  if (!criterios || !j) {
    return (
      <section
        aria-labelledby={idTitulo}
        data-card-criterios={ticker}
        data-bloco="criterios_fundamentos"
        className={
          v2 ? `${CARD_V2} flex flex-col ${className}` : `${CARD} flex flex-col gap-3 ${className}`
        }
      >
        {v2 ? (
          <>
            {cabecalhoV2}
            <div className={CORPO_V2}>
              <p className="m-0 text-sm text-gray-600 dark:text-gray-300">{TA.semAvaliacao}</p>
            </div>
          </>
        ) : (
          <>
            {cabecalho}
            <p className="m-0 text-sm text-gray-600 dark:text-gray-300">{TA.semAvaliacao}</p>
          </>
        )}
      </section>
    );
  }

  const fonte = fonteDoCard(criterios, classe);
  const incompleto =
    criterios.dadosIncompletos === true ||
    j.itens.some((i) => i.obs?.includes('dados_incompletos'));
  const notas = notasDoPerfil(criterios, janela);
  // a regra do crescimento anual composto vem no fim de cada definição: aparece uma vez só
  const partes = j.itens.map((i) => separarRegraCagr(i.definicao));
  const regraCagr = partes.find((p) => p.regra)?.regra ?? null;
  const corpo = (
    <>
      <div className="grid min-w-0 gap-4 @3xl:grid-cols-[13.5rem_minmax(0,1fr)] @3xl:gap-x-6">
        <div className="flex min-w-0 flex-col items-start gap-2 @3xl:border-r @3xl:border-gray-200 @3xl:pr-6 @3xl:dark:border-gray-800">
          {cabecalho}
          <p
            aria-live="polite"
            data-contagem-criterios=""
            className="m-0 font-bold leading-none text-gray-800 tabular-nums dark:text-white/90"
          >
            <span className="text-[42px] text-[#396CAA] dark:text-[#6E9DC4]">{j.atendidos}</span>{' '}
            <span className="text-[15px] font-medium text-gray-500 dark:text-gray-400">
              {formatarTexto(TA.deTotal, { total: j.aplicaveis })}
            </span>
            <span className="sr-only"> {formatarTexto(TA.contagemSr, { anos: janela })}</span>
          </p>
          <PilulasJanela
            valor={janela}
            onTrocar={(nova) => {
              setJanela(nova);
              aoTrocarJanela?.(nova);
            }}
            className="-ml-0.5"
          />
          {incompleto ? (
            <span
              data-selo-incompleto=""
              title={TC.incompleto.tooltip}
              className="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[11.5px] text-gray-600 dark:border-gray-600 dark:text-gray-300"
            >
              {TC.incompleto.selo}
              <span className="sr-only">: {TC.incompleto.tooltip}</span>
            </span>
          ) : null}
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
          {j.itens.map((item, k) => (
            <ItemCriterio
              key={item.id}
              item={{ ...item, definicao: partes[k].definicao }}
              janela={janela}
            />
          ))}
        </ul>
      </div>
      {regraCagr ? (
        <p
          data-regra-cagr=""
          className="m-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400"
        >
          {regraCagr}.
        </p>
      ) : null}
      <p className="m-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {fonte} {TA.mesmosCriterios} {TC.fonte.aviso}
      </p>
      {linkDocumentos ? (
        <a
          href={linkDocumentos}
          target="_blank"
          rel="noopener noreferrer"
          data-link-sec=""
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-[#396CAA] underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:text-[#6E9DC4] dark:focus-visible:ring-[#6E9DC4]"
        >
          {TEXTOS_EUA.fonte.linkDocumentos} ↗
        </a>
      ) : null}
      <RodapeFrescorBloco bloco="criterios_fundamentos" />
    </>
  );
  return (
    <section
      aria-labelledby={idTitulo}
      data-card-criterios={ticker}
      data-bloco="criterios_fundamentos"
      data-janela={janela}
      className={
        v2
          ? `@container ${CARD_V2} flex flex-col ${className}`
          : `${CARD} flex flex-col gap-4 ${className}`
      }
    >
      {cabecalhoV2}
      {v2 ? <div className={`${CORPO_V2} gap-4`}>{corpo}</div> : corpo}
    </section>
  );
}
