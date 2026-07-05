import { z } from 'zod';
import { NextResponse } from 'next/server';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './passwordRequirements';

// ── Reusable primitives ───────────────────────────────────────────────

/** Trimmed non-empty string, capped at `max` characters. */
export const zString = (max = 255) => z.string().trim().min(1).max(max);

/** Optional trimmed string (may be empty → coerced to undefined). */
export const zOptionalString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** UUID v4 string. */
export const zUuid = z.string().uuid();

/** Positive finite number (suitable for monetary values). */
export const zPositiveNumber = z.number().finite().positive();

/** Non-negative finite number. */
export const zNonNegativeNumber = z.number().finite().nonnegative();

/** Number between 0 and 100 (percentage). */
export const zPercentage = z.number().finite().min(0).max(100);

/** Date string that can be parsed into a valid Date. */
export const zDateString = z.string().refine(
  (v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime());
  },
  { message: 'Data inválida' },
);

/** Email – trimmed and lowercased. */
export const zEmail = z.string().trim().toLowerCase().email();

/** Boolean that also accepts absent values (defaults to `false`). */
export const zOptionalBoolean = z.boolean().optional().default(false);

// ── Auth schemas ──────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, 'Senha é obrigatória'),
  rememberMe: z.boolean().optional(),
  // LGPD #12: TOTP opcional no payload. Quando o user tem 2FA ativo
  // a primeira tentativa sem código retorna 401 com totpRequired=true
  // pra UI mostrar o campo; o cliente reenvia com `totpCode`.
  totpCode: z
    .string()
    .regex(/^\d{6}$/, 'Código TOTP deve ter 6 dígitos')
    .optional(),
});

/**
 * Política de senha (LGPD ATENÇÃO): mínimo 8 caracteres + ao menos uma
 * letra minúscula, uma maiúscula, um dígito e um símbolo. Pega os erros
 * mais comuns (senhas só de letras ou só de números, 12345, etc.) e exige
 * complexidade de caracteres.
 */
