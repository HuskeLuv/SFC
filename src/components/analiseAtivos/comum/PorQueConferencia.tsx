'use client';

/**
 * "Por quê?" de um dado em conferência (bloco C, fatia B) + o contexto da página que os blocos
 * usam para o chip, o menu ⋯ e o selo de frescor por bloco.
 *
 * - `ConferenciaPaginaProvider`/`useConferenciaPagina`: ticker, classe, versão, conferências
 *   (AtivoTopoResposta.conferencias), frescor por bloco e config.reporteHabilitado. Fora da página
 *   do ativo (Quadro) não há contexto: o chip vira texto e o menu não aparece.
 * - `PorQueConferencia`: conteúdo do "Por quê?" (motivo, desde, na tela, valor não publicado, no
 *   Índice MF, origem, situação) e o atalho final "Tem uma informação sobre isso? Reportar"
 *   (BotaoReportarDado, variante 'link', com o campo escolhido) — só com reporteHabilitado.
 *   O invólucro (popover de 380px no computador / BottomSheet no celular) é do ChipConferencia.
 * - `MenuBlocoPagina`: MenuBlocoAtivo (fatia 0) com o contexto do bloco; não renderiza sem itens
 *   (flag desligada e params v1 ⇒ página idêntica).
 *
 * Texto livre nenhum aqui: tudo vem de textosTela (varrido pelo teste de linguagem).
 */
import { createContext, useContext, type ReactNode } from 'react';
import BotaoReportarDado from '@/components/analiseAtivos/reporte/BotaoReportarDado';
import MenuBlocoAtivo from '@/components/analiseAtivos/reporte/MenuBlocoAtivo';
import { anoDaConferencia } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  CAMPOS_REPORTAVEIS,
  type BlocoReporte,
  type CampoReporte,
} from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, ConferenciaTela, FrescorBloco } from '@/types/analiseAtivosApi';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';

// ---------------------------------------------------------------------------
// Contexto da página do ativo
// ---------------------------------------------------------------------------

export interface ContextoConferenciaPagina {
  ticker: string;
  classe: ClasseQuadro;
  /** versão do Quadro (vai no contexto do relato) */
  versao: string;
  /** config.reporteHabilitado */
  reporteHabilitado: boolean;
  conferencias: ConferenciaTela[];
  /** frescor por bloco (só com params v2); null = selo único de hoje */
  frescorBlocos: Partial<Record<string, FrescorBloco>> | null;
}

const Contexto = createContext<ContextoConferenciaPagina | null>(null);

export function ConferenciaPaginaProvider({
  valor,
  children,
}: {
  valor: ContextoConferenciaPagina;
  children: ReactNode;
}) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useConferenciaPagina(): ContextoConferenciaPagina | null {
  return useContext(Contexto);
}

/** Bloco C visível na página: params v2 (frescor por bloco) ou relato ligado. */
export function blocoCAtivo(ctx: ContextoConferenciaPagina | null): boolean {
  return !!ctx && (ctx.frescorBlocos !== null || ctx.reporteHabilitado);
}

// ---------------------------------------------------------------------------
// "Por quê?"
// ---------------------------------------------------------------------------

function dataBr(iso: string | null): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export interface PorQueConferenciaProps {
  conferencia: ConferenciaTela;
  /** campo de tela escolhido (vai pré-selecionado no relato) */
  campo: string;
  /** 'P/VP' */
  rotuloCampo: string;
  /** valor calculado e NÃO publicado, já formatado (só com exibição 'ocultar') */
  valorNaoPublicado?: string | null;
  /** bloco onde o chip está (contexto do relato) */
  bloco: BlocoReporte;
  /** id do título (o invólucro usa em aria-labelledby) */
  idTitulo?: string;
  /** mostra o título dentro do conteúdo (o BottomSheet já tem título próprio) */
  comTitulo?: boolean;
}

