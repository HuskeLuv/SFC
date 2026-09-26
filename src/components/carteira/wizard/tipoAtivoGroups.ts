/**
 * Grupos dos tipos de ativo na etapa 1 do wizard no celular (PWA fase 1). Só agrupa: a lista, os
 * values e o onChange são os mesmos do Select do desktop (TIPOS_ATIVO, filtrado por
 * TIPOS_ATIVO_PLANEJAVEIS em "Planejar"). Tipo que não estiver aqui cai em "Outros".
 */

export interface TipoAtivoOption {
  value: string;
  label: string;
}

export interface TipoAtivoGrupo {
  id: string;
  label: string;
  values: readonly string[];
}

export const TIPO_ATIVO_GRUPO_OUTROS = 'outros';

export const TIPO_ATIVO_GRUPOS: readonly TipoAtivoGrupo[] = [
  { id: 'reservas', label: 'Reservas', values: ['reserva-emergencia', 'reserva-oportunidade'] },
  {
    id: 'renda-fixa',
    label: 'Renda fixa',
    values: ['renda-fixa', 'tesouro-direto', 'debenture', 'poupanca', 'conta-corrente'],
  },
  {
    id: 'renda-variavel',
    label: 'Renda variável no Brasil',
    values: ['acoes-brasil', 'fii', 'etf', 'fundo', 'opcoes'],
  },
  {
    id: 'exterior-cripto',
    label: 'Exterior e cripto',
    values: ['stock', 'reit', 'moeda', 'criptoativo'],
  },
  {
    id: TIPO_ATIVO_GRUPO_OUTROS,
    label: 'Outros',
    values: ['previdencia', 'imovel', 'personalizado'],
  },
];

export interface TipoAtivoGrupoComOpcoes {
  id: string;
  label: string;
  options: TipoAtivoOption[];
}

/**
 * Distribui as opções (na ordem dos grupos acima) e esconde grupos vazios. Valores desconhecidos
 * vão para "Outros", na ordem em que chegaram.
 */
export function groupTiposAtivo(options: readonly TipoAtivoOption[]): TipoAtivoGrupoComOpcoes[] {
  const byValue = new Map(options.map((o) => [o.value, o]));
  const known = new Set(TIPO_ATIVO_GRUPOS.flatMap((g) => g.values));
  const unknown = options.filter((o) => !known.has(o.value));

  return TIPO_ATIVO_GRUPOS.map((grupo) => {
    const listed = grupo.values
      .map((v) => byValue.get(v))
      .filter((o): o is TipoAtivoOption => o !== undefined);
    return {
      id: grupo.id,
      label: grupo.label,
      options: grupo.id === TIPO_ATIVO_GRUPO_OUTROS ? [...listed, ...unknown] : listed,
    };
  }).filter((g) => g.options.length > 0);
}
