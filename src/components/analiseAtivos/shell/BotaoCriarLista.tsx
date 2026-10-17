'use client';

/**
 * "Criar lista" da casca (bloco 1, fatia C). Navy (#314666, hover #396CAA), só nas variantes
 * quadro/comparador/salvos e só com config.recursos.salvos (sem o recurso: null, casca igual à de
 * hoje). Não aparece na página do ativo (lá o único primário é Registrar, §3.2).
 *
 * - Abre o ModalNomeLista (fatia 0) e, ao criar, vai para /analise-ativos/salvos?lista=<id>.
 * - Modo consultor: desabilitado com o texto do protótipo no title (as listas são pessoais).
 * - Compacto: a 420 px ou menos vira botão de ícone de 44×44 (aria-label "Criar lista").
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ModalNomeLista from '@/components/analiseAtivos/salvos/compartilhados/ModalNomeLista';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { useListas } from '@/hooks/useAnaliseAtivosSalvos';
import { useAuth } from '@/hooks/useAuth';
import { ROTAS_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

/** Primário navy do bloco (o mesmo do Quadro). */
export const BOTAO_NAVY = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#314666] px-4 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#396CAA] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#314666] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900 ${FOCO}`;

export function IconeMais({ className = '' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface BotaoCriarListaProps {
  className?: string;
}

export default function BotaoCriarLista({ className = '' }: BotaoCriarListaProps) {
  const router = useRouter();
  const config = useAnaliseAtivosConfig();
  const { actingClient } = useAuth();
  const recursos = config.data?.recursos;
  const ligado = recursos?.salvos === true;
  const consultor = !!actingClient;
  const [aberto, setAberto] = useState(false);
  const listas = useListas({ enabled: ligado && !consultor && aberto });
  if (!ligado) return null;

  const t = TEXTOS_SALVOS.criarLista;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={consultor}
        title={consultor ? TEXTOS_SALVOS.consultor.titleListas : undefined}
        aria-label={t.aria}
        aria-haspopup="dialog"
        data-criar-lista=""
        className={`${BOTAO_NAVY} max-[420px]:w-11 max-[420px]:px-0 ${className}`}
      >
        <IconeMais />
        <span className="max-[420px]:hidden">{t.botao}</span>
      </button>
      {consultor ? null : (
        <ModalNomeLista
          aberto={aberto}
          modo="criar"
          onFechar={() => setAberto(false)}
          onConcluir={(lista) => {
            setAberto(false);
            router.push(ROTAS_SALVOS.paginaLista(lista.id));
          }}
          alertasLigados={recursos?.alertas === true}
          totalListas={listas.data?.listas.length}
          limites={listas.data?.limites}
        />
      )}
    </>
  );
}