export default function PorQueConferencia({
  conferencia: c,
  campo,
  rotuloCampo,
  valorNaoPublicado,
  bloco,
  idTitulo,
  comTitulo = true,
}: PorQueConferenciaProps) {
  const ctx = useConferenciaPagina();
  const t = TEXTOS_TELA.conferencia.porQue;
  const ano = c.grupo === 'historico' ? anoDaConferencia(c) : null;
  const desde = ano === null ? dataBr(c.desde) : null;
  const oculto = c.exibicao === 'ocultar';
  const situacao = c.caso
    ? c.caso.status === 'em_analise'
      ? formatarTexto(t.equipeConferindo, { data: dataBr(c.caso.atualizadoEm) ?? '' })
      : t.aguardandoFonte
    : null;
  const campoReporte = (
    (CAMPOS_REPORTAVEIS[bloco] as readonly string[]).includes(campo) ? campo : 'outro'
  ) as CampoReporte;

  const linha = (rotulo: string, valor: ReactNode, chave: string) => (
    <div key={chave} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3">
      <dt className="text-gray-500 dark:text-gray-400">{rotulo}</dt>
      <dd className="m-0 text-gray-700 dark:text-gray-200">{valor}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 text-left" data-por-que={c.grupo}>
      {comTitulo ? (
        <h3
          id={idTitulo}
          className="pr-10 text-[15px] font-semibold text-gray-800 dark:text-white/90"
        >
          {formatarTexto(t.tituloCampo, { campo: rotuloCampo })}
        </h3>
      ) : null}
      <dl className="m-0 flex flex-col gap-1.5 text-[13px]">
        {linha(t.motivo, c.motivo, 'motivo')}
        {ano !== null
          ? linha(TEXTOS_TELA.telaConferencia.anoRotulo, String(ano), 'ano')
          : desde
            ? linha(t.desde, desde, 'desde')
            : null}
        {linha(
          t.naTela,
          <>
            {oculto ? t.ocultoNaTela : t.visivelNaTela}
            {oculto && valorNaoPublicado ? (
              <span className="mt-0.5 block tabular-nums" data-nao-publicado>
                {formatarTexto(t.naoPublicado, { valor: valorNaoPublicado })}
              </span>
            ) : null}
          </>,
          'tela',
        )}
        {linha(t.noIndice, c.efeitoIndice ?? t.semEfeitoIndice, 'indice')}
        {linha(t.origem, t.origemRegra, 'origem')}
        {situacao ? linha(t.situacao, situacao, 'situacao') : null}
      </dl>
      {ctx?.reporteHabilitado ? (
        <BotaoReportarDado
          ticker={ctx.ticker}
          classe={ctx.classe}
          bloco={bloco}
          campo={campoReporte}
          contexto={contextoDoBloco(ctx, bloco, [
            {
              campo: campo as DadoBlocoReporte['campo'],
              rotulo: rotuloCampo,
              valorExibido: oculto ? TEXTOS_TELA.formato.semDado : null,
              periodo: null,
            },
          ])}
          variante="link"
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu ⋯ do bloco
// ---------------------------------------------------------------------------

/** Contexto do relato para um bloco da página (rótulo, dados, fonte, frescor, versão). */
export function contextoDoBloco(
  ctx: ContextoConferenciaPagina,
  bloco: BlocoReporte,
  dados?: DadoBlocoReporte[],
) {
  const frescor = ctx.frescorBlocos?.[bloco] ?? null;
  const rotulos = TEXTOS_TELA.relatos.campos as Record<string, string>;
  return {
    rotuloBloco: TEXTOS_TELA.relatos.blocos[bloco],
    dados:
      dados ??
      CAMPOS_REPORTAVEIS[bloco].map((campo) => ({
        campo,
        rotulo: rotulos[campo] ?? campo,
        valorExibido: null,
        periodo: null,
      })),
    fonteExibida: frescor?.fonte ?? null,
    frescorExibido: frescor?.referencia ?? null,
    versao: ctx.versao,
  };
}

export interface MenuBlocoPaginaProps {
  bloco: BlocoReporte;
  /** dados do bloco para o "Qual dado?" (padrão: os campos reportáveis do bloco, sem valor) */
  dados?: DadoBlocoReporte[];
  className?: string;
}

/**
 * Menu ⋯ do bloco com o contexto da página. Sem contexto (fora da página) não renderiza; com flag
 * desligada e params v1 o MenuBlocoAtivo também não (nenhum item).
 */
export function MenuBlocoPagina({ bloco, dados, className }: MenuBlocoPaginaProps) {
  const ctx = useConferenciaPagina();
  if (!ctx) return null;
  const frescor = ctx.frescorBlocos?.[bloco] ?? null;
  if (!ctx.reporteHabilitado && !frescor) return null;
  return (
    <MenuBlocoAtivo
      ticker={ctx.ticker}
      classe={ctx.classe}
      bloco={bloco}
      contexto={contextoDoBloco(ctx, bloco, dados)}
      reporteHabilitado={ctx.reporteHabilitado}
      frescor={frescor}
      className={className}
    />
  );
}
