'use client';

import dynamic from 'next/dynamic';
import type { PluggyConnectProps } from 'react-pluggy-connect';

/**
 * Widget Pluggy Connect carregado só no cliente e só quando aberto
 * (abre um modal/iframe de connect.pluggy.ai — hosts liberados na CSP pelo
 * middleware quando PLUGGY_HABILITADO=true).
 */
const PluggyConnect = dynamic(() => import('react-pluggy-connect').then((m) => m.PluggyConnect), {
  ssr: false,
});

export type PluggyConnectWidgetProps = Pick<
  PluggyConnectProps,
  | 'connectToken'
  | 'includeSandbox'
  | 'updateItem'
  | 'connectorIds'
  | 'selectedConnectorId'
  | 'products'
  | 'onSuccess'
  | 'onError'
  | 'onClose'
  | 'onOpen'
  | 'onEvent'
>;

/**
 * PWA fase 3: enquanto o widget está montado, o marcador `data-mf-overlay` esconde a casca mobile
 * (cabeçalho e barra de abas) pelo contrato do globals.css — o iframe do react-pluggy-connect
 * (position: fixed) fica em tela cheia, sem nada por cima. No desktop o marcador não muda nada.
 */
export default function PluggyConnectWidget(props: PluggyConnectWidgetProps) {
  return (
    <>
      <span data-mf-overlay="" hidden aria-hidden="true" />
      <PluggyConnect language="pt" countries={['BR']} {...props} />
    </>
  );
}
