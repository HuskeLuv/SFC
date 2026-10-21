'use client';

/**
 * Barra "Filtros de fundamentos" do Quadro (v2.4, fatia B): janela 3 | 5 | 10 anos (PilulasJanela),
 * os chips dos critérios da classe (QuadroResposta.definicoes; combinados com E), "Na minha
 * carteira", Setor/Segmento e "Limpar filtros".
 * - Em FII o chip é o PAR tijolo/papel ('Alavancagem ≤ 20% do PL / LTV ≤ 60%'), com o rótulo de
 *   papel em cinza. v2.5: todos os pares ficam ATIVOS (o estado vem das definições da resposta);
 *   fundo sem o dado da série conta como não atende (tooltip). Um critério desligado por params
 *   (v1, D3) continua DESABILITADO (aria-disabled, borda tracejada e selo 'sem dado'), com o motivo
 *   no tooltip e no texto anunciado.
 * - Chip ligado: fundo #EDF2F8, borda #396CAA, texto #314666 + caixinha com ✓ (nunca verde); no
 *   escuro patrimonio a 20%. aria-pressed. Pílula visível de 36 px num alvo de 44 px (min-h-11).
 * - Celular: rótulo + janela numa linha; chips num trilho com rolagem lateral só dentro dele (sem
 *   rolagem horizontal da página); "Limpar filtros" embaixo.
 * Textos: textosQuadro + textosCriterios. Props FINAIS em src/types/analiseAtivosCriterios.ts.
 *
 * Visual v2 (fundamentei-regras F4, item C3; só com ANALISE_ATIVOS_VISUAL_V2_HABILITADO): faixa
 * única que quebra linha (rótulo + janela, chips, Limpar e, à direita, o slot `direita` com a
 * meta 'n de N · ordem', A–Z, Resumo | Detalhado, Filtros salvos e Comparar). Chips em pílula de
 * 99 px com o ✓ em SVG sempre visível (sem caixinha); ligado no acento sem borda. Alvo de 44 px em
 * todos os tamanhos (min-h-11). No celular os chips quebram linha. Sem a chave, a barra de hoje.
 */
import { useId, type ReactNode } from 'react';
import { ANEL_FOCO_GRUPO } from '@/components/analiseAtivos/comum/estiloPilulas';
import { useVisualV2 } from '@/components/analiseAtivos/shell/VisualV2';
import { VISUAL_V2 } from '@/constants/analiseAtivosVisual';
import PilulasJanela from '@/components/analiseAtivos/comum/PilulasJanela';
import FiltroSetor, {
  BOTAO_CHIP,
  classeChipVisual,
} from '@/components/analiseAtivos/quadro/FiltrosQuadro';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_QUADRO, formatarTexto } from '@/services/analiseAtivos/textosQuadro';
import type {
  BarraFiltrosCriteriosProps,
  DefCriterioChip,
  IdCriterio,
} from '@/types/analiseAtivosCriterios';

export type { BarraFiltrosCriteriosProps };

/**
 * Stocks e REITs (fatia C): `quebrarLinha` (ligado com a chave EUA) troca, no celular, o trilho
 * rolável dos chips por uma faixa que QUEBRA LINHA — os 6 critérios e os filtros ficam à vista em
 * 390 px, sem rolagem horizontal escondida. Sem a chave, o trilho de sempre.
 */
export interface BarraFiltrosCriteriosEuaProps extends BarraFiltrosCriteriosProps {
  quebrarLinha?: boolean;
  /** visual v2 (computador): conteúdo à direita da faixa (meta, ordem, modo, salvos, Comparar) */
  direita?: ReactNode;
}

/** Pílula visível do chip no visual v2 (99 px, 32 px de altura, ✓ sempre visível). */
function classeChipV2(ligado: boolean): string {
  return `inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] ${ANEL_FOCO_GRUPO} ${
    ligado ? VISUAL_V2.chipLigado : VISUAL_V2.chipDesligado
  }`;
}

