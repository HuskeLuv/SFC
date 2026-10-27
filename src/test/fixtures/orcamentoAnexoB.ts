/**
 * Massa do Anexo B da spec do Orçamento v2 (ticket 86e3v8p3u): outubro/2026, referência dia 23,
 * receita prevista R$ 24.000,00, 13 categorias e 82 subcategorias (Investimentos fora, D12).
 * Os valores são os do protótipo; os esperados por linha (status e % consumido) também vêm do
 * Anexo B, menos o R-08 revisto em 27/10 (laranja assim que passa do traço, piso de 80%): Mercado,
 * Combustível e Estacionamento (80–83% com o mês em 74%) viraram "à frente". Erros aritméticos da spec (D1–D5: 87 subs, 14 categorias, T06, T35) NÃO estão aqui —
 * ver o Apêndice C do desenho técnico. Fixa = coluna "Flag"; Planejamento é sempre fixa (R-07).
 */

import type { StatusOrcamento } from '@/lib/orcamento/regras';

export const ANEXO_B_RECEITA = 24_000;
export const ANEXO_B_HOJE = { ano: 2026, mes0: 9, dia: 23 } as const;

export interface SubAnexoB {
  nome: string;
  fixa: boolean;
  geral: boolean;
  valor: number | null;
  pct: number | null;
  realizado: number;
  /** Esperados do Anexo B. */
  esperado: { status: StatusOrcamento; consumidoPct: number | null };
}

export interface CategoriaAnexoB {
  nome: string;
  poupanca: boolean;
  subcategorias: SubAnexoB[];
  /** Linha da categoria no Anexo B. */
  esperado: {
    orcado: number;
    realizado: number;
    diferenca: number;
    consumidoPct: number | null;
    status: StatusOrcamento;
    qtdEstouro: number;
    qtdAFrente: number;
  };
}

type Linha = [
  nome: string,
  fixa: boolean,
  orcado: number,
  realizado: number,
  status: StatusOrcamento,
  consumidoPct: number | null,
];

const ok = 'ok' as const;
const bad = 'bad' as const;
const warn = 'warn' as const;
const none = 'none' as const;

/** Geral (padrão) com orçado/realizado da linha; status derivado como no Anexo B. */
const geral = (
  orcado = 0,
  realizado = 0,
  status: StatusOrcamento = none,
  consumidoPct: number | null = null,
): Linha => ['Geral', false, orcado, realizado, status, consumidoPct];

function categoria(
  nome: string,
  linhas: Linha[],
  esperado: CategoriaAnexoB['esperado'],
  poupanca = false,
): CategoriaAnexoB {
  return {
    nome,
    poupanca,
    esperado,
    subcategorias: linhas.map(([n, fixa, orcado, realizado, status, consumidoPct]) => ({
      nome: n,
      fixa: fixa || poupanca,
      geral: n === 'Geral',
      valor: orcado,
      pct: null,
      realizado,
      esperado: { status, consumidoPct },
    })),
  };
}

