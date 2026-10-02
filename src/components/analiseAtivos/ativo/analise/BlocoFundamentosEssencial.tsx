'use client';

/**
 * Fundamentos · Essencial (fatia C). Busca o próprio dado (useFundamentosAtivo) — a PaginaAtivo
 * só monta o bloco dentro da SecaoPreguicosa. Tabela no padrão TABLE_STYLES (compacta), até 10
 * anos fechados com o último destacado (tinta outside) + 'Últ. 12m'. A coluna Ano fica fixa e a
 * tabela rola para o lado DENTRO do card no celular (exceção justificada no protótipo).
 * Negativos em #D92D20/#F97066; Div./ação em conferência com asterisco e nota.
 */
import CartaoAnalise, {
  FUNDO_STICKY,
  TEXTO_NEGATIVO,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { useFundamentosAtivo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { BlocoFundamentosEssencialProps, LinhaFundamentos } from '@/types/analiseAtivosApi';

export type { BlocoFundamentosEssencialProps };

const TF = TEXTOS_TELA.analise.fundamentos;
/** Colunas que levam o asterisco quando o ano tem proventos em conferência. */
const COLUNAS_PROVENTO = new Set(['dpa', 'rendCota']);
const DESTAQUE_STICKY =
  'shadow-[inset_0_0_0_999px_rgba(0,121,242,0.06)] dark:shadow-[inset_0_0_0_999px_rgba(0,121,242,0.16)]';

function emConferencia(l: LinhaFundamentos): boolean {
  return l.selos.includes('proventos_em_conferencia');
}

export default function BlocoFundamentosEssencial({ ticker }: BlocoFundamentosEssencialProps) {
  const q = useFundamentosAtivo(ticker);
  const dados = q.data;
  const anos = dados?.linhas.filter((l) => l.ano !== null).length ?? 0;
  const sub = dados
    ? `${anos >= 10 ? TF.dezAnos : formatarTexto(TF.anosHistorico, { n: anos })} · ${TF.sub}`
    : TF.sub;

  return (
    <CartaoAnalise
      id={`fundamentos-${ticker}`}
      titulo={TEXTOS_TELA.blocos.fundamentos}
      sub={sub}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={320}
    >
      {dados && dados.linhas.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">{TF.vazio}</p>
      ) : dados ? (
        <>
          <div
            className={`${TABLE_STYLES.wrapper} max-w-full`}
            data-rolagem-card="fundamentos"
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
                  {dados.colunas.map((c) => (
                    <th
                      key={c.codigo}
                      scope="col"
                      className={`${TABLE_STYLES.compact.th} text-right`}
                    >
                      {c.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => {
                  const conf = emConferencia(l) && l.ano !== null;
                  return (
                    <tr
                      key={l.rotulo}
                      className={TABLE_STYLES.row}
                      data-destaque={l.destaque || undefined}
                    >
                      <th
                        scope="row"
                        className={`${TABLE_STYLES.compact.td} sticky left-0 z-[1] text-left font-semibold text-gray-800 dark:text-white/90 ${FUNDO_STICKY} ${l.destaque ? DESTAQUE_STICKY : ''}`}
                      >
                        {l.rotulo}
                      </th>
                      {dados.colunas.map((c) => {
                        const v = l.valores[c.codigo] ?? {
                          estado: 'ausente' as const,
                          motivo: 'sem_dado_fonte',
                          texto: TEXTOS_TELA.ausentesPorCampo.semDado,
                        };
                        const negativo = v.estado === 'ok' && v.valor < 0;
                        const asterisco = conf && COLUNAS_PROVENTO.has(c.codigo);
                        return (
                          <td
                            key={c.codigo}
                            title={v.estado === 'ok' ? undefined : v.texto}
                            className={`${TABLE_STYLES.compact.td} text-right tabular-nums ${l.destaque ? `${TABLE_STYLES.highlightTd} font-medium text-gray-800 dark:text-white/90` : ''} ${negativo ? TEXTO_NEGATIVO : ''}`}
                          >
                            {formatarEstado(v, c.formato)}
                            {asterisco ? (
                              <span aria-label={TEXTOS_TELA.selos.emConferencia}>*</span>
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
          <ul className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
            <li>
              {dados.variante === 'acao'
                ? TF.notaEssencialAcao
                : dados.variante === 'fii_papel'
                  ? TF.notaEssencialPapel
                  : TF.notaEssencialFii}
            </li>
            {dados.notas.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}
    </CartaoAnalise>
  );
}
