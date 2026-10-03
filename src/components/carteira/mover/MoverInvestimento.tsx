'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { useMoverOpcoes } from '@/hooks/useMoverOpcoes';
import { MoverErro, useMoverInvestimento } from '@/hooks/useMoverInvestimento';
import {
  SUBGRUPO_EDITAVEL,
  type MoverOpcoesResponse,
  type MoverResponse,
} from '@/lib/carteiraMover';
import type { Efeito } from '@/lib/moverEfeitos';
import { isMoverAlvoCompleto, type MoverInvestimentoProps } from '@/types/carteiraMover';
import {
  avisosDoDestino,
  isOpcoesCaixaRf,
  rotuloAtual,
  rotuloDestino,
  type EscolhaDestino,
} from './DestinoAbaList';
import { useEfeitosMover } from './EfeitosMoverList';
import MoverInvestimentoDialog from './MoverInvestimentoDialog';
import MoverInvestimentoSheet from './MoverInvestimentoSheet';

/** Estado compartilhado entre o diálogo (lg+) e o painel do celular. */
export interface FluxoMover {
  /** Ticker/nome para títulos ("Mover KDIF11"). */
  rotulo: string;
  opcoes?: MoverOpcoesResponse;
  carregando: boolean;
  erroCarregar: boolean;
  recarregar: () => void;
  escolha: EscolhaDestino | null;
  escolher: (escolha: EscolhaDestino) => void;
  /** A escolha é diferente do lugar atual. */
  mudou: boolean;
  salvando: boolean;
  erro: string | null;
  confirmar: () => void;
  /** "Mover para Infra" / "Mover para Fundos › Fiagro" / "Mover". */
  rotuloPrimario: string;
  avisos: string[];
  /**
   * Fase 2: o item está numa Reserva ou na Renda Fixa (troca só no trio, sem seção para
   * escolher). O diálogo e o painel mostram "O que muda" (`efeitos`) no lugar do impacto da fase 1.
   */
  caixaRf: boolean;
  /** Lista "O que muda" (S, !, A, F, §, =) da escolha atual; [] fora do trio ou sem escolha. */
  efeitos: Efeito[];
  fechar: () => void;
}

export const TEXTO_IMPACTO = {
  muda: 'onde o ativo aparece na Carteira, na alocação por classe e nos relatórios por classe.',
  naoMuda:
    'quantidade, preço médio, rentabilidade, proventos nem o IR (segue o tipo do ativo). Dá para desfazer.',
};

function useFluxoMover({ alvo, open, onClose, onMoved }: MoverInvestimentoProps): FluxoMover {
  const consulta = useMoverOpcoes(alvo.tipo, alvo.id, { enabled: open });
  // Página do ativo (alvo só com tipo/id): o aviso de sucesso leva "Ver na Carteira".
  const { mover } = useMoverInvestimento({
    toastErro: false,
    verNaCarteira: !isMoverAlvoCompleto(alvo),
  });
  const [escolha, setEscolha] = useState<EscolhaDestino | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEscolha(null);
    setSalvando(false);
    setErro(null);
  }, [open]);

  const opcoes = consulta.data;
  // Trio Reservas + RF: o símbolo é sintético (CDB-…, RESERVA-…, DEBENTURE-…), então o nome vale
  // mais; bolsa e fundos seguem pelo ticker, como na fase 1.
  const nomeCaixaRf = isOpcoesCaixaRf(opcoes) ? opcoes?.item.nome : undefined;
  const rotulo =
    nomeCaixaRf ||
    opcoes?.item.ticker ||
    (isMoverAlvoCompleto(alvo) ? alvo.label : '') ||
    'investimento';
  const mudou =
    !!escolha &&
    !!opcoes &&
    (escolha.categoria !== opcoes.atual.categoria ||
      // Aba sem seção para escolher (fase 2): mesma aba = nada muda.
      (SUBGRUPO_EDITAVEL[escolha.categoria] && escolha.subgrupo !== opcoes.atual.subgrupo));
  const caixaRf = isOpcoesCaixaRf(opcoes);
  const efeitos = useEfeitosMover(caixaRf ? opcoes : undefined, mudou ? escolha?.categoria : null);

  const fechar = useCallback(() => {
    if (!salvando) onClose();
  }, [onClose, salvando]);

  const confirmar = useCallback(() => {
    if (!escolha || !opcoes || !mudou || salvando) return;
    setSalvando(true);
    setErro(null);
    mover({ alvo, categoria: escolha.categoria, subgrupo: escolha.subgrupo })
      .then((resultado: MoverResponse) => {
        setSalvando(false);
        onMoved?.(resultado);
        onClose();
      })
      .catch((error: unknown) => {
        setSalvando(false);
        const recusa = error instanceof MoverErro && !!error.status && error.status < 500;
        setErro(
          recusa
            ? `Não foi possível mover ${rotulo}: ${error.message}.`
            : `Não foi possível mover ${rotulo}. Confira sua conexão e tente de novo. Ele continua em ${rotuloAtual(opcoes)}.`,
        );
      });
  }, [alvo, escolha, mover, mudou, onClose, onMoved, opcoes, rotulo, salvando]);

  return {
    rotulo,
    opcoes,
    carregando: consulta.isPending && consulta.fetchStatus !== 'idle',
    erroCarregar: consulta.isError,
    recarregar: () => void consulta.refetch(),
    escolha,
    escolher: (e) => {
      setEscolha(e);
      setErro(null);
    },
    mudou,
    salvando,
    erro,
    confirmar,
    rotuloPrimario:
      mudou && escolha && opcoes
        ? `Mover para ${rotuloDestino(opcoes.atual.categoria, escolha)}`
        : 'Mover',
    avisos: opcoes ? avisosDoDestino(opcoes, mudou ? escolha : null) : [],
    caixaRf,
    efeitos,
    fechar,
  };
}

/**
 * "Mover para…" (out/2026): diálogo de 600px no computador (D10) ou painel que sobe de baixo no
 * celular (M2-M6). Busca as opções em `useMoverOpcoes` e grava por `useMoverInvestimento`
 * (otimista + aviso com Desfazer). Erro: fica aberto, com a escolha preservada.
 */
export function MoverInvestimento(props: MoverInvestimentoProps) {
  const isBelowLg = useIsBelowLg();
  const fluxo = useFluxoMover(props);
  // "Voltar" do sistema fecha o painel do celular (entrada própria no histórico, sem parâmetro
  // na URL). Quem renderiza deve manter este componente montado e só virar `open` para false ao
  // fechar — desmontado com o painel aberto, a entrada do histórico fica órfã.
  useMobileHistoryLayer(props.open, fluxo.fechar, isBelowLg);
  if (!props.open) return null;
  return isBelowLg ? (
    <MoverInvestimentoSheet open={props.open} fluxo={fluxo} />
  ) : (
    <MoverInvestimentoDialog open={props.open} fluxo={fluxo} />
  );
}

export default MoverInvestimento;
