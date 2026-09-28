'use client';

import React, { createContext, useContext } from 'react';

/**
 * Abrir os wizards de cadastro/resgate da carteira de qualquer ponto da /carteira (PWA fase 1).
 * Os wizards e o listener do "+ Lançar" vivem no `CarteiraTabs`, então funcionam também com a
 * Análise aberta. Fora do provider o hook devolve `undefined` (quem usa decide o fallback).
 */
export interface CarteiraLaunchValue {
  openAdd: () => void;
  openRedeem: () => void;
}

const CarteiraLaunchContext = createContext<CarteiraLaunchValue | undefined>(undefined);

export function CarteiraLaunchProvider({
  value,
  children,
}: {
  value: CarteiraLaunchValue;
  children: React.ReactNode;
}) {
  return <CarteiraLaunchContext.Provider value={value}>{children}</CarteiraLaunchContext.Provider>;
}

export const useCarteiraLaunch = (): CarteiraLaunchValue | undefined =>
  useContext(CarteiraLaunchContext);
