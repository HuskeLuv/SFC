'use client';

/**
 * "Sua posição" (Bloco D, fatia B): quantidade e preço médio da Carteira (os mesmos números da
 * aba, via useNaCarteiraAtivo) e as contas sobre o custo — ação: P/L e yield sobre custo; FII:
 * P/VP e rendimento sobre custo. LPA ≤ 0 ⇒ só o yield ("—" no P/L). Com o consultor agindo, é a
 * posição do cliente. Sem posição: uma linha dizendo que o ativo não está na carteira.
 */
import { formatarNumeroBR } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { SuaPosicaoCenario } from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { reais } from '@/components/analiseAtivos/ativo/cenarios/TabelaMetodos';

const T = TEXTOS_CENARIOS.suaPosicao;

interface Props {
  posicao: SuaPosicaoCenario | null;
  classe: 'acao' | 'fii';
  consultor: boolean;
  /** ainda carregando o overlay da Carteira */
  carregando?: boolean;
}

export default function LinhaSuaPosicao({ posicao, classe, consultor, carregando }: Props) {
  if (carregando) return null;
  const titulo = consultor ? T.tituloCliente : T.titulo;
  const caixa =
    'flex flex-wrap items-center gap-x-[18px] gap-y-1.5 rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13.5px] text-gray-700 dark:border-gray-800 dark:text-gray-200';
  const forte = 'font-semibold text-gray-800 tabular-nums dark:text-white/90';
  if (!posicao) {
    return (
      <div className={caixa} data-sua-posicao="nada">
        <span className="font-semibold text-gray-800 dark:text-white/90">{titulo}</span>
        <span>{consultor ? T.semPosicaoCliente : T.semPosicao}</span>
      </div>
    );
  }
  const fii = classe === 'fii';
  const casasMult = fii ? 2 : 1;
  return (
    <div className={caixa} data-sua-posicao="posicao">
      <span className="font-semibold text-gray-800 dark:text-white/90">{titulo}</span>
      <span>
        {formatarTexto(fii ? T.fii : T.acao, {
          n: formatarNumeroBR(posicao.quantidade, 0),
          valor: reais(posicao.pm),
        })}
      </span>
      <span>
        {fii ? T.pvpSobreCusto : T.plSobreCusto}{' '}
        <b className={forte}>
          {posicao.multiploSobreCusto === null
            ? '—'
            : `${formatarNumeroBR(posicao.multiploSobreCusto, casasMult)}${fii ? '' : '×'}`}
        </b>
      </span>
      <span>
        {fii ? T.rendimentoSobreCusto : T.yieldSobreCusto}{' '}
        <b className={forte}>
          {posicao.yieldSobreCustoPct === null
            ? '—'
            : `${formatarNumeroBR(posicao.yieldSobreCustoPct, 1)}%`}
        </b>
        {posicao.proventoEmConferencia && posicao.yieldSobreCustoPct !== null ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {' '}
            (
            {formatarTexto(TEXTOS_CENARIOS.motivos.usaConferencia, {
              campo: fii
                ? TEXTOS_CENARIOS.rotulosCurtos.rend12m
                : TEXTOS_CENARIOS.rotulosCurtos.dpa,
            })}
            )
          </span>
        ) : null}
      </span>
    </div>
  );
}
