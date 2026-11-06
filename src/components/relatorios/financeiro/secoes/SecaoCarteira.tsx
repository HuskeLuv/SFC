'use client';

import dynamic from 'next/dynamic';
import { temAcesso } from '@/lib/planos';
import { useFormato } from '../FormatoProvider';
import type { PropsSecao } from '../tipos';
import { Cadeado } from '../ui/Cadeado';
import { Callout } from '../ui/Callout';
import { Pagina } from '../ui/Pagina';
import { sobraDoPeriodo } from './apoio';
import { CarteiraAvancadaFicticia } from './ficticio/CarteiraAvancadaFicticia';
import { CarteiraFicticia } from './ficticio/CarteiraFicticia';

// Corpos reais só por import dinâmico: o texto deles não vai para o chunk de quem vê o cadeado.
const CarteiraReal = dynamic(() => import('./real/CarteiraReal'), { ssr: false });
const CarteiraAvancadaReal = dynamic(() => import('./real/CarteiraAvancadaReal'), {
  ssr: false,
});

/** Seção 4: Carteira de investimentos (4a no Pro, 4b no Advanced). */
export function SecaoCarteira({ relatorio }: PropsSecao) {
  const { plano, carteira, carteiraAvancada } = relatorio;
  const n = relatorio.periodo.meses;
  const referencia = new Date(relatorio.geradoEm);
  const { fR0 } = useFormato();

  const temPro = temAcesso(plano, 'pro');
  const temAdv = temAcesso(plano, 'adv');

  return (
    <Pagina
      numero={4}
      titulo="Carteira de investimentos"
      lead="O que você tem investido, onde e quanto rendeu."
      relatorio={relatorio}
    >
      {temPro ? (
        carteira ? (
          <CarteiraReal relatorio={relatorio} carteira={carteira} />
        ) : (
          <Callout>Os dados da carteira não puderam ser carregados agora.</Callout>
        )
      ) : (
        <Cadeado
          plano="pro"
          titulo="Carteira de investimentos"
          descricao="Patrimônio investido, distribuição por classe e histórico mês a mês."
          gancho={`Você teve ${fR0(sobraDoPeriodo(relatorio.orcamento))} de sobra no período. No Pro você acompanha para onde esse dinheiro foi investido.`}
          referencia={referencia}
        >
          <CarteiraFicticia meses={n} />
        </Cadeado>
      )}
      {temAdv ? (
        carteiraAvancada ? (
          <CarteiraAvancadaReal relatorio={relatorio} carteiraAvancada={carteiraAvancada} />
        ) : (
          <Callout>As análises da carteira não puderam ser carregadas agora.</Callout>
        )
      ) : (
        <Cadeado
          plano="adv"
          titulo="Análises da carteira"
          descricao="Rentabilidade contra CDI, Ibovespa e inflação, e proventos por tipo."
          gancho={
            temPro && carteira
              ? `Seu patrimônio investido é ${fR0(carteira.patrimonio)}. Veja quanto ele rendeu de verdade.`
              : undefined
          }
          referencia={referencia}
        >
          <CarteiraAvancadaFicticia meses={n} />
        </Cadeado>
      )}
    </Pagina>
  );
}
