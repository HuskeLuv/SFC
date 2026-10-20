'use client';

/**
 * Fundamentos · Essencial (fatia C). Busca o próprio dado (useFundamentosAtivo) — a PaginaAtivo
 * só monta o bloco dentro da SecaoPreguicosa. Tabela no padrão TABLE_STYLES (compacta), até 10
 * anos fechados com o último ano fechado marcado (tinta outside, data-ultimo-ano) + 'Últ. 12m'. A
 * coluna Ano fica fixa e a tabela rola para o lado DENTRO do card no celular (exceção justificada no
 * protótipo). Negativos em #D92D20/#F97066; Div./ação em conferência com asterisco e nota.
 *
 * v2.4 (fatia C2): ações na ordem do HTML do Pedro em R$ bi (Receita líq. · EBITDA · Lucro líq. ⓘ ·
 * Margem líq. ⓘ · Dívida líq. ⓘ · Dív. líq./EBITDA · FCL/CAPEX ⓘ · ROE · LPA · Div./ação · Payout ·
 * P/L · P/VP · DY). As colunas com ⓘ levam a explicação no title, para leitor de tela e nas notas
 * (D2: a CVM não publica o lucro sem itens não recorrentes). FII: 'Área (CVM)' (rec. 7).
 *
 * Bloco C (params v2): célula em conferência = HACHURA + '—' ('ocultar') ou o valor ('selo') + chip
 * "em conferência" que abre o "Por quê?" (ano do histórico: o próprio ano). As células saem da
 * mesma política (conferenciasAtivo) do Quadro e do topo. Menu ⋯ e frescor do bloco pelo card.
 *
 * Bloco D (decisão 1, vale sempre): LPA, P/L e P/VP (FII: VP/cota e rendimento/cota) de um ano com a
 * base por ação quebrada saem 'em conferência' — hachura + '—' + chip com o motivo, montado aqui
 * (conferenciaTelaPerShare), igual ao Raio-X.
 *
 * v2.5 (fatia B): 'Lucro descontado ⓘ' e 'Margem descontada ⓘ' (§3.2). Célula que usa o lucro
 * líquido no lugar do descontado (LinhaFundamentos.marcas[c].fallback) leva um ⓘ com o tooltip
 * (fallbackLucro/fallbackMargem; sr-only para leitor de tela); '—' leva o texto do Estado no title
 * ('sem dado nas demonstrações'). Financeiras com as 14 colunas. A nota de fonte vem das origens
 * (FundamentosResposta.textoFonte) e o selo neutro 'dados incompletos' (§6) aparece quando a fonte
 * marcou algum ponto (dadosIncompletos).
 *
 * A6 (fatia B): banco e seguradora vêm com o template próprio do servidor (FundamentosResposta.
 * template, colunas de textosFinanceiras). A explicação da coluna vem de ColunaFundamentos.tooltip
 * quando o servidor manda (ex.: qual receita a seguradora usou); a tabela marca data-template.
 */
