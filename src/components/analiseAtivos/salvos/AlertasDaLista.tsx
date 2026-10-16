'use client';

/**
 * AlertasDaLista (bloco 1, fatia D) — modal "Alertas da lista "<nome>"" com os 3 avisos neutros:
 * Resultado entregue à CVM, Provento anunciado (data-com) e Mudança na contagem de critérios,
 * 5 anos (este vem desligado). Só é montado com recursos.alertas (fatia C).
 *
 * - ModalAnalise: diálogo no computador, BottomSheet + useMobileHistoryLayer no celular.
 * - Cada interruptor é um <button role="switch" aria-checked> com área de toque de 44 px NO PRÓPRIO
 *   elemento (min-h-11 min-w-11); rótulo e descrição ligados por aria-labelledby/-describedby.
 * - "Salvar alertas" → PATCH /listas/[id] (useAtualizarAlertasLista) só com o que mudou; sem
 *   mudança, fecha. Toast "Alertas de X salvos." (ou "desligados." quando os 3 ficam desligados).
 * - Texto fixo: o literal 'aviso-salvos-alertas' (data-texto-legal, pendente de jurídico) +
 *   TEXTOS_ALERTAS.daLista.rodape ("por volta das 8h").
 */
import { useEffect, useId, useState } from 'react';
import ModalAnalise, {
  BOTAO_MODAL_PRIMARIO,
  BOTAO_MODAL_SECUNDARIO,
  FOCO_MODAL,
  SUBTITULO_MODAL,
} from '@/components/analiseAtivos/ativo/acoes/ModalAnalise';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import { useAtualizarAlertasLista } from '@/hooks/useAnaliseAtivosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_ALERTAS } from '@/services/analiseAtivos/textosAlertas';
import { textoLiteral } from '@/services/analiseAtivos/textosLiterais';
import type { AlertasDaListaProps, AlertasLista } from '@/types/analiseAtivosSalvos';

export type { AlertasDaListaProps };

const T = TEXTOS_ALERTAS.daLista;
const TIPOS = ['resultado', 'provento', 'criterios'] as const;
export const ID_LITERAL_AVISO_SALVOS = 'aviso-salvos-alertas';

/** Interruptor 44×44 (trilho 40×24 visível) — ligado = patrimônio; foco visível. */
export function Interruptor({
  ligado,
  onAlternar,
  rotuloId,
  descricaoId,
  desabilitado = false,
  dataAttr,
}: {
  ligado: boolean;
  onAlternar: () => void;
  rotuloId: string;
  descricaoId?: string;
  desabilitado?: boolean;
  dataAttr?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-labelledby={rotuloId}
      aria-describedby={descricaoId}
      disabled={desabilitado}
      onClick={onAlternar}
      data-interruptor={dataAttr ?? ''}
      className={`group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50 ${FOCO_MODAL}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-10 rounded-full transition-colors motion-reduce:transition-none ${
          ligado ? 'bg-[#396CAA] dark:bg-[#6E9DC4]' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow motion-safe:transition-transform ${
            ligado ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function iguais(a: AlertasLista, b: AlertasLista): boolean {
  return TIPOS.every((k) => a[k] === b[k]);
}

export default function AlertasDaLista({ aberto, lista, onFechar, onSalvo }: AlertasDaListaProps) {
  const atualizar = useAtualizarAlertasLista();
  const [valores, setValores] = useState<AlertasLista>(lista.alertas);
  const [erro, setErro] = useState('');
  const base = useId();

  // Reabre com o que está gravado (deps primitivas: o objeto muda a cada render do pai).
  const { resultado, provento, criterios } = lista.alertas;
  useEffect(() => {
    if (!aberto) return;
    setValores({ resultado, provento, criterios });
    setErro('');
  }, [aberto, resultado, provento, criterios]);

  const salvar = async () => {
    if (atualizar.isPending) return;
    if (iguais(valores, lista.alertas)) {
      onFechar();
      return;
    }
    const mudou: Partial<AlertasLista> = {};
    for (const k of TIPOS) if (valores[k] !== lista.alertas[k]) mudou[k] = valores[k];
    setErro('');
    try {
      const r = await atualizar.mutateAsync({ id: lista.id, alertas: mudou });
      const nenhum = TIPOS.every((k) => !r.alertas[k]);
      mostrarToastSalvo({
        tipo: 'info',
        mensagem: formatarTexto(nenhum ? T.toastDesligados : T.toastSalvos, { lista: r.nome }),
      });
      onSalvo?.(r);
      onFechar();
    } catch {
      setErro(T.erro);
    }
  };

  const subtitulo =
    lista.totalAtivos === 1 ? T.subtituloUm : formatarTexto(T.subtituloN, { n: lista.totalAtivos });

  const rodape = (
    <>
      <span className="min-w-0 flex-1" />
      <button type="button" onClick={onFechar} className={BOTAO_MODAL_SECUNDARIO}>
        {T.cancelar}
      </button>
      <button
        type="button"
        onClick={() => void salvar()}
        disabled={atualizar.isPending}
        aria-busy={atualizar.isPending || undefined}
        className={BOTAO_MODAL_PRIMARIO}
        data-alertas-lista-salvar=""
      >
        {atualizar.isPending ? T.salvando : T.salvar}
      </button>
    </>
  );

  return (
    <ModalAnalise
      aberto={aberto}
      onFechar={onFechar}
      titulo={formatarTexto(T.titulo, { lista: lista.nome })}
      rodape={rodape}
    >
      <div data-alertas-da-lista={lista.id} className="flex flex-col">
        <p className={SUBTITULO_MODAL}>{subtitulo}</p>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {TIPOS.map((k) => {
            const t = TEXTOS_ALERTAS.tipos[k];
            const rotuloId = `${base}-${k}-rotulo`;
            const descricaoId = `${base}-${k}-descricao`;
            return (
              <li key={k} className="flex items-center gap-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    id={rotuloId}
                    className="text-sm font-medium text-gray-800 dark:text-white/90"
                  >
                    {t.rotulo}
                  </span>
                  <span
                    id={descricaoId}
                    className="text-xs leading-[1.45] text-gray-500 dark:text-gray-400"
                  >
                    {t.descricao}
                  </span>
                </span>
                <Interruptor
                  ligado={valores[k]}
                  onAlternar={() => setValores((v) => ({ ...v, [k]: !v[k] }))}
                  rotuloId={rotuloId}
                  descricaoId={descricaoId}
                  dataAttr={k}
                />
              </li>
            );
          })}
        </ul>
        {erro ? (
          <p
            role="alert"
            className="mt-2 text-[13px] text-[#D92D20] dark:text-[#F97066]"
            data-alertas-lista-erro=""
          >
            {erro}
          </p>
        ) : null}
        <p
          data-texto-legal={ID_LITERAL_AVISO_SALVOS}
          className="mt-3 text-xs leading-[1.5] text-gray-500 dark:text-gray-400"
        >
          {textoLiteral(ID_LITERAL_AVISO_SALVOS)}
        </p>
        <p className="mt-1.5 text-xs leading-[1.5] text-gray-500 dark:text-gray-400">{T.rodape}</p>
      </div>
    </ModalAnalise>
  );
}
