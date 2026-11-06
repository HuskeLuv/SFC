/**
 * Parágrafo "PGBL e IR" do Como ler (seção 9), só no Advanced. Entra por next/dynamic quando o
 * plano é adv (os textos não podem ir para os chunks do Basic/Pro). Export default (next/dynamic).
 *
 * Texto do Pedro ajustado à v1: a renda é a salva na aba PGBL ou a lançada no fluxo até a data de
 * geração (a projeção até 31/12 fica fora da v1).
 */
export default function ParagrafoPgbl(_props: Record<string, never>) {
  return (
    <p style={{ margin: 0 }}>
      <b>PGBL e IR.</b> Renda tributável vem da aba PGBL ou, sem ela, das categorias tributáveis do
      fluxo de caixa lançadas até a data de geração; aportes vêm da classe Previdência (PGBL) da
      carteira. A economia é a diferença de IR com e sem o aporte, pela tabela progressiva vigente.
      A restituição projetada não inclui o IR de Stocks EUA. O relatório não gera a DAA: confira com
      o Informe de Contribuições da seguradora.
    </p>
  );
}
