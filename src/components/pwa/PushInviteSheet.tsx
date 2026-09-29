'use client';

import React, { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useCsrf } from '@/hooks/useCsrf';
import { detectIosBrowser, ondeFicaCompartilhar } from '@/hooks/useInstallPrompt';
import { assinarPush, isIosSemPwa, isPushSupported, permissaoAtual } from '@/lib/pwa/pushClient';

/**
 * Convite contextual de push (PWA fase 5, C1 do protótipo): depois de salvar um lembrete na
 * Agenda, o sheet "Receber lembretes no celular?" oferece ligar os avisos — é o momento de maior
 * valor, e o pedido de permissão do sistema só sai do clique em "Ativar avisos" (nunca na carga).
 * Em iOS/iPadOS sem o app instalado (isIosSemPwa) o sheet vira o passo a passo de instalação (C3);
 * `assinarPush` devolvendo 'erro' cai no MESMO passo a passo (fallback da crítica 8).
 *
 * "Agora não" silencia o convite por 14 dias NESTE aparelho (localStorage, com try/catch) sem
 * gastar a permissão do navegador. O cartão-convite no sino (C2) ficou FORA da v1 — decisão 2.
 */

export const PUSH_INVITE_ADIADO_KEY = 'mf-push-invite-adiado';
const ADIAMENTO_MS = 14 * 24 * 60 * 60 * 1000;

/** true = a pessoa pediu "Agora não" há menos de 14 dias (sem storage = não convida). */
export function conviteAdiado(): boolean {
  try {
    const valor = window.localStorage.getItem(PUSH_INVITE_ADIADO_KEY);
    if (!valor) return false;
    const quando = Number(valor);
    return Number.isFinite(quando) && Date.now() - quando < ADIAMENTO_MS;
  } catch {
    return true;
  }
}

function adiarConvite(): void {
  try {
    window.localStorage.setItem(PUSH_INVITE_ADIADO_KEY, String(Date.now()));
  } catch {
    // sem storage o convite já não aparece (conviteAdiado devolve true)
  }
}

/**
 * O convite vale a pena neste aparelho? Permissão ainda não pedida (ou iOS sem PWA, que ganha o
 * passo a passo de instalação) e sem adiamento recente. NUNCA pede permissão — só lê o estado.
 */
export function deveConvidarParaPush(): boolean {
  if (typeof window === 'undefined') return false;
  if (conviteAdiado()) return false;
  if (isIosSemPwa()) return true;
  return isPushSupported() && permissaoAtual() === 'default';
}

type Modo = 'convite' | 'instalar' | 'negado' | 'sucesso';

const TITULOS: Record<Modo, string> = {
  convite: 'Receber lembretes no celular?',
  instalar: 'Instale o app para receber avisos',
  negado: 'Receber lembretes no celular?',
  sucesso: 'Avisos ligados',
};

interface Props {
  aberto: boolean;
  onClose: () => void;
}

