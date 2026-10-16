'use client';

/**
 * Marcador Salvar da linha (tabela) e do cartão (celular) do Quadro (bloco 1, fatia B). Vai no
 * slot `acaoLinha` de TabelaQuadro/CartoesQuadro (o clique não abre o ativo). Mesma regra e mesmo
 * índice do botão do cabeçalho (useSalvarAtivo): 0 listas cria "Salvos", 1 alterna nela, 2+ abre
 * "Salvar em…". Alvo de 44×44; aria-label "Salvar WEGE3" / "WEGE3 está salvo" e aria-pressed.
 * Consultor: desabilitado com o title das listas pessoais.
 */
import { useRef } from 'react';
import {
  IconeMarcador,
  useSalvarAtivo,
} from '@/components/analiseAtivos/ativo/acoes/BotaoSalvarAtivo';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

const T = TEXTOS_SALVOS.salvar;

export interface BotaoSalvarLinhaProps {
  ticker: string;
  classe: ClasseQuadro;
}

export default function BotaoSalvarLinha({ ticker, classe }: BotaoSalvarLinhaProps) {
  const c = useSalvarAtivo({ ticker, classe });
  const ref = useRef<HTMLButtonElement>(null);
  if (!c.ligado) return null;
  const marcado = c.salvo && !c.consultor;
  const rotulo = c.consultor
    ? formatarTexto(TEXTOS_SALVOS.consultor.marcadorAria, { ticker: c.ticker })
    : formatarTexto(marcado ? T.linhaAriaSalvo : T.linhaAria, { ticker: c.ticker });
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => c.clicar(ref.current)}
        disabled={c.consultor}
        title={c.consultor ? TEXTOS_SALVOS.consultor.titleListas : undefined}
        aria-label={rotulo}
        aria-pressed={c.consultor ? undefined : marcado}
        aria-haspopup={c.acao === 'escolher' && !c.consultor ? 'dialog' : undefined}
        aria-expanded={c.acao === 'escolher' && !c.consultor ? c.escolhaAberta : undefined}
        aria-busy={c.ocupado || undefined}
        data-marcador-salvar={c.ticker}
        data-salvo={marcado ? '' : undefined}
        className={`inline-grid h-11 w-11 place-items-center rounded-lg outline-none hover:bg-gray-100 focus-visible:ring-[3px] focus-visible:ring-[#0079F2] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/5 dark:focus-visible:ring-[#6E9DC4] ${
          marcado ? 'text-[#396CAA] dark:text-[#6E9DC4]' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        <IconeMarcador cheio={marcado} className="h-5 w-5" />
      </button>
      {c.camadas}
    </>
  );
}
