'use client';

/**
 * Ordem do Quadro no celular: BottomSheet com rádios de 52px (colunas ordenáveis do modo atual +
 * Índice MF) e a direção (Maior/Menor primeiro). Diz que sem dado vai para o fim.
 * "Voltar" do sistema fecha o sheet (useMobileHistoryLayer); "Ver resultado" aplica a ordem só
 * depois de desfazer a entrada do histórico, para a URL nova não cair na entrada do sheet.
 */
import { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { DIRECAO_PADRAO } from '@/constants/analiseAtivosVisual';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, DirecaoOrdem, OrdemQuadro } from '@/types/analiseAtivosApi';

const T = TEXTOS_TELA.quadro;

export interface OpcaoOrdem {
  ordem: OrdemQuadro;
  rotulo: string;
}

export interface SheetOrdemProps {
  aberto: boolean;
  onFechar: () => void;
  classe: ClasseQuadro;
  opcoes: OpcaoOrdem[];
  ordem: OrdemQuadro;
  dir: DirecaoOrdem;
  onAplicar: (ordem: OrdemQuadro, dir: DirecaoOrdem) => void;
}

export default function SheetOrdem({
  aberto,
  onFechar,
  classe,
  opcoes,
  ordem,
  dir,
  onAplicar,
}: SheetOrdemProps) {
  const [sel, setSel] = useState({ ordem, dir });
  const { fecharEntao } = useMobileHistoryLayer(aberto, onFechar, useIsBelowLg());
  useEffect(() => {
    if (aberto) setSel({ ordem, dir });
  }, [aberto, ordem, dir]);

  const escolher = (o: OrdemQuadro) => setSel({ ordem: o, dir: DIRECAO_PADRAO[o] });
  const confirmar = () => {
    const { ordem: o, dir: d } = sel;
    fecharEntao(() => onAplicar(o, d));
  };

  return (
    <BottomSheet
      isOpen={aberto}
      onClose={onFechar}
      title={formatarTexto(T.ordenarTitulo, { classe: T.classesMinusculas[classe] })}
      footer={
        <button
          type="button"
          onClick={confirmar}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#314666] px-4 text-sm font-semibold text-white outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]"
        >
          {T.verResultado}
        </button>
      }
    >
      <div role="radiogroup" aria-label={T.ordem} className="flex flex-col gap-1 pb-2">
        {opcoes.map((o) => {
          const marcado = sel.ordem === o.ordem;
          return (
            <button
              key={o.ordem}
              type="button"
              role="radio"
              aria-checked={marcado}
              onClick={() => escolher(o.ordem)}
              className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] ${
                marcado ? 'bg-[#EDF2F8] dark:bg-[#6E9DC4]/15' : ''
              }`}
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                  {o.rotulo}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {DIRECAO_PADRAO[o.ordem] === 'asc' ? T.padraoMenor : T.padraoMaior}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  marcado
                    ? 'border-[#396CAA] dark:border-[#6E9DC4]'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {marcado ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#396CAA] dark:bg-[#6E9DC4]" />
                ) : null}
              </span>
            </button>
          );
        })}
        <div
          role="group"
          aria-label={T.direcao}
          className="mt-2 flex rounded-xl bg-gray-100 p-[3px] dark:bg-white/[0.06]"
        >
          {(['desc', 'asc'] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={sel.dir === d}
              onClick={() => setSel((x) => ({ ...x, dir: d }))}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] px-3 text-sm font-semibold ${
                sel.dir === d
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-[#26262A] dark:text-white'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {d === 'desc' ? T.maiorPrimeiroBotao : T.menorPrimeiroBotao}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{T.semDadoNoFim}</p>
      </div>
    </BottomSheet>
  );
}
