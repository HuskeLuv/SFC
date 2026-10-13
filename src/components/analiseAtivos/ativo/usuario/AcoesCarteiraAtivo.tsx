'use client';

/**
 * Slot de ações da Carteira no cabeçalho da página do ativo. v2.4 (fatia C1): é a BarraAcoesAtivo
 * — Comparar · Planejar na carteira/Ajustar plano · Ver na Carteira · Registrar operação (único
 * primário), cada um com o seu modal sobre as rotas reais da Carteira. Nunca "Comprar".
 *
 * A cotação e o tipo do FII (sugestão de seção na 1ª compra) vêm do topo do ativo já carregado
 * pela página (mesma key do React Query, sem requisição nova).
 *
 * Consultor agindo pelo cliente (rec. 9): Ver, Planejar e Registrar continuam disponíveis; os
 * modais avisam que a gravação vai para a carteira do cliente. A tese segue privada (BlocoTese).
 *
 * Re-exporta os estilos de botão e o useWizardCarteiraAtivo (definidos na BarraAcoesAtivo) para
 * quem já importava daqui (BlocoTese, BlocoNaCarteira).
 */
import BarraAcoesAtivo from '@/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo';
import { useAtivoTopo } from '@/hooks/useAnaliseAtivos';
import { tipoCvmDoTopo } from '@/services/analiseAtivos/regras/carteira/secaoOperacao';
import type { AcoesCarteiraAtivoProps } from '@/types/analiseAtivosApi';

export {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  useWizardCarteiraAtivo,
  type OperacaoWizard,
} from '@/components/analiseAtivos/ativo/acoes/BarraAcoesAtivo';
export type { AcoesCarteiraAtivoProps };

export default function AcoesCarteiraAtivo({
  ticker,
  classe,
  nome,
  assetId,
}: AcoesCarteiraAtivoProps) {
  const t = ticker.toUpperCase();
  const topo = useAtivoTopo(t);
  const preco = topo.data?.cotacao.preco ?? null;
  const fiiTipo = topo.data ? tipoCvmDoTopo(topo.data) : null;
  return (
    <BarraAcoesAtivo
      ticker={t}
      classe={classe}
      nome={nome}
      assetId={assetId}
      preco={preco}
      fiiTipo={fiiTipo}
    />
  );
}
