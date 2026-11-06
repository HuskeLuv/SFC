'use client';

import dynamic from 'next/dynamic';
import { temAcesso } from '@/lib/planos';
import type { PropsSecao } from '../tipos';
import { Cadeado } from '../ui/Cadeado';
import { Callout } from '../ui/Callout';
import { Pagina } from '../ui/Pagina';
import { SonhosFicticios } from './ficticio/SonhosFicticios';

// Corpo real só por import dinâmico: o texto dele não vai para o chunk de quem vê o cadeado.
const SonhosReal = dynamic(() => import('./real/SonhosReal'), { ssr: false });

/** Seção 6: Sonhos (Pro). */
export function SecaoSonhos({ relatorio }: PropsSecao) {
  const { sonhos } = relatorio;
  let corpo;
  if (temAcesso(relatorio.plano, 'pro')) {
    corpo = sonhos ? (
      <SonhosReal relatorio={relatorio} sonhos={sonhos} />
    ) : (
      <Callout>Os sonhos não puderam ser carregados agora.</Callout>
    );
  } else {
    corpo = (
      <Cadeado
        plano="pro"
        titulo="Planejamento de sonhos"
        descricao="Veja quanto falta para cada sonho, quanto guardar por mês e quando você chega lá."
        gancho="Viagem, carro, casa, reserva: cada sonho com prazo, valor mensal e alerta quando sair do ritmo."
        referencia={new Date(relatorio.geradoEm)}
      >
        <SonhosFicticios meses={relatorio.periodo.meses} />
      </Cadeado>
    );
  }
  return (
    <Pagina
      numero={6}
      titulo="Sonhos"
      lead="O progresso de cada objetivo que você cadastrou."
      relatorio={relatorio}
    >
      {corpo}
    </Pagina>
  );
}
