'use client';

/**
 * Pares do segmento (fatia C; v2.4 fatia C2). Mesma consulta do Valuation (useValuationAtivo):
 * até 5 pares — SEM o próprio ativo — em ordem A–Z, clicáveis (abrem /analise-ativos/[ticker]),
 * com a coluna "Critérios" (contagem 'n de k' em 5 anos, neutra; sem Índice).
 *  - Ações: Ativo · P/L · P/VP · ROE · DY 12m · Lucros seguidos · Critérios;
 *  - FIIs: Fundo · DY 12m · P/VP · Vacância (CVM) (tijolo) ou Nº CRIs (papel) · Alavancagem (% do
 *    PL) (v2.5, rótulo coerente com o chip 'Alavancagem ≤ 20% do PL'; cálculo = obrigações ÷ PL) ·
 *    Patrimônio · Critérios. A6 (fatia E): com ANALISE_ATIVOS_ALAV_ATIVO_HABILITADO a API traz
 *    obrigacoesAtivoPct nas linhas de FII e a coluna 'Alavancagem (% do ativo)' entra ao lado da de PL,
 *    cada uma com o próprio valor e rótulo; sem o campo (chave desligada), a tabela é a de hoje.
 * Computador: tabela TABLE_STYLES com th scope="row" e CelulaCriterios (botão de 44 px com o
 * detalhe em tooltip, sem abrir a linha); celular: cartões (links de 44 px+) com 'n de k' em texto.
 * Desde que fica em 2/3 da linha (xl, ao lado dos Múltiplos históricos), a tabela cabe na coluna:
 * sem min-w-max, padding de 8 px e cabeçalhos que quebram em 2 linhas ('Alavancagem (% do PL)')
 * em vez de rolar e cortar a coluna Critérios; rótulos curtos ('DY 12m'), valores e a 1ª coluna
 * não quebram.
 * O nome do ativo vem do banco e leva data-nome-ativo (a varredura de linguagem o ignora). Critério
 * de seleção em texto; sem pares: texto próprio.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CartaoAnalise, {
  FUNDO_STICKY,
  TEXTO_NEGATIVO,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import CelulaCriterios from '@/components/analiseAtivos/comum/CelulaCriterios';
import { formatarAnalise, formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { useValuationAtivo } from '@/hooks/useAnaliseAtivos';
import { CRITERIA_PARAMS_CODIGO } from '@/services/analiseAtivos/params/criteriaParamsCodigo';
import { JANELA_PARES } from '@/services/analiseAtivos/leitura/ativo/paresAtivo';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  BlocoParesProps,
  ClasseQuadro,
  Estado,
  FormatoAnalise,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';
import type { IdCriterio, PerfilCriterio } from '@/types/analiseAtivosCriterios';

export type { BlocoParesProps };

const TP = TEXTOS_TELA.analise.pares;
const C = TP.colunas;
const TA = TEXTOS_ATIVO.pares;
const SEM = TEXTOS_TELA.formato.semDado;

interface ColunaPar {
  codigo: string;
  rotulo: string;
  valor: (l: LinhaQuadroApi) => { texto: string; negativo?: boolean; title?: string };
}

function deEstado(e: Estado<number>, formato: FormatoAnalise) {
  return {
    texto: formatarEstado(e, formato),
    negativo: e.estado === 'ok' && e.valor < 0,
    title: e.estado === 'ok' ? undefined : e.texto,
  };
}

function deNumero(n: number | null, formato: FormatoAnalise) {
  return { texto: n === null ? SEM : formatarAnalise(n, formato) };
}

/** 'n de k' dos critérios do par (texto neutro), ou '—' sem avaliação. */
export function textoCriteriosPar(l: LinhaQuadroApi): { texto: string; title?: string } {
  if (!l.criterios) return { texto: SEM, title: TA.criteriosSem };
  return {
    texto: formatarTexto(TEXTOS_CRITERIOS.contador.curto, {
      n: l.criterios.n,
      total: l.criterios.de,
    }),
  };
}

/**
 * id → rótulo dos critérios do perfil, para o tooltip da célula. v2.5: dos params vigentes do código
 * (CRITERIA_PARAMS_CODIGO: 'Alavancagem ≤ 20% do PL', 'Dív. líq./EBITDA < 3×'); a financeira usa os
 * 6 de ação.
 */