/** ✓ do chip no visual v2 (SVG, sempre visível; só decoração: o estado é o aria-pressed). */
function IconeMarca() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-chip-marca=""
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const T = TEXTOS_QUADRO.barra;
const LINK =
  'inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-medium text-[#396CAA] outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:text-[#6E9DC4] dark:focus-visible:ring-[#6E9DC4]';

/** Texto longo do chip (tooltip e aria-describedby). */
export function descricaoChip(d: DefCriterioChip): string {
  const partes: string[] = [d.definicao];
  if (d.equivalente) {
    partes.push(
      formatarTexto(TEXTOS_QUADRO.explicacao.papel, {
        rotulo: d.equivalente.rotulo,
        definicao: d.equivalente.definicao,
      }),
    );
  }
  if (!d.habilitado && d.motivoDesabilitado) partes.push(d.motivoDesabilitado);
  else if (d.equivalente) partes.push(TEXTOS_CRITERIOS.chips.semDadoFii);
  return partes.join(' · ');
}

/** Nome acessível do chip de par: 'Vacância ≤ 10% (tijolo) ou Inadimplência ≤ 3% (papel)'. */
function ariaChip(d: DefCriterioChip): string | undefined {
  if (!d.equivalente) return undefined;
  return formatarTexto(TEXTOS_CRITERIOS.chips.parAria, {
    tijolo: d.rotulo,
    papel: d.equivalente.rotulo,
  });
}

function CaixaMarca({ ligado }: { ligado: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-current text-[10px] leading-none font-bold"
    >
      {ligado ? '✓' : ''}
    </span>
  );
}

function ChipCriterio({
  d,
  ligado,
  onAlternar,
  v2 = false,
}: {
  d: DefCriterioChip;
  ligado: boolean;
  onAlternar: (id: IdCriterio) => void;
  v2?: boolean;
}) {
  const idDescricao = useId();
  const descricao = descricaoChip(d);
  const rotulo = (
    <>
      {d.rotulo}
      {d.equivalente ? (
        <small
          data-chip-papel={d.equivalente.id}
          className="text-[12px] font-normal text-gray-500 dark:text-gray-400"
        >
          {TEXTOS_CRITERIOS.chips.parSeparador.trimStart()}
          {formatarTexto(TEXTOS_CRITERIOS.chips.parPapel, { rotulo: d.equivalente.rotulo })}
        </small>
      ) : null}
    </>
  );
  if (!d.habilitado) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-label={ariaChip(d)}
        aria-describedby={idDescricao}
        title={descricao}
        data-criterio-chip={d.id}
        data-chip-desabilitado=""
        onClick={(e) => e.preventDefault()}
        className={`${BOTAO_CHIP} cursor-not-allowed`}
      >
        <span className={classeChipVisual('semDado')}>
          {rotulo}
          <em className="rounded border border-gray-300 px-1 text-[11px] not-italic dark:border-gray-600">
            {TEXTOS_CRITERIOS.chips.seloSemDado}
          </em>
        </span>
        <span id={idDescricao} className="sr-only">
          {T.desabilitadoSr}. {descricao}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={ligado}
      aria-label={ariaChip(d)}
      aria-describedby={idDescricao}
      title={descricao}
      data-criterio-chip={d.id}
      onClick={() => onAlternar(d.id)}
      className={BOTAO_CHIP}
    >
      {v2 ? (
        <span className={classeChipV2(ligado)}>
          <IconeMarca />
          {rotulo}
        </span>
      ) : (
        <span className={classeChipVisual(ligado ? 'ligado' : 'desligado')}>
          <CaixaMarca ligado={ligado} />
          {rotulo}
        </span>
      )}
      <span id={idDescricao} className="sr-only">
        {descricao}
      </span>
    </button>
  );
}