export const ANEXO_B: CategoriaAnexoB[] = [
  categoria(
    'Habitação',
    [
      ['Aluguel / Financiamento', true, 2400, 2400, ok, 100],
      ['Condomínio', true, 450, 450, ok, 100],
      ['Energia', true, 220, 198.4, ok, 90],
      ['Água', true, 90, 84.2, ok, 94],
      ['Gás', true, 60, 0, ok, 0],
      ['Internet / TV', true, 150, 149.9, ok, 100],
      ['Mercado', false, 1400, 1126.3, warn, 80],
      ['Diarista', true, 480, 360, ok, 75],
      geral(),
    ],
    {
      orcado: 5250,
      realizado: 4768.8,
      diferenca: 481.2,
      consumidoPct: 91,
      status: warn,
      qtdEstouro: 0,
      qtdAFrente: 1,
    },
  ),
  categoria(
    'Transporte',
    [
      ['Parcela do carro', true, 1100, 1100, ok, 100],
      ['Combustível', false, 500, 412.6, warn, 83],
      ['Seguro', true, 180, 180, ok, 100],
      ['IPVA / Licenciamento', true, 150, 0, ok, 0],
      ['Manutenção', false, 120, 0, ok, 0],
      ['Estacionamento / Pedágio', false, 80, 64, warn, 80],
      ['Uber / 99', false, 100, 138.4, bad, 138],
      geral(),
    ],
    {
      orcado: 2230,
      realizado: 1895,
      diferenca: 335,
      consumidoPct: 85,
      status: warn,
      qtdEstouro: 1,
      qtdAFrente: 2,
    },
  ),
  categoria(
    'Saúde',
    [
      ['Plano de saúde', true, 890, 890, ok, 100],
      ['Médicos', false, 150, 0, ok, 0],
      ['Terapeuta', true, 480, 360, ok, 75],
      ['Nutricionista', true, 200, 200, ok, 100],
      ['Exames', false, 80, 0, ok, 0],
      ['Farmácia', false, 120, 143.7, bad, 120],
      ['Academia', true, 130, 130, ok, 100],
      geral(),
    ],
    {
      orcado: 2050,
      realizado: 1723.7,
      diferenca: 326.3,
      consumidoPct: 84,
      status: ok,
      qtdEstouro: 1,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Educação',
    [
      ['Inglês', true, 500, 500, ok, 100],
      ['Cursos', true, 39.9, 39.9, ok, 100],
      ['MBA', true, 1500, 1500, ok, 100],
      ['Material', false, 50, 0, ok, 0],
      ['Consultoria financeira', false, 0, 0, none, null],
      geral(),
    ],
    {
      orcado: 2089.9,
      realizado: 2039.9,
      diferenca: 50,
      consumidoPct: 98,
      status: ok,
      qtdEstouro: 0,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Animais de estimação',
    [
      ['Ração', false, 180, 176.5, warn, 98],
      ['Veterinário', false, 80, 0, ok, 0],
      ['Banho e tosa', true, 120, 120, ok, 100],
      ['Plano pet', true, 70, 70, ok, 100],
      geral(),
    ],
    {
      orcado: 450,
      realizado: 366.5,
      diferenca: 83.5,
      consumidoPct: 81,
      status: warn,
      qtdEstouro: 0,
      qtdAFrente: 1,
    },
  ),
  categoria(
    'Despesas pessoais',
    [
      ['Vestuário', false, 250, 312.9, bad, 125],
      ['Cabeleireiro / Barbearia', true, 90, 90, ok, 100],
      ['Cosméticos', false, 80, 45, ok, 56],
      ['Celular', true, 70, 69.9, ok, 100],
      ['Assinaturas (streaming)', true, 95, 95.8, bad, 101],
      ['Presentes', false, 100, 0, ok, 0],
      geral(),
    ],
    {
      orcado: 685,
      realizado: 613.6,
      diferenca: 71.4,
      consumidoPct: 90,
      status: ok,
      qtdEstouro: 2,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Lazer',
    [
      ['Restaurantes', false, 500, 468, warn, 94],
      ['Delivery / iFood', false, 300, 334.5, bad, 112],
      ['Bar / Cafés', false, 200, 172, warn, 86],
      ['Cinema / Shows', false, 100, 0, ok, 0],
      ['Passeios', false, 100, 60, ok, 60],
      ['Livros / Revistas', true, 80, 80, ok, 100],
      geral(),
    ],
    {
      orcado: 1280,
      realizado: 1114.5,
      diferenca: 165.5,
      consumidoPct: 87,
      status: warn,
      qtdEstouro: 1,
      qtdAFrente: 2,
    },
  ),
  categoria(
    'Impostos',
    [
      ['IPTU', true, 180, 180, ok, 100],
      ['IR (provisão do ajuste anual)', true, 150, 0, ok, 0],
      ['Taxas e certidões', false, 20, 0, ok, 0],
      geral(),
    ],
    {
      orcado: 350,
      realizado: 180,
      diferenca: 170,
      consumidoPct: 51,
      status: ok,
      qtdEstouro: 0,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Despesas com dependentes',
    [
      ['Escola', true, 0, 0, none, null],
      ['Babá', true, 0, 0, none, null],
      ['Atividades', false, 0, 0, none, null],
      ['Mesada', true, 0, 0, none, null],
      geral(),
    ],
    {
      orcado: 0,
      realizado: 0,
      diferenca: 0,
      consumidoPct: null,
      status: none,
      qtdEstouro: 0,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Despesas Empresa',
    [
      ['Contador', true, 350, 350, ok, 100],
      ['Softwares', true, 120, 118.6, ok, 99],
      ['Marketing', false, 0, 0, none, null],
      ['Impostos PJ', false, 0, 0, none, null],
      geral(),
    ],
    {
      orcado: 470,
      realizado: 468.6,
      diferenca: 1.4,
      consumidoPct: 100,
      status: ok,
      qtdEstouro: 0,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Despesas Financeiras',
    [
      ['Tarifas bancárias', true, 30, 30, ok, 100],
      ['Anuidade do cartão', true, 40, 40, ok, 100],
      ['Juros / IOF', false, 0, 12.4, bad, null],
      ['Seguro de vida', true, 110, 110, ok, 100],
      geral(),
    ],
    {
      orcado: 180,
      realizado: 192.4,
      diferenca: -12.4,
      consumidoPct: 107,
      status: bad,
      qtdEstouro: 1,
      qtdAFrente: 0,
    },
  ),
  categoria(
    'Planejamento Financeiro',
    [
      ['Viagem Japão 2028', false, 710, 710, ok, 100],
      ['Entrada apartamento', false, 1500, 1500, ok, 100],
      ['Viagem praia dez/26', false, 500, 500, ok, 100],
      ['Reserva de emergência', false, 0, 0, none, null],
      geral(),
    ],
    {
      orcado: 2710,
      realizado: 2710,
      diferenca: 0,
      consumidoPct: 100,
      status: ok,
      qtdEstouro: 0,
      qtdAFrente: 0,
    },
    true,
  ),
  categoria(
    'Despesas Variáveis',
    [
      ['Manutenção e reparos', false, 100, 0, ok, 0],
      ['Móveis e decoração', false, 0, 0, none, null],
      ['Anuidades (OAB, CRM, CRP…)', false, 0, 0, none, null],
      ['Contador IR PF', false, 0, 0, none, null],
      ['Presentes do mês', false, 0, 0, none, null],
      ['Utilidades domésticas', false, 50, 38, ok, 76],
      ['Papelaria', false, 20, 0, ok, 0],
      geral(100, 65, ok, 65),
    ],
    {
      orcado: 270,
      realizado: 103,
      diferenca: 167,
      consumidoPct: 38,
      status: ok,
      qtdEstouro: 0,
      qtdAFrente: 0,
    },
  ),
];
