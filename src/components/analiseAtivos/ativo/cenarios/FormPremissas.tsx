'use client';

/**
 * Entradas de "Meus cenários" (Bloco D, fatia B): Dados do ativo (cotação só leitura com borda
 * tracejada; LPA/VPA/DPA ou rendimento/VP por cota editáveis) + Suas premissas + o slider
 * "Margem que você exige". v2.4 (fatia C2): as premissas abrem EM BRANCO, com placeholder 'ex.: …'
 * (só formato) e o subtítulo 'em branco até você preencher'; a margem começa em 0%.
 *
 * - Campo: rótulo 14/500 e caixa com a unidade dentro; computador 108×44px, celular 48px e fonte
 *   de 16px (sem zoom no iOS); inputMode decimal, aceita vírgula ou ponto.
 * - Dado editado: ponto azul + "editado" + "do ativo: X" + "voltar ao valor do ativo".
 * - Dado do ativo que mudou depois do salvamento: aviso + "Usar o valor atual".
 * - Dado em conferência: chip (o "Por quê?" da página quando houver); 'ocultar' abre vazio.
 * - Valor fora do limite: borda #D92D20/#F97066 + "Use um valor entre X e Y" (aria-invalid).
 * - Slider 0–50 em passos de 5 (← → andam 5), aria-valuetext, área de 44px.
 */
import { useId } from 'react';
import ChipConferencia from '@/components/analiseAtivos/comum/ChipConferencia';
import { useConferenciaPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import { conferenciaDoCampo } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  CAMPOS_DADO,
  CASAS_CAMPO,
  type CampoDadoCenario,
} from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import { formatarNumeroBR } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  textoDoNumero,
  valoresDoAtivo,
  type CampoForm,
  type EstadoCenario,
} from '@/components/analiseAtivos/ativo/cenarios/useEstadoCenario';
import type { CenariosResposta, ConferenciaCampoCenario } from '@/types/analiseAtivosBlocoD';

const T = TEXTOS_CENARIOS;
const C = T.campos;

export const FOCO_CENARIOS =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const LINK = `inline-flex min-h-11 -my-3 items-center rounded font-medium text-[#396CAA] hover:underline dark:text-[#6E9DC4] ${FOCO_CENARIOS}`;

/** Campo de tela da conferência da página para cada campo do cenário. */
const CAMPO_TELA: Record<ConferenciaCampoCenario['campo'], string> = {
  lpa: 'lpa',
  vpa: 'vpa',
  dpa: 'dpa12m',
  rend12m: 'rendCota12m',
  vpCota: 'vpCota',
  cotacao: 'preco',
};

/** 'AAAA-MM-DD' → 'dd/mm'. */
export function ddmm(data: string | null): string {
  if (!data || !/^\d{4}-\d{2}-\d{2}/.test(data)) return '—';
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

interface DefCampo {
  campo: CampoForm;
  rotulo: string;
  unidade: string;
  /** linha de ajuda sob o campo ('' = nenhuma) */
  origem: string;
  /** exemplo de formato (premissas em branco) */
  placeholder?: string;
}

function defsDados(r: CenariosResposta): DefCampo[] {
  if (r.classe === 'fii') {
    return [
      { campo: 'rend12m', rotulo: C.rend12m.rotulo, unidade: 'R$', origem: C.rend12m.origem },
      { campo: 'vpCota', rotulo: C.vpCota.rotulo, unidade: 'R$', origem: C.vpCota.origemSemData },
    ];
  }
  return [
    { campo: 'lpa', rotulo: C.lpa.rotulo, unidade: 'R$', origem: C.lpa.origem },
    { campo: 'vpa', rotulo: C.vpa.rotulo, unidade: 'R$', origem: C.vpa.origemSemData },
    { campo: 'dpa', rotulo: C.dpa.rotulo, unidade: 'R$', origem: C.dpa.origem },
  ];
}

/**
 * Premissas do usuário (v2.4, spec §4.4): campos EM BRANCO com placeholder só de formato
 * ('ex.: 6'); nenhuma origem 'padrão: …'. O P/L alvo abre com a média 10a do ativo, rotulada como
 * fato ('média 10a do ativo: 36,9 (fato; altere se quiser)').
 */
function defsPremissas(r: CenariosResposta): DefCampo[] {
  if (r.classe === 'fii') {
    return [
      {
        campo: 'yieldPct',
        rotulo: C.yieldFii.rotulo,
        unidade: '%',
        origem: '',
        placeholder: C.yieldFii.placeholder,
      },
      {
        campo: 'pvpAlvo',
        rotulo: C.pvpAlvo.rotulo,
        unidade: '×',
        origem: '',
        placeholder: C.pvpAlvo.placeholder,
      },
      {
        campo: 'rendaMensal',
        rotulo: C.rendaMensal.rotulo,
        unidade: C.rendaMensal.unidade,
        origem: '',
        placeholder: C.rendaMensal.placeholder,
      },
    ];
  }
  const plOrigem =
    r.base.plAlvoPadrao.estado === 'ok'
      ? formatarTexto(C.plAlvo.origem, {
          valor: textoDoNumero('plAlvo', r.base.plAlvoPadrao.valor),
        })
      : C.plAlvo.historicoCurto;
  return [
    {
      campo: 'yieldPct',
      rotulo: C.yieldAcao.rotulo,
      unidade: '%',
      origem: '',
      placeholder: C.yieldAcao.placeholder,
    },
    {
      campo: 'plAlvo',
      rotulo: C.plAlvo.rotulo,
      unidade: '×',
      origem: plOrigem,
      placeholder: C.plAlvo.placeholder,
    },
    {
      campo: 'gPct',
      rotulo: C.gPct.rotulo,
      unidade: C.gPct.unidade,
      origem: '',
      placeholder: C.gPct.placeholder,
    },
    {
      campo: 'kPct',
      rotulo: C.kPct.rotulo,
      unidade: C.kPct.unidade,
      origem: '',
      placeholder: C.kPct.placeholder,
    },
  ];
}

const CAIXA =
  'w-full min-h-12 rounded-[10px] border bg-white pr-9 pl-2.5 text-right text-base text-gray-800 tabular-nums lg:min-h-11 lg:text-[15px] dark:bg-gray-900 dark:text-white/90';

function IconeAviso() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
      <path
        d="M12 3l9.5 17h-19L12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface CampoProps {
  def: DefCampo;
  r: CenariosResposta;
  estado: EstadoCenario;
}

