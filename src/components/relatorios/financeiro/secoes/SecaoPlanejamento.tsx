'use client';

import dynamic from 'next/dynamic';
import { temAcesso } from '@/lib/planos';
import { useFormato } from '../FormatoProvider';
import type { PropsSecao } from '../tipos';
import { Cadeado } from '../ui/Cadeado';
import { Callout } from '../ui/Callout';
import { Pagina } from '../ui/Pagina';
import { sobraDoPeriodo } from './apoio';
import { PlanejamentoFicticio } from './ficticio/PlanejamentoFicticio';

// Corpo real só por import dinâmico: o texto dele não vai para o chunk de quem vê o cadeado.
const PlanejamentoReal = dynamic(() => import('./real/PlanejamentoReal'), { ssr: false });

/** Seção 5: Planejamento financeiro (Pro). */
export function SecaoPlanejamento({ relatorio }: PropsSecao) {
  const n = relatorio.periodo.meses;
  const { planejamento } = relatorio;
  const { fR0 } = useFormato();
  let corpo;
  if (temAcesso(relatorio.plano, 'pro')) {
    corpo = planejamento ? (
      <PlanejamentoReal relatorio={relatorio} planejamento={planejamento} />
    ) : (
      <Callout>O planejamento não pôde ser carregado agora.</Callout>
    );
  } else {
    corpo = (
      <Cadeado
        plano="pro"
        titulo="Planejamento financeiro"
        descricao="Compare o que você planejou com o que realizou mês a mês, até a independência financeira."
        gancho={`Com ${fR0(sobraDoPeriodo(relatorio.orcamento) / n)} de sobra por mês, o Pro calcula em que ano você chega na sua meta.`}
        referencia={new Date(relatorio.geradoEm)}
      >
        <PlanejamentoFicticio meses={n} />
      </Cadeado>
    );
  }
  return (
    <Pagina
      numero={5}
      titulo="Planejamento financeiro"
      lead="Se você está no caminho da sua meta de patrimônio."
      relatorio={relatorio}
    >
      {corpo}
    </Pagina>
  );
}
