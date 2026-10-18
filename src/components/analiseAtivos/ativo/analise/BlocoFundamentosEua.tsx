'use client';

/**
 * Fundamentos · Essencial de Stocks e REITs (fatia C). Busca o próprio dado (useFundamentosAtivo →
 * /api/analise-ativos/ativos/[ticker]/fundamentos, Essencial EUA): tabela no padrão TABLE_STYLES
 * (compacta), anos fiscais (FY) com o último marcado, valores em US$ bi (por ação e % à parte).
 *
 * SÓ as colunas que têm fonte no XBRL: as que o servidor marca em `colunasPendentes` (FFO, AFFO,
 * Ocupação, Imóveis do REIT) NÃO viram coluna de '—' — ficam escondidas, com a observação de que
 * entram com a leitura do 10-K. Sem Raio-X nesta versão (o Raio-X lê a CVM). Coluna FY fixa e
 * rolagem lateral só dentro do card no celular.
 */
import CartaoAnalise, {
  FUNDO_STICKY,
  TEXTO_NEGATIVO,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { useFundamentosAtivo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import { TEXTOS_EUA_TELAS, formatarTexto } from '@/services/analiseAtivos/textosEuaTelas';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

const TE = TEXTOS_EUA_TELAS.essencial;
const ULTIMO_ANO_STICKY =
  'shadow-[inset_0_0_0_999px_rgba(0,121,242,0.06)] dark:shadow-[inset_0_0_0_999px_rgba(0,121,242,0.16)]';

export default function BlocoFundamentosEua({ ticker }: { ticker: string }) {
  const q = useFundamentosAtivo(ticker);
  const dados = q.data;
  const anos = dados?.linhas.filter((l) => l.ano !== null).length ?? 0;
  const sub = dados
    ? `${formatarTexto(TEXTOS_TELA.analise.fundamentos.anosHistorico, { n: anos })} · ${TEXTOS_EUA.fonte.curta}`
    : TEXTOS_EUA.fonte.curta;

  return (
    <CartaoAnalise
      id={`fundamentos-${ticker}`}
      titulo={TEXTOS_TELA.blocos.fundamentos}
      sub={sub}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={320}
      bloco="fundamentos"
    >
      {dados && dados.linhas.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">{TE.vazio}</p>
      ) : dados ? (
        <>
          <div
            className={`${TABLE_STYLES.wrapper} relative max-w-full`}
            data-rolagem-card="fundamentos"
            data-essencial-eua={dados.variante}
            tabIndex={0}
            aria-label={formatarTexto(TE.caption, { ticker })}
          >
            <table className={`${TABLE_STYLES.table} min-w-max`}>
              <caption className="sr-only">{formatarTexto(TE.caption, { ticker })}</caption>
              <thead>
                <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <th
                    scope="col"
                    className={`${TABLE_STYLES.compact.th} sticky left-0 z-10 text-left`}
                    style={TABLE_HEADER_STYLE}
                  >
                    {TE.ano}
                  </th>
                  {dados.colunas.map((c) => {
                    const dica = TE.tooltips[c.codigo];
                    return (
                      <th
                        key={c.codigo}
                        scope="col"
                        data-coluna-eua={c.codigo}
                        className={`${TABLE_STYLES.compact.th} text-right`}
                      >
                        {dica ? (
                          <span title={dica} className="cursor-help">
                            {c.rotulo}
                            <span className="sr-only">: {dica}</span>
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
                {dados.linhas.map((l) => (
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
                    </th>
                    {dados.colunas.map((c) => {
                      const v = l.valores[c.codigo];
                      const negativo = v?.estado === 'ok' && v.valor < 0;
                      return (
                        <td
                          key={c.codigo}
                          title={v && v.estado !== 'ok' ? v.texto : undefined}
                          className={`${TABLE_STYLES.compact.td} text-right tabular-nums ${l.ultimoAno ? `${TABLE_STYLES.highlightTd} font-medium text-gray-800 dark:text-white/90` : ''} ${negativo ? TEXTO_NEGATIVO : ''}`}
                        >
                          {v ? formatarEstado(v, c.formato) : TEXTOS_TELA.formato.semDado}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            {dados.observacoes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {dados.textoFonte ? <li data-nota-fonte="">{dados.textoFonte}</li> : null}
          </ul>
        </>
      ) : null}
    </CartaoAnalise>
  );
}