export default function BarraFiltrosCriterios({
  classe,
  janela,
  definicoes,
  selecionados,
  naCarteira,
  setor,
  setores,
  onTrocarJanela,
  onAlternarCriterio,
  onAlternarNaCarteira,
  onTrocarSetor,
  onLimpar,
  className = '',
  quebrarLinha = false,
  direita,
}: BarraFiltrosCriteriosEuaProps) {
  const celular = useIsBelowLg();
  const v2 = useVisualV2();
  const idRotulo = useId();
  const temFiltro = selecionados.length > 0 || naCarteira || !!setor;

  const chips = (
    <>
      {definicoes.map((d) => (
        <ChipCriterio
          key={d.id}
          d={d}
          ligado={selecionados.includes(d.id)}
          onAlternar={onAlternarCriterio}
          v2={v2}
        />
      ))}
      <button
        type="button"
        aria-pressed={naCarteira}
        data-filtro="naCarteira"
        onClick={onAlternarNaCarteira}
        className={BOTAO_CHIP}
      >
        {v2 ? (
          <span className={classeChipV2(naCarteira)}>
            <IconeMarca />
            {T.naCarteira}
          </span>
        ) : (
          <span className={classeChipVisual(naCarteira ? 'ligado' : 'desligado')}>
            <CaixaMarca ligado={naCarteira} />
            {T.naCarteira}
          </span>
        )}
      </button>
      <FiltroSetor
        // stock filtra por setor (divisão SIC) como ação: o rótulo do FiltroSetor é 'Setor'
        classe={classe === 'stock' ? 'acao' : classe}
        setor={setor}
        setores={setores}
        onSetor={onTrocarSetor}
        celular={celular}
      />
    </>
  );

  const limpar = temFiltro ? (
    <button type="button" onClick={onLimpar} className={LINK} data-limpar-filtros="">
      {T.limpar}
    </button>
  ) : null;

  const rotulo = (
    <span id={idRotulo} className="text-sm font-semibold text-gray-800 dark:text-white/90">
      {T.rotulo}
    </span>
  );

  if (v2 && !celular) {
    return (
      <div
        role="group"
        aria-labelledby={idRotulo}
        data-barra-filtros={classe}
        data-visual-v2=""
        className={`flex min-w-0 flex-wrap items-center gap-x-2 ${className}`}
      >
        <span className="mr-1 inline-flex items-center gap-2">
          {rotulo}
          <PilulasJanela valor={janela} onTrocar={onTrocarJanela} />
        </span>
        <div
          role="group"
          aria-label={T.chipsRotulo}
          data-quadro-chips=""
          className="flex min-w-0 flex-wrap items-center gap-x-2"
        >
          {chips}
        </div>
        {limpar}
        {direita ? (
          <>
            <span className="flex-1" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-x-3" data-barra-direita="">
              {direita}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (celular) {
    const quebra = quebrarLinha || v2;
    return (
      <div
        role="group"
        aria-labelledby={idRotulo}
        data-barra-filtros={classe}
        className={`flex min-w-0 flex-col gap-1 [&>*]:shrink-0 ${className}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          {rotulo}
          <PilulasJanela valor={janela} onTrocar={onTrocarJanela} />
        </div>
        <div
          role="group"
          aria-label={T.chipsRotulo}
          data-mf-scroll-x={quebra ? undefined : ''}
          data-quadro-chips=""
          data-chips-quebram={quebra ? '' : undefined}
          className={
            quebra
              ? 'flex min-w-0 flex-wrap items-center gap-x-2'
              : `${TABLE_MOBILE_STYLES.chipRail} flex-none items-center`
          }
        >
          {chips}
        </div>
        {limpar ? <div className="flex justify-end">{limpar}</div> : null}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={idRotulo}
      data-barra-filtros={classe}
      className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}
    >
      {rotulo}
      <PilulasJanela valor={janela} onTrocar={onTrocarJanela} className="mr-1" />
      <div
        role="group"
        aria-label={T.chipsRotulo}
        data-quadro-chips=""
        className="flex min-w-0 flex-wrap items-center gap-x-2"
      >
        {chips}
      </div>
      {limpar}
    </div>
  );
}