// Os requisitos (min length, minúscula, maiúscula, dígito, símbolo) vivem em
// `passwordRequirements.ts` como fonte única — o SignUpForm usa a mesma lista
// pra mostrar o checklist.
export const passwordPolicy = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, 'Senha muito longa')
  .regex(/[a-z]/, 'Senha precisa conter pelo menos uma letra minúscula')
  .regex(/[A-Z]/, 'Senha precisa conter pelo menos uma letra maiúscula')
  .regex(/\d/, 'Senha precisa conter pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'Senha precisa conter pelo menos um símbolo');

export const registerSchema = z.object({
  email: zEmail,
  password: passwordPolicy,
  name: zString(255),
  // LGPD #5 (Fase 2): aceite explícito dos Termos + Política. Sem isso o
  // consentimento é juridicamente inválido (Art. 8º §1º).
  acceptedTerms: z.literal(true, {
    message: 'Aceite os Termos de Uso e a Política de Privacidade.',
  }),
  // Versão dos documentos aceitos. Cada release de política/termos sobe
  // este número e usuários ativos são pedidos a re-consentir.
  termsVersion: z.string().min(1).max(20).default('1.0'),
  privacyVersion: z.string().min(1).max(20).default('1.0'),
});

// ── Portfolio objetivo schema ─────────────────────────────────────────

export const objetivoSchema = z.object({
  ativoId: zString(255),
  objetivo: zPercentage,
});

// ── Aporte schema ─────────────────────────────────────────────────────

export const aporteSchema = z.object({
  portfolioId: zString(255),
  dataAporte: zDateString,
  valorAporte: zPositiveNumber,
  tipoAtivo: z.string().optional(),
  instituicaoId: z.string().optional(),
});

// ── Resgate schema ────────────────────────────────────────────────────

export const resgateSchema = z.object({
  portfolioId: zString(255),
  dataResgate: zDateString,
  metodoResgate: z.enum(['quantidade', 'valor']),
  quantidade: z.number().finite().optional(),
  cotacaoUnitaria: z.number().finite().optional(),
  valorResgate: z.number().finite().optional(),
  instituicaoId: z.string().optional(),
  observacoes: z.string().max(1000).optional(),
});

// ── Cashflow update (PATCH) schema ────────────────────────────────────

export const cashflowUpdateSchema = z.object({
  operation: z.enum(['create', 'update', 'delete']),
  type: z.enum(['group', 'item']),
  id: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

// ── Cashflow batch-update (PUT) schema ────────────────────────────────

export const cashflowBatchUpdateSchema = z.object({
  groupId: zString(255),
  // Ano da planilha; opcional p/ retrocompat (default = ano atual no handler).
  year: z.number().int().min(2000).max(2100).optional(),
  updates: z
    .array(
      z.object({
        itemId: zString(255),
        name: z.string().max(255).optional(),
        significado: z.string().max(1000).nullable().optional(),
        rank: z.string().max(255).nullable().optional(),
        values: z
          .array(
            z.object({
              month: z.number().int().min(0).max(11),
              value: z.number().finite(),
              color: z.string().max(50).nullable().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  deletes: z.array(z.string()).optional(),
});

// stockTransactionSchema / watchlistAddSchema removidos na Sprint 5B
// (consolidação Stock → Asset). Substitutos: /api/carteira/operacao
// (Zod inline) e /api/carteira/watchlist (TBD).

// ── Consultant acting schema ──────────────────────────────────────────

export const consultantActingSchema = z.object({
  clientId: zString(255),
});

// ── Consultant invitation schema ──────────────────────────────────────

export const consultantInvitationSchema = z.object({
  email: zEmail,
});

// ── Consultant invitation respond schema ──────────────────────────────

export const invitationRespondSchema = z.object({
  action: z.enum(['accept', 'reject']),
  notificationId: z.string().optional(),
});

// ── Cashflow items (POST) schema ──────────────────────────────────────

export const cashflowItemCreateSchema = z.object({
  groupId: zString(255),
  descricao: z.string().max(255).optional(),
  name: z.string().max(255).optional(),
  significado: z.string().max(1000).optional(),
});

// ── Cashflow values (PATCH) schema ────────────────────────────────────

export const cashflowValuePatchSchema = z.object({
  itemId: zString(255),
  field: z.string().min(1).max(50),
  value: z.unknown(),
  monthIndex: z.number().int().min(0).max(11).optional(),
  // Ano da planilha; opcional p/ retrocompat (default = ano atual no handler).
  year: z.number().int().min(2000).max(2100).optional(),
});

// ── Cashflow comments (PATCH) schema ──────────────────────────────────

export const cashflowCommentSchema = z.object({
  itemId: zString(255),
  month: z.number().int().min(0).max(11),
  year: z.number().int().min(2000).max(2100),
  comment: z.string().max(1000).nullable().optional(),
});

// ── Cashflow [id] PATCH schema ────────────────────────────────────────

export const cashflowIdPatchSchema = z.object({
  data: z.string().optional(),
  tipo: z.string().max(100).optional(),
  categoria: z.string().max(100).optional(),
  descricao: z.string().max(1000).optional(),
  valor: z.number().finite().optional(),
  forma_pagamento: z.string().max(100).optional(),
  pago: z.boolean().optional(),
});

// ── Carteira investimento (POST) schema ───────────────────────────────

export const investimentoCreateSchema = z.object({
  name: z.string().max(255).optional(),
  descricao: z.string().max(255).optional(),
  significado: z.string().max(1000).optional(),
  valor: zPositiveNumber,
});

// ── Carteira imoveis-bens (POST) schema ───────────────────────────────

export const imoveisBensPostSchema = z.object({
  ativoId: zString(255),
});

// ── Carteira imoveis-bens valor-atualizado (POST) schema ──────────────

export const valorAtualizadoImovelSchema = z.object({
  portfolioId: zString(255),
  novoValor: zPositiveNumber,
});

// ── Carteira configuracao (PUT) schema ────────────────────────────────

export const alocacaoConfigSchema = z.object({
  configuracoes: z.array(
    z.object({
      categoria: zString(100),
      minimo: zNonNegativeNumber,
      maximo: zNonNegativeNumber,
      target: zNonNegativeNumber,
      descricao: z.string().max(1000).optional(),
    }),
  ),
});

// ── Proventos (POST) schema ───────────────────────────────────────────

export const proventoCreateSchema = z.object({
  tipo: z.string().max(100).optional(),
  dataCom: zDateString,
  dataPagamento: zDateString,
  precificarPor: z.enum(['quantidade', 'valor']).optional(),
  valorTotal: z.number().finite().nonnegative(),
  quantidadeBase: z.number().finite().nonnegative(),
  impostoRenda: z.number().finite().nonnegative().nullable().optional(),
});

// ── Proventos (PATCH) schema ──────────────────────────────────────────

export const proventoPatchSchema = z.object({
  tipo: z.string().max(100).optional(),
  dataCom: zDateString.optional(),
  dataPagamento: zDateString.optional(),
  precificarPor: z.enum(['quantidade', 'valor']).optional(),
  valorTotal: z.number().finite().nonnegative().optional(),
  quantidadeBase: z.number().finite().nonnegative().optional(),
  impostoRenda: z.number().finite().nonnegative().nullable().optional(),
});

// ── Transaction PATCH schema ──────────────────────────────────────────

export const transactionPatchSchema = z.object({
  quantity: z.number().finite().optional(),
  price: z.number().finite().optional(),
  total: z.number().finite().optional(),
  date: zDateString.optional(),
  fees: z.number().finite().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

// ── Notifications PATCH schema ────────────────────────────────────────

export const notificationsPatchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

// ── Benchmark ingest (POST) schema ────────────────────────────────────

export const benchmarkIngestSchema = z.object({
  success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

// ── Planejamento Sonhos (F3.2) schemas ────────────────────────────────

// `months` 1..480 → 40 anos é o teto que cobre objetivos de longo prazo
// (aposentadoria, herança). `rate` aceita decimal mensal entre -1 e 1
// (ou seja, -100% a +100% ao mês) — range largo de propósito porque o
// cálculo de pmt já trata edge cases (rate≈0, target<=available).
// `startDate` YYYY-MM opcional. `available` pode ser zero (default DB).

const planejamentoPriority = z.enum(['Alta', 'Moderado', 'Baixa']);
const planejamentoCategory = z.enum(['c', 'm', 'l']);
const planejamentoStatus = z.enum(['Em espera', 'Iniciado', 'Pausado', 'Atrasado', 'Concluído']);
const yearMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const planejamentoStartDate = z
  .string()
  .regex(yearMonthRegex, 'startDate deve ser YYYY-MM')
  .nullable()
  .optional();

export const planejamentoObjetivoCreateSchema = z.object({
  name: zString(255),
  target: zPositiveNumber,
  months: z.number().int().min(1).max(480),
  startDate: planejamentoStartDate,
  available: zNonNegativeNumber.optional().default(0),
  rate: z.number().finite().min(-1).max(1).optional().default(0),
  priority: planejamentoPriority,
  category: planejamentoCategory.optional(),
  status: planejamentoStatus,
  notes: z.string().max(2000).nullable().optional(),
});

export const planejamentoObjetivoPatchSchema = z.object({
  name: zString(255).optional(),
  target: zPositiveNumber.optional(),
  months: z.number().int().min(1).max(480).optional(),
  startDate: planejamentoStartDate,
  available: zNonNegativeNumber.optional(),
  rate: z.number().finite().min(-1).max(1).optional(),
  priority: planejamentoPriority.optional(),
  category: planejamentoCategory.optional(),
  status: planejamentoStatus.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const planejamentoEntryUpsertSchema = z.object({
  month: z.string().regex(yearMonthRegex, 'month deve ser YYYY-MM'),
  aporte: z.number().finite().nonnegative(),
  balance: z.number().finite(), // pode ser negativo se houver perda
});

// ── Simulador de Aposentadoria schemas ────────────────────────────────

// Limites espelham os sliders do protótipo (idade 1-105, taxas 0-100% a.a.,
// valores monetários não-negativos). `rentNomRetiro` é nullable (null = usa a
// taxa de acumulação). `eventos` é uma lista curta de aportes/resgates pontuais.

const aposIdade = z.number().int().min(1).max(105);
const aposRate = z.number().finite().min(0).max(100);
const aposMoney = z.number().finite().nonnegative();

const aposEventoSchema = z.object({
  tipo: z.enum(['aporte', 'resgate']),
  idade: aposIdade,
  valor: aposMoney,
});

export const aposentadoriaPlanoUpsertSchema = z.object({
  idade: aposIdade,
  apos: aposIdade,
  vida: aposIdade,
  rentNom: aposRate,
  inflacao: aposRate,
  rentNomRetiro: aposRate.nullable().optional().default(null),
  patrimonio: aposMoney,
  aporteM: aposMoney,
  renda: aposMoney,
  trackStartMonth: z.number().int().min(1).max(12),
  trackStartYear: z.number().int().min(2000).max(2100),
  eventos: z.array(aposEventoSchema).max(50).optional().default([]),
  // Override layer: nomes dos campos travados manualmente (não re-sincronizam).
  fieldLocks: z.array(z.string().max(40)).max(20).optional().default([]),
});

export const aposentadoriaEntryUpsertSchema = z.object({
  off: z.number().int().min(1).max(2000),
  aporteReal: z.number().finite().nonnegative(),
  patFinal: z.number().finite().nonnegative(),
});

// ── Utility: build 400 response from ZodError ─────────────────────────

export function validationError(result: { success: false; error: z.ZodError }) {
  const flat = result.error.flatten();
  const invalidFields = Object.keys(flat.fieldErrors);
  const fieldList = invalidFields.join(', ');
  const errorMessage = fieldList ? `Dados inválidos: ${fieldList}` : 'Dados inválidos';
  return NextResponse.json(
    {
      error: errorMessage,
      details: flat.fieldErrors,
    },
    { status: 400 },
  );
}
