'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { twMerge } from 'tailwind-merge';
import { queryKeys } from '@/lib/queryKeys';
import {
  AVISO_LIQUIDEZ_RESERVA,
  AVISO_OBJETIVO_ZERA,
  MOTIVO_SALDO_SEM_TITULO,
  envolveReservaEmergencia,
  isCategoriaCaixaRf,
  type CategoriaMovivel,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import { isSecaoRendaFixa } from '@/lib/rendaFixaSecao';
import {
  calcularEfeitosMover,
  type CalcularEfeitosInput,
  type Efeito,
  type SaudePrevia,
} from '@/lib/moverEfeitos';
import type { SaudeFinanceiraPayload } from '@/services/saudeFinanceira/saudeFinanceiraServer';

/**
 * Efeitos de mover entre Reservas e Renda Fixa (mover fase 2, out/2026): a lista "O que muda"
 * da confirmação ao soltar (ConfirmarMoverCard), do diálogo e do painel do celular. As regras e
 * os textos são de `calcularEfeitosMover` (src/lib/moverEfeitos.ts); aqui só se juntam os dados
 * do GET /mover e da Saúde Financeira e se desenha a lista.
 *
 * Marcadores (protótipo docs/carteira-mover/fase2-prototipo.html): S Saúde, ! liquidez (vermelho,
 * com "Liquidez:" em negrito para não depender só da cor), A Alocação, F Fluxo, § seção e
 * = o que não muda. A lista é uma <ul> lida em ordem.
 */

/** Saúde Financeira (mesma cache de useSaudeFinanceira), buscada só quando a Emergência entra. */
export function useSaudePrevia(enabled: boolean): SaudePrevia | null {
  const { data } = useQuery<SaudeFinanceiraPayload>({
    queryKey: queryKeys.saudeFinanceira.all,
    queryFn: async () => {
      const res = await fetch('/api/saude-financeira', { credentials: 'include' });
      if (!res.ok) throw new Error(`Erro ao carregar saúde financeira (${res.status})`);
      return (await res.json()) as SaudeFinanceiraPayload;
    },
    enabled,
    retry: false,
  });
  const reserva = data?.indicadores?.benchmarks?.reservaEmergencia;
  if (!enabled || !reserva || typeof reserva.atual !== 'number') return null;
  return { reservaAtual: reserva.atual, necessario: reserva.necessario ?? null };
}

/** "Tesouro Prefixado 2029" → "Tesouro Prefixado" (selo "pelo tipo do título"). */
const tituloDoTesouro = (nome: string | undefined): string | null => {
  const s = (nome ?? '').trim();
  if (!/^tesouro\b/i.test(s)) return null;
  return s.replace(/\s+\d{4}$/, '') || null;
};

/**
 * Entrada de `calcularEfeitosMover` a partir do GET /mover (sem a Saúde). null fora do trio
 * Reservas + Renda Fixa, sem troca de aba ou sem as opções.
 */
export function entradaDosEfeitos(
  opcoes: MoverOpcoesResponse | undefined,
  destino: CategoriaMovivel | null | undefined,
): Omit<CalcularEfeitosInput, 'saude'> | null {
  if (!opcoes || !destino) return null;
  const origem = opcoes.atual.categoria;
  if (!isCategoriaCaixaRf(origem) || !isCategoriaCaixaRf(destino) || origem === destino) {
    return null;
  }
  const opcaoDestino = opcoes.destinos.find((d) => d.categoria === destino);
  const avisos = opcaoDestino?.avisos ?? [];
  const secao = opcaoDestino?.secaoAutomatica;
  const rf = opcoes.destinos.find((d) => d.categoria === 'rendaFixaFundos');
  return {
    origem,
    destino,
    valorItem: opcoes.item.valorAtualBRL ?? Number.NaN,
    objetivoPosicao: avisos.includes(AVISO_OBJETIVO_ZERA) ? 1 : 0,
    secao:
      secao && isSecaoRendaFixa(secao.id)
        ? {
            id: secao.id,
            via: secao.via,
            titulo: secao.via === 'titulo' ? tituloDoTesouro(opcoes.item.nome) : null,
          }
        : null,
    liquidez: avisos.includes(AVISO_LIQUIDEZ_RESERVA) ? { noVencimento: false } : null,
    semTitulo: !!rf && !rf.permitido && rf.motivo === MOTIVO_SALDO_SEM_TITULO,
  };
}

/** Efeitos da troca `opcoes.atual` → `destino` ([] fora do trio). */
export function useEfeitosMover(
  opcoes: MoverOpcoesResponse | undefined,
  destino: CategoriaMovivel | null | undefined,
): Efeito[] {
  const entrada = entradaDosEfeitos(opcoes, destino);
  // Os números vêm do GET /mover (saudePrevia, fatia A); a Saúde Financeira só é buscada
  // quando ele não os trouxe (falha/tempo esgotado → null; frase fixa se ambos faltarem).
  const doGet = opcoes?.saudePrevia ?? null;
  const envolve = !!entrada && envolveReservaEmergencia(entrada.origem, destino!);
  const daSaude = useSaudePrevia(envolve && !doGet);
  if (!entrada) return [];
  return calcularEfeitosMover({ ...entrada, saude: envolve ? (doGet ?? daSaude) : null });
}

/** "Saúde Financeira: reserva…" → rótulo em negrito + resto. */
const separar = (texto: string): [string | null, string] => {
  const i = texto.indexOf(': ');
  if (i <= 0 || i > 40) return [null, texto];
  return [texto.slice(0, i + 1), texto.slice(i + 2)];
};

interface EfeitosMoverListProps {
  efeitos: Efeito[];
  className?: string;
  /** Mostra o título "O que muda" (padrão: sim). */
  titulo?: boolean;
}

export function EfeitosMoverList({ efeitos, className, titulo = true }: EfeitosMoverListProps) {
  if (efeitos.length === 0) return null;
  return (
    <div className={twMerge('flex flex-col gap-1.5', className)} data-mf-efeitos-mover="">
      {titulo && (
        <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase dark:text-gray-300">
          O que muda
        </span>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {efeitos.map((efeito) => {
          const [rotulo, resto] = separar(efeito.texto);
          return (
            <li
              key={efeito.marcador}
              data-marcador={efeito.marcador}
              className={twMerge(
                'grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 text-[13px] leading-snug text-gray-700 dark:text-gray-200',
                efeito.alerta &&
                  'rounded-lg bg-[#D92D20]/[0.08] px-2 py-1.5 text-[#B42318] dark:bg-[#F97066]/10 dark:text-[#F97066]',
                efeito.igual && 'text-gray-800 dark:text-white/90',
              )}
            >
              <span
                aria-hidden="true"
                className={twMerge(
                  'mt-px inline-grid h-[18px] w-[18px] place-items-center rounded-full bg-mf-tranquilidade/[0.18] text-[11px] font-bold text-mf-seguranca dark:bg-mf-tranquilidade/20 dark:text-mf-escolha',
                  efeito.alerta && 'bg-[#D92D20] text-white dark:bg-[#F97066] dark:text-gray-900',
                  efeito.igual && 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200',
                )}
              >
                {efeito.marcador}
              </span>
              <span>
                {rotulo && <b className="font-semibold">{rotulo}</b>} {resto}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default EfeitosMoverList;
