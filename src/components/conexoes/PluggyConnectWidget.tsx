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
  | 'products'
  | 'onSuccess'
  | 'onError'
  | 'onClose'
  | 'onOpen'
  | 'onEvent'
>;

export default function PluggyConnectWidget(props: PluggyConnectWidgetProps) {
  return <PluggyConnect language="pt" countries={['BR']} {...props} />;
}
