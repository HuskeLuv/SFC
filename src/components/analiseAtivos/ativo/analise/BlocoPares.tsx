/**
 * STUB da fatia 0a — dono: C (análise: fundamentos, valuation, pares). Preguiçoso: busca o próprio dado com useFundamentosAtivo/useValuationAtivo; a PaginaAtivo só o monta dentro de SecaoPreguicosa. Props FINAIS (src/types/analiseAtivosApi.ts); a fatia dona
 * implementa o visual do protótipo revisado SEM mudar a assinatura.
 */
import PlaceholderBloco from '@/components/analiseAtivos/shell/PlaceholderBloco';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { BlocoParesProps } from '@/types/analiseAtivosApi';

export type { BlocoParesProps };

export default function BlocoPares(_props: BlocoParesProps) {
  return <PlaceholderBloco titulo={TEXTOS_TELA.blocos.pares} dono="BlocoPares" />;
}
