import { z } from 'zod';
import { NextResponse } from 'next/server';

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
});

export const registerSchema = z.object({
  email: zEmail,
  password: z.string().min(1, 'Senha é obrigatória'),
  name: zString(255),
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

// ── Stock transactions (POST) schema ──────────────────────────────────

export const stockTransactionSchema = z.object({
  stockId: zString(255),
  type: z.enum(['compra', 'venda']),
  quantity: zPositiveNumber,
  price: zPositiveNumber,
  date: zDateString,
  fees: z.number().finite().nonnegative().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

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

// ── Carteira reserva valor-atualizado (PATCH) schema ──────────────────

export const valorAtualizadoReservaSchema = z.object({
  portfolioId: zString(255),
  valorAtualizado: zPositiveNumber,
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

// ── Stocks watchlist (POST) schema ────────────────────────────────────

export const watchlistAddSchema = z.object({
  stockId: zString(255),
  notes: z.string().max(1000).nullable().optional(),
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