export function rotulosDoPerfil(perfil: PerfilCriterio): Partial<Record<IdCriterio, string>> {
  const p = CRITERIA_PARAMS_CODIGO.perfis;
  const lista =
    perfil === 'fii_tijolo' ? p.fii_tijolo : perfil === 'fii_papel' ? p.fii_papel : p.acao;
  return Object.fromEntries(lista.map((c) => [c.id, c.rotulo]));
}

const CRITERIOS: ColunaPar = {
  codigo: 'criterios',
  rotulo: TA.colunas.criterios,
  valor: textoCriteriosPar,
};

/** A6: coluna nova ao lado da de PL (obrigações ÷ ativo total), só quando a API manda o campo. */
const ALAVANCAGEM_ATIVO: ColunaPar = {
  codigo: 'alavancagemAtivo',
  rotulo: TA.colunas.alavancagemAtivo,
  valor: (l) => {
    const v = deEstado(
      l.obrigacoesAtivoPct ?? { estado: 'ausente', motivo: 'sem_dado_fonte', texto: SEM },
      'pct',
    );
    return { ...v, title: v.title ?? TEXTOS_ATIVO.alavancagemAtivo.tooltip };
  },
};

function colunasDe(classe: ClasseQuadro, papel: boolean, alavAtivo = false): ColunaPar[] {
  if (classe === 'acao') {
    return [
      { codigo: 'pl', rotulo: C.pl, valor: (l) => deEstado(l.pl, 'numero') },
      { codigo: 'pvp', rotulo: C.pvp, valor: (l) => deEstado(l.pvp, 'numero2') },
      { codigo: 'roe', rotulo: C.roe, valor: (l) => deEstado(l.roe, 'pct') },
      { codigo: 'dy12m', rotulo: C.dy12m, valor: (l) => deEstado(l.dy12m, 'pct') },
      {
        codigo: 'lucrosSeguidos',
        rotulo: C.lucrosSeguidos,
        valor: (l) => deNumero(l.anosLucroConsecutivos, 'inteiro'),
      },
      CRITERIOS,
    ];
  }
  return [
    { codigo: 'dy12m', rotulo: C.dy12m, valor: (l) => deEstado(l.dy12m, 'pct') },
    { codigo: 'pvp', rotulo: C.pvp, valor: (l) => deEstado(l.pvp, 'numero2') },
    papel
      ? { codigo: 'nCri', rotulo: TA.colunas.nCri, valor: (l) => deNumero(l.nCri, 'inteiro') }
      : {
          codigo: 'vacancia',
          rotulo: TA.colunas.vacancia,
          valor: (l) => deEstado(l.vacanciaCvm, 'pct'),
        },
    {
      codigo: 'alavancagem',
      rotulo: TA.colunas.alavancagem,
      valor: (l) => {
        const v = deEstado(l.obrigacoesPl, 'pct');
        return { ...v, title: v.title ?? TEXTOS_ATIVO.alavancagem.tooltip };
      },
    },
    ...(alavAtivo ? [ALAVANCAGEM_ATIVO] : []),
    {
      codigo: 'patrimonio',
      rotulo: C.patrimonio,
      valor: (l) => deNumero(l.patrimonio, 'moedaCompacta'),
    },
    CRITERIOS,
  ];
}

/** Variante mais justa do TABLE_STYLES.compact (mesmos tokens): cabeçalho pode quebrar. */
const TH = 'px-2 py-2 font-medium leading-tight';
const TD = 'px-2 py-2 text-xs whitespace-nowrap';

const href = (ticker: string) => `/analise-ativos/${encodeURIComponent(ticker)}`;

