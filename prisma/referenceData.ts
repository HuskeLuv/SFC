import type { PrismaClient } from '@prisma/client';

/**
 * Catálogo canônico de instituições financeiras (bancos comerciais + corretoras/
 * DTVMs/plataformas) — fonte de referência ÚNICA. Usado tanto pelo seed completo
 * (`prisma/seed.ts`) quanto por um refresh isolado de dados de referência em
 * produção (este módulo não tem efeitos colaterais ao ser importado).
 *
 * Códigos seguem COMPE oficial quando o ente é regulado como instituição
 * financeira; CNPJ fica null quando a entidade legal varia/foi incorporada
 * (ex.: Easynvest → NuInvest é rebranding sob a mesma raiz XP).
 */
export const INSTITUTIONS: { code: string; name: string; cnpj: string | null; status: string }[] = [
  // ─── Bancos comerciais ───
  { code: '001', name: 'Banco do Brasil S.A.', cnpj: '00000000000191', status: 'ATIVO' },
  { code: '104', name: 'Caixa Econômica Federal', cnpj: '00360305000104', status: 'ATIVO' },
  { code: '237', name: 'Banco Bradesco S.A.', cnpj: '60746948000112', status: 'ATIVO' },
  { code: '341', name: 'Itaú Unibanco S.A.', cnpj: '60701190000104', status: 'ATIVO' },
  { code: '033', name: 'Banco Santander (Brasil) S.A.', cnpj: '90400888000142', status: 'ATIVO' },
  { code: '422', name: 'Banco Safra S.A.', cnpj: '58160789000128', status: 'ATIVO' },
  { code: '077', name: 'Banco Inter S.A.', cnpj: '00416968000101', status: 'ATIVO' },
  { code: '336', name: 'Banco C6 S.A.', cnpj: '31872495000172', status: 'ATIVO' },
  { code: '212', name: 'Banco Original S.A.', cnpj: '92894922000185', status: 'ATIVO' },
  { code: '623', name: 'Banco Pan S.A.', cnpj: '59285411000113', status: 'ATIVO' },
  { code: '707', name: 'Banco Daycoval S.A.', cnpj: '62232889000190', status: 'ATIVO' },
  { code: '246', name: 'Banco ABC Brasil S.A.', cnpj: '28195667000106', status: 'ATIVO' },
  { code: '655', name: 'Banco Votorantim S.A.', cnpj: '59588111000103', status: 'ATIVO' },
  { code: '318', name: 'Banco BMG S.A.', cnpj: '61186680000174', status: 'ATIVO' },
  {
    code: '756',
    name: 'Banco Cooperativo do Brasil S.A. (Sicoob)',
    cnpj: '02038232000164',
    status: 'ATIVO',
  },
  {
    code: '748',
    name: 'Banco Cooperativo Sicredi S.A.',
    cnpj: '01181521000155',
    status: 'ATIVO',
  },

  // ─── Corretoras / DTVMs / Plataformas ───
  { code: '102', name: 'XP Investimentos CCTVM', cnpj: '02332886000104', status: 'ATIVO' },
  { code: '380', name: 'Rico Investimentos', cnpj: '02332886000104', status: 'ATIVO' },
  { code: '208', name: 'BTG Pactual (Digital/CTVM)', cnpj: '30306294000145', status: 'ATIVO' },
  { code: '746', name: 'Banco Modal / Modalmais', cnpj: '30723886000130', status: 'ATIVO' },
  { code: '278', name: 'Genial Investimentos CTVM', cnpj: '27652684000162', status: 'ATIVO' },
  { code: '107', name: 'Terra Investimentos DTVM', cnpj: '03751794000113', status: 'ATIVO' },
  { code: '325', name: 'Órama DTVM', cnpj: '13293225000125', status: 'ATIVO' },
  { code: '508', name: 'Avenue Securities DTVM', cnpj: '24933830000130', status: 'ATIVO' },
  {
    code: '260',
    name: 'NuInvest (ex-Easynvest)',
    cnpj: '62169875000179',
    status: 'ATIVO',
  },
  { code: '477', name: 'Citibank N.A. Brasil', cnpj: null, status: 'ATIVO' },
  { code: '655-IC', name: 'BV Investimentos (Banco Votorantim)', cnpj: null, status: 'ATIVO' },
  { code: '102-CL', name: 'Clear Corretora (Grupo XP)', cnpj: '02332886000104', status: 'ATIVO' },
];

/**
 * Upsert idempotente do catálogo de instituições (por `codigo`). Seguro de rodar
 * em produção a qualquer momento: não toca em dados de usuário, só na tabela de
 * referência. Retorna a quantidade de instituições no catálogo.
 */
export async function seedInstitutions(prisma: PrismaClient): Promise<number> {
  for (const institution of INSTITUTIONS) {
    const statusEnum = institution.status === 'ATIVO' ? 'ATIVA' : 'INATIVA';

    await prisma.institution.upsert({
      where: { codigo: institution.code },
      update: {
        nome: institution.name,
        cnpj: institution.cnpj,
        status: statusEnum,
      },
      create: {
        codigo: institution.code,
        nome: institution.name,
        cnpj: institution.cnpj,
        status: statusEnum,
      },
    });
  }

  return INSTITUTIONS.length;
}
