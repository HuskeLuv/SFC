'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useCsrf } from '@/hooks/useCsrf';
import {
  COOKIE_VALORES_OCULTOS,
  MAX_AGE_VALORES_OCULTOS,
  mascararTexto,
} from '@/utils/valoresOcultos';

/**
 * Esconder valores — estado do olho (por APARELHO, não por usuário: fica fora do AuthProvider e
 * vale igual durante a personificação do consultor).
 *
 * - O RootLayout lê o cookie e a flag e já entrega `<html data-valores-ocultos>` no SSR (sem
 *   flash, sem script inline); o provider começa com o mesmo valor (`inicial`).
 * - Ao alternar: atributo no <html> e cookie de script na hora (otimista: um router.refresh antes
 *   do POST não volta ao estado velho), POST /api/preferencias/valores-ocultos via csrfFetch em
 *   segundo plano (o Set-Cookie do servidor vale 1 ano, inclusive no Safari/ITP), BroadcastChannel
 *   para as outras abas e anúncio para leitor de tela. Se o POST falhar (PWA offline), tenta de
 *   novo no evento 'online' ou no próximo clique — sem toast.
 * - `ativo` = flag ligada + olho fechado. É ele que <Sensivel> e o hook dos gráficos consultam;
 *   desde o fechamento da Fase 6 vale no app logado inteiro (não há mais rotas "não cobertas").
 */

const ROTA_PREFERENCIA = '/api/preferencias/valores-ocultos';
const CANAL = 'mf-valores-ocultos';

interface ValoresOcultosBase {
  /** Flag VALORES_OCULTOS_HABILITADO (desligada = tudo inerte, sem botão). */
  habilitado: boolean;
  /** Preferência do aparelho: olho fechado. */
  ocultos: boolean;
  alternar: () => void;
  definir: (ocultos: boolean) => void;
}

export interface ValoresOcultosValor extends ValoresOcultosBase {
  /** Valores devem virar pílula (flag + olho fechado). */
  ativo: boolean;
  /** `mascararTexto` quando ativo; identidade fora disso. */
  mascarar: (texto: string) => string;
}

const noop = () => {};
const identidade = (texto: string) => texto;

const PADRAO: ValoresOcultosBase = {
  habilitado: false,
  ocultos: false,
  alternar: noop,
  definir: noop,
};

const ValoresOcultosContext = createContext<ValoresOcultosBase>(PADRAO);

function gravarCookieOtimista(ocultos: boolean) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_VALORES_OCULTOS}=${ocultos ? '1' : ''}; Path=/; Max-Age=${
      ocultos ? MAX_AGE_VALORES_OCULTOS : 0
    }; SameSite=Lax${secure}`;
  } catch {
    // cookie bloqueado: o POST grava pelo servidor
  }
}

export function ValoresOcultosProvider({
  habilitado,
  inicial,
  children,
}: {
  habilitado: boolean;
  inicial: boolean;
  children: React.ReactNode;
}) {
  const { csrfFetch } = useCsrf();
  const [ocultos, setOcultos] = useState(habilitado && inicial);
  const [anuncio, setAnuncio] = useState('');
  /** O anúncio vai num portal no <body> (fora da árvore dos componentes), só depois de montar. */
  const [montado, setMontado] = useState(false);
  /** Preferência que ainda não chegou ao servidor (null = nada pendente). */
  const pendenteRef = useRef<boolean | null>(null);
  const canalRef = useRef<BroadcastChannel | null>(null);

  const enviar = useCallback(
    async (valor: boolean) => {
      pendenteRef.current = valor;
      try {
        const res = await csrfFetch(ROTA_PREFERENCIA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ocultos: valor }),
        });
        if (res.ok && pendenteRef.current === valor) pendenteRef.current = null;
      } catch {
        // offline: o retry fica no evento 'online'
      }
    },
    [csrfFetch],
  );

  useEffect(() => setMontado(true), []);

  // O atributo do <html> segue o estado (o SSR já o entrega certo; aqui cobre alternar e abas).
  useEffect(() => {
    if (!habilitado) return;
    document.documentElement.toggleAttribute('data-valores-ocultos', ocultos);
  }, [habilitado, ocultos]);

  useEffect(() => {
    if (!habilitado || typeof BroadcastChannel === 'undefined') return;
    const canal = new BroadcastChannel(CANAL);
    canal.onmessage = (event: MessageEvent) => {
      const valor = (event.data as { ocultos?: unknown } | null)?.ocultos;
      if (typeof valor === 'boolean') setOcultos(valor);
    };
    canalRef.current = canal;
    return () => {
      canal.close();
      canalRef.current = null;
    };
  }, [habilitado]);

  useEffect(() => {
    if (!habilitado) return;
    const aoVoltarOnline = () => {
      if (pendenteRef.current !== null) void enviar(pendenteRef.current);
    };
    window.addEventListener('online', aoVoltarOnline);
    return () => window.removeEventListener('online', aoVoltarOnline);
  }, [habilitado, enviar]);

  const definir = useCallback(
    (valor: boolean) => {
      if (!habilitado) return;
      setOcultos(valor);
      document.documentElement.toggleAttribute('data-valores-ocultos', valor);
      gravarCookieOtimista(valor);
      setAnuncio(valor ? 'Valores ocultos' : 'Valores visíveis');
      try {
        canalRef.current?.postMessage({ ocultos: valor });
      } catch {
        // canal fechado: as outras abas pegam o cookie na próxima navegação
      }
      void enviar(valor);
    },
    [habilitado, enviar],
  );

  const alternar = useCallback(() => definir(!ocultos), [definir, ocultos]);

  const valor = useMemo<ValoresOcultosBase>(
    () => ({ habilitado, ocultos: habilitado && ocultos, alternar, definir }),
    [habilitado, ocultos, alternar, definir],
  );

  return (
    <ValoresOcultosContext.Provider value={valor}>
      {children}
      {habilitado && montado
        ? createPortal(
            <div role="status" aria-live="polite" className="sr-only" data-mf-anuncio-valores="">
              {anuncio}
            </div>,
            document.body,
          )
        : null}
    </ValoresOcultosContext.Provider>
  );
}

/** Estado do olho. Fora do provider devolve o padrão inerte (nada esconde, não lança erro). */
export function useValoresOcultos(): ValoresOcultosValor {
  const base = useContext(ValoresOcultosContext);
  const ativo = base.habilitado && base.ocultos;
  return useMemo(
    () => ({ ...base, ativo, mascarar: ativo ? mascararTexto : identidade }),
    [base, ativo],
  );
}