function CampoCenario({ def, r, estado }: CampoProps) {
  const id = useId();
  const ctx = useConferenciaPagina();
  const { campo } = def;
  const ehDado = (CAMPOS_DADO[r.classe] as readonly string[]).includes(campo);
  const texto = estado.snap.textos[campo] ?? '';
  const erro = estado.erro(campo);
  const editado = ehDado && estado.editado(campo as CampoDadoCenario);
  const mudou = ehDado ? estado.mudou(campo as CampoDadoCenario) : null;
  const base = ehDado ? valoresDoAtivo(r)[campo as CampoDadoCenario] : null;
  const conf = ehDado ? r.base.conferencias.find((c) => c.campo === campo) : undefined;
  const confPagina = conf ? conferenciaDoCampo(ctx?.conferencias, CAMPO_TELA[conf.campo]) : null;
  const idHint = `${id}-h`;
  const idErro = `${id}-e`;

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_108px] items-center gap-x-2.5 gap-y-1"
      data-campo-cenario={campo}
      data-invalido={erro ? '' : undefined}
    >
      <label htmlFor={id} className="text-sm font-medium text-gray-800 dark:text-white/90">
        {def.rotulo}
      </label>
      <span className="relative flex items-center">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          placeholder={def.placeholder}
          onChange={(e) => estado.setTexto(campo, e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={
            [def.origem || editado || mudou !== null || conf ? idHint : null, erro ? idErro : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={`${CAIXA} ${FOCO_CENARIOS} placeholder:text-gray-400 dark:placeholder:text-gray-500 ${
            erro
              ? 'border-[#D92D20] shadow-[inset_0_0_0_1px_#D92D20] dark:border-[#F97066] dark:shadow-[inset_0_0_0_1px_#F97066]'
              : 'border-gray-300 dark:border-gray-700'
          }`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 text-[12.5px] text-gray-500 dark:text-gray-400"
        >
          {def.unidade}
        </span>
      </span>
      {erro ? (
        <span
          id={idErro}
          className="col-span-2 flex items-start gap-1.5 text-[12.5px] text-[#D92D20] dark:text-[#F97066]"
        >
          <IconeAviso />
          {erro}
        </span>
      ) : null}
      <span
        id={idHint}
        className="col-span-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-600 dark:text-gray-400"
      >
        {mudou !== null ? (
          <>
            <span className="text-gray-700 dark:text-gray-200">
              {formatarTexto(C.valorMudou, { valor: textoDoNumero(campo, mudou) })}
            </span>
            <button
              type="button"
              className={LINK}
              onClick={() => estado.voltarAoAtivo(campo as CampoDadoCenario)}
            >
              {C.usarValorAtual}
            </button>
          </>
        ) : editado ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200">
              <span
                aria-hidden="true"
                className="h-[7px] w-[7px] rounded-full bg-[#396CAA] dark:bg-[#6E9DC4]"
              />
              {C.editado}
            </span>
            <span>{formatarTexto(C.doAtivo, { valor: textoDoNumero(campo, base) || '—' })}</span>
            <button
              type="button"
              className={LINK}
              onClick={() => estado.voltarAoAtivo(campo as CampoDadoCenario)}
            >
              {C.voltarAoAtivo}
            </button>
          </>
        ) : def.origem ? (
          <span>{def.origem}</span>
        ) : null}
        {conf && !editado ? (
          <ChipConferencia
            conferencia={confPagina}
            campo={CAMPO_TELA[conf.campo]}
            rotuloCampo={def.rotulo}
            bloco="valuation"
            estatico={!confPagina}
          />
        ) : null}
      </span>
    </div>
  );
}

function CampoCotacao({ r }: { r: CenariosResposta }) {
  const id = useId();
  const ctx = useConferenciaPagina();
  const v = r.cotacao.valor.estado === 'ok' ? r.cotacao.valor.valor : null;
  const conf = r.cotacao.conferencia;
  const confPagina = conf ? conferenciaDoCampo(ctx?.conferencias, 'preco') : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_108px] items-center gap-x-2.5 gap-y-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-800 dark:text-white/90">
        {C.cotacao.rotulo}
      </label>
      <span className="relative flex items-center">
        <input
          id={id}
          readOnly
          aria-readonly="true"
          value={v === null ? '—' : formatarNumeroBR(v, CASAS_CAMPO.cotacao)}
          aria-describedby={`${id}-h`}
          className={`${CAIXA} ${FOCO_CENARIOS} border-dashed border-gray-300 bg-transparent text-gray-700 dark:border-gray-700 dark:bg-transparent dark:text-gray-200`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 text-[12.5px] text-gray-600 dark:text-gray-400"
        >
          R$
        </span>
      </span>
      <span
        id={`${id}-h`}
        className="col-span-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400"
      >
        <span>{formatarTexto(C.cotacao.origem, { data: ddmm(r.cotacao.data) })}</span>
        <span className="sr-only">{C.somenteLeitura}</span>
        {conf ? (
          <ChipConferencia
            conferencia={confPagina}
            campo="preco"
            rotuloCampo={C.cotacao.rotulo}
            bloco="valuation"
            estatico={!confPagina}
          />
        ) : null}
      </span>
    </div>
  );
}

function SliderMargem({ estado }: { estado: EstadoCenario }) {
  const id = useId();
  const v = estado.snap.margemPct;
  return (
    <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3 dark:border-gray-700">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-gray-800 dark:text-white/90">
          {T.margem.rotulo}
        </label>
        <output
          htmlFor={id}
          className="text-[17px] font-semibold text-gray-800 tabular-nums dark:text-white/90"
        >
          {formatarTexto(T.margem.valor, { valor: v })}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={50}
        step={5}
        value={v}
        onChange={(e) => estado.setMargem(Number(e.target.value))}
        aria-valuetext={formatarTexto(T.margem.valor, { valor: v })}
        aria-describedby={`${id}-h`}
        data-slider-margem=""
        className={`h-11 w-full cursor-pointer rounded-lg accent-[#396CAA] dark:accent-[#6E9DC4] ${FOCO_CENARIOS}`}
      />
      <div
        aria-hidden="true"
        className="flex justify-between text-[11.5px] text-gray-600 tabular-nums dark:text-gray-400"
      >
        <span>{T.margem.marcas.min}</span>
        <span>{T.margem.marcas.meio}</span>
        <span>{T.margem.marcas.max}</span>
      </div>
      <span id={`${id}-h`} className="text-xs text-gray-600 dark:text-gray-400">
        {T.margem.ajuda}
      </span>
    </div>
  );
}

const LEGENDA =
  'mb-2 p-0 text-xs font-semibold tracking-[0.06em] text-gray-600 uppercase dark:text-gray-300';
const GRADE =
  'grid grid-cols-1 gap-2.5 @min-[560px]:grid-cols-2 @min-[560px]:gap-x-4 @min-[900px]:grid-cols-1';

export default function FormPremissas({
  r,
  estado,
}: {
  r: CenariosResposta;
  estado: EstadoCenario;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5" data-cenarios-entradas="">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={LEGENDA}>
          {T.secoes.dadosAtivo}{' '}
          <small className="font-normal tracking-normal normal-case">
            ({T.secoes.dadosAtivoSub})
          </small>
        </legend>
        <div className={GRADE}>
          <CampoCotacao r={r} />
          {defsDados(r).map((d) => (
            <CampoCenario key={d.campo} def={d} r={r} estado={estado} />
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={LEGENDA}>
          {T.secoes.premissas}{' '}
          <small className="font-normal tracking-normal normal-case" data-premissas-em-branco="">
            ({T.secoes.premissasSub})
          </small>
        </legend>
        <div className={GRADE}>
          {defsPremissas(r).map((d) => (
            <CampoCenario key={d.campo} def={d} r={r} estado={estado} />
          ))}
        </div>
      </fieldset>
      <SliderMargem estado={estado} />
    </div>
  );
}