import type { ReactNode } from 'react';
import CartaoAnalise, {
  FUNDO_STICKY,
  TEXTO_NEGATIVO,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import ChipConferencia, {
  HACHURA,
  naoPublicado,
} from '@/components/analiseAtivos/comum/ChipConferencia';
import { useConferenciaPagina } from '@/components/analiseAtivos/comum/PorQueConferencia';
import {
  CAMPO_COLUNA_FUNDAMENTOS,
  CAMPO_HISTORICO,
  anoDaConferencia,
  conferenciaDoCampo,
  grupoDoEstado,
} from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  conferenciaTelaPerShare,
  ehEstadoPerShareEmConferencia,
} from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import { CAMPOS_REPORTAVEIS } from '@/services/analiseAtivos/curadoria/contrato';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { useFundamentosAtivo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import type {
  BlocoFundamentosEssencialProps,
  ColunaFundamentos,
  ConferenciaTela,
  Estado,
  FundamentosResposta,
  LinhaFundamentos,
} from '@/types/analiseAtivosApi';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';

export type { BlocoFundamentosEssencialProps };

const TF = TEXTOS_TELA.analise.fundamentos;
/** Colunas que levam o asterisco quando o ano tem proventos em conferência. */
const COLUNAS_PROVENTO = new Set(['dpa', 'rendCota']);
const TE = TEXTOS_ATIVO.essencial;
const ULTIMO_ANO_STICKY =
  'shadow-[inset_0_0_0_999px_rgba(0,121,242,0.06)] dark:shadow-[inset_0_0_0_999px_rgba(0,121,242,0.16)]';

/** Explicação das colunas com ⓘ (D2 e rec. 7), por variante; A6: o tooltip do servidor primeiro. */
export function explicacaoDaColuna(
  variante: FundamentosResposta['variante'],
  codigo: string,
  tooltip?: string,
): string | null {
  if (tooltip) return tooltip;
  if (variante === 'acao') {
    return (TE.tooltips as Record<string, string>)[codigo] ?? null;
  }
  return codigo === 'area' ? TE.tooltipAreaFii : null;
}

/** Rótulo sem o 'ⓘ' (notas e leitor de tela). */
function rotuloLimpo(rotulo: string): string {
  return rotulo.replace(/\s*ⓘ\s*$/u, '');
}

/** Tooltip da célula que usa o lucro líquido no lugar do descontado (v2.5); null = nenhum. */
export function tooltipFallback(l: LinhaFundamentos, codigo: string): string | null {
  if (!l.marcas?.[codigo]?.fallback) return null;
  if (codigo === 'lucro') return TE.tooltips.fallbackLucro;
  if (codigo === 'margem') return TE.tooltips.fallbackMargem;
  return null;
}

function emConferencia(l: LinhaFundamentos): boolean {
  return l.selos.includes('proventos_em_conferencia');
}

/** Campo de tela da coluna (fundamentos) na classe do ativo. */
function campoDaColuna(variante: FundamentosResposta['variante'], codigo: string): string {
  return CAMPO_COLUNA_FUNDAMENTOS[variante === 'acao' ? 'acao' : 'fii'][codigo] ?? codigo;
}

/**
 * Bloco C: conferência da célula — 'ocultar' pelo motivo do Estado; 'selo' pela linha marcada
 * ('em_conferencia') e a conferência da página que marca o campo com selo.
 */
function conferenciaDaCelula(
  conferencias: readonly ConferenciaTela[],
  l: LinhaFundamentos,
  variante: FundamentosResposta['variante'],
  c: ColunaFundamentos,
  v: Estado<number>,
): ConferenciaTela | null {
  // decisão 1 do Bloco D: base por ação quebrada no ano (sem grupo do Bloco C)
  if (ehEstadoPerShareEmConferencia(v) && v.estado === 'ausente') {
    return conferenciaTelaPerShare(v.texto, [campoDaColuna(variante, c.codigo)]);
  }
  const grupo = grupoDoEstado(v);
  if (grupo) {
    return (
      conferencias.find(
        (x) => x.grupo === grupo && (grupo !== 'historico' || anoDaConferencia(x) === l.ano),
      ) ?? null
    );
  }
  if (v.estado !== 'ok' || !l.selos.includes('em_conferencia')) return null;
  const conf = conferenciaDoCampo(conferencias, campoDaColuna(variante, c.codigo));
  return conf && conf.exibicao === 'selo' ? conf : null;
}

/** "Qual dado?" do relato: colunas reportáveis da linha destacada (último ano fechado). */
function dadosReporte(dados: FundamentosResposta | undefined): DadoBlocoReporte[] | undefined {
  const linha = dados?.linhas.find((l) => l.ultimoAno);
  if (!dados || !linha) return undefined;
  const reportaveis = CAMPOS_REPORTAVEIS.fundamentos as readonly string[];
  return dados.colunas
    .map((c) => ({ c, campo: campoDaColuna(dados.variante, c.codigo) }))
    .filter(({ campo }) => reportaveis.includes(campo))
    .map(({ c, campo }) => ({
      campo: campo as DadoBlocoReporte['campo'],
      rotulo: c.rotulo,
      valorExibido: linha.valores[c.codigo]
        ? formatarEstado(linha.valores[c.codigo], c.formato)
        : null,
      periodo: linha.rotulo,
    }));
}

export interface BlocoFundamentosEssencialComNivelProps extends BlocoFundamentosEssencialProps {
  /** Bloco D: título do card com o seletor de nível ('Fundamentos'); sem ele, o de hoje */
  titulo?: string;
  /** Bloco D: slot `acao` do card (SeletorNivel 'Essencial | Raio-X') */
  cabecalhoExtra?: ReactNode;
}

export default function BlocoFundamentosEssencial({
  ticker,
  titulo,
  cabecalhoExtra,
}: BlocoFundamentosEssencialComNivelProps) {
  const q = useFundamentosAtivo(ticker);
  const ctx = useConferenciaPagina();
  const conferencias = ctx?.conferencias ?? [];
  const dados = q.data;
  const anos = dados?.linhas.filter((l) => l.ano !== null).length ?? 0;
  const sub = dados
    ? `${anos >= 10 ? TF.dezAnos : formatarTexto(TF.anosHistorico, { n: anos })} · ${TF.sub}`
    : TF.sub;

  return (
    <CartaoAnalise
      id={`fundamentos-${ticker}`}
      titulo={titulo ?? TEXTOS_TELA.blocos.fundamentos}
      sub={sub}
      acao={cabecalhoExtra}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={320}
      dadosReporte={dadosReporte(dados)}
    >
      {dados && dados.linhas.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">{TF.vazio}</p>
      ) : dados ? (
        <>
          <div
            className={`${TABLE_STYLES.wrapper} relative max-w-full`}
            data-rolagem-card="fundamentos"
            data-template={dados.template}
            tabIndex={0}
            aria-label={formatarTexto(TF.caption, { ticker })}
          >
            <table className={`${TABLE_STYLES.table} min-w-max`}>
              <caption className="sr-only">{formatarTexto(TF.caption, { ticker })}</caption>
              <thead>
                <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <th
                    scope="col"
                    className={`${TABLE_STYLES.compact.th} sticky left-0 z-10 text-left`}
                    style={TABLE_HEADER_STYLE}
                  >
                    {TF.ano}
                  </th>
                  {dados.colunas.map((c) => {
                    const explicacao = explicacaoDaColuna(dados.variante, c.codigo, c.tooltip);
                    return (
                      <th
                        key={c.codigo}
                        scope="col"
                        className={`${TABLE_STYLES.compact.th} text-right`}
                      >
                        {explicacao ? (
                          <span
                            title={explicacao}
                            data-explicacao-coluna={c.codigo}
                            className="cursor-help"
                          >
                            {c.rotulo}
                            <span className="sr-only">: {explicacao}</span>
                          </span>
                        ) : (
                          c.rotulo
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => {
                  const conf = emConferencia(l) && l.ano !== null;
                  return (
                    <tr
                      key={l.rotulo}
                      className={TABLE_STYLES.row}
                      data-ultimo-ano={l.ultimoAno || undefined}
                    >
                      <th
                        scope="row"
                        className={`${TABLE_STYLES.compact.td} sticky left-0 z-[1] text-left font-semibold text-gray-800 dark:text-white/90 ${FUNDO_STICKY} ${l.ultimoAno ? ULTIMO_ANO_STICKY : ''}`}
                      >
                        {l.rotulo}
                        {l.ultimoAno ? <span className="sr-only"> ({TE.ultimoAnoSr})</span> : null}
                      </th>
                      {dados.colunas.map((c) => {
                        const v = l.valores[c.codigo] ?? {
                          estado: 'ausente' as const,
                          motivo: 'sem_dado_fonte',
                          texto: TEXTOS_TELA.ausentesPorCampo.semDado,
                        };
                        const negativo = v.estado === 'ok' && v.valor < 0;
                        const asterisco = conf && COLUNAS_PROVENTO.has(c.codigo);
                        const confC = conferenciaDaCelula(conferencias, l, dados.variante, c, v);
                        const fallback = v.estado === 'ok' ? tooltipFallback(l, c.codigo) : null;
                        return (
                          <td
                            key={c.codigo}
                            title={v.estado === 'ok' ? (fallback ?? undefined) : v.texto}
                            data-conferencia={confC?.grupo}
                            data-fallback={fallback ? '' : undefined}
                            className={`${TABLE_STYLES.compact.td} text-right tabular-nums ${l.ultimoAno ? `${TABLE_STYLES.highlightTd} font-medium text-gray-800 dark:text-white/90` : ''} ${negativo ? TEXTO_NEGATIVO : ''} ${confC ? HACHURA : ''}`}
                          >
                            {formatarEstado(v, c.formato)}
                            {fallback ? (
                              <>
                                {/* ⓘ minúsculo não existe na fonte do app: ícone em SVG */}
                                <svg
                                  aria-hidden="true"
                                  data-icone-fallback=""
                                  viewBox="0 0 12 12"
                                  className="ml-1 inline-block h-[11px] w-[11px] cursor-help align-[-1px] text-gray-500 dark:text-gray-400"
                                >
                                  <circle
                                    cx="6"
                                    cy="6"
                                    r="5.25"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                  />
                                  <circle cx="6" cy="3.6" r="0.75" fill="currentColor" />
                                  <rect
                                    x="5.4"
                                    y="5"
                                    width="1.2"
                                    height="3.8"
                                    fill="currentColor"
                                  />
                                </svg>
                                <span className="sr-only">: {fallback}</span>
                              </>
                            ) : null}
                            {asterisco ? (
                              <span aria-label={TEXTOS_TELA.selos.emConferencia}>*</span>
                            ) : null}
                            {confC ? (
                              <span className="mt-0.5 flex justify-end">
                                <ChipConferencia
                                  conferencia={confC}
                                  campo={
                                    confC.grupo === 'historico'
                                      ? (CAMPO_HISTORICO[c.codigo] ?? c.codigo)
                                      : campoDaColuna(dados.variante, c.codigo)
                                  }
                                  rotuloCampo={`${c.rotulo} · ${l.rotulo}`}
                                  valorNaoPublicado={naoPublicado(v, c.formato)}
                                  bloco="fundamentos"
                                />
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {dados.dadosIncompletos ? (
            <p className="m-0">
              <span
                data-selo-incompleto=""
                title={TE.tooltipIncompleto}
                className="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[11.5px] text-gray-600 dark:border-gray-600 dark:text-gray-300"
              >
                {TE.seloIncompleto}
                <span className="sr-only">: {TE.tooltipIncompleto}</span>
              </span>
            </p>
          ) : null}
          <ul className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            <li>
              {dados.variante === 'acao'
                ? TE.notaEssencial
                : dados.variante === 'fii_papel'
                  ? TF.notaEssencialPapel
                  : TF.notaEssencialFii}
            </li>
            {dados.observacoes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {dados.textoFonte ? <li data-nota-fonte="">{dados.textoFonte}</li> : null}
            {dados.colunas.map((c) => {
              const explicacao = explicacaoDaColuna(dados.variante, c.codigo, c.tooltip);
              return explicacao ? (
                <li key={`ⓘ-${c.codigo}`} data-nota-coluna={c.codigo}>
                  {rotuloLimpo(c.rotulo)}: {explicacao}
                </li>
              ) : null;
            })}
          </ul>
        </>
      ) : null}
    </CartaoAnalise>
  );
}
