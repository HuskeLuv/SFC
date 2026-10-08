'use client';

/**
 * Card "Fundamentos" da página do ativo (Bloco D, fatia A). A PaginaAtivo não muda.
 *
 * - Sem config.recursos.raioX (flag ANALISE_ATIVOS_RAIOX_HABILITADO desligada ou usuário fora):
 *   renderiza EXATAMENTE o BlocoFundamentosEssencial de hoje (mesmas props; ?fund= é ignorado).
 * - Com o recurso: título 'Fundamentos' e o SeletorNivel 'Essencial | Raio-X' no slot do cabeçalho
 *   (antes do menu ⋯). O nível fica NA URL (decisão 13): ?fund=raiox abre no Raio-X; trocar usa
 *   router.replace sem rolar a página; o Essencial remove o parâmetro (URL de hoje). Nada em
 *   localStorage. O Raio-X só busca o dado quando o nível é 'raioX' (TabelaRaioX → useRaioX).
 */
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import BlocoFundamentosEssencial from '@/components/analiseAtivos/ativo/analise/BlocoFundamentosEssencial';
import TabelaRaioX from '@/components/analiseAtivos/ativo/analise/TabelaRaioX';
import SeletorNivel from '@/components/analiseAtivos/comum/SeletorNivel';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import {
  PARAM_NIVEL_FUNDAMENTOS,
  nivelFundamentosDaUrl,
  queryComNivelFundamentos,
} from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import type {
  BlocoFundamentosProps,
  NivelFundamentos,
  OpcaoSeletorNivel,
} from '@/types/analiseAtivosBlocoD';

const OPCOES: ReadonlyArray<OpcaoSeletorNivel<NivelFundamentos>> = [
  { valor: 'essencial', rotulo: TEXTOS_RAIO_X.seletor.essencial },
  { valor: 'raioX', rotulo: TEXTOS_RAIO_X.seletor.raioX },
];

function FundamentosComNivel({ ticker, classe }: BlocoFundamentosProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const nivel = nivelFundamentosDaUrl(params?.get(PARAM_NIVEL_FUNDAMENTOS), true);

  const trocar = useCallback(
    (novo: NivelFundamentos) => {
      const qs = queryComNivelFundamentos(params?.toString() ?? '', novo);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // celular: o seletor vai para a linha de baixo, largura toda (o menu ⋯ fica ao lado do título);
  // computador: encostado à direita, antes do menu ⋯ (o invólucro ocupa o espaço livre)
  const seletor = (
    <div className="order-last flex w-full sm:order-none sm:w-auto sm:flex-1 sm:justify-end">
      <SeletorNivel
        opcoes={OPCOES}
        ativo={nivel}
        onTrocar={trocar}
        rotuloGrupo={TEXTOS_RAIO_X.seletor.rotuloGrupo}
      />
    </div>
  );

  return nivel === 'raioX' ? (
    <TabelaRaioX ticker={ticker} classe={classe} cabecalhoExtra={seletor} />
  ) : (
    <BlocoFundamentosEssencial
      ticker={ticker}
      classe={classe}
      titulo={TEXTOS_RAIO_X.titulo}
      cabecalhoExtra={seletor}
    />
  );
}

export default function BlocoFundamentos({ ticker, classe }: BlocoFundamentosProps) {
  const config = useAnaliseAtivosConfig();
  if (config.data?.recursos?.raioX !== true) {
    return <BlocoFundamentosEssencial ticker={ticker} classe={classe} />;
  }
  return <FundamentosComNivel ticker={ticker} classe={classe} />;
}