export default function BlocoPares({ ticker, classe }: BlocoParesProps) {
  const q = useValuationAtivo(ticker);
  const router = useRouter();
  const pares = q.data?.pares;
  // v2.4: a API manda só os pares; o filtro garante que o próprio ativo nunca aparece
  const itens = (pares?.itens ?? []).filter((l) => l.ticker !== ticker);
  const papel = itens.length > 0 && itens.every((l) => l.fiiTipo === 'papel');
  // A6: o campo só vem na API com a chave ALAV_ATIVO ligada
  const alavAtivo = classe === 'fii' && itens.some((l) => l.obrigacoesAtivoPct !== undefined);
  const colunas = colunasDe(classe, papel, alavAtivo);
  const tituloCriterios = formatarTexto(TA.criteriosTitulo, { anos: JANELA_PARES });

  return (
    <CartaoAnalise
      id={`pares-${ticker}`}
      titulo={TEXTOS_TELA.blocos.pares}
      sub={pares?.criterio}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={220}
    >
      {pares ? (
        itens.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {classe === 'fii' ? TA.vazioFii : TA.vazioAcao}
          </p>
        ) : (
          <>
            {/* Computador: tabela */}
            <div className={`${TABLE_STYLES.wrapper} relative hidden max-w-full lg:block`}>
              <table className={TABLE_STYLES.table}>
                <caption className="sr-only">{formatarTexto(TP.caption, { ticker })}</caption>
                <thead>
                  <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                    <th
                      scope="col"
                      className={`${TH} sticky left-0 z-10 text-left whitespace-nowrap`}
                      style={TABLE_HEADER_STYLE}
                    >
                      {classe === 'fii' ? TA.colunas.fundo : C.ativo}
                    </th>
                    {colunas.map((c) => (
                      <th
                        key={c.codigo}
                        scope="col"
                        title={c.codigo === 'criterios' ? tituloCriterios : undefined}
                        className={`${TH} ${c.rotulo.length <= 10 ? 'whitespace-nowrap' : ''} ${c.codigo === 'criterios' ? 'text-center' : 'text-right'}`}
                      >
                        {c.rotulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((l) => (
                    <tr
                      key={l.ticker}
                      data-par={l.ticker}
                      onClick={() => router.push(href(l.ticker))}
                      className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover} cursor-pointer`}
                    >
                      <th
                        scope="row"
                        className={`${TD} sticky left-0 z-[1] text-left font-normal ${FUNDO_STICKY}`}
                      >
                        <Link
                          href={href(l.ticker)}
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex min-h-11 items-center font-medium ${COR_LINK.classes}`}
                        >
                          {l.ticker}
                        </Link>{' '}
                        <span
                          data-nome-ativo=""
                          title={l.nome}
                          className="inline-block max-w-[11rem] truncate align-middle text-gray-500 dark:text-gray-400"
                        >
                          {l.nome}
                        </span>
                      </th>
                      {colunas.map((c) => {
                        if (c.codigo === 'criterios') {
                          return (
                            <td
                              key={c.codigo}
                              data-criterios-par={l.ticker}
                              className={`${TD} text-center`}
                            >
                              <CelulaCriterios
                                criterios={l.criterios ?? null}
                                ticker={l.ticker}
                                rotulos={
                                  l.criterios ? rotulosDoPerfil(l.criterios.perfil) : undefined
                                }
                              />
                            </td>
                          );
                        }
                        const v = c.valor(l);
                        return (
                          <td
                            key={c.codigo}
                            title={v.title}
                            className={`${TD} text-right tabular-nums ${v.negativo ? TEXTO_NEGATIVO : ''}`}
                          >
                            {v.texto}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Celular: cartões */}
            <ul
              className="flex flex-col gap-2 lg:hidden"
              aria-label={formatarTexto(TP.caption, { ticker })}
            >
              {itens.map((l) => (
                <li key={l.ticker} data-par={l.ticker}>
                  <Link
                    href={href(l.ticker)}
                    className="block min-h-11 rounded-xl border border-gray-200 px-3.5 py-3 active:bg-gray-100 dark:border-gray-800 dark:active:bg-white/[0.05]"
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className={`font-semibold ${COR_LINK.classes}`}>{l.ticker}</span>
                      <span
                        data-nome-ativo=""
                        className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400"
                      >
                        {l.nome}
                      </span>
                    </span>
                    <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 max-[359px]:grid-cols-2">
                      {colunas.map((c) => {
                        const v = c.valor(l);
                        return (
                          <div key={c.codigo} className="min-w-0">
                            <dt className="text-[11px] text-gray-500 dark:text-gray-400">
                              {c.codigo === 'criterios' ? tituloCriterios : c.rotulo}
                            </dt>
                            <dd
                              title={v.title}
                              className={`text-[13.5px] font-medium tabular-nums ${v.negativo ? TEXTO_NEGATIVO : 'text-gray-800 dark:text-gray-100'}`}
                            >
                              {v.texto}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}
    </CartaoAnalise>
  );
}
