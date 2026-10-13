'use client';

/**
 * Barra "Filtros de fundamentos" do Quadro (v2.4, fatia B): janela 3 | 5 | 10 anos (PilulasJanela),
 * os chips dos critérios da classe (QuadroResposta.definicoes; combinados com E), "Na minha
 * carteira", Setor/Segmento e "Limpar filtros".
 * - Em FII o chip é o PAR tijolo/papel ('Obrigações/PL ≤ 20% / LTV ≤ 60%'); o par
 *   Vacância/Inadimplência fica DESABILITADO (aria-disabled, borda tracejada e selo 'sem dado'),
 *   com o motivo no tooltip e no texto anunciado (D3).
 * - Chip ligado: fundo #EDF2F8, borda #396CAA, texto #314666 + caixinha com ✓ (nunca verde); no
 *   escuro patrimonio a 20%. aria-pressed. Pílula visível de 36 px num alvo de 44 px (min-h-11).
 * - Celular: rótulo + janela numa linha; chips num trilho com rolagem lateral só dentro dele (sem
 *   rolagem horizontal da página); "Limpar filtros" embaixo.
 * Textos: textosQuadro + textosCriterios. Props FINAIS em src/types/analiseAtivosCriterios.ts.
 */
import { useId } from 'react';
import PilulasJanela from '@/components/analiseAtivos/comum/PilulasJanela';
import FiltroSetor, {
  BOTAO_CHIP,
  classeChipVisual,
} from '@/components/analiseAtivos/quadro/FiltrosQuadro';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_QUADRO, formatarTexto } from '@/services/analiseAtivos/textosQuadro';
import type {
  BarraFiltrosCriteriosProps,
  DefCriterioChip,
  IdCriterio,
} from '@/types/analiseAtivosCriterios';

export type { BarraFiltrosCriteriosProps };

const T = TEXTOS_QUADRO.barra;
const LINK =
  'inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-medium text-[#396CAA] outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:text-[#6E9DC4] dark:focus-visible:ring-[#6E9DC4]';

/** Critérios de papel inativos (D3): o par habilitado avisa que papel fica de fora. */
const PAPEL_INATIVOS: ReadonlySet<IdCriterio> = new Set(
  CRITERIA_PARAMS_V1.perfis.fii_papel.filter((c) => c.ativo === false).map((c) => c.id),
);

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
  else if (d.equivalente && PAPEL_INATIVOS.has(d.equivalente.id)) {
    partes.push(TEXTOS_CRITERIOS.chips.tooltipParAlavancagem);
  }
  return partes.join(' · ');
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
}: {
  d: DefCriterioChip;
  ligado: boolean;
  onAlternar: (id: IdCriterio) => void;
}) {
  const idDescricao = useId();
  const descricao = descricaoChip(d);
  const rotulo = (
    <>
      {d.rotulo}
      {d.equivalente ? (
        <small className="text-[12px] font-normal text-gray-500 dark:text-gray-400">
          {TEXTOS_CRITERIOS.chips.parSeparador.trimStart()}
          {d.equivalente.rotulo}
        </small>
      ) : null}
    </>
  );
  if (!d.habilitado) {
    return (
      <button
        type="button"
        aria-disabled="true"
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
      aria-describedby={idDescricao}
      title={descricao}
      data-criterio-chip={d.id}
      onClick={() => onAlternar(d.id)}
      className={BOTAO_CHIP}
    >
      <span className={classeChipVisual(ligado ? 'ligado' : 'desligado')}>
        <CaixaMarca ligado={ligado} />
        {rotulo}
      </span>
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
}: BarraFiltrosCriteriosProps) {
  const celular = useIsBelowLg();
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
        />
      ))}
      <button
        type="button"
        aria-pressed={naCarteira}
        data-filtro="naCarteira"
        onClick={onAlternarNaCarteira}
        className={BOTAO_CHIP}
      >
        <span className={classeChipVisual(naCarteira ? 'ligado' : 'desligado')}>
          <CaixaMarca ligado={naCarteira} />
          {T.naCarteira}
        </span>
      </button>
      <FiltroSetor
        classe={classe}
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

  if (celular) {
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
          data-mf-scroll-x=""
          data-quadro-chips=""
          className={`${TABLE_MOBILE_STYLES.chipRail} flex-none items-center`}
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