export default function PushInviteSheet({ aberto, onClose }: Props) {
  const { csrfFetch } = useCsrf();
  const [modo, setModo] = useState<Modo>('convite');
  const [ocupado, setOcupado] = useState(false);
  // undefined = carregando; null = push indisponível; string = pronta para assinar.
  const [chave, setChave] = useState<string | null | undefined>(undefined);

  // A chave VAPID é buscada na ABERTURA do sheet (nenhuma permissão é pedida aqui): no WebKit a
  // ativação transitória do gesto expira se houver rede entre o toque e o requestPermission.
  useEffect(() => {
    if (!aberto) return;
    setModo(isIosSemPwa() ? 'instalar' : 'convite');
    setOcupado(false);
    setChave(undefined);
    let cancelado = false;
    (async () => {
      let valor: string | null = null;
      try {
        const res = await fetch('/api/push/preferencias', { credentials: 'include' });
        const d = res.ok
          ? ((await res.json()) as { habilitado?: boolean; vapidPublicKey?: string | null })
          : null;
        valor = d?.habilitado ? (d.vapidPublicKey ?? null) : null;
      } catch {
        valor = null;
      }
      if (!cancelado) setChave(valor);
    })();
    return () => {
      cancelado = true;
    };
  }, [aberto]);

  const agoraNao = () => {
    adiarConvite();
    onClose();
  };

  /** Gesto do usuário: só aqui o requestPermission (dentro de assinarPush) acontece — SEM rede
   *  antes do prompt (a chave já chegou na abertura do sheet). */
  const ativar = async () => {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (!chave) {
        setModo('instalar');
        return;
      }
      const resultado = await assinarPush(chave, csrfFetch);
      if (resultado === 'ok') setModo('sucesso');
      else if (resultado === 'negado') setModo('negado');
      else setModo('instalar');
    } finally {
      setOcupado(false);
    }
  };

  /** Fechar o passo a passo também silencia por 14 dias (senão ele voltaria a cada lembrete). */
  const fechar = () => {
    if (modo === 'instalar') adiarConvite();
    onClose();
  };

  const btnPrimario =
    'flex min-h-12 flex-1 items-center justify-center rounded-xl bg-mf-patrimonio px-4 text-[15px] font-semibold text-white active:bg-mf-seguranca disabled:opacity-60';
  const btnNeutro =
    'flex min-h-12 flex-1 items-center justify-center rounded-xl border border-gray-300 px-4 text-[15px] font-medium text-gray-700 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200';

  return (
    <BottomSheet
      isOpen={aberto}
      onClose={fechar}
      title={TITULOS[modo]}
      footer={
        modo === 'convite' ? (
          // "Agora não" primeiro no DOM (foco inicial fica no painel, nunca no primário).
          <div className="flex gap-2" data-push-invite-acoes="">
            <button type="button" onClick={agoraNao} disabled={ocupado} className={btnNeutro}>
              Agora não
            </button>
            <button
              type="button"
              onClick={() => void ativar()}
              // Desabilitado enquanto a chave não chega: clicar sem ela cairia no passo a passo
              // de instalação à toa (a busca dura o tempo de abrir o sheet).
              disabled={ocupado || chave === undefined}
              className={btnPrimario}
            >
              {ocupado ? 'Ativando…' : 'Ativar avisos'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={fechar} className={btnPrimario}>
            {modo === 'sucesso' ? 'Fechar' : 'Entendi'}
          </button>
        )
      }
    >
      <div data-push-invite={modo} className="pb-2">
        {modo === 'convite' ? (
          <>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              Você acabou de criar um lembrete. Se quiser, o aviso chega <b>neste aparelho</b> na
              hora certa, mesmo com o app fechado.
            </p>
            {/* Prévia no formato REAL do payload: título sem R$ + corpo genérico. */}
            <div
              aria-hidden="true"
              className="mt-3.5 flex items-center gap-3 rounded-xl bg-gray-100 p-3 dark:bg-white/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mf-seguranca text-[13px] font-bold text-white">
                MF
              </span>
              <span className="flex min-w-0 flex-col">
                <b className="truncate text-[13.5px] font-semibold text-gray-800 dark:text-white/90">
                  Lembrete: IPTU parcela 9
                </b>
                <small className="text-xs text-gray-500 dark:text-gray-400">
                  Toque para ver os detalhes na agenda.
                </small>
              </span>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Sem valores em R$ na tela bloqueada. Dá para desligar quando quiser em Perfil ›
              Notificações.
            </p>
          </>
        ) : null}

        {modo === 'instalar' ? (
          <>
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              No iPhone e iPad, o Safari só entrega notificações de apps{' '}
              <b>instalados na Tela de Início</b> (iOS 16.4 ou mais novo). Leva menos de um minuto:
            </p>
            <ol className="mt-3 flex flex-col gap-2.5">
              {[
                <React.Fragment key="1">
                  Toque em <b className="font-semibold">Compartilhar</b>{' '}
                  {ondeFicaCompartilhar(detectIosBrowser(globalThis.navigator))}
                </React.Fragment>,
                <React.Fragment key="2">
                  Escolha <b className="font-semibold">Adicionar à Tela de Início</b> e confirme
                </React.Fragment>,
                <React.Fragment key="3">
                  Abra pelo ícone <b className="font-semibold">My Finance</b> e ative os avisos em
                  Perfil › Notificações
                </React.Fragment>,
              ].map((passo, i) => (
                <li
                  key={i}
                  className="flex min-h-11 items-center gap-3 text-sm leading-snug text-gray-700 dark:text-gray-200"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mf-outside/10 text-[13px] font-semibold text-mf-patrimonio dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade">
                    {i + 1}
                  </span>
                  <span>{passo}</span>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        {modo === 'negado' ? (
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200" role="status">
            O navegador ficou sem permissão para avisos. Veja como reverter em{' '}
            <b>Perfil › Notificações</b> — enquanto isso, tudo continua chegando no sino.
          </p>
        ) : null}

        {modo === 'sucesso' ? (
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200" role="status">
            Avisos ligados <b>neste aparelho</b>. Os lembretes da Agenda chegam na hora certa, e dá
            para ajustar as categorias em Perfil › Notificações.
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
